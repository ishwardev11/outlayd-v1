-- Accounting foundation, step 1 of Phase 1 (Outlayd Accounting Upgrade spec, section 3).
--
-- Purely additive: nothing that exists today is moved, renamed or recomputed, so every dashboard,
-- report and export shows the same numbers before and after this migration.
--
-- It adds the pieces every later phase depends on:
--   * organisation settings (type, legal name, address, signatories, numbering)
--   * funds: type (unrestricted / restricted), opening balance, and one protected default fund
--   * categories: kind (income / expense), group, nature, sort order, protected system categories
--   * accounts: where the cash sits, with one protected default "Main Account"
--   * vendors: the name is unique per organisation instead of across the whole database
-- and makes sure every organisation, existing or new, always has a default fund, a default account
-- and the system categories, so no report can ever depend on something that is blank.

-- ---------------------------------------------------------------- Organisation settings
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_type             text    NOT NULL DEFAULT 'nonprofit',
  ADD COLUMN IF NOT EXISTS legal_name           text,
  ADD COLUMN IF NOT EXISTS address              text,
  ADD COLUMN IF NOT EXISTS signatories          jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS invoice_prefix       text    NOT NULL DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS invoice_next_number  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS receipt_prefix       text    NOT NULL DEFAULT 'RCP-',
  ADD COLUMN IF NOT EXISTS receipt_next_number  integer NOT NULL DEFAULT 1;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_org_type_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_org_type_check
  CHECK (org_type IN ('nonprofit', 'small_business'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_signatories_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_signatories_check
  CHECK (jsonb_typeof(signatories) = 'array' AND jsonb_array_length(signatories) <= 3);

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_numbering_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_numbering_check
  CHECK (invoice_next_number >= 1 AND receipt_next_number >= 1);

-- ---------------------------------------------------------------- Funds
ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS fund_type       text          NOT NULL DEFAULT 'unrestricted',
  ADD COLUMN IF NOT EXISTS opening_balance numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default      boolean       NOT NULL DEFAULT false;

ALTER TABLE public.funds DROP CONSTRAINT IF EXISTS funds_fund_type_check;
ALTER TABLE public.funds ADD CONSTRAINT funds_fund_type_check
  CHECK (fund_type IN ('unrestricted', 'restricted'));

-- A fund that already carries grant details is restricted money. Everything else stays unrestricted
-- and the organisation can change it in Settings.
UPDATE public.funds
SET fund_type = 'restricted'
WHERE fund_type = 'unrestricted'
  AND (award_amount IS NOT NULL OR grant_reference IS NOT NULL);

-- At most one default fund per organisation
CREATE UNIQUE INDEX IF NOT EXISTS funds_one_default_per_org
  ON public.funds (organization_id) WHERE is_default;

-- ---------------------------------------------------------------- Categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS kind       text    NOT NULL DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS nature     text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_system  boolean NOT NULL DEFAULT false;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_kind_check;
ALTER TABLE public.categories ADD CONSTRAINT categories_kind_check
  CHECK (kind IN ('income', 'expense'));

-- "nature" only exists for income. Donation versus other income in the UI is a filter on it, so the
-- two can never disagree.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_nature_check;
ALTER TABLE public.categories ADD CONSTRAINT categories_nature_check
  CHECK (
    nature IS NULL
    OR (kind = 'income' AND nature IN ('donation', 'grant', 'membership', 'fundraising', 'programme_income', 'other_income'))
  );

-- ---------------------------------------------------------------- Accounts (where the cash sits)
CREATE TABLE IF NOT EXISTS public.accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  account_type     text NOT NULL DEFAULT 'bank' CHECK (account_type IN ('bank', 'cash', 'ewallet')),
  opening_balance  numeric(15,2) NOT NULL DEFAULT 0,
  opening_date     date,
  is_default       boolean NOT NULL DEFAULT false,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_name_org_key UNIQUE (organization_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_default_per_org
  ON public.accounts (organization_id) WHERE is_default;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbac_accounts_select ON public.accounts;
CREATE POLICY rbac_accounts_select ON public.accounts FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());

DROP POLICY IF EXISTS rbac_accounts_insert ON public.accounts;
CREATE POLICY rbac_accounts_insert ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

DROP POLICY IF EXISTS rbac_accounts_update ON public.accounts;
CREATE POLICY rbac_accounts_update ON public.accounts FOR UPDATE TO authenticated
  USING (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin')
  WITH CHECK (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

DROP POLICY IF EXISTS rbac_accounts_delete ON public.accounts;
CREATE POLICY rbac_accounts_delete ON public.accounts FOR DELETE TO authenticated
  USING (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;

-- ---------------------------------------------------------------- Defaults for every organisation
-- One function creates everything an organisation must always have. It is safe to run repeatedly,
-- so the backfill below and the trigger for new organisations share it.
CREATE OR REPLACE FUNCTION public.ensure_org_accounting_defaults(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Default fund: reuse an existing "General..." fund if there is one, otherwise create General Fund
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

  -- Default account
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = p_org AND is_default) THEN
    INSERT INTO public.accounts (organization_id, name, account_type, is_default)
    VALUES (p_org, 'Main Account', 'bank', true)
    ON CONFLICT (organization_id, name)
    DO UPDATE SET is_default = true, archived_at = NULL;
  END IF;

  -- System categories. There are two "Uncategorised" because the category's kind decides whether a
  -- line is income or expense, and one category cannot be both.
  INSERT INTO public.categories (organization_id, name, kind, group_name, is_system, sort_order)
  VALUES
    (p_org, 'Uncategorised',        'expense', 'System', true, 9000),
    (p_org, 'Uncategorised income', 'income',  'System', true, 9001),
    (p_org, 'Depreciation',         'expense', 'System', true, 9002)
  ON CONFLICT (name, organization_id)
  DO UPDATE SET is_system = true, group_name = 'System', is_archived = false;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_org_accounting_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_org_accounting_defaults(uuid) TO service_role;

-- Backfill every existing organisation
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_org_accounting_defaults(o.id);
  END LOOP;
END;
$$;

-- New organisations get the same defaults the moment they are created
CREATE OR REPLACE FUNCTION public.org_accounting_defaults_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_org_accounting_defaults(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_accounting_defaults ON public.organizations;
CREATE TRIGGER trg_org_accounting_defaults
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.org_accounting_defaults_trigger();

-- ---------------------------------------------------------------- Protect the defaults
-- Signed-in users (and the browser) can never archive, delete or demote the default fund, the default
-- account or a system category. The server (service role) is exempt, which keeps "delete my account"
-- working. Deletes that happen because the whole organisation is being removed are exempt too.
CREATE OR REPLACE FUNCTION public.protect_accounting_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  jwt_role text;
  protected boolean;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IS NULL OR jwt_role NOT IN ('anon', 'authenticated') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'funds' THEN
    protected := OLD.is_default;
    IF protected AND (
         TG_OP = 'DELETE'
         OR NEW.is_default = false
         OR NEW.archived_at IS NOT NULL
         OR COALESCE(NEW.is_archived, false)
         OR NEW.fund_type <> 'unrestricted'
       ) THEN
      RAISE EXCEPTION 'The default fund cannot be archived, deleted or made restricted';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts' THEN
    protected := OLD.is_default;
    IF protected AND (TG_OP = 'DELETE' OR NEW.is_default = false OR NEW.archived_at IS NOT NULL) THEN
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
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_default_fund ON public.funds;
CREATE TRIGGER trg_protect_default_fund
  BEFORE UPDATE OR DELETE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.protect_accounting_defaults();

DROP TRIGGER IF EXISTS trg_protect_default_account ON public.accounts;
CREATE TRIGGER trg_protect_default_account
  BEFORE UPDATE OR DELETE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_accounting_defaults();

DROP TRIGGER IF EXISTS trg_protect_system_categories ON public.categories;
CREATE TRIGGER trg_protect_system_categories
  BEFORE UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.protect_accounting_defaults();

-- A signed-in user cannot create their own "system" category or a second default
CREATE OR REPLACE FUNCTION public.block_client_system_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE jwt_role text;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IN ('anon', 'authenticated') THEN
    IF TG_TABLE_NAME = 'categories' AND NEW.is_system THEN
      RAISE EXCEPTION 'System categories are created by Outlayd only';
    ELSIF TG_TABLE_NAME IN ('funds', 'accounts') AND NEW.is_default THEN
      RAISE EXCEPTION 'The default % is created by Outlayd only', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_client_system_funds ON public.funds;
CREATE TRIGGER trg_block_client_system_funds
  BEFORE INSERT ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.block_client_system_rows();

DROP TRIGGER IF EXISTS trg_block_client_system_accounts ON public.accounts;
CREATE TRIGGER trg_block_client_system_accounts
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.block_client_system_rows();

DROP TRIGGER IF EXISTS trg_block_client_system_categories ON public.categories;
CREATE TRIGGER trg_block_client_system_categories
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.block_client_system_rows();

-- ---------------------------------------------------------------- Vendors (future payees)
-- The vendor name was unique across the whole database, so two organisations could not both have a
-- supplier called "TNB". It becomes unique per organisation, which the built-in payees ("Anonymous
-- donor") will also need.
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_name_key;
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_name_org_key;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_name_org_key UNIQUE (organization_id, name);
