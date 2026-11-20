-- Transactions and lines, step 3 of Phase 1 (spec sections 3.7 and 10).
--
-- A transaction is an actual movement of cash. Money in and money out carry one or more lines, each
-- with an amount, a fund and a category, and the lines must add up to the header total. Transfers
-- (account to account, fund to fund) carry no lines.
--
-- Nothing in the app reads these tables yet and nothing the app does today changes. Documents are
-- still where people work. Every PAID document is mirrored into a transaction by a database trigger,
-- so the new tables are always current, and the old screens, reports and exports show exactly what
-- they showed before. Later phases move the app onto these tables; this step builds and proves them.
--
-- Rules the mirror follows (they match how Settings > Funds "Spent" is worked out today):
--   * a document with splits is allocated by its splits, otherwise by its own fund and category
--   * a missing or deleted fund becomes the General Fund, a missing or deleted category becomes
--     "Uncategorised"
--   * the date is the payment date; when the document has none, the document date, and the row is
--     flagged date_estimated
--   * a negative document (credit note or refund) becomes money IN against its expense category,
--     so no negative amount is ever stored

-- ---------------------------------------------------------------- Tables
CREATE TABLE IF NOT EXISTS public.transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tx_type          text NOT NULL CHECK (tx_type IN ('money_in', 'money_out', 'account_transfer', 'fund_transfer')),
  tx_date          date NOT NULL,
  date_estimated   boolean NOT NULL DEFAULT false,
  account_id       uuid NOT NULL REFERENCES public.accounts(id),
  to_account_id    uuid REFERENCES public.accounts(id),
  from_fund_id     uuid REFERENCES public.funds(id),
  to_fund_id       uuid REFERENCES public.funds(id),
  payee_id         uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  payee_name       text,
  reference        text,
  remarks          text CHECK (remarks IS NULL OR char_length(remarks) <= 500),
  total            numeric(15,2) NOT NULL CHECK (total > 0),
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_extraction', 'import', 'document')),
  document_id      uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_type_columns CHECK (
    (tx_type IN ('money_in', 'money_out')
       AND to_account_id IS NULL AND from_fund_id IS NULL AND to_fund_id IS NULL)
    OR (tx_type = 'account_transfer'
       AND to_account_id IS NOT NULL AND to_account_id <> account_id
       AND from_fund_id IS NULL AND to_fund_id IS NULL)
    OR (tx_type = 'fund_transfer'
       AND from_fund_id IS NOT NULL AND to_fund_id IS NOT NULL AND from_fund_id <> to_fund_id
       AND to_account_id IS NULL)
  ),
  CONSTRAINT transactions_document_direction CHECK (document_id IS NULL OR tx_type IN ('money_in', 'money_out'))
);

-- One transaction per direction per document
CREATE UNIQUE INDEX IF NOT EXISTS transactions_document_direction_key
  ON public.transactions (document_id, tx_type) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON public.transactions (organization_id, tx_date);

