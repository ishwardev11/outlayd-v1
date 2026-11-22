-- Assurance, stage 6a of Phase 5 (spec 3.9 and 8): period locks, change history, reconciliations and
-- the integrity checks. Decisions (Dev, 2026-11-22):
--   * The lock covers everything dated on or before the lock date: money in and out (and their lines),
--     invoices (and lines), assets and liabilities, fund transfers, reconciliations, and uploaded
--     documents through what they feed into. The opening position is frozen once the lock reaches it.
--     Paying an old invoice after the lock date still works (the payment is dated after it).
--   * An Admin can move the lock date back (unlock), with a reason that is kept in the history.
--   * The change history is readable on every plan; locking and reconciliations are paid features.
-- Deleting a whole organisation bypasses the lock (app.bypass_lock).

-- ================================================================ 1. Settings
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lock_date date,
  ADD COLUMN IF NOT EXISTS statement_note text;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_statement_note_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_statement_note_check
  CHECK (statement_note IS NULL OR char_length(statement_note) <= 300);

-- ================================================================ 2. The lock
-- Raises the lock error (SQLSTATE OL001, so callers can tell it apart) when p_date is on or before the
-- lock date of the organisation
CREATE OR REPLACE FUNCTION public.assert_not_locked(p_org uuid, p_date date, p_what text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock date;
BEGIN
  IF COALESCE(current_setting('app.bypass_lock', true), '') = 'on' OR p_date IS NULL THEN
    RETURN;
  END IF;
  SELECT lock_date INTO v_lock FROM public.organizations WHERE id = p_org;
  IF v_lock IS NOT NULL AND p_date <= v_lock THEN
    RAISE EXCEPTION 'This % is dated %, which is in a locked period (up to %). An Admin can unlock it in Settings.', p_what, p_date, v_lock
      USING ERRCODE = 'OL001';
  END IF;
END;
$$;

-- Is the opening position frozen? (the lock date has reached the day before the start date)
CREATE OR REPLACE FUNCTION public.opening_locked(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(current_setting('app.bypass_lock', true), '') <> 'on'
     AND o.lock_date IS NOT NULL
     AND o.lock_date >= COALESCE(o.tracking_start_date - 1, '-infinity'::date)
  FROM public.organizations o WHERE o.id = p_org;
$$;

-- Did anything besides the bookkeeping timestamp change?
CREATE OR REPLACE FUNCTION public.row_changed(p_old jsonb, p_new jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_old - 'updated_at') IS DISTINCT FROM (p_new - 'updated_at');
$$;

CREATE OR REPLACE FUNCTION public.enforce_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.row_changed(to_jsonb(OLD), to_jsonb(NEW)) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'transactions' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM public.assert_not_locked(OLD.organization_id, OLD.tx_date, 'entry'); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public.assert_not_locked(NEW.organization_id, NEW.tx_date, 'entry'); END IF;

  ELSIF TG_TABLE_NAME = 'transaction_lines' THEN
    SELECT t.tx_date INTO v_date FROM public.transactions t WHERE t.id = COALESCE(NEW.transaction_id, OLD.transaction_id);
    PERFORM public.assert_not_locked(COALESCE(NEW.organization_id, OLD.organization_id), v_date, 'entry');

  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM public.assert_not_locked(OLD.organization_id, OLD.issue_date, 'invoice'); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public.assert_not_locked(NEW.organization_id, NEW.issue_date, 'invoice'); END IF;

  ELSIF TG_TABLE_NAME = 'invoice_lines' THEN
    SELECT i.issue_date INTO v_date FROM public.invoices i WHERE i.id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    PERFORM public.assert_not_locked(COALESCE(NEW.organization_id, OLD.organization_id), v_date, 'invoice');

  ELSIF TG_TABLE_NAME = 'items' THEN
    -- Its name, notes and archiving can always change; what it is worth cannot, in a locked period
    IF TG_OP = 'UPDATE' AND ROW(OLD.kind, OLD.classification, OLD.fund_id, OLD.opening_balance, OLD.acquired_date, OLD.opening_cost,
                                OLD.opening_accumulated_depreciation, OLD.residual_value, OLD.useful_life_months, OLD.disposed_date)
                         IS NOT DISTINCT FROM
                         ROW(NEW.kind, NEW.classification, NEW.fund_id, NEW.opening_balance, NEW.acquired_date, NEW.opening_cost,
                             NEW.opening_accumulated_depreciation, NEW.residual_value, NEW.useful_life_months, NEW.disposed_date) THEN
      RETURN NEW;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      PERFORM public.assert_not_locked(OLD.organization_id, OLD.acquired_date, 'asset');
      PERFORM public.assert_not_locked(OLD.organization_id, OLD.disposed_date, 'disposal');
      IF (OLD.opening_balance <> 0 OR OLD.opening_cost <> 0) AND public.opening_locked(OLD.organization_id) THEN
        RAISE EXCEPTION 'The opening position is in a locked period. An Admin can unlock it in Settings.' USING ERRCODE = 'OL001';
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM public.assert_not_locked(NEW.organization_id, NEW.acquired_date, 'asset');
      PERFORM public.assert_not_locked(NEW.organization_id, NEW.disposed_date, 'disposal');
      IF (NEW.opening_balance <> 0 OR NEW.opening_cost <> 0) AND public.opening_locked(NEW.organization_id) THEN
        RAISE EXCEPTION 'The opening position is in a locked period. An Admin can unlock it in Settings.' USING ERRCODE = 'OL001';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'reconciliations' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM public.assert_not_locked(OLD.organization_id, OLD.period_end, 'reconciliation'); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public.assert_not_locked(NEW.organization_id, NEW.period_end, 'reconciliation'); END IF;

  ELSIF TG_TABLE_NAME IN ('accounts', 'funds') THEN
    -- Opening balances are part of the opening position
    IF (TG_OP = 'UPDATE' AND NEW.opening_balance IS DISTINCT FROM OLD.opening_balance)
       OR (TG_OP = 'INSERT' AND NEW.opening_balance <> 0)
       OR (TG_OP = 'DELETE' AND OLD.opening_balance <> 0) THEN
      IF public.opening_locked(COALESCE(NEW.organization_id, OLD.organization_id)) THEN
        RAISE EXCEPTION 'Opening balances are in a locked period. An Admin can unlock it in Settings.' USING ERRCODE = 'OL001';
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'transaction_lines', 'invoices', 'invoice_lines', 'items', 'accounts', 'funds'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_lock ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_enforce_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_lock()', t);
  END LOOP;
END $$;

-- The lock date moves only through set_lock_date (which records the reason); the start date cannot
-- move once the opening position is locked
CREATE OR REPLACE FUNCTION public.protect_lock_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lock_date IS DISTINCT FROM OLD.lock_date AND COALESCE(current_setting('app.lock_change', true), '') <> 'on'
     AND COALESCE(current_setting('app.bypass_lock', true), '') <> 'on' THEN
    RAISE EXCEPTION 'The lock date is changed from Settings, with a reason when unlocking';
  END IF;
  IF NEW.tracking_start_date IS DISTINCT FROM OLD.tracking_start_date AND OLD.lock_date IS NOT NULL
     AND COALESCE(current_setting('app.bypass_lock', true), '') <> 'on'
     AND OLD.lock_date >= LEAST(COALESCE(OLD.tracking_start_date, '-infinity'::date), COALESCE(NEW.tracking_start_date, '-infinity'::date)) - 1 THEN
    RAISE EXCEPTION 'The start date is in a locked period. An Admin can unlock it in Settings.' USING ERRCODE = 'OL001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_lock_settings ON public.organizations;
CREATE TRIGGER trg_protect_lock_settings
  BEFORE UPDATE OF lock_date, tracking_start_date ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_lock_settings();

-- Bills from uploads: a change the lock refuses must stop the document save with its message, not be
-- swallowed. Re-created from the exact current text (20261119160000_transactions.sql).
CREATE OR REPLACE FUNCTION public.documents_sync_transaction_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.sync_document_transaction(NEW.id);
  EXCEPTION
    WHEN SQLSTATE 'OL001' THEN
      RAISE;
    WHEN OTHERS THEN
      RAISE WARNING 'Could not mirror document % into transactions: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- The mirror, re-created from its exact current text (20261125100000_invoices.sql) so that it only
-- rewrites what actually changed. Before, every save of a bill rewrote its invoice and payment even
-- when nothing differed, which a lock would refuse (and which made needless history).
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
  cur_inv public.invoices%ROWTYPE;
  cur_tx public.transactions%ROWTYPE;
  inv_changed boolean := false;
  want_lines jsonb;
  have_lines jsonb;
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

  -- Does the payable invoice need to change?
  IF want_invoice THEN
    IF inv_id IS NOT NULL THEN
      SELECT * INTO cur_inv FROM public.invoices WHERE id = inv_id;
    END IF;
    inv_changed := inv_id IS NULL
      OR ROW(cur_inv.invoice_no, cur_inv.payee_id, cur_inv.payee_name, cur_inv.issue_date, cur_inv.due_date,
             cur_inv.reference, cur_inv.remarks, cur_inv.total, cur_inv.status)
         IS DISTINCT FROM
         ROW(NULLIF(left(btrim(COALESCE(d.invoice_number, '')), 100), ''), d.vendor_id,
             COALESCE(NULLIF(left(btrim(COALESCE(d.vendor_name, '')), 255), ''), 'Unknown payee'),
             issue_day, CASE WHEN d.due_date >= issue_day THEN d.due_date END,
             NULLIF(left(btrim(COALESCE(d.reference_number, '')), 100), ''), NULLIF(d.remarks, ''),
             inv_total::numeric(15,2), 'open'::text)
      OR (SELECT jsonb_agg(jsonb_build_array(il.amount, il.fund_id, il.category_id) ORDER BY il.line_no) FROM public.invoice_lines il WHERE il.invoice_id = inv_id)
         IS DISTINCT FROM
         (SELECT jsonb_agg(jsonb_build_array(l.amount, l.fund_id, l.category_id) ORDER BY l.line_no) FROM public.document_cash_lines(p_doc) l WHERE l.amount > 0);
  END IF;

  -- 1. When the invoice changes, remove the own payment lines of this mirror first, so the invoice can change underneath
  IF inv_changed OR (NOT want_invoice AND inv_id IS NOT NULL) THEN
    DELETE FROM public.transaction_lines
    WHERE transaction_id IN (SELECT id FROM public.transactions WHERE document_id = p_doc AND tx_type = 'money_out');
  END IF;

  -- 2. The payable invoice
  IF want_invoice AND inv_changed THEN
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

    IF (SELECT jsonb_agg(jsonb_build_array(il.amount, il.fund_id, il.category_id) ORDER BY il.line_no) FROM public.invoice_lines il WHERE il.invoice_id = inv_id)
       IS DISTINCT FROM
       (SELECT jsonb_agg(jsonb_build_array(l.amount, l.fund_id, l.category_id) ORDER BY l.line_no) FROM public.document_cash_lines(p_doc) l WHERE l.amount > 0) THEN
      DELETE FROM public.invoice_lines WHERE invoice_id = inv_id;
      INSERT INTO public.invoice_lines (invoice_id, organization_id, line_no, amount, fund_id, category_id)
      SELECT inv_id, d.organization_id, (row_number() OVER (ORDER BY l.line_no))::integer, l.amount, l.fund_id, l.category_id
      FROM public.document_cash_lines(p_doc) l WHERE l.amount > 0;
    END IF;
  ELSIF NOT want_invoice AND inv_id IS NOT NULL THEN
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
    cur_tx := NULL;
    have_lines := NULL;
    want_lines := NULL;
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

    -- Skip when the transaction already says exactly this
    IF dir = 'money_out' AND inv_id IS NOT NULL THEN
      SELECT jsonb_agg(jsonb_build_array(s.amount, s.fund_id, s.category_id, inv_id) ORDER BY s.amount DESC, s.category_id) INTO want_lines
      FROM public.invoice_payment_split(inv_id, hdr_total) s WHERE s.amount > 0;
    ELSE
      SELECT jsonb_agg(jsonb_build_array(abs(l.amount), l.fund_id, l.category_id, NULL::uuid) ORDER BY l.line_no) INTO want_lines
      FROM public.document_cash_lines(p_doc) l
      WHERE (dir = 'money_out' AND l.amount > 0) OR (dir = 'money_in' AND l.amount < 0);
    END IF;
    SELECT * INTO cur_tx FROM public.transactions WHERE document_id = p_doc AND tx_type = dir;
    IF FOUND THEN
      SELECT jsonb_agg(jsonb_build_array(tl.amount, tl.fund_id, tl.category_id, tl.invoice_id) ORDER BY tl.line_no) INTO have_lines
      FROM public.transaction_lines tl WHERE tl.transaction_id = cur_tx.id;
      IF ROW(cur_tx.tx_date, cur_tx.date_estimated, cur_tx.account_id, cur_tx.payee_id, cur_tx.payee_name,
             cur_tx.reference, cur_tx.remarks, cur_tx.total)
         IS NOT DISTINCT FROM
         ROW(tx_day, d.paid_date IS NULL, acct, d.vendor_id, d.vendor_name::text,
             COALESCE(NULLIF(d.invoice_number, ''), NULLIF(d.reference_number, ''))::text, NULLIF(d.remarks, ''), hdr_total::numeric(15,2))
         AND have_lines IS NOT DISTINCT FROM want_lines THEN
        CONTINUE;
      END IF;
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

    IF have_lines IS DISTINCT FROM want_lines OR cur_tx.id IS NULL THEN
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
    END IF;
  END LOOP;
END;
$$;

-- Admin moves the lock date. Locking further forward needs no reason; moving it back (unlocking) does.
-- The change and the reason go into the history.
CREATE OR REPLACE FUNCTION public.set_lock_date(p_date date, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_old date;
  v_today date;
BEGIN
  v_org := NULLIF(public.get_user_org_id(), '')::uuid;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation';
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Only Admins can lock or unlock a period';
  END IF;
  IF NOT public.org_feature_allowed(v_org, 'period_lock', 'use') THEN
    RAISE EXCEPTION 'Period locks are available on the Growth and Nonprofit plans';
  END IF;
  SELECT lock_date, (now() AT TIME ZONE COALESCE(timezone, 'UTC'))::date INTO v_old, v_today FROM public.organizations WHERE id = v_org;
  IF p_date IS NOT NULL AND p_date > v_today THEN
    RAISE EXCEPTION 'A period can only be locked up to today';
  END IF;
  IF (p_date IS NULL AND v_old IS NOT NULL) OR p_date < v_old THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'Give a reason for unlocking';
    END IF;
  END IF;
  PERFORM set_config('app.lock_change', 'on', true);
  PERFORM set_config('app.audit_reason', left(btrim(COALESCE(p_reason, '')), 500), true);
  UPDATE public.organizations SET lock_date = p_date WHERE id = v_org;
  PERFORM set_config('app.lock_change', 'off', true);
  PERFORM set_config('app.audit_reason', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_lock_date(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lock_date(date, text) TO authenticated, service_role;

-- ================================================================ 3. Change history
CREATE TABLE IF NOT EXISTS public.audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity           text NOT NULL,
  entity_id        uuid NOT NULL,
  parent_id        uuid,
  action           text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before           jsonb,
  after            jsonb,
  reason           text,
  actor_id         uuid,
  actor_email      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_org ON public.audit_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events (entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_parent ON public.audit_events (parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rbac_audit_events_select ON public.audit_events;
CREATE POLICY rbac_audit_events_select ON public.audit_events FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());
REVOKE ALL ON public.audit_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_events FROM authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

-- One row per change. Entries made by the bill mirror (source document) are not repeated here:
-- the history of the document already records them.
CREATE OR REPLACE FUNCTION public.record_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_org uuid;
  v_id uuid;
  v_parent uuid;
  v_source text;
BEGIN
  IF COALESCE(current_setting('app.bypass_lock', true), '') = 'on' THEN
    RETURN NULL; -- deleting a whole organisation
  END IF;
  IF TG_TABLE_NAME = 'organizations' THEN
    v_org := COALESCE(NEW.id, OLD.id);
    v_id := v_org;
    v_old := jsonb_build_object('lock_date', OLD.lock_date, 'tracking_start_date', OLD.tracking_start_date,
                                'opening_position_completed_at', OLD.opening_position_completed_at, 'statement_note', OLD.statement_note);
    v_new := jsonb_build_object('lock_date', NEW.lock_date, 'tracking_start_date', NEW.tracking_start_date,
                                'opening_position_completed_at', NEW.opening_position_completed_at, 'statement_note', NEW.statement_note);
  ELSE
    v_org := COALESCE(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
    v_id := COALESCE(v_new ->> 'id', v_old ->> 'id')::uuid;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT public.row_changed(v_old, v_new) THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'transactions' THEN
    IF COALESCE(v_new ->> 'source', v_old ->> 'source') = 'document' THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'transaction_lines' THEN
    v_parent := COALESCE(v_new ->> 'transaction_id', v_old ->> 'transaction_id')::uuid;
    SELECT source INTO v_source FROM public.transactions WHERE id = v_parent;
    IF v_source IS NULL OR v_source = 'document' THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF COALESCE(v_new ->> 'source', v_old ->> 'source') = 'document' THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'invoice_lines' THEN
    v_parent := COALESCE(v_new ->> 'invoice_id', v_old ->> 'invoice_id')::uuid;
    SELECT source INTO v_source FROM public.invoices WHERE id = v_parent;
    IF v_source IS NULL OR v_source = 'document' THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'funds' THEN
    -- only what the statements depend on
    IF TG_OP <> 'UPDATE' OR ROW(OLD.opening_balance, OLD.fund_type) IS NOT DISTINCT FROM ROW(NEW.opening_balance, NEW.fund_type) THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'accounts' THEN
    IF TG_OP <> 'UPDATE' OR OLD.opening_balance IS NOT DISTINCT FROM NEW.opening_balance THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.audit_events (organization_id, entity, entity_id, parent_id, action, before, after, reason, actor_id, actor_email)
  VALUES (v_org, TG_TABLE_NAME, v_id, v_parent, lower(TG_OP), v_old, v_new,
          NULLIF(current_setting('app.audit_reason', true), ''),
          auth.uid(), NULLIF(COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'email', ''));
  RETURN NULL;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'transaction_lines', 'invoices', 'invoice_lines', 'items', 'accounts', 'funds'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_record_audit_event ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_record_audit_event AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_audit_event()', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_record_audit_event ON public.organizations;
CREATE TRIGGER trg_record_audit_event
  AFTER UPDATE OF lock_date, tracking_start_date, opening_position_completed_at, statement_note ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_event();

-- ================================================================ 4. Reconciliations
-- One per account per month-end: the closing balance on the bank statement and a note. The Outlayd
-- balance and the difference are worked out when read, never stored.
CREATE TABLE IF NOT EXISTS public.reconciliations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id         uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_end         date NOT NULL CHECK (extract(day FROM period_end + 1) = 1),
  statement_balance  numeric(15,2) NOT NULL,
  note               text CHECK (note IS NULL OR char_length(note) <= 500),
  updated_by         uuid,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliations_account_period_key UNIQUE (account_id, period_end)
);
CREATE INDEX IF NOT EXISTS idx_reconciliations_org ON public.reconciliations (organization_id, period_end);

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rbac_reconciliations_select ON public.reconciliations;
CREATE POLICY rbac_reconciliations_select ON public.reconciliations FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());
REVOKE ALL ON public.reconciliations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.reconciliations FROM authenticated;
GRANT SELECT ON public.reconciliations TO authenticated;
GRANT ALL ON public.reconciliations TO service_role;

DROP TRIGGER IF EXISTS trg_enforce_lock ON public.reconciliations;
CREATE TRIGGER trg_enforce_lock BEFORE INSERT OR UPDATE OR DELETE ON public.reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lock();
DROP TRIGGER IF EXISTS trg_record_audit_event ON public.reconciliations;
CREATE TRIGGER trg_record_audit_event AFTER INSERT OR UPDATE OR DELETE ON public.reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_event();

-- Each account at a month-end: the Outlayd balance, the statement balance entered, the difference, the
-- note, and a suggested statement balance from an uploaded bank statement ending that day
CREATE OR REPLACE FUNCTION public.reconciliation_status(p_org uuid, p_period_end date)
RETURNS TABLE (account_id uuid, account_name text, archived boolean, outlayd_balance numeric, reconciliation_id uuid,
               statement_balance numeric, difference numeric, note text, suggested_balance numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT a.id, a.name, a.archived_at IS NOT NULL, b.balance, r.id, r.statement_balance,
         CASE WHEN r.id IS NOT NULL THEN r.statement_balance - b.balance END, r.note,
         (SELECT s.closing_balance FROM public.bank_statements s
          WHERE s.organization_id = p_org AND s.period_end = p_period_end AND s.closing_balance IS NOT NULL AND s.status = 'ready'
          ORDER BY s.created_at DESC LIMIT 1)
  FROM public.accounts a
  JOIN public.account_balances(p_org, p_period_end) b ON b.account_id = a.id
  LEFT JOIN public.reconciliations r ON r.account_id = a.id AND r.period_end = p_period_end
  WHERE a.organization_id = p_org;
$$;

-- payload: {account_id, period_end, statement_balance, note?}
CREATE OR REPLACE FUNCTION public.save_reconciliation(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_acct uuid;
  v_end date;
  v_bal numeric;
  v_id uuid;
BEGIN
  v_org := public.writer_org('reconciliation', false);
  BEGIN
    v_acct := NULLIF(payload ->> 'account_id', '')::uuid;
    v_end := (payload ->> 'period_end')::date;
    v_bal := (payload ->> 'statement_balance')::numeric;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter a valid month-end and balance';
  END;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_acct AND organization_id = v_org) THEN
    RAISE EXCEPTION 'That account was not found';
  END IF;
  IF v_end IS NULL OR extract(day FROM v_end + 1) <> 1 THEN
    RAISE EXCEPTION 'Reconcile to the last day of a month';
  END IF;
  IF v_bal IS NULL OR v_bal <> round(v_bal, 2) THEN
    RAISE EXCEPTION 'Enter the statement balance with at most two decimals';
  END IF;
  INSERT INTO public.reconciliations (organization_id, account_id, period_end, statement_balance, note, updated_by)
  VALUES (v_org, v_acct, v_end, v_bal, NULLIF(left(btrim(COALESCE(payload ->> 'note', '')), 500), ''), auth.uid())
  ON CONFLICT (account_id, period_end) DO UPDATE
    SET statement_balance = EXCLUDED.statement_balance, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_reconciliation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := public.writer_org('reconciliation', false);
  DELETE FROM public.reconciliations WHERE id = p_id AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That reconciliation was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_reconciliation(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_reconciliation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_reconciliation(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_reconciliation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconciliation_status(uuid, date) TO authenticated, service_role;

-- ================================================================ 5. Integrity checks (spec 8)
-- One row per check for a period. Severity block must pass for a statement to be final; warning
-- is listed but does not block. passed is NULL when a check does not apply yet.
CREATE OR REPLACE FUNCTION public.integrity_checks(p_org uuid, p_from date, p_to date)
RETURNS TABLE (code text, title text, severity text, passed boolean, detail text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_complete boolean;
  v_start date;
  n integer;
  v_diff numeric;
  v_me date;
BEGIN
  SELECT opening_position_completed_at IS NOT NULL, tracking_start_date INTO v_complete, v_start FROM public.organizations WHERE id = p_org;

  -- 1. Nothing in the period is Uncategorised
  SELECT count(*) INTO n FROM (
    SELECT l.id FROM public.transactions t JOIN public.transaction_lines l ON l.transaction_id = t.id
    JOIN public.categories c ON c.id = l.category_id
    WHERE t.organization_id = p_org AND t.tx_date BETWEEN p_from AND p_to AND l.invoice_id IS NULL
      AND c.is_system AND c.name IN ('Uncategorised', 'Uncategorised income')
    UNION ALL
    SELECT il.id FROM public.invoices i JOIN public.invoice_lines il ON il.invoice_id = i.id
    JOIN public.categories c ON c.id = il.category_id
    WHERE i.organization_id = p_org AND i.status = 'open' AND i.issue_date BETWEEN p_from AND p_to
      AND c.is_system AND c.name IN ('Uncategorised', 'Uncategorised income')
  ) x;
  code := 'uncategorised'; title := 'Nothing in the period is Uncategorised'; severity := 'block';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' line(s) still Uncategorised' END;
  RETURN NEXT;

  -- 2. Every entry adds up and every line has a fund
  SELECT count(*) INTO n FROM public.transactions t
  WHERE t.organization_id = p_org AND t.tx_type IN ('money_in', 'money_out') AND t.tx_date BETWEEN p_from AND p_to
    AND (t.total <> COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l WHERE l.transaction_id = t.id), 0)
         OR EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = t.id AND l.fund_id IS NULL));
  code := 'lines_balanced'; title := 'Every entry adds up and has a fund'; severity := 'block';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' entry(ies) do not add up' END;
  RETURN NEXT;

  -- 3. Opening position complete
  code := 'opening_complete'; title := 'Opening position is complete'; severity := 'block';
  passed := v_complete; detail := CASE WHEN NOT v_complete THEN 'Complete it in Settings, Accounts & Transfers' END;
  RETURN NEXT;

  -- 4. Balance check at the period end (R5)
  code := 'balance_check'; title := 'Assets less liabilities equal the funds at the period end'; severity := 'block';
  IF v_complete AND p_to >= COALESCE(v_start - 1, '-infinity'::date) THEN
    SELECT b.difference INTO v_diff FROM public.balance_check(p_org, p_to) b;
    passed := v_diff = 0; detail := CASE WHEN v_diff <> 0 THEN 'Difference of ' || v_diff END;
  ELSE
    passed := NULL; detail := 'Needs the opening position';
  END IF;
  RETURN NEXT;

  -- 5. Prior-year closing = opening of this year (R7)
  code := 'prior_year'; title := 'Closing of the last period equals opening of this one'; severity := 'block';
  IF v_complete AND p_from > COALESCE(v_start, '-infinity'::date) THEN
    SELECT (SELECT funds_total FROM public.balance_check(p_org, p_from - 1)) - COALESCE((SELECT sum(c.opening) FROM public.changes_in_funds(p_org, p_from, p_to) c), 0)
    INTO v_diff;
    passed := v_diff = 0; detail := CASE WHEN v_diff <> 0 THEN 'Difference of ' || v_diff END;
  ELSE
    passed := NULL; detail := CASE WHEN v_complete THEN 'The period starts at the opening position' ELSE 'Needs the opening position' END;
  END IF;
  RETURN NEXT;

  -- 6. No invoice overpaid, no payment on a void invoice
  SELECT count(*) INTO n FROM public.invoices i
  WHERE i.organization_id = p_org
    AND (COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l WHERE l.invoice_id = i.id), 0) > i.total
         OR (i.status = 'void' AND EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.invoice_id = i.id)));
  code := 'invoices'; title := 'No invoice is overpaid or paid while void'; severity := 'block';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' invoice(s) affected' END;
  RETURN NEXT;

  -- 7. Every account reconciled at the last month-end of the period, any difference explained
  v_me := (date_trunc('month', p_to + 1) - interval '1 day')::date;
  IF v_me > p_to THEN v_me := (date_trunc('month', p_to) - interval '1 day')::date; END IF;
  SELECT count(*) INTO n FROM public.reconciliation_status(p_org, v_me) s
  WHERE NOT s.archived AND (s.reconciliation_id IS NULL OR (s.difference <> 0 AND COALESCE(btrim(s.note), '') = ''));
  code := 'reconciled'; title := 'Every account is reconciled at ' || v_me; severity := 'warning';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' account(s) not reconciled, or a difference not explained' END;
  RETURN NEXT;

  -- 8. No restricted fund below zero at the period end
  IF v_complete THEN
    SELECT count(*) INTO n FROM public.changes_in_funds(p_org, GREATEST(p_from, COALESCE(v_start, p_from)), p_to) c
    WHERE c.fund_type = 'restricted' AND c.closing < 0;
    passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' restricted fund(s) below zero' END;
  ELSE
    passed := NULL; detail := 'Needs the opening position';
  END IF;
  code := 'restricted_negative'; title := 'No restricted fund is below zero'; severity := 'warning';
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.integrity_checks(uuid, date, date) TO authenticated, service_role;

-- ================================================================ 6. Deleting an organisation
-- Re-created from the exact current text (20261126100000_balance_sheet.sql): bypasses the lock and the
-- history while everything of the organisation is removed.
CREATE OR REPLACE FUNCTION public.delete_organization_data(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.bypass_lock', 'on', true);
  DELETE FROM public.donation_receipts    WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.reconciliations      WHERE organization_id::text = p_org_id::text;
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
  DELETE FROM public.audit_events         WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.organizations        WHERE id::text = p_org_id::text;
  PERFORM set_config('app.bypass_lock', 'off', true);
END;
$function$;
