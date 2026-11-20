-- Money in and donations, stage 3a of Phase 2 (spec sections 3.3, 3.7, 5.3, 6.1, 7).
-- Database and rules only; the screens arrive in stages 3b to 3d.
--
-- Design (approved 2026-11-20): cash numbers (money in/out, Income & Expenditure, cash book) are read
-- from transactions only; workflow numbers (needs review, awaiting payment) from documents only.
-- Expenses keep entering as documents (the existing mirror creates their transactions), so the only
-- transactions people write directly are MONEY IN (source = 'manual').
--
--   1. income categories seeded per organisation type (existing categories are never touched)
--   2. categories are archived, not deleted, once anything uses them
--   3. a guarded write path for money in (policies, integrity checks, save/delete functions)
--   4. donation receipts with an atomic, never-reused number sequence
--   5. tax-exempt receipt settings (off by default)
--   6. read functions for the Income & Expenditure statement and the dashboard

-- ================================================================ 1. Income categories
-- Spec section 7. Nature drives the "Donation / Other income" choice and the I&E grouping.
CREATE OR REPLACE FUNCTION public.seed_income_categories(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT org_type INTO v_type FROM public.organizations WHERE id = p_org;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Insert only names the organisation does not already have; existing categories are left exactly as they are
  IF v_type = 'small_business' THEN
    INSERT INTO public.categories (organization_id, name, kind, nature, group_name, sort_order)
    SELECT p_org, s.name, 'income', s.nature, s.grp, s.ord
    FROM (VALUES
      ('Sales',          NULL,           'Revenue', 100),
      ('Service income', NULL,           'Revenue', 110),
      ('Other income',   'other_income', 'Revenue', 120)
    ) AS s(name, nature, grp, ord)
    ON CONFLICT (name, organization_id) DO NOTHING;
  ELSE
    INSERT INTO public.categories (organization_id, name, kind, nature, sort_order)
    SELECT p_org, s.name, 'income', s.nature, s.ord
    FROM (VALUES
      ('General donations',          'donation',         100),
      ('Restricted donations',       'donation',         110),
      ('Government grants',          'grant',            200),
      ('Corporate grants',           'grant',            210),
      ('Foundation grants',          'grant',            220),
      ('Entrance fees',              'membership',       300),
      ('Annual subscriptions',       'membership',       310),
      ('Event and ticket income',    'fundraising',      400),
      ('Merchandise sales',          'fundraising',      410),
      ('Sponsorships',               'fundraising',      420),
      ('Programme and course fees',  'programme_income', 500),
      ('Rental income',              'programme_income', 510),
      ('Bank interest',              'other_income',     600),
      ('Miscellaneous income',       'other_income',     610)
    ) AS s(name, nature, ord)
    ON CONFLICT (name, organization_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_income_categories(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_income_categories(uuid) TO service_role;

-- The defaults function, re-created from its exact current text (20261119140000_payees.sql) with the
-- income seed added at the end, so every new organisation gets its income categories.
CREATE OR REPLACE FUNCTION public.ensure_org_accounting_defaults(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.seed_income_categories(p_org);

  PERFORM set_config('app.accounting_bootstrap', 'off', true);
END;
$function$;

-- Existing organisations get their income categories now (no expense category is changed)
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_income_categories(o.id);
  END LOOP;
END $$;

-- ================================================================ 2. Categories: archive, not delete
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- The older is_archived flag is kept in step with archived_at so nothing that reads it disagrees
UPDATE public.categories SET archived_at = now() WHERE COALESCE(is_archived, false) AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_category_archived()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_archived IS DISTINCT FROM OLD.is_archived
     AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN
    -- something changed only the old flag: follow it
    NEW.archived_at := CASE WHEN COALESCE(NEW.is_archived, false) THEN COALESCE(OLD.archived_at, now()) ELSE NULL END;
  END IF;
  NEW.is_archived := NEW.archived_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_category_archived ON public.categories;
CREATE TRIGGER trg_sync_category_archived
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_category_archived();

-- System categories can no longer be archived through archived_at either. Re-created from the exact
-- current text (20261119170000_fix_insert_guards.sql) with archived_at added to the categories rule.
CREATE OR REPLACE FUNCTION public.protect_accounting_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
         OR COALESCE(NEW.is_archived, false)
         OR NEW.archived_at IS NOT NULL THEN
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
$function$;

-- A category that anything uses is archived, never deleted (spec rule 3). An unused one can still be
-- deleted. Deleting a whole organisation (a cascade) is not affected.
CREATE OR REPLACE FUNCTION public.block_delete_used_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM public.documents d WHERE d.category_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.documents d
                WHERE d.organization_id = OLD.organization_id
                  AND jsonb_typeof(d.splits) = 'array'
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.splits) s WHERE s ->> 'category_id' = OLD.id::text))
     OR EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.category_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.default_category_id = OLD.id) THEN
    RAISE EXCEPTION 'This category is in use, so it cannot be deleted. Archive it instead.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_delete_used_category ON public.categories;
