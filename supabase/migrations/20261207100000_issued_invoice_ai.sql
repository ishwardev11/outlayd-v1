-- Invoices and AI plan, step 6: AI reading of invoices you issued.
--   * invoices.entry_method: 'manual' or 'ai_extraction' (filled in by the AI from an uploaded invoice and
--     checked by a person before saving). Kept apart from invoices.source, which many rules use to tell
--     a manual invoice from a bill created by an upload; an AI-read invoice is a manual invoice.
--   * invoices.ai_extracted: what the AI read from the document (customer, number, dates, amounts,
--     currency, checks), kept on the row so the change history records it. New invoices only.
--   * save_invoice (re-created from its exact text in 20261125100000_invoices.sql). Changes:
--       - payload.printed_invoice_no: a new invoice you issued keeps the number printed on its document
--         (no Outlayd number is used); refused when another invoice you issued already has it;
--       - payload.ai_extracted: stored with entry_method 'ai_extraction';
--       - automatic numbering skips a number already taken by a printed one, so numbers never clash.
-- Existing invoices are unchanged (entry_method 'manual').

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS entry_method text NOT NULL DEFAULT 'manual';
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_entry_method_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_entry_method_check CHECK (entry_method IN ('manual', 'ai_extraction'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ai_extracted jsonb;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_ai_extracted_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_ai_extracted_check
  CHECK (ai_extracted IS NULL OR (jsonb_typeof(ai_extracted) = 'object' AND char_length(ai_extracted::text) <= 20000));
CREATE INDEX IF NOT EXISTS idx_invoices_org_number ON public.invoices (organization_id, lower(invoice_no)) WHERE invoice_no IS NOT NULL;

-- Saves a manual invoice (new, or replacing an existing one) with its lines.
-- payload: {id?, direction, status (draft or open), payee_id, invoice_no? (bills only), printed_invoice_no?
--           (new invoices you issue, read by the AI), ai_extracted?, issue_date, due_date?, reference?,
--           remarks?, is_opening_balance?, lines: [{description?, amount, fund_id?, category_id}]}
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
  v_printed text;
  v_ai jsonb;
  v_next integer;
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

  -- A new invoice you issued, read from its document by the AI, keeps the number printed on it
  -- (the Outlayd sequence is not used). The number must not be used by another invoice you issued.
  v_printed := NULLIF(left(btrim(COALESCE(payload ->> 'printed_invoice_no', '')), 100), '');
  IF v_printed IS NOT NULL AND (v_dir <> 'receivable' OR v_id IS NOT NULL) THEN
    v_printed := NULL;
  END IF;
  IF v_printed IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices x WHERE x.organization_id = v_org AND x.direction = 'receivable' AND lower(x.invoice_no) = lower(v_printed)
  ) THEN
    RAISE EXCEPTION 'Invoice number % is already used by another invoice', v_printed;
  END IF;
  -- What the AI read from the document, kept for the change history (new invoices only)
  IF v_id IS NULL AND jsonb_typeof(payload -> 'ai_extracted') = 'object' THEN
    v_ai := payload -> 'ai_extracted';
    IF char_length(v_ai::text) > 20000 THEN
      RAISE EXCEPTION 'The extracted details are too long';
    END IF;
  END IF;

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
                                 reference, remarks, total, status, is_opening_balance, source, created_by,
                                 entry_method, ai_extracted)
    VALUES (v_org, v_dir,
            CASE WHEN v_dir = 'payable' THEN NULLIF(left(btrim(COALESCE(payload ->> 'invoice_no', '')), 100), '') ELSE v_printed END,
            v_payee, v_payee_name, v_issue, v_due,
            NULLIF(left(btrim(COALESCE(payload ->> 'reference', '')), 100), ''),
            NULLIF(left(btrim(COALESCE(payload ->> 'remarks', '')), 500), ''),
            v_total, v_status, COALESCE((payload ->> 'is_opening_balance')::boolean, false), 'manual', auth.uid(),
            CASE WHEN v_ai IS NULL THEN 'manual' ELSE 'ai_extraction' END, v_ai)
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

  -- A receivable invoice gets its number the first time it is opened, unless it keeps a printed one.
  -- A number already taken by an invoice with a printed number is skipped.
  IF v_dir = 'receivable' AND v_status = 'open' AND cur.seq IS NULL AND cur.invoice_no IS NULL THEN
    SELECT * INTO o FROM public.organizations WHERE id = v_org FOR UPDATE;
    v_next := o.invoice_next_number;
    WHILE EXISTS (SELECT 1 FROM public.invoices x WHERE x.organization_id = v_org AND x.direction = 'receivable'
                  AND lower(x.invoice_no) = lower(o.invoice_prefix || v_next)) LOOP
      v_next := v_next + 1;
    END LOOP;
    UPDATE public.invoices SET seq = v_next, invoice_no = o.invoice_prefix || v_next WHERE id = v_id;
    UPDATE public.organizations SET invoice_next_number = v_next + 1 WHERE id = v_org;
  END IF;

  RETURN v_id;
END;
$$;
