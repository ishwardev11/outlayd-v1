-- Balance sheet, stage 5a of Phase 4 (spec 3.2, 3.5, 3.6, 5.6, rules R4 to R8, reports 6.2, 6.4, 6.5).
--
-- Decisions (Dev, 2026-11-22):
--   * A tracking start date (the 1st of a month, usually the first day of a financial year). Balances
--     start from the opening position on that date; older records stay in older periods of the reports
--     but are not counted again in balances. Bills and invoices issued before the start date (or flagged
--     as opening balances) are the opening amounts owed.
--   * Assets and liabilities ("items") are recorded from their own page through the functions below:
--     purchase, loan received, repayment, disposal. Uploads stay expenses.
--
-- One source of truth, nothing stored that can drift:
--   cash per account   = account opening balance + movements from the start date            (R2)
--   owed to / by you   = open invoices issued by the date less payments by the date         (R3)
--   other assets/loans = item opening balance + item movements from the start date         (R6)
--   fixed assets (NBV) = cost - depreciation to date; depreciation is computed, never stored
--   fund balance       = opening + income - expense (R1, incl. depreciation and disposal
--                        gain/loss) +/- fund transfers, from the start date                 (R4)
--   General Fund opening = the balancing figure (net assets at the start - other funds' openings)
--   check              = net assets - funds = 0 at any date                                  (R5)
--
-- A transaction line targets either a category (optionally paying an invoice, as before) or an item.
-- Item lines have no category, so Income & Expenditure never counts them (R6). Nothing existing is
-- converted by this migration.

-- ================================================================ 1. Organisation: start date
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tracking_start_date date,
  ADD COLUMN IF NOT EXISTS opening_position_completed_at timestamptz;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_tracking_start_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_tracking_start_check
  CHECK (tracking_start_date IS NULL OR extract(day FROM tracking_start_date) = 1);

-- The start date, or the beginning of time when there is none yet
CREATE OR REPLACE FUNCTION public.org_start(p_org uuid)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT o.tracking_start_date FROM public.organizations o WHERE o.id = p_org), '-infinity'::date);
$$;

-- ================================================================ 2. Assets and liabilities
CREATE TABLE IF NOT EXISTS public.items (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                              text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  kind                              text NOT NULL CHECK (kind IN ('fixed_asset', 'other_asset', 'liability')),
  classification                    text NOT NULL DEFAULT 'current' CHECK (classification IN ('current', 'non_current')),
  fund_id                           uuid NOT NULL REFERENCES public.funds(id),
  -- other assets and liabilities: the amount at the start date
  opening_balance                   numeric(15,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  -- fixed assets
  acquired_date                     date,
  opening_cost                      numeric(15,2) NOT NULL DEFAULT 0 CHECK (opening_cost >= 0),
  opening_accumulated_depreciation  numeric(15,2) NOT NULL DEFAULT 0 CHECK (opening_accumulated_depreciation >= 0),
  residual_value                    numeric(15,2) NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  useful_life_months                integer CHECK (useful_life_months IS NULL OR useful_life_months BETWEEN 1 AND 1200),
  disposed_date                     date,
  notes                             text CHECK (notes IS NULL OR char_length(notes) <= 500),
  archived_at                       timestamptz,
  created_by                        uuid,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_fixed_fields CHECK (
    (kind = 'fixed_asset' AND classification = 'non_current' AND useful_life_months IS NOT NULL AND acquired_date IS NOT NULL
       AND opening_balance = 0 AND opening_accumulated_depreciation <= opening_cost)
    OR (kind <> 'fixed_asset' AND acquired_date IS NULL AND opening_cost = 0 AND opening_accumulated_depreciation = 0
       AND residual_value = 0 AND useful_life_months IS NULL AND disposed_date IS NULL)
  ),
  CONSTRAINT items_disposed_after_acquired CHECK (disposed_date IS NULL OR (acquired_date IS NOT NULL AND disposed_date >= acquired_date))
);
CREATE INDEX IF NOT EXISTS idx_items_org ON public.items (organization_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS items_name_org_key ON public.items (organization_id, lower(btrim(name)));

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rbac_items_select ON public.items;
CREATE POLICY rbac_items_select ON public.items FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());
REVOKE ALL ON public.items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.items FROM authenticated;
GRANT SELECT ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;

-- A line targets a category (optionally paying an invoice) or an item, never both
ALTER TABLE public.transaction_lines ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.items(id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_item ON public.transaction_lines (item_id) WHERE item_id IS NOT NULL;
ALTER TABLE public.transaction_lines DROP CONSTRAINT IF EXISTS transaction_lines_one_target;
ALTER TABLE public.transaction_lines ADD CONSTRAINT transaction_lines_one_target
  CHECK (num_nonnulls(category_id, item_id) = 1 AND (invoice_id IS NULL OR category_id IS NOT NULL));

-- "Gain/loss on disposal", a protected system category like Depreciation
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
    (p_org, 'Uncategorised',         'expense', 'System', true, 9000),
    (p_org, 'Uncategorised income',  'income',  'System', true, 9001),
    (p_org, 'Depreciation',          'expense', 'System', true, 9002),
    (p_org, 'Gain/loss on disposal', 'expense', 'System', true, 9003)
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

DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_org_accounting_defaults(o.id);
  END LOOP;
END $$;

-- ================================================================ 3. Integrity
-- Item lines: same organisation, the item's own fund, on or after the start date, and the right
-- direction for the kind of item. Fixed assets: one purchase (when not owned before the start date),
-- and sale proceeds only on the disposal date.
CREATE OR REPLACE FUNCTION public.check_item_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it public.items%ROWTYPE;
  t public.transactions%ROWTYPE;
BEGIN
  IF NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO it FROM public.items WHERE id = NEW.item_id FOR UPDATE;
  IF NOT FOUND OR it.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'That asset or liability was not found';
  END IF;
  SELECT * INTO t FROM public.transactions WHERE id = NEW.transaction_id;
  IF t.tx_type NOT IN ('money_in', 'money_out') THEN
    RAISE EXCEPTION 'Only money in or money out can be recorded against an asset or liability';
  END IF;
  IF NEW.fund_id <> it.fund_id THEN
    RAISE EXCEPTION 'A line for an asset or liability uses that item''s fund';
  END IF;
  IF t.tx_date < public.org_start(it.organization_id) THEN
    RAISE EXCEPTION 'This date is before your tracking start date. Enter it in the opening position instead.';
  END IF;
  IF it.kind = 'fixed_asset' THEN
    IF t.tx_type = 'money_out' THEN
      IF it.opening_cost > 0 THEN
        RAISE EXCEPTION 'This asset was owned before the start date, so its cost is in the opening position';
      END IF;
      IF EXISTS (SELECT 1 FROM public.transaction_lines l JOIN public.transactions x ON x.id = l.transaction_id
                 WHERE l.item_id = it.id AND x.tx_type = 'money_out' AND l.id IS DISTINCT FROM NEW.id) THEN
        RAISE EXCEPTION 'This asset''s purchase is already recorded. Add improvements as a new asset.';
      END IF;
      IF it.disposed_date IS NOT NULL OR (it.acquired_date IS NOT NULL AND t.tx_date <> it.acquired_date) THEN
        RAISE EXCEPTION 'The purchase date must be the asset''s acquired date';
      END IF;
    ELSE
      IF it.disposed_date IS NULL OR t.tx_date <> it.disposed_date THEN
        RAISE EXCEPTION 'Sale proceeds are recorded with the disposal, on the disposal date';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_item_line ON public.transaction_lines;
CREATE TRIGGER trg_check_item_line
  BEFORE INSERT OR UPDATE OF item_id, fund_id, amount ON public.transaction_lines
  FOR EACH ROW EXECUTE FUNCTION public.check_item_line();

-- Item movements and fund transfers are changed only through the functions below (NOT security
-- definer on purpose: current_user is the caller). save_money_in runs with the user's own rights, so
-- it can never turn a loan into income.
CREATE OR REPLACE FUNCTION public.guard_item_lines()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tx uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_TABLE_NAME = 'transaction_lines' THEN
    IF (TG_OP <> 'DELETE' AND NEW.item_id IS NOT NULL) OR (TG_OP <> 'INSERT' AND OLD.item_id IS NOT NULL) THEN
      RAISE EXCEPTION 'This entry is for an asset or liability. Change it from the Assets & Liabilities page.';
    END IF;
    v_tx := COALESCE(NEW.transaction_id, OLD.transaction_id);
  ELSE
    IF OLD.tx_type = 'fund_transfer' THEN
      RAISE EXCEPTION 'Fund transfers are changed from the Funds settings.';
    END IF;
    v_tx := OLD.id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = v_tx AND l.item_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This entry is for an asset or liability. Change it from the Assets & Liabilities page.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_item_lines ON public.transaction_lines;
CREATE TRIGGER trg_guard_item_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.transaction_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_lines();
DROP TRIGGER IF EXISTS trg_guard_item_tx ON public.transactions;
CREATE TRIGGER trg_guard_item_tx
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_lines();

-- The start date can only move where it keeps every item movement on or after it
CREATE OR REPLACE FUNCTION public.protect_tracking_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_start_date IS NOT DISTINCT FROM OLD.tracking_start_date THEN
    RETURN NEW;
  END IF;
  IF NEW.tracking_start_date IS NULL AND OLD.opening_position_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'The tracking start date cannot be removed once the opening position is complete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
    WHERE l.item_id IS NOT NULL AND t.organization_id = NEW.id
      AND t.tx_date < COALESCE(NEW.tracking_start_date, '-infinity'::date)
  ) OR EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.organization_id = NEW.id AND t.tx_type = 'fund_transfer'
      AND t.tx_date < COALESCE(NEW.tracking_start_date, '-infinity'::date)
  ) THEN
    RAISE EXCEPTION 'Some asset, loan or fund transfer entries are dated before that start date. Choose an earlier start date.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.organization_id = NEW.id AND i.kind = 'fixed_asset' AND i.opening_cost > 0
      AND i.acquired_date >= COALESCE(NEW.tracking_start_date, 'infinity'::date)
  ) THEN
    RAISE EXCEPTION 'Some assets in the opening position were acquired on or after that start date. Choose a later start date.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_tracking_start ON public.organizations;
