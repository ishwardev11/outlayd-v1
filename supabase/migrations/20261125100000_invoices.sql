-- Invoices, stage 4a of Phase 3 (spec sections 3.8, 6.1, 6.3, rules R1-R3, section 10 step 5).
--
-- An invoice is money owed that is not yet cash: a bill owed to a supplier (payable) or an invoice the
-- organisation issued (receivable). Decisions (Dev, 2026-11-22):
--   * Uploads stay the way bills come in. An approved, unpaid bill gets a payable invoice behind the
--     scenes (source document); marking the bill paid records the payment against that invoice.
--     Receipt-type documents paid straight away stay plain money out, exactly as before.
--   * Income & Expenditure follows R1: invoice lines count on the issue date; payments of invoices are
--     never counted again. Draft, void and opening-balance invoices do not count (R3).
--   * Stored status is only draft, open or void. Paid, part-paid and overdue are always derived.
--
-- Payment lines: a transaction line that pays an invoice carries invoice_id AND the category of the
-- invoice line it covers (split in proportion to the lines of the invoice). The category is there so the
-- cash book and Receipts & Payments can show what the cash was for; Income & Expenditure skips every
-- line with an invoice_id, so nothing is counted twice.
--
-- Users never write the invoice tables directly: everything goes through the functions at the end,
-- which check the role, the organisation and the plan explicitly.

-- ================================================================ 1. Settings
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS payment_details text;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_payment_details_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_payment_details_check
  CHECK (payment_details IS NULL OR char_length(payment_details) <= 1000);

-- ================================================================ 2. Tables
CREATE TABLE IF NOT EXISTS public.invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction           text NOT NULL CHECK (direction IN ('payable', 'receivable')),
  -- receivable: our own number (prefix + seq); payable: the number of the supplier, if any
  invoice_no          text CHECK (invoice_no IS NULL OR char_length(invoice_no) <= 100),
  seq                 integer CHECK (seq IS NULL OR seq >= 1),
  payee_id            uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  payee_name          text NOT NULL CHECK (char_length(payee_name) BETWEEN 1 AND 255),
  issue_date          date NOT NULL,
  due_date            date,
  reference           text CHECK (reference IS NULL OR char_length(reference) <= 100),
  remarks             text CHECK (remarks IS NULL OR char_length(remarks) <= 500),
  attachment_url      text CHECK (attachment_url IS NULL OR (char_length(attachment_url) <= 500 AND attachment_url NOT LIKE '%..%')),
  total               numeric(15,2) NOT NULL CHECK (total > 0),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'void')),
  is_opening_balance  boolean NOT NULL DEFAULT false,
  source              text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'document')),
  document_id         uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  voided_at           timestamptz,
  voided_by           uuid,
  void_reason         text CHECK (void_reason IS NULL OR char_length(void_reason) BETWEEN 1 AND 500),
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_void_fields CHECK ((status = 'void') = (voided_at IS NOT NULL)),
  CONSTRAINT invoices_due_after_issue CHECK (due_date IS NULL OR due_date >= issue_date),
  CONSTRAINT invoices_source_document CHECK ((source = 'document') = (document_id IS NOT NULL)),
  CONSTRAINT invoices_document_payable CHECK (document_id IS NULL OR direction = 'payable'),
  CONSTRAINT invoices_seq_receivable CHECK (seq IS NULL OR direction = 'receivable')
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_document_key ON public.invoices (document_id) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_seq_key ON public.invoices (organization_id, seq) WHERE seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices (organization_id, direction, issue_date);

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  line_no          integer NOT NULL DEFAULT 1,
  description      text CHECK (description IS NULL OR char_length(description) <= 300),
  amount           numeric(15,2) NOT NULL CHECK (amount > 0),
  fund_id          uuid NOT NULL REFERENCES public.funds(id),
  category_id      uuid NOT NULL REFERENCES public.categories(id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_org_category ON public.invoice_lines (organization_id, category_id);

-- A payment line points at the invoice it pays (NO ACTION: an invoice with payments cannot vanish)
ALTER TABLE public.transaction_lines ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_invoice ON public.transaction_lines (invoice_id) WHERE invoice_id IS NOT NULL;

-- Read-only to signed-in users (own organisation); written only by the functions below
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rbac_invoices_select ON public.invoices;
CREATE POLICY rbac_invoices_select ON public.invoices FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());
DROP POLICY IF EXISTS rbac_invoice_lines_select ON public.invoice_lines;
CREATE POLICY rbac_invoice_lines_select ON public.invoice_lines FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());
REVOKE ALL ON public.invoices, public.invoice_lines FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices, public.invoice_lines FROM authenticated;
GRANT SELECT ON public.invoices, public.invoice_lines TO authenticated;
GRANT ALL ON public.invoices, public.invoice_lines TO service_role;

