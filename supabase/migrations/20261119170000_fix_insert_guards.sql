-- Fix for the insert guards added in steps 1 and 2.
--
-- block_client_system_rows() read NEW.is_system on funds and accounts, and NEW.is_default on
-- categories and payees, fields those tables do not have. Postgres does not short-circuit that, so
-- a signed-in user got an error when creating a fund, account, category or payee. Each table is now
-- checked only for its own fields.
--
-- It also lets the defaults function (ensure_org_accounting_defaults) create the protected rows even
-- when it runs inside a signed-in user's request, for example when an organisation is created or an
-- old organisation is missing a default.

CREATE OR REPLACE FUNCTION public.block_client_system_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE jwt_role text;
BEGIN
  IF COALESCE(current_setting('app.accounting_bootstrap', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IN ('anon', 'authenticated') THEN
    IF TG_TABLE_NAME = 'categories' THEN
      IF NEW.is_system THEN RAISE EXCEPTION 'System categories are created by Outlayd only'; END IF;
    ELSIF TG_TABLE_NAME = 'vendors' THEN
      IF NEW.is_system THEN RAISE EXCEPTION 'Built-in payees are created by Outlayd only'; END IF;
    ELSIF TG_TABLE_NAME = 'funds' THEN
      IF NEW.is_default THEN RAISE EXCEPTION 'The default fund is created by Outlayd only'; END IF;
    ELSIF TG_TABLE_NAME = 'accounts' THEN
      IF NEW.is_default THEN RAISE EXCEPTION 'The default account is created by Outlayd only'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The update/delete guard is bypassed by the defaults function as well
CREATE OR REPLACE FUNCTION public.protect_accounting_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF COALESCE(current_setting('app.accounting_bootstrap', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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

-- The defaults function switches the guards off for its own writes (transaction-local)
CREATE OR REPLACE FUNCTION public.ensure_org_accounting_defaults(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.accounting_bootstrap', 'on', true);

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
    (p_org, 'Anonymous donor',          'donor', true),
    (p_org, 'Cash donations (unnamed)', 'donor', true)
  ON CONFLICT (organization_id, name)
  DO UPDATE SET is_system = true, payee_type = 'donor', archived_at = NULL;

  PERFORM set_config('app.accounting_bootstrap', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_org_accounting_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_org_accounting_defaults(uuid) TO service_role;
