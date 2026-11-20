-- Remarks, step 4 of Phase 1 (spec sections 3.7 and 5.2).
--
-- A remark is a short note a person writes about an entry (up to 500 characters), for example
-- "Paid by cheque 4471, approved at the March committee". It is NOT the existing documents.notes
-- column: the AI extraction already stores its own error messages there, and those must never show
-- up as someone's remarks or travel into the transactions.
--
--   * documents.remarks, limited to 500 characters
--   * the transaction mirror copies remarks (it used to copy notes)
--   * ledger search also looks inside remarks
--   * every mirrored transaction is rebuilt once, so remarks that were copied from notes are cleared

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS remarks text;

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_remarks_length_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_remarks_length_check
  CHECK (remarks IS NULL OR char_length(remarks) <= 500);

-- The mirror follows remarks
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
    INSERT INTO public.transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id)
    SELECT hdr, d.organization_id, (row_number() OVER (ORDER BY l.line_no))::integer, abs(l.amount), l.fund_id, l.category_id
    FROM public.document_cash_lines(p_doc) l
    WHERE (dir = 'money_out' AND l.amount > 0) OR (dir = 'money_in' AND l.amount < 0);
  END LOOP;
END;
$$;

-- Re-mirror when remarks change (notes no longer matter to the mirror)
DROP TRIGGER IF EXISTS trg_documents_sync_update ON public.documents;
CREATE TRIGGER trg_documents_sync_update
  AFTER UPDATE OF status, amount, splits, fund_id, category_id, vendor_id, vendor_name,
                  paid_date, document_date, remarks, reference_number, invoice_number
  ON public.documents
  FOR EACH ROW WHEN (NEW.status = 'paid' OR OLD.status = 'paid')
  EXECUTE FUNCTION public.documents_sync_transaction_trigger();

-- Ledger search also looks inside remarks (same function as before, one extra condition)
CREATE OR REPLACE FUNCTION "public"."ledger_page"("p_org" "uuid", "p_status" "text" DEFAULT NULL::"text", "p_fund" "uuid" DEFAULT NULL::"uuid", "p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date", "p_q" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."documents"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT d.*
  FROM public.documents d
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN p_q IS NULL OR btrim(p_q) = '' THEN NULL
      ELSE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    END AS pat
  ) q
  WHERE d.organization_id = p_org
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_fund IS NULL OR d.fund_id = p_fund)
    AND (
      (p_from IS NULL AND p_to IS NULL)
      OR public.safe_iso_date(d.document_date::text) IS NULL
      OR (public.safe_iso_date(d.document_date::text) >= COALESCE(p_from, '-infinity'::date)
          AND public.safe_iso_date(d.document_date::text) <= COALESCE(p_to, 'infinity'::date))
    )
    AND (
      q.pat IS NULL
      OR d.vendor_name::text ILIKE q.pat
      OR d.invoice_number::text ILIKE q.pat
      OR d.amount::text ILIKE q.pat
      OR d.line_items::text ILIKE q.pat
      OR d.remarks::text ILIKE q.pat
    )
  ORDER BY d.created_at DESC, d.id DESC;
$$;

-- Rebuild every mirrored transaction once so nothing copied from notes remains
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT DISTINCT organization_id FROM public.documents WHERE status = 'paid' LOOP
    PERFORM public.resync_org_transactions(o.organization_id);
  END LOOP;
END;
$$;