-- ================================================================ 3. Integrity
-- Commit-time check: the lines add up to the total, belong to the same organisation, and use the
-- right kind of category (payable -> expense, receivable -> income). Payments never exceed the total.
CREATE OR REPLACE FUNCTION public.check_invoice_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  i public.invoices%ROWTYPE;
  n integer;
  s numeric;
  paid numeric;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    v_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  END IF;
  SELECT * INTO i FROM public.invoices WHERE id = v_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0) INTO n, s FROM public.invoice_lines WHERE invoice_id = v_id;
  IF n = 0 THEN
    RAISE EXCEPTION 'An invoice needs at least one line';
  END IF;
  IF s <> i.total THEN
    RAISE EXCEPTION 'The invoice lines (%) must add up to the invoice total (%)', s, i.total;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_lines l
    LEFT JOIN public.funds f ON f.id = l.fund_id AND f.organization_id = i.organization_id
    LEFT JOIN public.categories c ON c.id = l.category_id AND c.organization_id = i.organization_id
    WHERE l.invoice_id = v_id AND (l.organization_id <> i.organization_id OR f.id IS NULL OR c.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'An invoice line uses a fund or category from a different organisation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_lines l JOIN public.categories c ON c.id = l.category_id
    WHERE l.invoice_id = v_id AND c.kind <> CASE WHEN i.direction = 'payable' THEN 'expense' ELSE 'income' END
  ) THEN
    RAISE EXCEPTION 'A bill uses expense categories and an invoice you issue uses income categories';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO paid FROM public.transaction_lines WHERE invoice_id = v_id;
  IF paid > i.total THEN
    RAISE EXCEPTION 'The payments (%) are more than the invoice total (%)', paid, i.total;
  END IF;
  IF paid > 0 AND i.status <> 'open' THEN
    RAISE EXCEPTION 'An invoice with payments cannot be a draft or void';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_balanced ON public.invoices;
CREATE CONSTRAINT TRIGGER trg_invoices_balanced
  AFTER INSERT OR UPDATE ON public.invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_invoice_balanced();
DROP TRIGGER IF EXISTS trg_invoice_lines_balanced ON public.invoice_lines;
CREATE CONSTRAINT TRIGGER trg_invoice_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_invoice_balanced();

-- A payment line: same organisation, an open invoice, the right direction, one of its own
-- categories, and never more than the balance. The invoice row is locked while the balance is
-- checked, so two payments at the same moment cannot both squeeze under it.
CREATE OR REPLACE FUNCTION public.check_invoice_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.invoices%ROWTYPE;
  t public.transactions%ROWTYPE;
  paid numeric;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO i FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND OR i.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'That invoice was not found';
  END IF;
  IF i.status <> 'open' THEN
    RAISE EXCEPTION 'Only an open invoice can be paid';
  END IF;
  SELECT * INTO t FROM public.transactions WHERE id = NEW.transaction_id;
  IF t.tx_type <> (CASE WHEN i.direction = 'payable' THEN 'money_out' ELSE 'money_in' END) OR t.is_refund THEN
    RAISE EXCEPTION 'A bill is paid with money out and an invoice you issued is paid with money in';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoice_lines l WHERE l.invoice_id = i.id AND l.category_id = NEW.category_id) THEN
    RAISE EXCEPTION 'A payment line must use one of the categories on the invoice';
  END IF;
  SELECT COALESCE(sum(amount), 0) INTO paid FROM public.transaction_lines
  WHERE invoice_id = i.id AND id IS DISTINCT FROM NEW.id;
  IF paid + NEW.amount > i.total THEN
    RAISE EXCEPTION 'This payment is more than the balance of the invoice (balance %)', i.total - paid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_invoice_payment ON public.transaction_lines;
CREATE TRIGGER trg_check_invoice_payment
  BEFORE INSERT OR UPDATE OF invoice_id, amount, category_id ON public.transaction_lines
  FOR EACH ROW EXECUTE FUNCTION public.check_invoice_payment();

-- Payments of invoices are changed only through the functions below. A signed-in user writing the
-- tables directly (or through save_money_in, which runs with the own rights of the user) is refused, so a
-- payment can never be turned into plain income or expense and counted twice. NOT security definer
-- on purpose: current_user is the caller.
CREATE OR REPLACE FUNCTION public.guard_invoice_payments()
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
    IF (TG_OP <> 'DELETE' AND NEW.invoice_id IS NOT NULL) OR (TG_OP <> 'INSERT' AND OLD.invoice_id IS NOT NULL) THEN
      RAISE EXCEPTION 'This entry pays an invoice. Change it from the Invoices page.';
    END IF;
    v_tx := COALESCE(NEW.transaction_id, OLD.transaction_id);
  ELSE
    v_tx := OLD.id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = v_tx AND l.invoice_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This entry pays an invoice. Change it from the Invoices page.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_payment_lines ON public.transaction_lines;
CREATE TRIGGER trg_guard_invoice_payment_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.transaction_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_payments();
DROP TRIGGER IF EXISTS trg_guard_invoice_payment_tx ON public.transactions;
CREATE TRIGGER trg_guard_invoice_payment_tx
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_payments();

-- A bill whose invoice has payments recorded on the Invoices page cannot be deleted until those
-- payments are removed (the payments would otherwise point at nothing)
CREATE OR REPLACE FUNCTION public.block_delete_paid_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.transaction_lines l ON l.invoice_id = i.id
    JOIN public.transactions t ON t.id = l.transaction_id
    WHERE i.document_id = OLD.id AND t.document_id IS DISTINCT FROM OLD.id
  ) THEN
    RAISE EXCEPTION 'Payments have been recorded against this bill on the Invoices page. Delete those payments first.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_delete_paid_bill ON public.documents;
CREATE TRIGGER trg_block_delete_paid_bill
  BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.block_delete_paid_bill();