CREATE TRIGGER trg_protect_tracking_start
  BEFORE UPDATE OF tracking_start_date ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_tracking_start();

-- Fund transfers: both funds belong to the organisation. Re-created from the exact current text
-- (20261122100000_money_in_foundation.sql) with the fund checks added for transfers.
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
    IF (NEW.from_fund_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.funds f WHERE f.id = NEW.from_fund_id AND f.organization_id = NEW.organization_id))
       OR (NEW.to_fund_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.funds f WHERE f.id = NEW.to_fund_id AND f.organization_id = NEW.organization_id)) THEN
      RAISE EXCEPTION 'The fund does not belong to this organisation';
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

-- Deleting a fund moves its lines and items to the General Fund. Re-created from the exact current
-- text (20261125100000_invoices.sql) with items added.
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
    UPDATE public.invoice_lines
    SET fund_id = (
      SELECT f.id FROM public.funds f WHERE f.organization_id = OLD.organization_id AND f.is_default LIMIT 1
    )
    WHERE fund_id = OLD.id;
    UPDATE public.items
    SET fund_id = (
      SELECT f.id FROM public.funds f WHERE f.organization_id = OLD.organization_id AND f.is_default LIMIT 1
    )
    WHERE fund_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$function$;

-- Deleting an organisation removes its items after the transactions that point at them. Re-created
-- from the exact current text (20261125100000_invoices.sql) with one line added.
CREATE OR REPLACE FUNCTION public.delete_organization_data(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.donation_receipts    WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.transactions         WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.invoices             WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.items                WHERE organization_id::text = p_org_id::text;
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

-- ================================================================ 4. Computed figures
-- Straight-line depreciation, one row per item and month (dated the 1st of the month), a full month
-- from the month of purchase. An asset owned before the start date continues from its opening net
-- book value over the rest of its life. Whole cents: each month is the rounded running total less the
-- month before, so the months always add up to exactly the depreciable amount. Stops before the
-- month of disposal.
CREATE OR REPLACE FUNCTION public.fixed_asset_charges(p_org uuid)
RETURNS TABLE (item_id uuid, fund_id uuid, month date, amount numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH a AS (
    SELECT i.id, i.fund_id, i.useful_life_months AS life, i.disposed_date,
           date_trunc('month', i.acquired_date)::date AS acq_m,
           GREATEST(date_trunc('month', i.acquired_date)::date, public.org_start(p_org)) AS dep_m,
           GREATEST(i.opening_cost + COALESCE(p.purchases, 0) - i.opening_accumulated_depreciation - i.residual_value, 0) AS base
    FROM public.items i
    LEFT JOIN LATERAL (
      SELECT sum(l.amount) AS purchases
      FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
      WHERE l.item_id = i.id AND t.tx_type = 'money_out'
    ) p ON true
    WHERE i.organization_id = p_org AND i.kind = 'fixed_asset' AND i.acquired_date IS NOT NULL
  ),
  b AS (
    SELECT a.*,
           GREATEST(a.life - ((extract(year FROM a.dep_m) * 12 + extract(month FROM a.dep_m))
                            - (extract(year FROM a.acq_m) * 12 + extract(month FROM a.acq_m)))::integer, 0) AS remaining
    FROM a
  )
  SELECT b.id, b.fund_id, (b.dep_m + make_interval(months => g.i))::date,
         round(b.base * (g.i + 1) / b.remaining, 2) - round(b.base * g.i / b.remaining, 2)
  FROM b
  CROSS JOIN LATERAL generate_series(0, b.remaining - 1) AS g(i)
  WHERE b.remaining > 0 AND b.base > 0
    AND (b.disposed_date IS NULL OR (b.dep_m + make_interval(months => g.i))::date < date_trunc('month', b.disposed_date)::date);
$$;

-- Each fixed asset at a date: cost, depreciation to date and net book value. A disposed asset (on or
-- before the date) or one not yet acquired is not listed.
CREATE OR REPLACE FUNCTION public.fixed_asset_position(p_org uuid, p_date date)
RETURNS TABLE (item_id uuid, name text, fund_id uuid, cost numeric, accumulated numeric, nbv numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT i.id, i.name, i.fund_id, x.cost, x.acc, x.cost - x.acc
  FROM public.items i
  CROSS JOIN LATERAL (
    SELECT i.opening_cost + COALESCE((
             SELECT sum(l.amount) FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
             WHERE l.item_id = i.id AND t.tx_type = 'money_out' AND t.tx_date <= p_date), 0) AS cost,
           i.opening_accumulated_depreciation + COALESCE((
             SELECT sum(c.amount) FROM public.fixed_asset_charges(p_org) c WHERE c.item_id = i.id AND c.month <= p_date), 0) AS acc
  ) x
  WHERE i.organization_id = p_org AND i.kind = 'fixed_asset'
    AND i.acquired_date <= p_date
    AND (i.disposed_date IS NULL OR i.disposed_date > p_date);
$$;

-- Each disposal: proceeds, net book value just before it, and the loss (a negative loss is a gain)
CREATE OR REPLACE FUNCTION public.disposal_results(p_org uuid)
RETURNS TABLE (item_id uuid, fund_id uuid, disposed_date date, proceeds numeric, nbv numeric, loss numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT i.id, i.fund_id, i.disposed_date, x.proceeds, x.nbv, x.nbv - x.proceeds
  FROM public.items i
  CROSS JOIN LATERAL (
    SELECT COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
                     WHERE l.item_id = i.id AND t.tx_type = 'money_in'), 0) AS proceeds,
           i.opening_cost
             + COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
                         WHERE l.item_id = i.id AND t.tx_type = 'money_out'), 0)
             - i.opening_accumulated_depreciation
             - COALESCE((SELECT sum(c.amount) FROM public.fixed_asset_charges(p_org) c WHERE c.item_id = i.id), 0) AS nbv
  ) x
  WHERE i.organization_id = p_org AND i.kind = 'fixed_asset' AND i.disposed_date IS NOT NULL;