CREATE TRIGGER trg_block_delete_used_category
  BEFORE DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.block_delete_used_category();

-- Deleting a category no longer moves its lines to "Uncategorised" (it cannot be deleted while used).
-- The funds behaviour is unchanged. Re-created from the exact current text with the categories branch removed.
DROP TRIGGER IF EXISTS trg_categories_reassign_lines ON public.categories;
CREATE OR REPLACE FUNCTION public.reassign_lines_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'funds' THEN
    UPDATE public.transaction_lines
    SET fund_id = (
      SELECT f.id FROM public.funds f WHERE f.organization_id = OLD.organization_id AND f.is_default LIMIT 1
    )
    WHERE fund_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$function$;

-- ================================================================ 3. Money in: the write path
-- A refund received against an expense (spec sign rule: money in to an expense category reduces expense)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_refund boolean NOT NULL DEFAULT false;

-- Shared rule: the row is a manual money-in that the signed-in user may write
CREATE OR REPLACE FUNCTION public.can_write_money_in(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_org::text = public.get_user_org_id()
     AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor'])
     AND public.org_feature_allowed(p_org, 'income', 'use');
$$;

GRANT INSERT, UPDATE, DELETE ON public.transactions, public.transaction_lines TO authenticated;

DROP POLICY IF EXISTS rbac_transactions_insert ON public.transactions;
CREATE POLICY rbac_transactions_insert ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (source = 'manual' AND document_id IS NULL AND tx_type = 'money_in' AND public.can_write_money_in(organization_id));
DROP POLICY IF EXISTS rbac_transactions_update ON public.transactions;
CREATE POLICY rbac_transactions_update ON public.transactions FOR UPDATE TO authenticated
  USING (source = 'manual' AND document_id IS NULL AND tx_type = 'money_in' AND public.can_write_money_in(organization_id))
  WITH CHECK (source = 'manual' AND document_id IS NULL AND tx_type = 'money_in' AND public.can_write_money_in(organization_id));
DROP POLICY IF EXISTS rbac_transactions_delete ON public.transactions;
CREATE POLICY rbac_transactions_delete ON public.transactions FOR DELETE TO authenticated
  USING (source = 'manual' AND document_id IS NULL AND tx_type = 'money_in' AND public.can_write_money_in(organization_id));

-- Lines may only be written on a manual money-in transaction of the same organisation
CREATE OR REPLACE FUNCTION public.line_on_manual_money_in(p_tx uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = p_tx AND t.organization_id = p_org
      AND t.source = 'manual' AND t.document_id IS NULL AND t.tx_type = 'money_in'
  );
$$;

DROP POLICY IF EXISTS rbac_transaction_lines_insert ON public.transaction_lines;
CREATE POLICY rbac_transaction_lines_insert ON public.transaction_lines FOR INSERT TO authenticated
  WITH CHECK (public.can_write_money_in(organization_id) AND public.line_on_manual_money_in(transaction_id, organization_id));
DROP POLICY IF EXISTS rbac_transaction_lines_update ON public.transaction_lines;
CREATE POLICY rbac_transaction_lines_update ON public.transaction_lines FOR UPDATE TO authenticated
  USING (public.can_write_money_in(organization_id) AND public.line_on_manual_money_in(transaction_id, organization_id))
  WITH CHECK (public.can_write_money_in(organization_id) AND public.line_on_manual_money_in(transaction_id, organization_id));
DROP POLICY IF EXISTS rbac_transaction_lines_delete ON public.transaction_lines;
CREATE POLICY rbac_transaction_lines_delete ON public.transaction_lines FOR DELETE TO authenticated
  USING (public.can_write_money_in(organization_id) AND public.line_on_manual_money_in(transaction_id, organization_id));

-- Integrity on every path (including the service role): everything a transaction points at belongs to
-- the same organisation. For manual entries, archived accounts, funds and categories cannot be chosen.
CREATE OR REPLACE FUNCTION public.check_transaction_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.transactions%ROWTYPE;
  manual boolean;
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    manual := NEW.source = 'manual';
    IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'The account does not belong to this organisation';
    END IF;
    IF NEW.to_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.to_account_id AND a.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'The account does not belong to this organisation';
    END IF;
    IF NEW.payee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = NEW.payee_id AND v.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'The payee does not belong to this organisation';
    END IF;
    IF manual AND (TG_OP = 'INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id)
       AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'That account is archived';
    END IF;
  ELSE
    SELECT * INTO t FROM public.transactions WHERE id = NEW.transaction_id;
    IF NOT FOUND OR t.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'A transaction line belongs to a different organisation than its transaction';
    END IF;
    manual := t.source = 'manual';
    IF NOT EXISTS (SELECT 1 FROM public.funds f WHERE f.id = NEW.fund_id AND f.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'The fund does not belong to this organisation';
    END IF;
    IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'The category does not belong to this organisation';
    END IF;
    IF manual AND (TG_OP = 'INSERT' OR NEW.fund_id IS DISTINCT FROM OLD.fund_id)
       AND EXISTS (SELECT 1 FROM public.funds f WHERE f.id = NEW.fund_id AND (f.archived_at IS NOT NULL OR COALESCE(f.is_archived, false))) THEN
      RAISE EXCEPTION 'That fund is archived';
    END IF;
    IF manual AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id)
       AND EXISTS (SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'That category is archived';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_transaction_refs ON public.transactions;
CREATE TRIGGER trg_check_transaction_refs
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.check_transaction_refs();
DROP TRIGGER IF EXISTS trg_check_transaction_line_refs ON public.transaction_lines;
CREATE TRIGGER trg_check_transaction_line_refs
  BEFORE INSERT OR UPDATE ON public.transaction_lines
  FOR EACH ROW EXECUTE FUNCTION public.check_transaction_refs();

-- The commit-time check, re-created from its exact current text (20261119160000_transactions.sql) with
-- the money-in category rule added: a manual money-in line targets an income category, or an expense
-- category only when the transaction is a refund.
CREATE OR REPLACE FUNCTION public.check_transaction_balanced()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  tx_id uuid;
  t public.transactions%ROWTYPE;
  n integer;
  s numeric;
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    tx_id := COALESCE(NEW.id, OLD.id);
  ELSE
    tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  END IF;

  SELECT * INTO t FROM public.transactions WHERE id = tx_id;
  IF NOT FOUND THEN
    RETURN NULL; -- the transaction was deleted together with its lines
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0) INTO n, s
  FROM public.transaction_lines WHERE transaction_id = tx_id;

  IF t.tx_type IN ('money_in', 'money_out') THEN
    IF n = 0 THEN
      RAISE EXCEPTION 'A money in or money out transaction needs at least one line';
    END IF;
    IF s <> t.total THEN
      RAISE EXCEPTION 'The line amounts (%) must add up to the transaction total (%)', s, t.total;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.transaction_lines l
      WHERE l.transaction_id = tx_id AND l.organization_id <> t.organization_id
    ) THEN
      RAISE EXCEPTION 'A transaction line belongs to a different organisation than its transaction';
    END IF;
    IF t.source = 'manual' AND t.tx_type = 'money_in' AND EXISTS (
      SELECT 1 FROM public.transaction_lines l
      JOIN public.categories c ON c.id = l.category_id
      WHERE l.transaction_id = tx_id
        AND c.kind <> CASE WHEN t.is_refund THEN 'expense' ELSE 'income' END
    ) THEN
      RAISE EXCEPTION 'Money in must use income categories (or expense categories when it is a refund)';
    END IF;
  ELSIF n > 0 THEN
    RAISE EXCEPTION 'Transfers have no lines';
  END IF;

  RETURN NULL;
END;
$function$;

-- ================================================================ 4. Donation receipts
CREATE TABLE IF NOT EXISTS public.donation_receipts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NO ACTION: a transaction with a receipt cannot be deleted, so a number is never orphaned (deleting
  -- a whole organisation still works, because its receipts go in the same cascade)
  transaction_id        uuid NOT NULL REFERENCES public.transactions(id) ON DELETE NO ACTION,
  seq                   integer NOT NULL CHECK (seq >= 1),
  receipt_no            text NOT NULL,
  issued_at             timestamptz NOT NULL DEFAULT now(),
  issued_by             uuid,
  -- A copy of what was printed, so the receipt still reads the same if the entry or payee changes later
  donor_payee_id        uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  donor_name            text NOT NULL,
  donation_date         date NOT NULL,
  amount                numeric(15,2) NOT NULL CHECK (amount > 0),
  details               jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_exempt            boolean NOT NULL DEFAULT false,
  tax_exempt_reference  text,
  voided_at             timestamptz,
  voided_by             uuid,
  void_reason           text CHECK (void_reason IS NULL OR char_length(void_reason) BETWEEN 1 AND 500),
  CONSTRAINT donation_receipts_void_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
  CONSTRAINT donation_receipts_no_key UNIQUE (organization_id, receipt_no),
  CONSTRAINT donation_receipts_seq_key UNIQUE (organization_id, seq)
);