-- Receivable numbers never move back onto numbers already issued
CREATE OR REPLACE FUNCTION public.protect_invoice_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_seq integer;
BEGIN
  IF NEW.invoice_next_number IS DISTINCT FROM OLD.invoice_next_number THEN
    SELECT COALESCE(max(seq), 0) INTO last_seq FROM public.invoices WHERE organization_id = NEW.id;
    IF NEW.invoice_next_number <= last_seq THEN
      RAISE EXCEPTION 'The next invoice number must be after the last one issued (%)', last_seq;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_invoice_sequence ON public.organizations;
CREATE TRIGGER trg_protect_invoice_sequence
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_sequence();

-- Categories used by invoices are archived, not deleted. Re-created from the exact current text
-- (20261122100000_money_in_foundation.sql) with invoice lines added.
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
     OR EXISTS (SELECT 1 FROM public.invoice_lines l WHERE l.category_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.default_category_id = OLD.id) THEN
    RAISE EXCEPTION 'This category is in use, so it cannot be deleted. Archive it instead.';
  END IF;
  RETURN OLD;
END;
$$;

-- Deleting a fund moves its lines to the General Fund, invoice lines included. Re-created from the
-- exact current text with invoice lines added.
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
  END IF;
  RETURN OLD;
END;
$function$;

-- ================================================================ 4. Balances and derived status
-- One row per invoice with what has been paid, the balance and the derived status, as of today in the
-- own timezone of the organisation. security_invoker: row-level security of the caller applies.
CREATE OR REPLACE VIEW public.invoice_summary WITH (security_invoker = true) AS
SELECT
  i.id, i.organization_id, i.direction, i.invoice_no, i.seq, i.payee_id, i.payee_name,
  i.issue_date, i.due_date, i.reference, i.remarks, i.attachment_url, i.total, i.status,
  i.is_opening_balance, i.source, i.document_id, i.voided_at, i.void_reason, i.created_at,
  p.paid,
  i.total - p.paid AS balance,
  d.today,
  CASE
    WHEN i.status = 'draft' THEN 'draft'
    WHEN i.status = 'void' THEN 'void'
    WHEN i.total - p.paid <= 0 THEN 'paid'
    WHEN i.due_date IS NOT NULL AND i.due_date < d.today THEN 'overdue'
    WHEN p.paid > 0 THEN 'part_paid'
    ELSE 'open'
  END AS derived_status,
  CASE WHEN i.status = 'open' AND i.total - p.paid > 0 AND i.due_date < d.today THEN d.today - i.due_date ELSE 0 END AS days_overdue,
  CASE
    WHEN i.status <> 'open' OR i.total - p.paid <= 0 THEN NULL
    WHEN i.due_date IS NULL OR i.due_date >= d.today THEN 'current'
    WHEN d.today - i.due_date <= 30 THEN '1_30'
    WHEN d.today - i.due_date <= 60 THEN '31_60'
    ELSE '61_plus'
  END AS ageing_bucket
FROM public.invoices i
JOIN public.organizations o ON o.id = i.organization_id
CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'UTC'))::date AS today) d
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(l.amount), 0)::numeric(15,2) AS paid FROM public.transaction_lines l WHERE l.invoice_id = i.id
) p;

REVOKE ALL ON public.invoice_summary FROM anon;
GRANT SELECT ON public.invoice_summary TO authenticated, service_role;