CREATE TABLE IF NOT EXISTS public.transaction_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  line_no          integer NOT NULL DEFAULT 1,
  amount           numeric(15,2) NOT NULL CHECK (amount > 0),
  fund_id          uuid NOT NULL REFERENCES public.funds(id),
  category_id      uuid REFERENCES public.categories(id),
  -- Every line has exactly one target. Today that is always a category; invoices (Phase 3) and
  -- assets or liabilities (Phase 4) widen this rule when they arrive.
  CONSTRAINT transaction_lines_one_target CHECK (category_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_transaction_lines_tx ON public.transaction_lines (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_org_fund ON public.transaction_lines (organization_id, fund_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_org_category ON public.transaction_lines (organization_id, category_id);

-- Read-only for signed-in users for now. Only the database mirror below writes to these tables.
-- Write policies arrive with the money-in screens in Phase 2.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbac_transactions_select ON public.transactions;
CREATE POLICY rbac_transactions_select ON public.transactions FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());

DROP POLICY IF EXISTS rbac_transaction_lines_select ON public.transaction_lines;
CREATE POLICY rbac_transaction_lines_select ON public.transaction_lines FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());

-- Supabase grants new tables to the browser roles by default. Take the write privileges back
-- explicitly, so the tables are read-only to signed-in users even if a policy is added by mistake.
REVOKE ALL ON public.transactions, public.transaction_lines FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.transactions, public.transaction_lines FROM authenticated;
GRANT SELECT ON public.transactions, public.transaction_lines TO authenticated;
GRANT ALL ON public.transactions, public.transaction_lines TO service_role;

-- ---------------------------------------------------------------- The lines add up to the total
-- Checked when the database transaction commits, so a transaction and its lines can be written in
-- any order inside one save.
CREATE OR REPLACE FUNCTION public.check_transaction_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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
  ELSIF n > 0 THEN
    RAISE EXCEPTION 'Transfers have no lines';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_balanced ON public.transactions;
CREATE CONSTRAINT TRIGGER trg_transactions_balanced
  AFTER INSERT OR UPDATE ON public.transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_transaction_balanced();

DROP TRIGGER IF EXISTS trg_transaction_lines_balanced ON public.transaction_lines;
CREATE CONSTRAINT TRIGGER trg_transaction_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.transaction_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_transaction_balanced();

-- ---------------------------------------------------------------- Document -> cash lines
-- The signed cash lines of one document. Positive = money out, negative = money in (a refund).
-- Used by the mirror below and by the parity check, so both always apply the same rules.
CREATE OR REPLACE FUNCTION public.document_cash_lines(p_doc uuid)
RETURNS TABLE (line_no integer, amount numeric, fund_id uuid, category_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH d AS (
    SELECT * FROM public.documents WHERE id = p_doc
  ),
  ctx AS (
    SELECT
      d.organization_id AS org,
      (SELECT f.id FROM public.funds f WHERE f.organization_id = d.organization_id AND f.is_default LIMIT 1) AS def_fund,
      (SELECT c.id FROM public.categories c
        WHERE c.organization_id = d.organization_id AND c.is_system AND c.name = 'Uncategorised' LIMIT 1) AS uncategorised
    FROM d
  ),
  raw AS (
    -- Documents with splits: one line per split
    SELECT
      s.ord::integer AS ord,
      CASE WHEN (s.elem ->> 'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (s.elem ->> 'amount')::numeric ELSE 0 END AS amt,
      s.elem ->> 'fund_id' AS fund_text,
      s.elem ->> 'category_id' AS cat_text
    FROM d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.splits) = 'array' THEN d.splits ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS s(elem, ord)

    UNION ALL

    -- Documents without splits: the whole amount, on the document's own fund and category
    SELECT 1, COALESCE(d.amount, 0), d.fund_id::text, d.category_id::text
    FROM d
    WHERE jsonb_typeof(d.splits) IS DISTINCT FROM 'array' OR jsonb_array_length(d.splits) = 0
  )
  SELECT
    raw.ord,
    round(raw.amt, 2),
    COALESCE(
      (SELECT f.id FROM public.funds f WHERE f.id::text = raw.fund_text AND f.organization_id = ctx.org),
      ctx.def_fund
    ),
    COALESCE(
      (SELECT c.id FROM public.categories c
        WHERE c.id::text = raw.cat_text AND c.organization_id = ctx.org AND c.kind = 'expense'),
      ctx.uncategorised
    )
  FROM raw CROSS JOIN ctx
  WHERE round(raw.amt, 2) <> 0;
$$;

-- ---------------------------------------------------------------- Mirror a paid document
CREATE OR REPLACE FUNCTION public.sync_document_transaction(p_doc uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.documents%ROWTYPE;
  tz text;
  acct uuid;
  tx_day date;
  dir text;
  hdr uuid;
  hdr_total numeric;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = p_doc;
  IF NOT FOUND THEN
    RETURN; -- deleted: the transactions go with it
  END IF;

  -- Only cash that has actually moved is a transaction
  IF d.status IS DISTINCT FROM 'paid' THEN
    DELETE FROM public.transactions WHERE document_id = p_doc;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.funds WHERE organization_id = d.organization_id AND is_default)
     OR NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = d.organization_id AND is_default)
     OR NOT EXISTS (SELECT 1 FROM public.categories
                    WHERE organization_id = d.organization_id AND is_system AND name = 'Uncategorised') THEN
    PERFORM public.ensure_org_accounting_defaults(d.organization_id);
  END IF;

  SELECT a.id INTO acct FROM public.accounts a WHERE a.organization_id = d.organization_id AND a.is_default LIMIT 1;
  SELECT o.timezone INTO tz FROM public.organizations o WHERE o.id = d.organization_id;
  tx_day := COALESCE(d.paid_date, public.safe_iso_date(d.document_date::text),
                     (d.created_at AT TIME ZONE COALESCE(tz, 'UTC'))::date);

  FOREACH dir IN ARRAY ARRAY['money_out', 'money_in'] LOOP
    SELECT COALESCE(sum(abs(l.amount)), 0) INTO hdr_total
    FROM public.document_cash_lines(p_doc) l
    WHERE (dir = 'money_out' AND l.amount > 0) OR (dir = 'money_in' AND l.amount < 0);

    IF hdr_total = 0 THEN
      DELETE FROM public.transactions WHERE document_id = p_doc AND tx_type = dir;
      CONTINUE;
    END IF;

    INSERT INTO public.transactions (
      organization_id, tx_type, tx_date, date_estimated, account_id, payee_id, payee_name,
      reference, remarks, total, source, document_id
    ) VALUES (
      d.organization_id, dir, tx_day, d.paid_date IS NULL, acct, d.vendor_id, d.vendor_name,
      COALESCE(NULLIF(d.invoice_number, ''), NULLIF(d.reference_number, '')),
      left(NULLIF(d.notes, ''), 500), hdr_total, 'document', p_doc
    )
    ON CONFLICT (document_id, tx_type) WHERE document_id IS NOT NULL
    DO UPDATE SET
      tx_date = EXCLUDED.tx_date,
      date_estimated = EXCLUDED.date_estimated,
      account_id = EXCLUDED.account_id,
      payee_id = EXCLUDED.payee_id,
      payee_name = EXCLUDED.payee_name,
      reference = EXCLUDED.reference,
      remarks = EXCLUDED.remarks,
      total = EXCLUDED.total,
      updated_at = now()
    RETURNING id INTO hdr;

    DELETE FROM public.transaction_lines WHERE transaction_id = hdr;
    INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id)
    SELECT hdr, d.organization_id, (row_number() OVER (ORDER BY l.line_no))::integer, abs(l.amount), l.fund_id, l.category_id
    FROM public.document_cash_lines(p_doc) l
    WHERE (dir = 'money_out' AND l.amount > 0) OR (dir = 'money_in' AND l.amount < 0);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_document_transaction(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_document_transaction(uuid) TO service_role;

-- The mirror must never stop a person from saving a document. It runs with the database owner's
-- rights (SECURITY DEFINER) because signed-in users are not allowed to write transactions directly. If it fails it logs a warning, and the
-- parity check (below) shows the drift so it can be repaired with resync_org_transactions.
CREATE OR REPLACE FUNCTION public.documents_sync_transaction_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.sync_document_transaction(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not mirror document % into transactions: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_sync_insert ON public.documents;
CREATE TRIGGER trg_documents_sync_insert
  AFTER INSERT ON public.documents
  FOR EACH ROW WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION public.documents_sync_transaction_trigger();

DROP TRIGGER IF EXISTS trg_documents_sync_update ON public.documents;
CREATE TRIGGER trg_documents_sync_update
  AFTER UPDATE OF status, amount, splits, fund_id, category_id, vendor_id, vendor_name,
                  paid_date, document_date, notes, reference_number, invoice_number
  ON public.documents
  FOR EACH ROW WHEN (NEW.status = 'paid' OR OLD.status = 'paid')
  EXECUTE FUNCTION public.documents_sync_transaction_trigger();

-- ---------------------------------------------------------------- Deleting a fund or category in use
-- Today deleting a category simply leaves "no category" on the documents that used it. Transaction
-- lines keep the same behaviour: they move to Uncategorised (or the General Fund) instead of
-- blocking the delete.
CREATE OR REPLACE FUNCTION public.reassign_lines_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'categories' THEN
    UPDATE public.transaction_lines
    SET category_id = (
      SELECT c.id FROM public.categories c
      WHERE c.organization_id = OLD.organization_id AND c.is_system
        AND c.name = CASE WHEN OLD.kind = 'income' THEN 'Uncategorised income' ELSE 'Uncategorised' END
      LIMIT 1
    )
    WHERE category_id = OLD.id;
  ELSE
    UPDATE public.transaction_lines
    SET fund_id = (
      SELECT f.id FROM public.funds f WHERE f.organization_id = OLD.organization_id AND f.is_default LIMIT 1
    )
    WHERE fund_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_reassign_lines ON public.categories;
CREATE TRIGGER trg_categories_reassign_lines
  BEFORE DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.reassign_lines_before_delete();

DROP TRIGGER IF EXISTS trg_funds_reassign_lines ON public.funds;
CREATE TRIGGER trg_funds_reassign_lines
  BEFORE DELETE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.reassign_lines_before_delete();

-- Deleting a whole organisation removes its transactions first (lines reference funds and categories)
CREATE OR REPLACE FUNCTION public.delete_organization_data(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;

-- ---------------------------------------------------------------- Repair and proof
-- Rebuilds every mirrored transaction of one organisation from its documents.
CREATE OR REPLACE FUNCTION public.resync_org_transactions(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  DELETE FROM public.transactions
  WHERE organization_id = p_org AND source = 'document'
    AND document_id NOT IN (SELECT id FROM public.documents WHERE status = 'paid');
  FOR r IN SELECT id FROM public.documents WHERE organization_id = p_org AND status = 'paid' LOOP
    PERFORM public.sync_document_transaction(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.resync_org_transactions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resync_org_transactions(uuid) TO service_role;

-- The migration acceptance test: what paid documents say, fund by fund and category by category,
-- against what the transactions say (money out minus money in). It returns only the rows that
-- DIFFER, so an empty result means every total is identical.
CREATE OR REPLACE FUNCTION public.accounting_parity_check(p_org uuid)
RETURNS TABLE (fund_id uuid, category_id uuid, documents_net numeric, transactions_net numeric, difference numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH doc_side AS (
    SELECT l.fund_id, l.category_id, sum(l.amount) AS net
    FROM public.documents d
    CROSS JOIN LATERAL public.document_cash_lines(d.id) l
    WHERE d.organization_id = p_org AND d.status = 'paid'
    GROUP BY l.fund_id, l.category_id
  ),
  tx_side AS (
    SELECT tl.fund_id, tl.category_id,
           sum(CASE t.tx_type WHEN 'money_out' THEN tl.amount ELSE -tl.amount END) AS net
    FROM public.transaction_lines tl
    JOIN public.transactions t ON t.id = tl.transaction_id
    WHERE t.organization_id = p_org AND t.source = 'document'
    GROUP BY tl.fund_id, tl.category_id
  )
  SELECT COALESCE(a.fund_id, b.fund_id), COALESCE(a.category_id, b.category_id),
         COALESCE(a.net, 0), COALESCE(b.net, 0), COALESCE(a.net, 0) - COALESCE(b.net, 0)
  FROM doc_side a
  FULL JOIN tx_side b ON a.fund_id = b.fund_id AND a.category_id = b.category_id
  WHERE COALESCE(a.net, 0) <> COALESCE(b.net, 0);
$$;

GRANT EXECUTE ON FUNCTION public.accounting_parity_check(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- Backfill
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT DISTINCT organization_id FROM public.documents WHERE status = 'paid' LOOP
    PERFORM public.resync_org_transactions(o.organization_id);
  END LOOP;
END;
$$;
