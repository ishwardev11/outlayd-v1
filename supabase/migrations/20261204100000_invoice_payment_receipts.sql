-- Invoices and AI plan, step 1: a receipt is required on every payment received for an invoice you issued.
--   * record_invoice_payment (re-created from its exact text in 20261125100000_invoices.sql). Change: for a
--     receivable invoice the payload must carry attachment_path, the storage path of the receipt the server
--     uploaded first (it must sit in this organisation's folder). The payment and its receipt are saved in
--     one go, so a payment never exists without its receipt. Bills (payables) are unchanged.
--   * set_invoice_payment_receipt: adds a receipt to an older payment received that has none. Admins and
--     Editors on a paid plan, never in a locked period, never replacing a receipt that is already there.
-- Existing payments without a receipt are left as they are (step 2 flags them).

-- Is this a storage path inside the organisation's own folder?
CREATE OR REPLACE FUNCTION public.org_receipt_path_ok(p_org uuid, p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_path IS NOT NULL
     AND char_length(p_path) BETWEEN char_length(p_org::text) + 2 AND 500
     AND left(p_path, char_length(p_org::text) + 1) = p_org::text || '/'
     AND p_path NOT LIKE '%..%';
$$;
REVOKE ALL ON FUNCTION public.org_receipt_path_ok(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_receipt_path_ok(uuid, text) TO authenticated, service_role;

-- payload: {invoice_id, amount, tx_date, account_id?, reference?, remarks?, attachment_path (receivable: required)}
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
  v_path text;
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
  -- Money received for an invoice you issued needs its receipt
  IF i.direction = 'receivable' THEN
    v_path := NULLIF(btrim(COALESCE(payload ->> 'attachment_path', '')), '');
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'Attach the receipt for this payment';
    END IF;
    IF NOT public.org_receipt_path_ok(v_org, v_path) THEN
      RAISE EXCEPTION 'The receipt could not be attached. Please upload it again.';
    END IF;
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
                                   reference, remarks, total, source, created_by, attachment_url)
  VALUES (v_org, CASE WHEN i.direction = 'payable' THEN 'money_out' ELSE 'money_in' END, v_date, v_account,
          i.payee_id, i.payee_name,
          COALESCE(NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''), i.invoice_no),
          NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''),
          v_amount, 'manual', auth.uid(), v_path)
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

-- Adds the receipt to an older payment received for an invoice you issued that has none
CREATE OR REPLACE FUNCTION public.set_invoice_payment_receipt(p_tx uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  t public.transactions%ROWTYPE;
BEGIN
  v_org := public.invoice_writer_org();
  SELECT * INTO t FROM public.transactions WHERE id = p_tx AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND OR t.source <> 'manual' OR t.tx_type <> 'money_in'
     OR NOT EXISTS (SELECT 1 FROM public.transaction_lines l JOIN public.invoices i ON i.id = l.invoice_id
                    WHERE l.transaction_id = p_tx AND i.direction = 'receivable') THEN
    RAISE EXCEPTION 'That payment was not found';
  END IF;
  IF t.attachment_url IS NOT NULL THEN
    RAISE EXCEPTION 'This payment already has a receipt';
  END IF;
  PERFORM public.assert_not_locked(v_org, t.tx_date, 'payment');
  IF NOT public.org_receipt_path_ok(v_org, p_path) THEN
    RAISE EXCEPTION 'The receipt could not be attached. Please upload it again.';
  END IF;
  UPDATE public.transactions SET attachment_url = p_path WHERE id = p_tx;
END;
$$;
REVOKE ALL ON FUNCTION public.set_invoice_payment_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_invoice_payment_receipt(uuid, text) TO authenticated, service_role;