-- Splits an amount across the lines of an invoice in proportion (grouped by fund and category). Cents left
-- over from rounding go to the largest group, so the parts always add up to the amount exactly.
CREATE OR REPLACE FUNCTION public.invoice_payment_split(p_invoice uuid, p_amount numeric)
RETURNS TABLE (fund_id uuid, category_id uuid, amount numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH g AS (
    SELECT l.fund_id, l.category_id, sum(l.amount) AS amt, min(l.line_no) AS ord
    FROM public.invoice_lines l WHERE l.invoice_id = p_invoice
    GROUP BY l.fund_id, l.category_id
  ),
  r AS (
    SELECT g.fund_id, g.category_id, round(p_amount * g.amt / (SELECT total FROM public.invoices WHERE id = p_invoice), 2) AS share,
           row_number() OVER (ORDER BY g.amt DESC, g.ord) AS rn
    FROM g
  )
  SELECT r.fund_id, r.category_id,
         r.share + CASE WHEN r.rn = 1 THEN p_amount - sum(r.share) OVER () ELSE 0 END
  FROM r;
$$;

-- ================================================================ 5. Bills from uploads
-- Is this document a payable bill? An approved bill awaiting payment always is; a paid document is
-- when it is an invoice-type document. A receipt paid straight away is plain money out (as before).
CREATE OR REPLACE FUNCTION public.document_is_bill(p_status text, p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status = 'awaiting_payment' OR (p_status = 'paid' AND p_type = 'invoice');
$$;

-- The mirror, re-created from its exact current text (20261120100000_document_remarks.sql) and
-- extended: keeps the payable invoice of the bill in step, and when the bill is paid, records the payment
-- against that invoice (only what is still owed, when part was already paid on the Invoices page).
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
  issue_day date;
  dir text;
  hdr uuid;
  hdr_total numeric;
  inv_id uuid;
  inv_total numeric;
  other_paid numeric := 0;
  want_invoice boolean;
  remaining numeric;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = p_doc;
  IF NOT FOUND THEN
    RETURN; -- deleted: the transactions and the invoice go with it
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.funds WHERE organization_id = d.organization_id AND is_default)
     OR NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = d.organization_id AND is_default)
     OR NOT EXISTS (SELECT 1 FROM public.categories
                    WHERE organization_id = d.organization_id AND is_system AND name = 'Uncategorised') THEN
    PERFORM public.ensure_org_accounting_defaults(d.organization_id);
  END IF;

  SELECT o.timezone INTO tz FROM public.organizations o WHERE o.id = d.organization_id;
  issue_day := COALESCE(public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE COALESCE(tz, 'UTC'))::date);

  -- What was paid on the Invoices page (anything that is not the own payment of this mirror)
  SELECT i.id INTO inv_id FROM public.invoices i WHERE i.document_id = p_doc;
  IF inv_id IS NOT NULL THEN
    SELECT COALESCE(sum(l.amount), 0) INTO other_paid
    FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
    WHERE l.invoice_id = inv_id AND t.document_id IS DISTINCT FROM p_doc;
  END IF;

  SELECT COALESCE(sum(l.amount), 0) INTO inv_total FROM public.document_cash_lines(p_doc) l WHERE l.amount > 0;
  want_invoice := inv_total > 0 AND (public.document_is_bill(d.status, d.document_type) OR other_paid > 0);

  -- 1. Remove the own payment lines of this mirror first, so the invoice can change underneath
  DELETE FROM public.transaction_lines
  WHERE transaction_id IN (SELECT id FROM public.transactions WHERE document_id = p_doc AND tx_type = 'money_out');

  -- 2. The payable invoice
  IF want_invoice THEN
    INSERT INTO public.invoices (organization_id, direction, invoice_no, payee_id, payee_name, issue_date, due_date,
                                 reference, remarks, total, status, source, document_id)
    VALUES (d.organization_id, 'payable', NULLIF(left(btrim(COALESCE(d.invoice_number, '')), 100), ''), d.vendor_id,
            COALESCE(NULLIF(left(btrim(COALESCE(d.vendor_name, '')), 255), ''), 'Unknown payee'),
            issue_day, CASE WHEN d.due_date >= issue_day THEN d.due_date END,
            NULLIF(left(btrim(COALESCE(d.reference_number, '')), 100), ''), NULLIF(d.remarks, ''),
            inv_total, 'open', 'document', p_doc)
    ON CONFLICT (document_id) WHERE document_id IS NOT NULL
    DO UPDATE SET
      invoice_no = EXCLUDED.invoice_no, payee_id = EXCLUDED.payee_id, payee_name = EXCLUDED.payee_name,
      issue_date = EXCLUDED.issue_date, due_date = EXCLUDED.due_date, reference = EXCLUDED.reference,
      remarks = EXCLUDED.remarks, total = EXCLUDED.total, status = 'open', updated_at = now()
    RETURNING id INTO inv_id;

    DELETE FROM public.invoice_lines WHERE invoice_id = inv_id;
    INSERT INTO public.invoice_lines (invoice_id, organization_id, line_no, amount, fund_id, category_id)
    SELECT inv_id, d.organization_id, (row_number() OVER (ORDER BY l.line_no))::integer, l.amount, l.fund_id, l.category_id
    FROM public.document_cash_lines(p_doc) l WHERE l.amount > 0;
  ELSIF inv_id IS NOT NULL THEN
    DELETE FROM public.invoices WHERE id = inv_id;
    inv_id := NULL;
  END IF;

  -- 3. Cash: only money that has actually moved is a transaction
  IF d.status IS DISTINCT FROM 'paid' THEN
    DELETE FROM public.transactions WHERE document_id = p_doc;
    RETURN;
  END IF;

  SELECT a.id INTO acct FROM public.accounts a WHERE a.organization_id = d.organization_id AND a.is_default LIMIT 1;
  tx_day := COALESCE(d.paid_date, issue_day);

  FOREACH dir IN ARRAY ARRAY['money_out', 'money_in'] LOOP
    IF dir = 'money_out' AND inv_id IS NOT NULL THEN
      remaining := inv_total - other_paid;
      hdr_total := GREATEST(remaining, 0);
    ELSE
      SELECT COALESCE(sum(abs(l.amount)), 0) INTO hdr_total
      FROM public.document_cash_lines(p_doc) l
      WHERE (dir = 'money_out' AND l.amount > 0) OR (dir = 'money_in' AND l.amount < 0);
    END IF;

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
      NULLIF(d.remarks, ''), hdr_total, 'document', p_doc
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
    IF dir = 'money_out' AND inv_id IS NOT NULL THEN
      INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id, invoice_id)
      SELECT hdr, d.organization_id, (row_number() OVER (ORDER BY s.amount DESC, s.category_id))::integer, s.amount, s.fund_id, s.category_id, inv_id
      FROM public.invoice_payment_split(inv_id, hdr_total) s WHERE s.amount > 0;
    ELSE
      INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id)
      SELECT hdr, d.organization_id, (row_number() OVER (ORDER BY l.line_no))::integer, abs(l.amount), l.fund_id, l.category_id
      FROM public.document_cash_lines(p_doc) l
      WHERE (dir = 'money_out' AND l.amount > 0) OR (dir = 'money_in' AND l.amount < 0);
    END IF;
  END LOOP;
END;
$$;

-- The mirror now also follows bills awaiting payment, their type and their due date
DROP TRIGGER IF EXISTS trg_documents_sync_insert ON public.documents;
CREATE TRIGGER trg_documents_sync_insert
  AFTER INSERT ON public.documents
  FOR EACH ROW WHEN (NEW.status IN ('paid', 'awaiting_payment'))
  EXECUTE FUNCTION public.documents_sync_transaction_trigger();