-- At most one receipt in force per transaction (a voided one can be re-issued under a NEW number)
CREATE UNIQUE INDEX IF NOT EXISTS donation_receipts_one_active
  ON public.donation_receipts (transaction_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_donation_receipts_org_issued ON public.donation_receipts (organization_id, issued_at DESC);

-- Read-only to signed-in users; receipts are issued and voided only through the functions below.
ALTER TABLE public.donation_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rbac_donation_receipts_select ON public.donation_receipts;
CREATE POLICY rbac_donation_receipts_select ON public.donation_receipts FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());
REVOKE ALL ON public.donation_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.donation_receipts FROM authenticated;
GRANT SELECT ON public.donation_receipts TO authenticated;
GRANT ALL ON public.donation_receipts TO service_role;

-- Deleting an organisation removes its receipts first (they would otherwise block deleting its
-- transactions). Re-created from the exact current text with that one line added at the top.
CREATE OR REPLACE FUNCTION public.delete_organization_data(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.donation_receipts    WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.transactions         WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.quotes               WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.procurement_projects WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.documents            WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.vendors              WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.funds                WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.categories           WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.workspace_invites    WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.user_profiles        WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.user_roles           WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.organizations        WHERE id::text = p_org_id::text;
END;
$function$;

-- ================================================================ 5. Receipt settings
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tax_exempt_receipts  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_exempt_reference text;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_tax_exempt_reference_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_tax_exempt_reference_check
  CHECK (tax_exempt_reference IS NULL OR char_length(tax_exempt_reference) <= 200);

-- The next receipt number can never be moved back onto numbers already issued
CREATE OR REPLACE FUNCTION public.protect_receipt_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_seq integer;
BEGIN
  IF NEW.receipt_next_number IS DISTINCT FROM OLD.receipt_next_number THEN
    SELECT COALESCE(max(seq), 0) INTO last_seq FROM public.donation_receipts WHERE organization_id = NEW.id;
    IF NEW.receipt_next_number <= last_seq THEN
      RAISE EXCEPTION 'The next receipt number must be after the last one issued (%)', last_seq;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_receipt_sequence ON public.organizations;
CREATE TRIGGER trg_protect_receipt_sequence
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_receipt_sequence();

-- ================================================================ Functions people call
-- Saves a manual money-in entry (new, or replacing an existing one) with its lines in one database
-- transaction. SECURITY INVOKER: the caller's own permissions and row-level security apply throughout.
-- payload: {id?, tx_date, account_id?, payee_id?, payee_name?, reference?, remarks?, is_refund?,
--           lines: [{amount, fund_id?, category_id}]}
CREATE OR REPLACE FUNCTION public.save_money_in(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
  v_date date;
  v_account uuid;
  v_fund uuid;
  v_payee uuid;
  v_payee_name text;
  v_total numeric(15,2) := 0;
  v_line jsonb;
  v_n integer := 0;
  v_amount numeric;
BEGIN
  v_org := NULLIF(public.get_user_org_id(), '')::uuid;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation';
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'Admin' AND public.get_user_role() IS DISTINCT FROM 'Editor' THEN
    RAISE EXCEPTION 'Only Admins and Editors can record money in';
  END IF;
  IF NOT public.org_feature_allowed(v_org, 'income', 'use') THEN
    RAISE EXCEPTION 'Income and donation tracking is available on the Growth and Nonprofit plans';
  END IF;

  IF jsonb_typeof(payload -> 'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(payload -> 'lines') = 0 THEN
    RAISE EXCEPTION 'Add at least one line';
  END IF;
  IF jsonb_array_length(payload -> 'lines') > 50 THEN
    RAISE EXCEPTION 'An entry can have at most 50 lines';
  END IF;

  BEGIN
    v_date := (payload ->> 'tx_date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter a valid date';
  END;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'Enter the date the money was received';
  END IF;

  v_account := NULLIF(payload ->> 'account_id', '')::uuid;
  IF v_account IS NULL THEN
    SELECT id INTO v_account FROM public.accounts WHERE organization_id = v_org AND is_default;
  END IF;
  SELECT id INTO v_fund FROM public.funds WHERE organization_id = v_org AND is_default;

  v_payee := NULLIF(payload ->> 'payee_id', '')::uuid;
  IF v_payee IS NOT NULL THEN
    SELECT name INTO v_payee_name FROM public.vendors WHERE id = v_payee AND organization_id = v_org;
    IF v_payee_name IS NULL THEN
      RAISE EXCEPTION 'The payee does not belong to this organisation';
    END IF;
  ELSE
    v_payee_name := NULLIF(left(btrim(COALESCE(payload ->> 'payee_name', '')), 255), '');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(payload -> 'lines') LOOP
    BEGIN
      v_amount := (v_line ->> 'amount')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Each line needs a valid amount';
    END;
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2) THEN
      RAISE EXCEPTION 'Each line needs an amount above zero with at most two decimals';
    END IF;
    IF NULLIF(v_line ->> 'category_id', '') IS NULL THEN
      RAISE EXCEPTION 'Each line needs a category';
    END IF;
    v_total := v_total + v_amount;
  END LOOP;

  v_id := NULLIF(payload ->> 'id', '')::uuid;
  IF v_id IS NULL THEN
    INSERT INTO public.transactions (organization_id, tx_type, tx_date, account_id, payee_id, payee_name,
                                     reference, remarks, total, source, is_refund, created_by)
    VALUES (v_org, 'money_in', v_date, v_account, v_payee, v_payee_name,
            NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''),
            NULLIF(btrim(COALESCE(payload ->> 'remarks', '')), ''),
            v_total, 'manual', COALESCE((payload ->> 'is_refund')::boolean, false), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.donation_receipts r WHERE r.transaction_id = v_id AND r.voided_at IS NULL) THEN
      RAISE EXCEPTION 'A donation receipt has been issued for this entry. Void the receipt before changing it.';
    END IF;
    UPDATE public.transactions
    SET tx_date = v_date, account_id = v_account, payee_id = v_payee, payee_name = v_payee_name,
        reference = NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''),
        remarks = NULLIF(btrim(COALESCE(payload ->> 'remarks', '')), ''),
        total = v_total, is_refund = COALESCE((payload ->> 'is_refund')::boolean, false), updated_at = now()
    WHERE id = v_id AND organization_id = v_org AND source = 'manual' AND tx_type = 'money_in';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That entry was not found, or it cannot be edited here';
    END IF;
    DELETE FROM public.transaction_lines WHERE transaction_id = v_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(payload -> 'lines') LOOP
    v_n := v_n + 1;
    INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id)
    VALUES (v_id, v_org, v_n, (v_line ->> 'amount')::numeric,
            COALESCE(NULLIF(v_line ->> 'fund_id', '')::uuid, v_fund),
            (v_line ->> 'category_id')::uuid);
  END LOOP;

  RETURN v_id;