$$;

-- Other assets and liabilities at a date: opening balance plus movements from the start date
CREATE OR REPLACE FUNCTION public.item_balances(p_org uuid, p_date date)
RETURNS TABLE (item_id uuid, name text, kind text, classification text, fund_id uuid, balance numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT i.id, i.name, i.kind, i.classification, i.fund_id,
         i.opening_balance + COALESCE((
           SELECT sum(CASE WHEN (t.tx_type = 'money_out') = (i.kind = 'other_asset') THEN l.amount ELSE -l.amount END)
           FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
           WHERE l.item_id = i.id AND t.tx_date >= public.org_start(p_org) AND t.tx_date <= p_date), 0)
  FROM public.items i
  WHERE i.organization_id = p_org AND i.kind IN ('other_asset', 'liability');
$$;

-- Owed to you (receivable) and by you (payable) at a date: open invoices issued by then, less the
-- payments made by then. An invoice flagged as an opening balance counts as issued before the start.
CREATE OR REPLACE FUNCTION public.invoice_balances_at(p_org uuid, p_date date)
RETURNS TABLE (direction text, amount numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT i.direction,
         COALESCE(sum(i.total - COALESCE((
           SELECT sum(l.amount) FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
           WHERE l.invoice_id = i.id AND t.tx_date <= p_date), 0)), 0)
  FROM public.invoices i
  WHERE i.organization_id = p_org AND i.status = 'open'
    AND (CASE WHEN i.is_opening_balance THEN LEAST(i.issue_date, public.org_start(p_org) - 1) ELSE i.issue_date END) <= p_date
  GROUP BY i.direction;
$$;

-- Cash per account at a date: opening balance plus movements from the start date (R2)
CREATE OR REPLACE FUNCTION public.account_balances(p_org uuid, p_date date)
RETURNS TABLE (account_id uuid, name text, balance numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT a.id, a.name,
         a.opening_balance + COALESCE((
           SELECT sum(CASE
                        WHEN t.tx_type = 'money_in'  AND t.account_id = a.id THEN t.total
                        WHEN t.tx_type = 'money_out' AND t.account_id = a.id THEN -t.total
                        WHEN t.tx_type = 'account_transfer' AND t.account_id = a.id THEN -t.total
                        WHEN t.tx_type = 'account_transfer' AND t.to_account_id = a.id THEN t.total
                        ELSE 0 END)
           FROM public.transactions t
           WHERE t.organization_id = p_org AND (t.account_id = a.id OR t.to_account_id = a.id)
             AND t.tx_date >= public.org_start(p_org) AND t.tx_date <= p_date), 0)
  FROM public.accounts a
  WHERE a.organization_id = p_org;
$$;

-- Net assets at the start date (the opening position)
CREATE OR REPLACE FUNCTION public.opening_net_assets(p_org uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT sum(a.opening_balance) FROM public.accounts a WHERE a.organization_id = p_org), 0)
       + COALESCE((SELECT sum(CASE WHEN b.direction = 'receivable' THEN b.amount ELSE -b.amount END)
                   FROM public.invoice_balances_at(p_org, public.org_start(p_org) - 1) b), 0)
       + COALESCE((SELECT sum(CASE WHEN i.kind = 'other_asset' THEN i.opening_balance ELSE -i.opening_balance END)
                   FROM public.items i WHERE i.organization_id = p_org AND i.kind IN ('other_asset', 'liability')), 0)
       + COALESCE((SELECT sum(i.opening_cost - i.opening_accumulated_depreciation)
                   FROM public.items i WHERE i.organization_id = p_org AND i.kind = 'fixed_asset'
                     AND i.acquired_date < public.org_start(p_org)
                     AND (i.disposed_date IS NULL OR i.disposed_date >= public.org_start(p_org))), 0);
$$;

-- Opening balance of each fund. The General Fund's is the balancing figure, so the opening position
-- balances by construction (spec 5.6).
CREATE OR REPLACE FUNCTION public.fund_openings(p_org uuid)
RETURNS TABLE (fund_id uuid, opening numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT f.id,
         CASE WHEN f.is_default
              THEN public.opening_net_assets(p_org)
                   - COALESCE((SELECT sum(x.opening_balance) FROM public.funds x WHERE x.organization_id = p_org AND NOT x.is_default), 0)
              ELSE f.opening_balance END
  FROM public.funds f
  WHERE f.organization_id = p_org;
$$;

-- ================================================================ 5. Income & Expenditure
-- Re-created from its exact current text (20261125100000_invoices.sql), adding (c) depreciation,
-- charged to the asset's fund under the system category "Depreciation", dated the 1st of each month,
-- and (d) gain or loss on disposal on the disposal date. Item lines have no category, so purchases,
-- loans and repayments are never counted (R6).
CREATE OR REPLACE FUNCTION public.income_expenditure(p_org uuid, p_from date, p_to date, p_fund uuid DEFAULT NULL)
RETURNS TABLE (kind text, nature text, group_name text, category_id uuid, category_name text,
               category_sort integer, fund_id uuid, fund_name text, amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH lines AS (
    SELECT l.category_id, l.fund_id,
           CASE
             WHEN c.kind = 'income'  AND t.tx_type = 'money_in'  THEN l.amount
             WHEN c.kind = 'income'  AND t.tx_type = 'money_out' THEN -l.amount
             WHEN c.kind = 'expense' AND t.tx_type = 'money_out' THEN l.amount
             ELSE -l.amount
           END AS amt
    FROM public.transactions t
    JOIN public.transaction_lines l ON l.transaction_id = t.id
    JOIN public.categories c ON c.id = l.category_id
    WHERE t.organization_id = p_org
      AND t.tx_type IN ('money_in', 'money_out')
      AND l.invoice_id IS NULL
      AND t.tx_date BETWEEN p_from AND p_to
      AND (p_fund IS NULL OR l.fund_id = p_fund)
    UNION ALL
    SELECT il.category_id, il.fund_id, il.amount
    FROM public.invoices i
    JOIN public.invoice_lines il ON il.invoice_id = i.id
    WHERE i.organization_id = p_org
      AND i.status = 'open'
      AND NOT i.is_opening_balance
      AND i.issue_date BETWEEN p_from AND p_to
      AND (p_fund IS NULL OR il.fund_id = p_fund)
    UNION ALL
    SELECT (SELECT c.id FROM public.categories c WHERE c.organization_id = p_org AND c.is_system AND c.name = 'Depreciation'),
           d.fund_id, d.amount
    FROM public.fixed_asset_charges(p_org) d
    WHERE d.month BETWEEN p_from AND p_to
      AND (p_fund IS NULL OR d.fund_id = p_fund)
    UNION ALL
    SELECT (SELECT c.id FROM public.categories c WHERE c.organization_id = p_org AND c.is_system AND c.name = 'Gain/loss on disposal'),
           r.fund_id, r.loss
    FROM public.disposal_results(p_org) r
    WHERE r.disposed_date BETWEEN p_from AND p_to AND r.loss <> 0
      AND (p_fund IS NULL OR r.fund_id = p_fund)
  )
  SELECT c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name, sum(x.amt)
  FROM lines x
  JOIN public.categories c ON c.id = x.category_id
  JOIN public.funds f ON f.id = x.fund_id
  GROUP BY c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name;
$$;

-- ================================================================ 6. Funds (R4) and the balance sheet (R5)
-- Income, expenditure and transfers of each fund between two dates
CREATE OR REPLACE FUNCTION public.fund_movements(p_org uuid, p_from date, p_to date)
RETURNS TABLE (fund_id uuid, income numeric, expense numeric, transfers_in numeric, transfers_out numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ie AS (
    SELECT x.fund_id, sum(x.amount) FILTER (WHERE x.kind = 'income') AS inc, sum(x.amount) FILTER (WHERE x.kind = 'expense') AS exp
    FROM public.income_expenditure(p_org, p_from, p_to) x
    GROUP BY x.fund_id
  ),
  tr AS (
    SELECT f.id AS fund_id,
           sum(t.total) FILTER (WHERE t.to_fund_id = f.id) AS tin,
           sum(t.total) FILTER (WHERE t.from_fund_id = f.id) AS tout
    FROM public.funds f
    JOIN public.transactions t ON t.organization_id = p_org AND t.tx_type = 'fund_transfer'
      AND (t.to_fund_id = f.id OR t.from_fund_id = f.id) AND t.tx_date BETWEEN p_from AND p_to
    WHERE f.organization_id = p_org
    GROUP BY f.id
  )
  SELECT f.id, COALESCE(ie.inc, 0), COALESCE(ie.exp, 0), COALESCE(tr.tin, 0), COALESCE(tr.tout, 0)
  FROM public.funds f
  LEFT JOIN ie ON ie.fund_id = f.id
  LEFT JOIN tr ON tr.fund_id = f.id
  WHERE f.organization_id = p_org;
$$;

-- Statement of Changes in Funds (spec 6.4): per fund, the balance at the start of the period, income,
-- expenditure, transfers and the balance at the end. Nothing before the start date counts.
CREATE OR REPLACE FUNCTION public.changes_in_funds(p_org uuid, p_from date, p_to date)
RETURNS TABLE (fund_id uuid, fund_name text, fund_type text, is_default boolean, archived boolean,
               opening numeric, income numeric, expense numeric, transfers_in numeric, transfers_out numeric, closing numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH s AS (SELECT public.org_start(p_org) AS sd),
  win AS (SELECT GREATEST(p_from, s.sd) AS f FROM s),
  before AS (
    SELECT m.* FROM s, win, LATERAL public.fund_movements(p_org, s.sd, win.f - 1) m WHERE win.f > s.sd
  ),
  during AS (
    SELECT m.* FROM win, LATERAL public.fund_movements(p_org, win.f, p_to) m
  )
  SELECT f.id, f.name, f.fund_type, f.is_default, (f.archived_at IS NOT NULL OR COALESCE(f.is_archived, false)),
         o.opening + COALESCE(b.income - b.expense + b.transfers_in - b.transfers_out, 0),
         COALESCE(d.income, 0), COALESCE(d.expense, 0), COALESCE(d.transfers_in, 0), COALESCE(d.transfers_out, 0),
         o.opening + COALESCE(b.income - b.expense + b.transfers_in - b.transfers_out, 0)
           + COALESCE(d.income - d.expense + d.transfers_in - d.transfers_out, 0)
  FROM public.funds f
  JOIN public.fund_openings(p_org) o ON o.fund_id = f.id
  LEFT JOIN before b ON b.fund_id = f.id
  LEFT JOIN during d ON d.fund_id = f.id
  WHERE f.organization_id = p_org;
$$;

-- Statement of Financial Position (spec 6.2) at a date, one row per line. Sections:
--   fixed_assets, other_non_current_assets, cash, receivables, other_current_assets,
--   payables, current_liabilities, non_current_liabilities, funds
CREATE OR REPLACE FUNCTION public.balance_sheet(p_org uuid, p_date date)
RETURNS TABLE (section text, ref_id uuid, label text, amount numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT 'fixed_assets', p.item_id, p.name, p.nbv FROM public.fixed_asset_position(p_org, p_date) p
  UNION ALL
  SELECT CASE WHEN b.classification = 'current' THEN 'other_current_assets' ELSE 'other_non_current_assets' END, b.item_id, b.name, b.balance
  FROM public.item_balances(p_org, p_date) b WHERE b.kind = 'other_asset'
  UNION ALL
  SELECT 'cash', a.account_id, a.name, a.balance FROM public.account_balances(p_org, p_date) a
  UNION ALL
  SELECT CASE WHEN v.direction = 'receivable' THEN 'receivables' ELSE 'payables' END, NULL::uuid,
         CASE WHEN v.direction = 'receivable' THEN 'Owed to you (invoices)' ELSE 'You owe (bills)' END, v.amount
  FROM public.invoice_balances_at(p_org, p_date) v
  UNION ALL
  SELECT CASE WHEN b.classification = 'current' THEN 'current_liabilities' ELSE 'non_current_liabilities' END, b.item_id, b.name, b.balance
  FROM public.item_balances(p_org, p_date) b WHERE b.kind = 'liability'
  UNION ALL
  SELECT 'funds', c.fund_id, c.fund_name, c.closing FROM public.changes_in_funds(p_org, public.org_start(p_org), p_date) c;
$$;

-- R5 at a date: assets - liabilities against the total of the funds. Zero difference = it balances.
CREATE OR REPLACE FUNCTION public.balance_check(p_org uuid, p_date date)
RETURNS TABLE (net_assets numeric, funds_total numeric, difference numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH b AS (SELECT * FROM public.balance_sheet(p_org, p_date)),
  n AS (
    SELECT COALESCE(sum(CASE WHEN section IN ('payables', 'current_liabilities', 'non_current_liabilities') THEN -amount
                             WHEN section = 'funds' THEN 0 ELSE amount END), 0) AS net,
           COALESCE(sum(amount) FILTER (WHERE section = 'funds'), 0) AS funds
    FROM b
  )
  SELECT n.net, n.funds, n.net - n.funds FROM n;
$$;

-- Fixed asset schedule (spec 6.5) between two dates: cost and depreciation brought forward, additions,
-- disposals, charge for the period, and carried forward.
CREATE OR REPLACE FUNCTION public.fixed_asset_schedule(p_org uuid, p_from date, p_to date)
RETURNS TABLE (item_id uuid, name text, fund_id uuid,
               cost_open numeric, additions numeric, disposals_cost numeric, cost_close numeric,
               dep_open numeric, dep_charge numeric, dep_disposals numeric, dep_close numeric, nbv_open numeric, nbv_close numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH o AS (SELECT * FROM public.fixed_asset_position(p_org, p_from - 1)),
  c AS (SELECT * FROM public.fixed_asset_position(p_org, p_to)),
  ch AS (SELECT x.item_id, sum(x.amount) AS amt FROM public.fixed_asset_charges(p_org) x WHERE x.month BETWEEN p_from AND p_to GROUP BY x.item_id),
  addn AS (
    SELECT l.item_id, sum(l.amount) AS amt
    FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
    WHERE t.organization_id = p_org AND t.tx_type = 'money_out' AND l.item_id IS NOT NULL AND t.tx_date BETWEEN p_from AND p_to
    GROUP BY l.item_id
  )
  SELECT i.id, i.name, i.fund_id,
         COALESCE(o.cost, 0), COALESCE(addn.amt, 0),
         CASE WHEN i.disposed_date BETWEEN p_from AND p_to THEN COALESCE(o.cost, 0) + COALESCE(addn.amt, 0) ELSE 0 END,
         COALESCE(c.cost, 0),
         COALESCE(o.accumulated, 0), COALESCE(ch.amt, 0),
         CASE WHEN i.disposed_date BETWEEN p_from AND p_to THEN COALESCE(o.accumulated, 0) + COALESCE(ch.amt, 0) ELSE 0 END,
         COALESCE(c.accumulated, 0), COALESCE(o.nbv, 0), COALESCE(c.nbv, 0)
  FROM public.items i
  LEFT JOIN o ON o.item_id = i.id
  LEFT JOIN c ON c.item_id = i.id
  LEFT JOIN ch ON ch.item_id = i.id
  LEFT JOIN addn ON addn.item_id = i.id
  WHERE i.organization_id = p_org AND i.kind = 'fixed_asset'
    AND (o.item_id IS NOT NULL OR c.item_id IS NOT NULL OR addn.item_id IS NOT NULL OR i.disposed_date BETWEEN p_from AND p_to);
$$;

-- ================================================================ 7. Cash reports follow the start date
-- Receipts and Payments, re-created from its exact current text (20261125100000_invoices.sql), adding
-- the cash movements of assets and liabilities as their own lines (kind 'item'; group_name says what).
CREATE OR REPLACE FUNCTION public.receipts_payments(p_org uuid, p_from date, p_to date, p_fund uuid DEFAULT NULL)
RETURNS TABLE (section text, kind text, nature text, group_name text, category_id uuid, category_name text,
               category_sort integer, fund_id uuid, fund_name text, amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE WHEN t.tx_type = 'money_in' THEN 'receipts' ELSE 'payments' END,
         c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name, sum(l.amount)
  FROM public.transactions t
  JOIN public.transaction_lines l ON l.transaction_id = t.id
  JOIN public.categories c ON c.id = l.category_id
  JOIN public.funds f ON f.id = l.fund_id
  WHERE t.organization_id = p_org
    AND t.tx_type IN ('money_in', 'money_out')
    AND t.tx_date BETWEEN p_from AND p_to
    AND (p_fund IS NULL OR l.fund_id = p_fund)
  GROUP BY 1, c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name
  UNION ALL
  SELECT CASE WHEN t.tx_type = 'money_in' THEN 'receipts' ELSE 'payments' END,
         'item', NULL::text,
         CASE
           WHEN i.kind = 'fixed_asset' AND t.tx_type = 'money_out' THEN 'Purchase of fixed assets'
           WHEN i.kind = 'fixed_asset' THEN 'Sale of fixed assets'
           WHEN i.kind = 'liability' AND t.tx_type = 'money_in' THEN 'Loans received'
           WHEN i.kind = 'liability' THEN 'Loan repayments'
           WHEN t.tx_type = 'money_out' THEN 'Deposits and other assets paid'
           ELSE 'Deposits and other assets returned'
         END,
         i.id, i.name, 0, f.id, f.name, sum(l.amount)
  FROM public.transactions t
  JOIN public.transaction_lines l ON l.transaction_id = t.id
  JOIN public.items i ON i.id = l.item_id
  JOIN public.funds f ON f.id = l.fund_id
  WHERE t.organization_id = p_org
    AND t.tx_type IN ('money_in', 'money_out')
    AND t.tx_date BETWEEN p_from AND p_to
    AND (p_fund IS NULL OR l.fund_id = p_fund)
  GROUP BY 1, 4, i.id, i.name, f.id, f.name;
$$;

-- Cash across all accounts at the start of p_from and at the end of p_to. Re-created from its exact
-- current text, now counting movements only from the tracking start date (the opening balances are
-- the position on that date).
CREATE OR REPLACE FUNCTION public.cash_position(p_org uuid, p_from date, p_to date)
RETURNS TABLE (opening numeric, closing numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT COALESCE(sum(a.opening_balance), 0) AS ob FROM public.accounts a WHERE a.organization_id = p_org
  ),
  moves AS (
    SELECT t.tx_date, CASE t.tx_type WHEN 'money_in' THEN t.total WHEN 'money_out' THEN -t.total ELSE 0 END AS signed
    FROM public.transactions t WHERE t.organization_id = p_org AND t.tx_date >= public.org_start(p_org)
  )
  SELECT base.ob + COALESCE((SELECT sum(signed) FROM moves WHERE tx_date < p_from), 0),
         base.ob + COALESCE((SELECT sum(signed) FROM moves WHERE tx_date <= p_to), 0)
  FROM base;
$$;

-- Running balance of one account (cash book). Re-created from its exact current text
-- (20261123100000_cash_book.sql), counting only entries from the tracking start date; earlier entries
-- get no running balance.
CREATE OR REPLACE FUNCTION public.account_running_balance(p_account uuid, p_ids uuid[])
RETURNS TABLE (transaction_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH moves AS (
    SELECT t.id, t.tx_date, t.created_at,
           CASE
             WHEN t.tx_type = 'money_in'  AND t.account_id = p_account THEN t.total
             WHEN t.tx_type = 'money_out' AND t.account_id = p_account THEN -t.total
             WHEN t.tx_type = 'account_transfer' AND t.account_id = p_account THEN -t.total
             WHEN t.tx_type = 'account_transfer' AND t.to_account_id = p_account THEN t.total
             ELSE 0
           END AS signed
    FROM public.transactions t
    WHERE (t.account_id = p_account OR t.to_account_id = p_account)
      AND t.tx_date >= public.org_start(t.organization_id)
  ),
  running AS (
    SELECT m.id,
           COALESCE((SELECT a.opening_balance FROM public.accounts a WHERE a.id = p_account), 0)
             + sum(m.signed) OVER (ORDER BY m.tx_date, m.created_at, m.id) AS bal
    FROM moves m
  )
  SELECT r.id, r.bal FROM running r WHERE r.id = ANY (p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.org_start(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fixed_asset_charges(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fixed_asset_position(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disposal_results(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.item_balances(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_balances_at(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_balances(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.opening_net_assets(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fund_openings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.income_expenditure(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fund_movements(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.changes_in_funds(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.balance_sheet(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.balance_check(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fixed_asset_schedule(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receipts_payments(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cash_position(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_running_balance(uuid, uuid[]) TO authenticated, service_role;

-- ================================================================ 8. Functions people call
-- Shared check: the caller's organisation, the role and the plan feature
CREATE OR REPLACE FUNCTION public.writer_org(p_feature text, p_admin_only boolean)
RETURNS uuid
LANGUAGE plpgsql
STABLE
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
  IF p_admin_only AND public.get_user_role() IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Only Admins can change this';
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'Admin' AND public.get_user_role() IS DISTINCT FROM 'Editor' THEN
    RAISE EXCEPTION 'Only Admins and Editors can change this';
  END IF;
  IF NOT public.org_feature_allowed(v_org, p_feature, 'use') THEN
    RAISE EXCEPTION 'This is available on the Growth and Nonprofit plans';
  END IF;
  RETURN v_org;
END;
$$;
REVOKE ALL ON FUNCTION public.writer_org(text, boolean) FROM PUBLIC, anon;

-- Saves an asset or liability. payload: {id?, name, kind, classification, fund_id?, notes?, archived?,
--   opening_balance? (other assets and liabilities), acquired_date?, opening_cost?,
--   opening_accumulated_depreciation?, residual_value?, useful_life_months? (fixed assets)}
-- A fixed asset owned before the start date takes its opening cost and depreciation to date; one
-- acquired later takes its cost from its purchase (record_item_transaction).
CREATE OR REPLACE FUNCTION public.save_item(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
  cur public.items%ROWTYPE;
  v_kind text;
  v_class text;
  v_fund uuid;
  v_start date;
  v_has_lines boolean := false;
  v_acq date;
  v_ob numeric; v_oc numeric; v_oad numeric; v_rv numeric; v_life integer;
BEGIN
  v_org := public.writer_org('assets', false);
  v_start := (SELECT tracking_start_date FROM public.organizations WHERE id = v_org);
  v_kind := payload ->> 'kind';
  IF v_kind IS NULL OR v_kind NOT IN ('fixed_asset', 'other_asset', 'liability') THEN
    RAISE EXCEPTION 'Choose a fixed asset, another asset or a liability';
  END IF;
  v_class := CASE WHEN v_kind = 'fixed_asset' THEN 'non_current' ELSE COALESCE(NULLIF(payload ->> 'classification', ''), 'current') END;
  IF v_class NOT IN ('current', 'non_current') THEN
    RAISE EXCEPTION 'Choose current or non-current';
  END IF;
  IF btrim(COALESCE(payload ->> 'name', '')) = '' THEN
    RAISE EXCEPTION 'Enter a name';
  END IF;
  v_fund := COALESCE(NULLIF(payload ->> 'fund_id', '')::uuid, (SELECT id FROM public.funds WHERE organization_id = v_org AND is_default));
  IF NOT EXISTS (SELECT 1 FROM public.funds WHERE id = v_fund AND organization_id = v_org) THEN
    RAISE EXCEPTION 'The fund does not belong to this organisation';
  END IF;
  BEGIN
    v_ob := COALESCE(NULLIF(payload ->> 'opening_balance', '')::numeric, 0);
    v_oc := COALESCE(NULLIF(payload ->> 'opening_cost', '')::numeric, 0);
    v_oad := COALESCE(NULLIF(payload ->> 'opening_accumulated_depreciation', '')::numeric, 0);
    v_rv := COALESCE(NULLIF(payload ->> 'residual_value', '')::numeric, 0);
    v_life := NULLIF(payload ->> 'useful_life_months', '')::integer;
    v_acq := NULLIF(payload ->> 'acquired_date', '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter valid amounts and dates';
  END;
  IF v_ob < 0 OR v_oc < 0 OR v_oad < 0 OR v_rv < 0
     OR v_ob <> round(v_ob, 2) OR v_oc <> round(v_oc, 2) OR v_oad <> round(v_oad, 2) OR v_rv <> round(v_rv, 2) THEN
    RAISE EXCEPTION 'Amounts must be zero or more, with at most two decimals';
  END IF;

  IF v_kind = 'fixed_asset' THEN
    IF v_life IS NULL OR v_life < 1 OR v_life > 1200 THEN
      RAISE EXCEPTION 'Enter the useful life in months (1 to 1200)';
    END IF;
    IF v_acq IS NULL THEN
      RAISE EXCEPTION 'Enter the date the asset was bought';
    END IF;
    IF v_start IS NOT NULL AND v_acq < v_start THEN
      -- owned before the start date: its cost and depreciation so far are part of the opening position
      IF v_oc <= 0 THEN
        RAISE EXCEPTION 'This asset was bought before your start date: enter its cost and depreciation to date';
      END IF;
      IF v_oad + v_rv > v_oc THEN
        RAISE EXCEPTION 'Depreciation to date plus residual value cannot be more than the cost';
      END IF;
    ELSE
      IF v_oc > 0 OR v_oad > 0 THEN
        RAISE EXCEPTION 'An asset bought on or after the start date takes its cost from its purchase. Record the purchase instead.';
      END IF;
    END IF;
    v_ob := 0;
  ELSE
    v_oc := 0; v_oad := 0; v_rv := 0; v_life := NULL; v_acq := NULL;
    IF v_ob > 0 AND v_start IS NULL THEN
      RAISE EXCEPTION 'Set your tracking start date in the opening position before entering opening balances';
    END IF;
  END IF;

  v_id := NULLIF(payload ->> 'id', '')::uuid;
  IF v_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.items WHERE id = v_id AND organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That asset or liability was not found';
    END IF;
    v_has_lines := EXISTS (SELECT 1 FROM public.transaction_lines WHERE item_id = v_id);
    IF v_has_lines AND (cur.kind <> v_kind OR cur.fund_id <> v_fund OR cur.acquired_date IS DISTINCT FROM v_acq) THEN
      RAISE EXCEPTION 'This item has entries, so its kind, fund and acquired date cannot change';
    END IF;
    IF cur.disposed_date IS NOT NULL THEN
      RAISE EXCEPTION 'A disposed asset cannot be changed. Undo the disposal first.';
    END IF;
    UPDATE public.items
    SET name = left(btrim(payload ->> 'name'), 200), kind = v_kind, classification = v_class, fund_id = v_fund,
        opening_balance = v_ob, acquired_date = v_acq, opening_cost = v_oc, opening_accumulated_depreciation = v_oad,
        residual_value = v_rv, useful_life_months = v_life,
        notes = NULLIF(left(btrim(COALESCE(payload ->> 'notes', '')), 500), ''),
        archived_at = CASE WHEN (payload ->> 'archived')::boolean IS TRUE THEN COALESCE(archived_at, now()) ELSE NULL END,
        updated_at = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.items (organization_id, name, kind, classification, fund_id, opening_balance, acquired_date,
                              opening_cost, opening_accumulated_depreciation, residual_value, useful_life_months, notes, created_by)
    VALUES (v_org, left(btrim(payload ->> 'name'), 200), v_kind, v_class, v_fund, v_ob, v_acq, v_oc, v_oad, v_rv, v_life,
            NULLIF(left(btrim(COALESCE(payload ->> 'notes', '')), 500), ''), auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'An asset or liability with this name already exists';
END;
$$;

-- Deletes an item that has no entries (anything else is archived instead)
CREATE OR REPLACE FUNCTION public.delete_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := public.writer_org('assets', false);
  IF EXISTS (SELECT 1 FROM public.transaction_lines WHERE item_id = p_id) THEN
    RAISE EXCEPTION 'This item has entries, so it cannot be deleted. Archive it instead.';
  END IF;
  DELETE FROM public.items WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That asset or liability was not found';
  END IF;
END;
$$;

-- Records cash for an item. payload: {item_id, action, amount, tx_date, account_id?, payee_name?, reference?, remarks?}
--   fixed asset:  purchase (money out; sets the acquired date if none)
--   other asset:  pay (money out, e.g. a deposit paid) | return (money in, e.g. a deposit returned)
--   liability:    receive (money in, e.g. a loan received) | repay (money out, a repayment)
CREATE OR REPLACE FUNCTION public.record_item_transaction(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  it public.items%ROWTYPE;
  v_action text;
  v_dir text;
  v_amount numeric;
  v_date date;
  v_account uuid;
  v_bal numeric;
  v_tx uuid;
BEGIN
  v_org := public.writer_org('assets', false);
  SELECT * INTO it FROM public.items WHERE id = NULLIF(payload ->> 'item_id', '')::uuid AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That asset or liability was not found';
  END IF;
  IF it.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'That item is archived';
  END IF;
  v_action := payload ->> 'action';
  v_dir := CASE
    WHEN it.kind = 'fixed_asset' AND v_action = 'purchase' THEN 'money_out'
    WHEN it.kind = 'other_asset' AND v_action = 'pay' THEN 'money_out'
    WHEN it.kind = 'other_asset' AND v_action = 'return' THEN 'money_in'
    WHEN it.kind = 'liability' AND v_action = 'receive' THEN 'money_in'
    WHEN it.kind = 'liability' AND v_action = 'repay' THEN 'money_out'
  END;
  IF v_dir IS NULL THEN
    RAISE EXCEPTION 'That action does not apply to this kind of item';
  END IF;
  BEGIN
    v_amount := (payload ->> 'amount')::numeric;
    v_date := (payload ->> 'tx_date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter a valid amount and date';
  END;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'Enter an amount above zero with at most two decimals';
  END IF;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'Enter the date';
  END IF;
  -- A repayment or a returned deposit cannot take the balance below zero
  IF v_action IN ('repay', 'return') THEN
    SELECT b.balance INTO v_bal FROM public.item_balances(v_org, v_date) b WHERE b.item_id = it.id;
    IF v_amount > COALESCE(v_bal, 0) THEN
      RAISE EXCEPTION 'This is more than the balance on % (balance %)', v_date, COALESCE(v_bal, 0);
    END IF;
  END IF;
  IF v_action = 'purchase' AND it.acquired_date IS NULL THEN
    UPDATE public.items SET acquired_date = v_date WHERE id = it.id;
  END IF;

  v_account := NULLIF(payload ->> 'account_id', '')::uuid;
  IF v_account IS NULL THEN
    SELECT id INTO v_account FROM public.accounts WHERE organization_id = v_org AND is_default;
  END IF;
  INSERT INTO public.transactions (organization_id, tx_type, tx_date, account_id, payee_name, reference, remarks, total, source, created_by)
  VALUES (v_org, v_dir, v_date, v_account,
          NULLIF(left(btrim(COALESCE(payload ->> 'payee_name', '')), 255), ''),
          NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''),
          NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''),
          v_amount, 'manual', auth.uid())
  RETURNING id INTO v_tx;
  INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, item_id)
  VALUES (v_tx, v_org, 1, v_amount, it.fund_id, it.id);
  RETURN v_tx;
END;
$$;

-- Deletes an item entry. A fixed asset's purchase can only go while it is not disposed; disposal
-- proceeds go with undo_disposal.
CREATE OR REPLACE FUNCTION public.delete_item_transaction(p_tx uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  it public.items%ROWTYPE;
BEGIN
  v_org := public.writer_org('assets', false);
  SELECT i.* INTO it FROM public.transaction_lines l JOIN public.items i ON i.id = l.item_id
  JOIN public.transactions t ON t.id = l.transaction_id
  WHERE l.transaction_id = p_tx AND t.organization_id = v_org LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry was not found';
  END IF;
  IF it.kind = 'fixed_asset' AND it.disposed_date IS NOT NULL THEN
    RAISE EXCEPTION 'This asset is disposed. Undo the disposal first.';
  END IF;
  DELETE FROM public.transactions WHERE id = p_tx;
END;
$$;

-- Disposes of (sells or writes off) a fixed asset. payload: {item_id, disposed_date, proceeds?, account_id?, remarks?}
-- Proceeds above zero are recorded as money in on the disposal date. The gain or loss is computed by
-- the reports (net book value against proceeds), never stored.
CREATE OR REPLACE FUNCTION public.dispose_item(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  it public.items%ROWTYPE;
  v_date date;
  v_proceeds numeric;
  v_account uuid;
  v_tx uuid;
BEGIN
  v_org := public.writer_org('assets', false);
  SELECT * INTO it FROM public.items WHERE id = NULLIF(payload ->> 'item_id', '')::uuid AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND OR it.kind <> 'fixed_asset' THEN
    RAISE EXCEPTION 'That fixed asset was not found';
  END IF;
  IF it.disposed_date IS NOT NULL THEN
    RAISE EXCEPTION 'This asset is already disposed';
  END IF;
  IF it.opening_cost = 0 AND NOT EXISTS (SELECT 1 FROM public.transaction_lines WHERE item_id = it.id) THEN
    RAISE EXCEPTION 'Record the purchase of this asset before disposing of it';
  END IF;
  BEGIN
    v_date := (payload ->> 'disposed_date')::date;
    v_proceeds := COALESCE(NULLIF(payload ->> 'proceeds', '')::numeric, 0);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter a valid date and amount';
  END;
  IF v_date IS NULL OR v_date < it.acquired_date OR v_date < public.org_start(v_org) THEN
    RAISE EXCEPTION 'The disposal date must be on or after the date the asset was bought and your start date';
  END IF;
  IF v_proceeds < 0 OR v_proceeds <> round(v_proceeds, 2) THEN
    RAISE EXCEPTION 'Proceeds must be zero or more, with at most two decimals';
  END IF;
  UPDATE public.items SET disposed_date = v_date, updated_at = now() WHERE id = it.id;
  IF v_proceeds > 0 THEN
    v_account := NULLIF(payload ->> 'account_id', '')::uuid;
    IF v_account IS NULL THEN
      SELECT id INTO v_account FROM public.accounts WHERE organization_id = v_org AND is_default;
    END IF;
    INSERT INTO public.transactions (organization_id, tx_type, tx_date, account_id, reference, remarks, total, source, created_by)
    VALUES (v_org, 'money_in', v_date, v_account, NULL,
            COALESCE(NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''), 'Sale of ' || it.name),
            v_proceeds, 'manual', auth.uid())
    RETURNING id INTO v_tx;
    INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, item_id)
    VALUES (v_tx, v_org, 1, v_proceeds, it.fund_id, it.id);
  END IF;
END;
$$;

-- Undoes a disposal: removes the proceeds and puts the asset back in use
CREATE OR REPLACE FUNCTION public.undo_disposal(p_item uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := public.writer_org('assets', false);
  IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = p_item AND organization_id = v_org AND disposed_date IS NOT NULL) THEN
    RAISE EXCEPTION 'That disposed asset was not found';
  END IF;
  DELETE FROM public.transactions t
  WHERE t.organization_id = v_org AND t.tx_type = 'money_in'
    AND EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = t.id AND l.item_id = p_item);
  UPDATE public.items SET disposed_date = NULL, updated_at = now() WHERE id = p_item;
END;
$$;

-- Moves money between funds (no cash effect). payload: {id?, from_fund_id, to_fund_id, amount, tx_date, remarks?}
CREATE OR REPLACE FUNCTION public.save_fund_transfer(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
  v_from uuid;
  v_to uuid;
  v_amount numeric;
  v_date date;
  v_account uuid;
BEGIN
  v_org := public.writer_org('funds', false);
  v_from := NULLIF(payload ->> 'from_fund_id', '')::uuid;
  v_to := NULLIF(payload ->> 'to_fund_id', '')::uuid;
  IF v_from IS NULL OR v_to IS NULL OR v_from = v_to THEN
    RAISE EXCEPTION 'Choose two different funds';
  END IF;
  BEGIN
    v_amount := (payload ->> 'amount')::numeric;
    v_date := (payload ->> 'tx_date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter a valid amount and date';
  END;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'Enter an amount above zero with at most two decimals';
  END IF;
  IF v_date IS NULL OR v_date < public.org_start(v_org) THEN
    RAISE EXCEPTION 'Enter a date on or after your tracking start date';
  END IF;
  SELECT id INTO v_account FROM public.accounts WHERE organization_id = v_org AND is_default;
  v_id := NULLIF(payload ->> 'id', '')::uuid;
  IF v_id IS NULL THEN
    INSERT INTO public.transactions (organization_id, tx_type, tx_date, account_id, from_fund_id, to_fund_id, remarks, total, source, created_by)
    VALUES (v_org, 'fund_transfer', v_date, v_account, v_from, v_to,
            NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''), v_amount, 'manual', auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.transactions
    SET tx_date = v_date, from_fund_id = v_from, to_fund_id = v_to, total = v_amount,
        remarks = NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''), updated_at = now()
    WHERE id = v_id AND organization_id = v_org AND tx_type = 'fund_transfer';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That transfer was not found';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_fund_transfer(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := public.writer_org('funds', false);
  DELETE FROM public.transactions WHERE id = p_id AND organization_id = v_org AND tx_type = 'fund_transfer';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That transfer was not found';
  END IF;
END;
$$;

-- Sets the tracking start date (the 1st of a month) and, when asked, marks the opening position
-- complete. Account and restricted fund opening balances are saved on those rows by Admins as before.
-- payload: {start_date, complete?}
CREATE OR REPLACE FUNCTION public.save_opening_position(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_start date;
BEGIN
  v_org := public.writer_org('financial_statements', true);
  BEGIN
    v_start := (payload ->> 'start_date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter a valid start date';
  END;
  IF v_start IS NULL OR extract(day FROM v_start) <> 1 THEN
    RAISE EXCEPTION 'The start date must be the first day of a month';
  END IF;
  UPDATE public.organizations
  SET tracking_start_date = v_start,
      opening_position_completed_at = CASE WHEN (payload ->> 'complete')::boolean IS TRUE THEN now() ELSE opening_position_completed_at END
  WHERE id = v_org;
  UPDATE public.accounts SET opening_date = v_start WHERE organization_id = v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.save_item(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_item_transaction(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_item_transaction(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispose_item(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_disposal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fund_transfer(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_fund_transfer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_opening_position(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_item(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_item(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_item_transaction(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_item_transaction(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispose_item(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_disposal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_fund_transfer(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_fund_transfer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_opening_position(jsonb) TO authenticated, service_role;