DROP TRIGGER IF EXISTS trg_documents_sync_update ON public.documents;
CREATE TRIGGER trg_documents_sync_update
  AFTER UPDATE OF status, amount, splits, fund_id, category_id, vendor_id, vendor_name,
                  paid_date, document_date, due_date, document_type, remarks, reference_number, invoice_number
  ON public.documents
  FOR EACH ROW WHEN (NEW.status IN ('paid', 'awaiting_payment') OR OLD.status IN ('paid', 'awaiting_payment'))
  EXECUTE FUNCTION public.documents_sync_transaction_trigger();

-- Rebuilds every mirrored transaction and bill invoice of one organisation. Re-created from the exact
-- current text (20261119160000_transactions.sql) extended to bills awaiting payment.
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
  FOR r IN SELECT id FROM public.documents
           WHERE organization_id = p_org
             AND (status IN ('paid', 'awaiting_payment')
                  OR id IN (SELECT document_id FROM public.invoices WHERE organization_id = p_org AND document_id IS NOT NULL)) LOOP
    PERFORM public.sync_document_transaction(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.resync_org_transactions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resync_org_transactions(uuid) TO service_role;

-- The acceptance test, re-created: what paid documents say, fund by fund and category by category,
-- against what the accounting tables say. A paid bill now counts through its invoice lines (rule R1),
-- and the payment lines are skipped; every other mirrored line counts as before. Empty = identical.
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
  acct_side_raw AS (
    SELECT tl.fund_id, tl.category_id, CASE t.tx_type WHEN 'money_out' THEN tl.amount ELSE -tl.amount END AS net
    FROM public.transaction_lines tl
    JOIN public.transactions t ON t.id = tl.transaction_id
    WHERE t.organization_id = p_org AND t.source = 'document' AND tl.invoice_id IS NULL
    UNION ALL
    SELECT il.fund_id, il.category_id, il.amount
    FROM public.invoice_lines il
    JOIN public.invoices i ON i.id = il.invoice_id
    JOIN public.documents d ON d.id = i.document_id
    WHERE i.organization_id = p_org AND d.status = 'paid'
  ),
  acct_side AS (
    SELECT r.fund_id, r.category_id, sum(r.net) AS net FROM acct_side_raw r GROUP BY r.fund_id, r.category_id
  )
  SELECT COALESCE(a.fund_id, b.fund_id), COALESCE(a.category_id, b.category_id),
         COALESCE(a.net, 0), COALESCE(b.net, 0), COALESCE(a.net, 0) - COALESCE(b.net, 0)
  FROM doc_side a
  FULL JOIN acct_side b ON a.fund_id = b.fund_id AND a.category_id = b.category_id
  WHERE COALESCE(a.net, 0) <> COALESCE(b.net, 0);
$$;

GRANT EXECUTE ON FUNCTION public.accounting_parity_check(uuid) TO authenticated, service_role;

-- Deleting an organisation removes its invoices (after the payments that point at them). Re-created
-- from the exact current text (20261122100000_money_in_foundation.sql) with one line added.
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

-- ================================================================ 6. Functions people call
-- Shared checks for changing invoices: the organisation of the caller, Admin or Editor, and a paid plan
CREATE OR REPLACE FUNCTION public.invoice_writer_org()
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
  IF public.get_user_role() IS DISTINCT FROM 'Admin' AND public.get_user_role() IS DISTINCT FROM 'Editor' THEN
    RAISE EXCEPTION 'Only Admins and Editors can change invoices';
  END IF;
  IF NOT public.org_feature_allowed(v_org, 'invoices', 'use') THEN
    RAISE EXCEPTION 'Invoices are available on the Growth and Nonprofit plans';
  END IF;
  RETURN v_org;
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_writer_org() FROM PUBLIC, anon;

-- Saves a manual invoice (new, or replacing an existing one) with its lines.
-- payload: {id?, direction, status (draft or open), payee_id, invoice_no? (bills only), issue_date,
--           due_date?, reference?, remarks?, is_opening_balance?, lines: [{description?, amount, fund_id?, category_id}]}
-- A receivable invoice takes the next number the first time it is opened (the organisation row is
-- locked meanwhile, so numbers are never reused or skipped). Returns the invoice id.
CREATE OR REPLACE FUNCTION public.save_invoice(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
  cur public.invoices%ROWTYPE;
  o public.organizations%ROWTYPE;
  v_dir text;
  v_status text;
  v_issue date;
  v_due date;
  v_payee uuid;
  v_payee_name text;
  v_fund_default uuid;
  v_line jsonb;
  v_amount numeric;
  v_fund uuid;
  v_cat uuid;
  v_total numeric(15,2) := 0;
  v_n integer := 0;
  v_paid numeric := 0;
BEGIN
  v_org := public.invoice_writer_org();

  v_dir := payload ->> 'direction';
  IF v_dir IS NULL OR v_dir NOT IN ('payable', 'receivable') THEN
    RAISE EXCEPTION 'Choose whether this is a bill to pay or an invoice you issue';
  END IF;
  v_status := COALESCE(NULLIF(payload ->> 'status', ''), 'open');
  IF v_status NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'An invoice is saved as a draft or as open';
  END IF;
  BEGIN
    v_issue := (payload ->> 'issue_date')::date;
    v_due := NULLIF(payload ->> 'due_date', '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter valid dates';
  END;
  IF v_issue IS NULL THEN
    RAISE EXCEPTION 'Enter the invoice date';
  END IF;
  IF v_due IS NOT NULL AND v_due < v_issue THEN
    RAISE EXCEPTION 'The due date cannot be before the invoice date';
  END IF;

  v_payee := NULLIF(payload ->> 'payee_id', '')::uuid;
  IF v_payee IS NULL THEN
    RAISE EXCEPTION 'Choose who the invoice is with';
  END IF;
  SELECT name INTO v_payee_name FROM public.vendors WHERE id = v_payee AND organization_id = v_org;
  IF v_payee_name IS NULL THEN
    RAISE EXCEPTION 'The payee does not belong to this organisation';
  END IF;

  IF jsonb_typeof(payload -> 'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(payload -> 'lines') = 0 THEN
    RAISE EXCEPTION 'Add at least one line';
  END IF;
  IF jsonb_array_length(payload -> 'lines') > 100 THEN
    RAISE EXCEPTION 'An invoice can have at most 100 lines';
  END IF;
  SELECT id INTO v_fund_default FROM public.funds WHERE organization_id = v_org AND is_default;

  FOR v_line IN SELECT * FROM jsonb_array_elements(payload -> 'lines') LOOP
    BEGIN
      v_amount := (v_line ->> 'amount')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Each line needs a valid amount';
    END;
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2) THEN
      RAISE EXCEPTION 'Each line needs an amount above zero with at most two decimals';
    END IF;
    v_fund := COALESCE(NULLIF(v_line ->> 'fund_id', '')::uuid, v_fund_default);
    v_cat := NULLIF(v_line ->> 'category_id', '')::uuid;
    IF v_cat IS NULL THEN
      RAISE EXCEPTION 'Each line needs a category';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.funds f WHERE f.id = v_fund AND f.organization_id = v_org) THEN
      RAISE EXCEPTION 'The fund does not belong to this organisation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = v_cat AND c.organization_id = v_org) THEN
      RAISE EXCEPTION 'The category does not belong to this organisation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.funds f WHERE f.id = v_fund AND (f.archived_at IS NOT NULL OR COALESCE(f.is_archived, false))) THEN
      RAISE EXCEPTION 'That fund is archived';
    END IF;
    IF EXISTS (SELECT 1 FROM public.categories c WHERE c.id = v_cat AND c.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'That category is archived';
    END IF;
    v_total := v_total + v_amount;
  END LOOP;

  v_id := NULLIF(payload ->> 'id', '')::uuid;
  IF v_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.invoices WHERE id = v_id AND organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That invoice was not found';
    END IF;
    IF cur.source <> 'manual' THEN
      RAISE EXCEPTION 'This bill came from an upload. Change it on the document in the Ledger.';
    END IF;
    IF cur.status = 'void' THEN
      RAISE EXCEPTION 'A void invoice cannot be changed';
    END IF;
    IF cur.direction <> v_dir THEN
      RAISE EXCEPTION 'An invoice cannot change between a bill and an invoice you issue';
    END IF;
    SELECT COALESCE(sum(amount), 0) INTO v_paid FROM public.transaction_lines WHERE invoice_id = v_id;
    IF v_paid > 0 AND v_status = 'draft' THEN
      RAISE EXCEPTION 'An invoice with payments cannot go back to draft';
    END IF;
    IF v_paid > v_total THEN
      RAISE EXCEPTION 'The new total (%) is less than what has already been paid (%)', v_total, v_paid;
    END IF;
    IF cur.seq IS NOT NULL AND v_status = 'draft' THEN
      RAISE EXCEPTION 'A numbered invoice cannot go back to draft. Void it instead.';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.invoices (organization_id, direction, invoice_no, payee_id, payee_name, issue_date, due_date,
                                 reference, remarks, total, status, is_opening_balance, source, created_by)
    VALUES (v_org, v_dir,
            CASE WHEN v_dir = 'payable' THEN NULLIF(left(btrim(COALESCE(payload ->> 'invoice_no', '')), 100), '') END,
            v_payee, v_payee_name, v_issue, v_due,
            NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''),
            NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''),
            v_total, v_status, COALESCE((payload ->> 'is_opening_balance')::boolean, false), 'manual', auth.uid())
    RETURNING * INTO cur;
    v_id := cur.id;
  ELSE
    UPDATE public.invoices
    SET invoice_no = CASE WHEN v_dir = 'payable' THEN NULLIF(left(btrim(COALESCE(payload ->> 'invoice_no', '')), 100), '') ELSE invoice_no END,
        payee_id = v_payee, payee_name = v_payee_name, issue_date = v_issue, due_date = v_due,
        reference = NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''),
        remarks = NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''),
        total = v_total, status = v_status,
        is_opening_balance = COALESCE((payload ->> 'is_opening_balance')::boolean, false), updated_at = now()
    WHERE id = v_id
    RETURNING * INTO cur;
    DELETE FROM public.invoice_lines WHERE invoice_id = v_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(payload -> 'lines') LOOP
    v_n := v_n + 1;
    INSERT INTO public.invoice_lines (invoice_id, organization_id, line_no, description, amount, fund_id, category_id)
    VALUES (v_id, v_org, v_n, NULLIF(left(btrim(COALESCE(v_line ->> 'description', '')), 300), ''),
            (v_line ->> 'amount')::numeric,
            COALESCE(NULLIF(v_line ->> 'fund_id', '')::uuid, v_fund_default),
            (v_line ->> 'category_id')::uuid);
  END LOOP;

  -- A receivable invoice gets its number the first time it is opened
  IF v_dir = 'receivable' AND v_status = 'open' AND cur.seq IS NULL THEN
    SELECT * INTO o FROM public.organizations WHERE id = v_org FOR UPDATE;
    UPDATE public.invoices SET seq = o.invoice_next_number, invoice_no = o.invoice_prefix || o.invoice_next_number WHERE id = v_id;
    UPDATE public.organizations SET invoice_next_number = o.invoice_next_number + 1 WHERE id = v_org;
  END IF;

  RETURN v_id;