END;
$$;

-- Deletes a manual money-in entry. Refused once any receipt (even a voided one) was issued for it,
-- so receipt numbers always point at a real entry.
CREATE OR REPLACE FUNCTION public.delete_money_in(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.donation_receipts r WHERE r.transaction_id = p_id) THEN
    RAISE EXCEPTION 'A donation receipt was issued for this entry, so it cannot be deleted';
  END IF;
  DELETE FROM public.transactions
  WHERE id = p_id AND source = 'manual' AND tx_type = 'money_in'
    AND organization_id::text = public.get_user_org_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry was not found, or you cannot delete it';
  END IF;
END;
$$;

-- Issues the next donation receipt number for a money-in entry. The organisation row is locked while
-- the number is taken, so two people issuing at the same moment get consecutive numbers and a number
-- is never reused or skipped. SECURITY DEFINER (receipts are read-only to users), so every rule is
-- checked explicitly here.
CREATE OR REPLACE FUNCTION public.issue_donation_receipt(p_tx uuid)
RETURNS public.donation_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  t public.transactions%ROWTYPE;
  o public.organizations%ROWTYPE;
  v_amount numeric(15,2);
  v_details jsonb;
  r public.donation_receipts%ROWTYPE;
BEGIN
  v_org := NULLIF(public.get_user_org_id(), '')::uuid;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation';
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'Admin' AND public.get_user_role() IS DISTINCT FROM 'Editor' THEN
    RAISE EXCEPTION 'Only Admins and Editors can issue receipts';
  END IF;
  IF NOT public.org_feature_allowed(v_org, 'income', 'use') THEN
    RAISE EXCEPTION 'Donor receipts are available on the Growth and Nonprofit plans';
  END IF;

  SELECT * INTO t FROM public.transactions WHERE id = p_tx AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry was not found';
  END IF;
  IF t.tx_type <> 'money_in' OR t.source <> 'manual' OR t.is_refund THEN
    RAISE EXCEPTION 'Receipts can only be issued for donations recorded as money in';
  END IF;

  -- Only the donation lines count towards the receipt
  SELECT COALESCE(sum(l.amount), 0),
         COALESCE(jsonb_agg(jsonb_build_object('category', c.name, 'fund', f.name, 'amount', l.amount) ORDER BY l.line_no), '[]'::jsonb)
  INTO v_amount, v_details
  FROM public.transaction_lines l
  JOIN public.categories c ON c.id = l.category_id
  JOIN public.funds f ON f.id = l.fund_id
  WHERE l.transaction_id = t.id AND c.kind = 'income' AND c.nature = 'donation';
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'This entry has no donation lines, so a donation receipt cannot be issued';
  END IF;

  -- Lock the organisation row: this serialises receipt numbering
  SELECT * INTO o FROM public.organizations WHERE id = v_org FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.donation_receipts x WHERE x.transaction_id = t.id AND x.voided_at IS NULL) THEN
    RAISE EXCEPTION 'A receipt has already been issued for this entry';
  END IF;

  INSERT INTO public.donation_receipts (organization_id, transaction_id, seq, receipt_no, issued_by,
                                        donor_payee_id, donor_name, donation_date, amount, details,
                                        tax_exempt, tax_exempt_reference)
  VALUES (v_org, t.id, o.receipt_next_number, o.receipt_prefix || o.receipt_next_number, auth.uid(),
          t.payee_id, COALESCE(NULLIF(t.payee_name, ''), 'Anonymous donor'), t.tx_date, v_amount,
          jsonb_build_object('lines', v_details, 'reference', t.reference),
          o.tax_exempt_receipts, CASE WHEN o.tax_exempt_receipts THEN o.tax_exempt_reference END)
  RETURNING * INTO r;

  UPDATE public.organizations SET receipt_next_number = o.receipt_next_number + 1 WHERE id = v_org;
  RETURN r;
