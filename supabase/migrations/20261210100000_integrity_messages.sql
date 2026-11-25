-- Invoices and AI plan, step 9: report checks explained in plain words, each with a Fix link to exactly
-- the records concerned.
--   * integrity_checks is re-created from its exact text in 20261127100000_assurance.sql (DROP first: its
--     result gains columns). Every check keeps its code, title, severity, pass rule and detail text.
--     New columns: affected (how many records the Fix link will list; for Uncategorised, the items the
--     Uncategorised queue shows) and amount (the difference, for the balance and prior-year checks).
--     New check 9 (warning): invoices issued in the period with a payment missing its receipt.
--   * integrity_check_records(org, from, to, code): the records behind the two checks that have no list
--     of their own to filter (entries that do not add up; invoices overpaid or paid while void), so the
--     Transactions and Invoices pages can show exactly those.
-- The plain-language messages are fixed templates in the app (src/utils/integrity-messages.ts). No AI.

DROP FUNCTION IF EXISTS public.integrity_checks(uuid, date, date);

-- One row per check for a period. Severity block must pass for a statement to be final; warning
-- is listed but does not block. passed is NULL when a check does not apply yet.
CREATE FUNCTION public.integrity_checks(p_org uuid, p_from date, p_to date)
RETURNS TABLE (code text, title text, severity text, passed boolean, detail text, affected integer, amount numeric)
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
  v_items integer;
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
  SELECT count(*) INTO v_items FROM public.uncategorised_items(p_org, p_from, p_to);
  affected := CASE WHEN n > 0 THEN v_items ELSE 0 END; amount := NULL;
  RETURN NEXT;

  -- 2. Every entry adds up and every line has a fund
  SELECT count(*) INTO n FROM public.transactions t
  WHERE t.organization_id = p_org AND t.tx_type IN ('money_in', 'money_out') AND t.tx_date BETWEEN p_from AND p_to
    AND (t.total <> COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l WHERE l.transaction_id = t.id), 0)
         OR EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = t.id AND l.fund_id IS NULL));
  code := 'lines_balanced'; title := 'Every entry adds up and has a fund'; severity := 'block';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' entry(ies) do not add up' END;
  affected := n; amount := NULL;
  RETURN NEXT;

  -- 3. Opening position complete
  code := 'opening_complete'; title := 'Opening position is complete'; severity := 'block';
  passed := v_complete; detail := CASE WHEN NOT v_complete THEN 'Complete it in Settings, Accounts & Transfers' END;
  affected := NULL; amount := NULL;
  RETURN NEXT;

  -- 4. Balance check at the period end (R5)
  code := 'balance_check'; title := 'Assets less liabilities equal the funds at the period end'; severity := 'block';
  IF v_complete AND p_to >= COALESCE(v_start - 1, '-infinity'::date) THEN
    SELECT b.difference INTO v_diff FROM public.balance_check(p_org, p_to) b;
    passed := v_diff = 0; detail := CASE WHEN v_diff <> 0 THEN 'Difference of ' || v_diff END;
    amount := v_diff;
  ELSE
    passed := NULL; detail := 'Needs the opening position'; amount := NULL;
  END IF;
  affected := NULL;
  RETURN NEXT;

  -- 5. Prior-year closing = opening of this year (R7)
  code := 'prior_year'; title := 'Closing of the last period equals opening of this one'; severity := 'block';
  IF v_complete AND p_from > COALESCE(v_start, '-infinity'::date) THEN
    SELECT (SELECT funds_total FROM public.balance_check(p_org, p_from - 1)) - COALESCE((SELECT sum(c.opening) FROM public.changes_in_funds(p_org, p_from, p_to) c), 0)
    INTO v_diff;
    passed := v_diff = 0; detail := CASE WHEN v_diff <> 0 THEN 'Difference of ' || v_diff END;
    amount := v_diff;
  ELSE
    passed := NULL; detail := CASE WHEN v_complete THEN 'The period starts at the opening position' ELSE 'Needs the opening position' END;
    amount := NULL;
  END IF;
  affected := NULL;
  RETURN NEXT;

  -- 6. No invoice overpaid, no payment on a void invoice
  SELECT count(*) INTO n FROM public.invoices i
  WHERE i.organization_id = p_org
    AND (COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l WHERE l.invoice_id = i.id), 0) > i.total
         OR (i.status = 'void' AND EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.invoice_id = i.id)));
  code := 'invoices'; title := 'No invoice is overpaid or paid while void'; severity := 'block';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' invoice(s) affected' END;
  affected := n; amount := NULL;
  RETURN NEXT;

  -- 7. Every account reconciled at the last month-end of the period, any difference explained
  v_me := (date_trunc('month', p_to + 1) - interval '1 day')::date;
  IF v_me > p_to THEN v_me := (date_trunc('month', p_to) - interval '1 day')::date; END IF;
  SELECT count(*) INTO n FROM public.reconciliation_status(p_org, v_me) s
  WHERE NOT s.archived AND (s.reconciliation_id IS NULL OR (s.difference <> 0 AND COALESCE(btrim(s.note), '') = ''));
  code := 'reconciled'; title := 'Every account is reconciled at ' || v_me; severity := 'warning';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' account(s) not reconciled, or a difference not explained' END;
  affected := n; amount := NULL;
  RETURN NEXT;

  -- 8. No restricted fund below zero at the period end
  IF v_complete THEN
    SELECT count(*) INTO n FROM public.changes_in_funds(p_org, GREATEST(p_from, COALESCE(v_start, p_from)), p_to) c
    WHERE c.fund_type = 'restricted' AND c.closing < 0;
    passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' restricted fund(s) below zero' END;
    affected := n;
  ELSE
    passed := NULL; detail := 'Needs the opening position'; affected := NULL;
  END IF;
  code := 'restricted_negative'; title := 'No restricted fund is below zero'; severity := 'warning'; amount := NULL;
  RETURN NEXT;

  -- 9. Every payment received for an invoice issued in the period has its receipt (invoices and AI
  --    plan, step 2): a warning, it does not block the statements
  SELECT count(*) INTO n FROM public.invoice_summary s
  WHERE s.organization_id = p_org AND s.direction = 'receivable' AND s.issue_date BETWEEN p_from AND p_to AND s.receipts_missing > 0;
  code := 'receipts_missing'; title := 'Every payment received for an invoice has its receipt'; severity := 'warning';
  passed := n = 0; detail := CASE WHEN n > 0 THEN n || ' invoice(s) with a payment missing its receipt' END;
  affected := n; amount := NULL;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.integrity_checks(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.integrity_check_records(p_org uuid, p_from date, p_to date, p_code text)
RETURNS TABLE (record_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.id FROM public.transactions t
  WHERE p_code = 'lines_balanced' AND t.organization_id = p_org AND t.tx_type IN ('money_in', 'money_out')
    AND (p_from IS NULL OR t.tx_date >= p_from) AND (p_to IS NULL OR t.tx_date <= p_to)
    AND (t.total <> COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l WHERE l.transaction_id = t.id), 0)
         OR EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = t.id AND l.fund_id IS NULL))
  UNION ALL
  SELECT i.id FROM public.invoices i
  WHERE p_code = 'invoices' AND i.organization_id = p_org
    AND (COALESCE((SELECT sum(l.amount) FROM public.transaction_lines l WHERE l.invoice_id = i.id), 0) > i.total
         OR (i.status = 'void' AND EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.invoice_id = i.id)))
  LIMIT 10000;
$$;
REVOKE ALL ON FUNCTION public.integrity_check_records(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integrity_check_records(uuid, date, date, text) TO authenticated, service_role;