END;
$$;

-- Voids an invoice that has no payments. A numbered invoice keeps its number (shown as VOID).
CREATE OR REPLACE FUNCTION public.void_invoice(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  i public.invoices%ROWTYPE;
BEGIN
  v_org := public.invoice_writer_org();
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Give a reason for voiding the invoice';
  END IF;
  SELECT * INTO i FROM public.invoices WHERE id = p_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invoice was not found';
  END IF;
  IF i.source <> 'manual' THEN
    RAISE EXCEPTION 'This bill came from an upload. Change it on the document in the Ledger.';
  END IF;
  IF i.status = 'void' THEN
    RAISE EXCEPTION 'That invoice is already void';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transaction_lines WHERE invoice_id = p_id) THEN
    RAISE EXCEPTION 'An invoice with payments cannot be voided. Delete the payments first.';
  END IF;
  UPDATE public.invoices
  SET status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = left(btrim(p_reason), 500), updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Deletes a draft that never had a number. Anything else is voided instead.
CREATE OR REPLACE FUNCTION public.delete_invoice(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  i public.invoices%ROWTYPE;
BEGIN
  v_org := public.invoice_writer_org();
  SELECT * INTO i FROM public.invoices WHERE id = p_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invoice was not found';
  END IF;
  IF i.source <> 'manual' OR i.status <> 'draft' OR i.seq IS NOT NULL THEN
    RAISE EXCEPTION 'Only a draft can be deleted. Void the invoice instead.';
  END IF;
  DELETE FROM public.invoices WHERE id = p_id;
END;
$$;

-- Records a payment against an invoice (money out for a bill, money in for an invoice you issued),
-- split across the funds and categories in proportion. Part-payments are allowed; paying
-- more than the balance is refused. When a bill from an upload is paid in full this way, the bill
-- itself moves to paid. payload: {invoice_id, amount, tx_date, account_id?, reference?, remarks?}
CREATE OR REPLACE FUNCTION public.record_invoice_payment(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  i public.invoices%ROWTYPE;
  v_amount numeric;
  v_date date;
  v_account uuid;
  v_paid numeric;
  v_tx uuid;
BEGIN
  v_org := public.invoice_writer_org();
  SELECT * INTO i FROM public.invoices WHERE id = NULLIF(payload ->> 'invoice_id', '')::uuid AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invoice was not found';
  END IF;
  IF i.status <> 'open' THEN
    RAISE EXCEPTION 'Only an open invoice can be paid';
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
    RAISE EXCEPTION 'Enter the payment date';
  END IF;
  SELECT COALESCE(sum(amount), 0) INTO v_paid FROM public.transaction_lines WHERE invoice_id = i.id;
  IF v_paid + v_amount > i.total THEN
    RAISE EXCEPTION 'This payment is more than the balance of the invoice (balance %)', i.total - v_paid;
  END IF;

  v_account := NULLIF(payload ->> 'account_id', '')::uuid;
  IF v_account IS NULL THEN
    SELECT id INTO v_account FROM public.accounts WHERE organization_id = v_org AND is_default;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v_account AND a.organization_id = v_org AND a.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Choose an account of this organisation that is not archived';
  END IF;

  INSERT INTO public.transactions (organization_id, tx_type, tx_date, account_id, payee_id, payee_name,
                                   reference, remarks, total, source, created_by)
  VALUES (v_org, CASE WHEN i.direction = 'payable' THEN 'money_out' ELSE 'money_in' END, v_date, v_account,
          i.payee_id, i.payee_name,
          COALESCE(NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''), i.invoice_no),
          NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''),
          v_amount, 'manual', auth.uid())
  RETURNING id INTO v_tx;

  INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id, invoice_id)
  SELECT v_tx, v_org, (row_number() OVER (ORDER BY s.amount DESC, s.category_id))::integer, s.amount, s.fund_id, s.category_id, i.id
  FROM public.invoice_payment_split(i.id, v_amount) s WHERE s.amount > 0;

  -- A bill from an upload, now paid in full on the Invoices page: the bill itself is paid
  IF i.document_id IS NOT NULL AND v_paid + v_amount = i.total THEN
    UPDATE public.documents SET status = 'paid', paid_date = v_date
    WHERE id = i.document_id AND status = 'awaiting_payment';
  END IF;
  RETURN v_tx;