END;
$$;

-- Voids a receipt. The number stays used forever (shown as VOID), so the sequence has no gaps.
CREATE OR REPLACE FUNCTION public.void_donation_receipt(p_receipt uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := NULLIF(public.get_user_org_id(), '')::uuid;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation';
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'Admin' AND public.get_user_role() IS DISTINCT FROM 'Editor' THEN
    RAISE EXCEPTION 'Only Admins and Editors can void receipts';
  END IF;
  IF NOT public.org_feature_allowed(v_org, 'income', 'use') THEN
    RAISE EXCEPTION 'Donor receipts are available on the Growth and Nonprofit plans';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Give a reason for voiding the receipt';
  END IF;
  UPDATE public.donation_receipts
  SET voided_at = now(), voided_by = auth.uid(), void_reason = left(btrim(p_reason), 500)
  WHERE id = p_receipt AND organization_id = v_org AND voided_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That receipt was not found or is already void';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_money_in(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_money_in(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_donation_receipt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_donation_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_money_in(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_money_in(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_donation_receipt(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_donation_receipt(uuid, text) TO authenticated, service_role;

-- ================================================================ 6. Read functions
-- Income & Expenditure on a cash basis (spec 6.1, rule R1 for transactions): every transaction line
-- that targets a category, dated by the transaction date. Signed by the spec's sign rule: the
-- category's kind decides income or expense, the direction decides the sign (a refund reduces expense,
-- a returned donation reduces income). Grouping and layout are done by the app. SECURITY INVOKER, so
-- row-level security limits it to the caller's own organisation.
CREATE OR REPLACE FUNCTION public.income_expenditure(p_org uuid, p_from date, p_to date, p_fund uuid DEFAULT NULL)
RETURNS TABLE (kind text, nature text, group_name text, category_id uuid, category_name text,
               category_sort integer, fund_id uuid, fund_name text, amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name,
         sum(CASE
               WHEN c.kind = 'income'  AND t.tx_type = 'money_in'  THEN l.amount
               WHEN c.kind = 'income'  AND t.tx_type = 'money_out' THEN -l.amount
               WHEN c.kind = 'expense' AND t.tx_type = 'money_out' THEN l.amount
               ELSE -l.amount
             END)
  FROM public.transactions t
  JOIN public.transaction_lines l ON l.transaction_id = t.id
  JOIN public.categories c ON c.id = l.category_id
  JOIN public.funds f ON f.id = l.fund_id
  WHERE t.organization_id = p_org
    AND t.tx_type IN ('money_in', 'money_out')
    AND t.tx_date BETWEEN p_from AND p_to
    AND (p_fund IS NULL OR l.fund_id = p_fund)
  GROUP BY c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name;
$$;

-- Money in and money out for the month containing p_today, by transaction (payment) date
CREATE OR REPLACE FUNCTION public.dashboard_cash_month(p_org uuid, p_today date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'money_in',  COALESCE(sum(t.total) FILTER (WHERE t.tx_type = 'money_in'), 0),
    'money_out', COALESCE(sum(t.total) FILTER (WHERE t.tx_type = 'money_out'), 0)
  )
  FROM public.transactions t
  WHERE t.organization_id = p_org
    AND t.tx_date >= date_trunc('month', p_today)::date
    AND t.tx_date <  (date_trunc('month', p_today) + interval '1 month')::date;
$$;

GRANT EXECUTE ON FUNCTION public.income_expenditure(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_cash_month(uuid, date) TO authenticated, service_role;
