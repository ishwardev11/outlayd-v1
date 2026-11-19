-- Payees, step 2 of Phase 1 (spec section 3.4). The vendors table is extended, not replaced, so every
-- existing vendor becomes a payee of type "vendor" and every document keeps its link.
--
--   * type (vendor, donor, member, grantor, customer, staff, other) and contact details
--   * archived_at: a payee that has records is archived, never deleted (spec rule 3)
--   * two built-in payees per organisation, "Anonymous donor" and "Cash donations (unnamed)", so a
--     donation never needs a donor record. They cannot be renamed, archived or deleted.
-- Bank account numbers are deliberately not stored.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS payee_type          text NOT NULL DEFAULT 'vendor',
  ADD COLUMN IF NOT EXISTS email               text,
  ADD COLUMN IF NOT EXISTS phone               text,
  ADD COLUMN IF NOT EXISTS address             text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS notes               text,
  ADD COLUMN IF NOT EXISTS archived_at         timestamptz,
  ADD COLUMN IF NOT EXISTS is_system           boolean NOT NULL DEFAULT false;

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_payee_type_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_payee_type_check
  CHECK (payee_type IN ('vendor', 'donor', 'member', 'grantor', 'customer', 'staff', 'other'));

-- Add the built-in payees to the function that guarantees every organisation's defaults.
-- (Same body as step 1, plus the payees at the end.)
CREATE OR REPLACE FUNCTION public.ensure_org_accounting_defaults(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.funds WHERE organization_id = p_org AND is_default) THEN
    UPDATE public.funds
    SET is_default = true, fund_type = 'unrestricted'
    WHERE id = (
      SELECT id FROM public.funds
      WHERE organization_id = p_org
        AND archived_at IS NULL
        AND COALESCE(is_archived, false) = false
        AND name ILIKE 'general%'
        AND award_amount IS NULL AND grant_reference IS NULL
      ORDER BY created_at NULLS LAST, name
      LIMIT 1
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.funds WHERE organization_id = p_org AND is_default) THEN
    INSERT INTO public.funds (organization_id, name, fund_type, is_default)
    VALUES (p_org, 'General Fund', 'unrestricted', true)
    ON CONFLICT (name, organization_id)
    DO UPDATE SET is_default = true, fund_type = 'unrestricted', is_archived = false, archived_at = NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = p_org AND is_default) THEN
    INSERT INTO public.accounts (organization_id, name, account_type, is_default)
    VALUES (p_org, 'Main Account', 'bank', true)
    ON CONFLICT (organization_id, name)
    DO UPDATE SET is_default = true, archived_at = NULL;
  END IF;

  INSERT INTO public.categories (organization_id, name, kind, group_name, is_system, sort_order)
  VALUES
    (p_org, 'Uncategorised',        'expense', 'System', true, 9000),
    (p_org, 'Uncategorised income', 'income',  'System', true, 9001),
    (p_org, 'Depreciation',         'expense', 'System', true, 9002)
  ON CONFLICT (name, organization_id)
  DO UPDATE SET is_system = true, group_name = 'System', is_archived = false;

  INSERT INTO public.vendors (organization_id, name, payee_type, is_system)
  VALUES
    (p_org, 'Anonymous donor',            'donor', true),
    (p_org, 'Cash donations (unnamed)',   'donor', true)
  ON CONFLICT (organization_id, name)
  DO UPDATE SET is_system = true, payee_type = 'donor', archived_at = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_org_accounting_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_org_accounting_defaults(uuid) TO service_role;

-- Guards: add built-in payees to the protection from step 1
CREATE OR REPLACE FUNCTION public.protect_accounting_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IS NULL OR jwt_role NOT IN ('anon', 'authenticated') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'funds' THEN
    IF OLD.is_default AND (
         TG_OP = 'DELETE'
         OR NEW.is_default = false
         OR NEW.archived_at IS NOT NULL
         OR COALESCE(NEW.is_archived, false)
         OR NEW.fund_type <> 'unrestricted'
       ) THEN
      RAISE EXCEPTION 'The default fund cannot be archived, deleted or made restricted';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts' THEN
    IF OLD.is_default AND (TG_OP = 'DELETE' OR NEW.is_default = false OR NEW.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'The default account cannot be archived or deleted';
    END IF;
  ELSIF TG_TABLE_NAME = 'categories' THEN
    IF OLD.is_system THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'System categories cannot be deleted';
      END IF;
      IF NEW.name IS DISTINCT FROM OLD.name
         OR NEW.kind IS DISTINCT FROM OLD.kind
         OR NEW.is_system = false
         OR COALESCE(NEW.is_archived, false) THEN
        RAISE EXCEPTION 'System categories cannot be edited or archived';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'vendors' THEN
    IF OLD.is_system THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Built-in payees cannot be deleted';
      END IF;
      IF NEW.name IS DISTINCT FROM OLD.name
         OR NEW.payee_type IS DISTINCT FROM OLD.payee_type
         OR NEW.is_system = false
         OR NEW.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Built-in payees cannot be renamed or archived';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.block_client_system_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE jwt_role text;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IN ('anon', 'authenticated') THEN
    IF TG_TABLE_NAME IN ('categories', 'vendors') AND NEW.is_system THEN
      RAISE EXCEPTION 'Built-in % are created by Outlayd only', CASE WHEN TG_TABLE_NAME = 'vendors' THEN 'payees' ELSE 'categories' END;
    ELSIF TG_TABLE_NAME IN ('funds', 'accounts') AND NEW.is_default THEN
      RAISE EXCEPTION 'The default % is created by Outlayd only', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_system_payees ON public.vendors;
CREATE TRIGGER trg_protect_system_payees
  BEFORE UPDATE OR DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.protect_accounting_defaults();

DROP TRIGGER IF EXISTS trg_block_client_system_payees ON public.vendors;
CREATE TRIGGER trg_block_client_system_payees
  BEFORE INSERT ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.block_client_system_rows();

-- Backfill: every existing organisation gets the built-in payees
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_org_accounting_defaults(o.id);
  END LOOP;
END;
$$;