END;
$$;

-- Deletes a payment recorded on the Invoices page; the balance reopens automatically. If that payment
-- was what made a bill from an upload paid, the bill goes back to awaiting payment.
CREATE OR REPLACE FUNCTION public.delete_invoice_payment(p_tx uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  t public.transactions%ROWTYPE;
  v_docs uuid[];
  v_doc uuid;
BEGIN
  v_org := public.invoice_writer_org();
  SELECT * INTO t FROM public.transactions WHERE id = p_tx AND organization_id = v_org;
  IF NOT FOUND OR t.source <> 'manual'
     OR NOT EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = p_tx AND l.invoice_id IS NOT NULL) THEN
    RAISE EXCEPTION 'That payment was not found';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT i.document_id), '{}') INTO v_docs
  FROM public.transaction_lines l JOIN public.invoices i ON i.id = l.invoice_id
  WHERE l.transaction_id = p_tx AND i.document_id IS NOT NULL;

  DELETE FROM public.transactions WHERE id = p_tx;

  FOREACH v_doc IN ARRAY v_docs LOOP
    IF EXISTS (SELECT 1 FROM public.transactions x WHERE x.document_id = v_doc AND x.tx_type = 'money_out') THEN
      -- the bill was marked paid itself: its own payment now covers what is owed again
      PERFORM public.sync_document_transaction(v_doc);
    ELSE
      UPDATE public.documents SET status = 'awaiting_payment', paid_date = NULL
      WHERE id = v_doc AND status = 'paid';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_invoice(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_invoice(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_invoice_payment(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_invoice_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_payment(uuid) TO authenticated, service_role;

-- ================================================================ 7. Reports
-- Income & Expenditure, rule R1 (re-created; same columns as before):
--   (a) transaction lines with a category, by transaction date, EXCEPT lines that pay an invoice
--   (b) invoice lines by issue date, for open invoices that are not opening balances (R3)
-- Signed by the sign rule of the spec. SECURITY INVOKER: row-level security limits it to the org of the caller.
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
  )
  SELECT c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name, sum(x.amt)
  FROM lines x
  JOIN public.categories c ON c.id = x.category_id
  JOIN public.funds f ON f.id = x.fund_id
  GROUP BY c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name;
$$;

-- Receipts and Payments (spec 6.3, rule R2): transactions only, by transaction date. A payment of an
-- invoice is shown under the categories of the invoice (its lines carry them, split in proportion).
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
  GROUP BY 1, c.kind, c.nature, c.group_name, c.id, c.name, c.sort_order, f.id, f.name;
$$;

-- Cash and bank across all accounts at the start of p_from and at the end of p_to: opening balances
-- plus money in minus money out (transfers between accounts cancel out across all accounts)
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
    FROM public.transactions t WHERE t.organization_id = p_org
  )
  SELECT base.ob + COALESCE((SELECT sum(signed) FROM moves WHERE tx_date < p_from), 0),
         base.ob + COALESCE((SELECT sum(signed) FROM moves WHERE tx_date <= p_to), 0)
  FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.income_expenditure(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receipts_payments(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cash_position(uuid, date, date) TO authenticated, service_role;

-- ================================================================ 8. Convert existing bills
-- Every bill awaiting payment gets an open payable invoice; every paid invoice-type document gets an
-- invoice plus a linked payment (dated by its payment date, or flagged "date estimated" without one).
-- Acceptance (spec section 10): total expenses by category and fund are identical before and after,
-- for every organisation, or this migration stops and changes nothing.
CREATE TEMP TABLE conv_before ON COMMIT DROP AS
SELECT t.organization_id AS org, l.fund_id, l.category_id,
       sum(CASE t.tx_type WHEN 'money_out' THEN l.amount ELSE -l.amount END) AS net
FROM public.transactions t JOIN public.transaction_lines l ON l.transaction_id = t.id
WHERE t.source = 'document'
GROUP BY 1, 2, 3;

DO $$
DECLARE o record; bad integer;
BEGIN
  FOR o IN SELECT DISTINCT organization_id FROM public.documents WHERE status IN ('paid', 'awaiting_payment') LOOP
    PERFORM public.resync_org_transactions(o.organization_id);
  END LOOP;

  -- After: mirrored lines that are not payments, plus the invoice lines of paid bills
  SELECT count(*) INTO bad FROM (
    SELECT COALESCE(a.org, b.org) AS org FROM conv_before a
    FULL JOIN (
      SELECT x.org, x.fund_id, x.category_id, sum(x.net) AS net FROM (
        SELECT t.organization_id AS org, l.fund_id, l.category_id, CASE t.tx_type WHEN 'money_out' THEN l.amount ELSE -l.amount END AS net
        FROM public.transactions t JOIN public.transaction_lines l ON l.transaction_id = t.id
        WHERE t.source = 'document' AND l.invoice_id IS NULL
        UNION ALL
        SELECT i.organization_id, il.fund_id, il.category_id, il.amount
        FROM public.invoice_lines il JOIN public.invoices i ON i.id = il.invoice_id
        JOIN public.documents d ON d.id = i.document_id
        WHERE d.status = 'paid'
      ) x GROUP BY 1, 2, 3
    ) b ON a.org = b.org AND a.fund_id = b.fund_id AND a.category_id = b.category_id
    WHERE COALESCE(a.net, 0) <> COALESCE(b.net, 0)
  ) diff;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Invoice conversion changed expense totals by category and fund (% differences). Nothing was changed.', bad;
  END IF;

  -- Cash must not move either: the money out total of every paid document is unchanged
  SELECT count(*) INTO bad FROM public.documents d
  WHERE d.status = 'paid'
    AND COALESCE((SELECT sum(l.amount) FROM public.document_cash_lines(d.id) l WHERE l.amount > 0), 0)
        <> COALESCE((SELECT t.total FROM public.transactions t WHERE t.document_id = d.id AND t.tx_type = 'money_out'), 0);
  IF bad > 0 THEN
    RAISE EXCEPTION 'Invoice conversion changed the cash paid on % documents. Nothing was changed.', bad;
  END IF;
END $$;
