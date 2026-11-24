-- Simplification step 1: the Donor & Audit Memo reads the ledger, not documents.
--
-- fund_memo_lines returns, for one fund and period, every row behind that fund's column of the
-- Income & Expenditure statement, one row per line, with the details a memo prints (payee, reference,
-- remarks, attachment). Its WHERE clauses are copied from income_expenditure (latest definition in
-- 20261126100000_balance_sheet.sql), so for any fund and period:
--   sum(amount) of rows with kind = 'income'  = that fund's income  in income_expenditure
--   sum(amount) of rows with kind = 'expense' = that fund's expense in income_expenditure
-- (tested in supabase/tests/fund_memo.test.sql). Rule R1: bills and invoices count on their issue date
-- and their payments are not counted again; R3: opening-balance invoices are left out; R6: asset and
-- loan cash is left out, except that fixed-asset purchases are also returned as row_kind
-- 'asset_purchase' with kind NULL, for the memo's "Assets bought from this fund" list (not in totals).
--
-- row_kind:  'transaction'    a money in or money out line with a category (not an invoice payment)
--            'invoice'        a line of an open bill or invoice, not an opening balance
--            'depreciation'   one month's depreciation of a fixed asset charged to the fund
--            'disposal'       gain or loss when a fixed asset was disposed of
--            'asset_purchase' money out to a fixed asset from the fund (kind NULL, not in totals)
-- amount: signed as in income_expenditure, so a supplier refund is a negative expense.
-- invoice_paid: payments of the whole invoice dated on or before p_to (invoice rows only).
--
-- SECURITY INVOKER: it reads with the caller's own rights, so row-level security limits it to the
-- caller's organisation. The plan rule (donor_memo, read: paid plans and organisations that have been
-- on one) is checked here as well as by the server action: an organisation without it gets no rows.
-- Never returns documents.notes (AI extraction errors); remarks come from transactions and invoices.

CREATE OR REPLACE FUNCTION public.fund_memo_lines(p_org uuid, p_fund uuid, p_from date, p_to date)
RETURNS TABLE (row_kind text, row_id uuid, line_no integer, row_date date, kind text,
               category_id uuid, category_name text, description text, amount numeric,
               payee text, reference text, remarks text, tx_type text, is_refund boolean,
               document_id uuid, attachment_url text, document_file text,
               invoice_total numeric, invoice_paid numeric, item_id uuid, item_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.* FROM (
  -- (a) money in and money out lines with a category, dated by transaction date
  SELECT 'transaction'::text, t.id, l.line_no, t.tx_date, c.kind, c.id, c.name, NULL::text,
         CASE
           WHEN c.kind = 'income'  AND t.tx_type = 'money_in'  THEN l.amount
           WHEN c.kind = 'income'  AND t.tx_type = 'money_out' THEN -l.amount
           WHEN c.kind = 'expense' AND t.tx_type = 'money_out' THEN l.amount
           ELSE -l.amount
         END,
         t.payee_name, t.reference, t.remarks, t.tx_type, t.is_refund,
         t.document_id, t.attachment_url, d.image_url,
         NULL::numeric, NULL::numeric, NULL::uuid, NULL::text
  FROM public.transactions t
  JOIN public.transaction_lines l ON l.transaction_id = t.id
  JOIN public.categories c ON c.id = l.category_id
  JOIN public.funds f ON f.id = l.fund_id
  LEFT JOIN public.documents d ON d.id = t.document_id
  WHERE t.organization_id = p_org
    AND t.tx_type IN ('money_in', 'money_out')
    AND l.invoice_id IS NULL
    AND t.tx_date BETWEEN p_from AND p_to
    AND l.fund_id = p_fund
  UNION ALL
  -- (b) lines of open bills and invoices, dated by issue date (their payments are not counted again)
  SELECT 'invoice'::text, i.id, il.line_no, i.issue_date, c.kind, c.id, c.name, il.description,
         il.amount,
         i.payee_name, COALESCE(NULLIF(btrim(i.invoice_no), ''), i.reference), i.remarks,
         CASE WHEN i.direction = 'payable' THEN 'money_out' ELSE 'money_in' END, false,
         i.document_id, i.attachment_url, d.image_url,
         i.total,
         COALESCE((SELECT sum(pl.amount)
                   FROM public.transaction_lines pl
                   JOIN public.transactions pt ON pt.id = pl.transaction_id
                   WHERE pl.invoice_id = i.id AND pt.tx_date <= p_to), 0),
         NULL::uuid, NULL::text
  FROM public.invoices i
  JOIN public.invoice_lines il ON il.invoice_id = i.id
  JOIN public.categories c ON c.id = il.category_id
  JOIN public.funds f ON f.id = il.fund_id
  LEFT JOIN public.documents d ON d.id = i.document_id
  WHERE i.organization_id = p_org
    AND i.status = 'open'
    AND NOT i.is_opening_balance
    AND i.issue_date BETWEEN p_from AND p_to
    AND il.fund_id = p_fund
  UNION ALL
  -- (c) depreciation, charged to the asset's fund on the 1st of each month
  SELECT 'depreciation'::text, x.item_id, NULL::integer, x.month, c.kind, c.id, c.name, NULL::text,
         x.amount,
         NULL::text, NULL::text, NULL::text, NULL::text, false,
         NULL::uuid, NULL::text, NULL::text,
         NULL::numeric, NULL::numeric, x.item_id, it.name
  FROM public.fixed_asset_charges(p_org) x
  JOIN public.categories c ON c.organization_id = p_org AND c.is_system AND c.name = 'Depreciation'
  JOIN public.funds f ON f.id = x.fund_id
  JOIN public.items it ON it.id = x.item_id
  WHERE x.month BETWEEN p_from AND p_to
    AND x.fund_id = p_fund
  UNION ALL
  -- (d) gain or loss on disposal, on the disposal date
  SELECT 'disposal'::text, r.item_id, NULL::integer, r.disposed_date, c.kind, c.id, c.name, NULL::text,
         r.loss,
         NULL::text, NULL::text, NULL::text, NULL::text, false,
         NULL::uuid, NULL::text, NULL::text,
         NULL::numeric, NULL::numeric, r.item_id, it.name
  FROM public.disposal_results(p_org) r
  JOIN public.categories c ON c.organization_id = p_org AND c.is_system AND c.name = 'Gain/loss on disposal'
  JOIN public.funds f ON f.id = r.fund_id
  JOIN public.items it ON it.id = r.item_id
  WHERE r.disposed_date BETWEEN p_from AND p_to AND r.loss <> 0
    AND r.fund_id = p_fund
  UNION ALL
  -- (e) fixed assets bought from the fund: listed on the memo, never in its totals (R6)
  SELECT 'asset_purchase'::text, t.id, l.line_no, t.tx_date, NULL::text, NULL::uuid, NULL::text, NULL::text,
         l.amount,
         t.payee_name, t.reference, t.remarks, t.tx_type, false,
         t.document_id, t.attachment_url, d.image_url,
         NULL::numeric, NULL::numeric, it.id, it.name
  FROM public.transactions t
  JOIN public.transaction_lines l ON l.transaction_id = t.id
  JOIN public.items it ON it.id = l.item_id AND it.kind = 'fixed_asset'
  LEFT JOIN public.documents d ON d.id = t.document_id
  WHERE t.organization_id = p_org
    AND t.tx_type = 'money_out'
    AND t.tx_date BETWEEN p_from AND p_to
    AND l.fund_id = p_fund
  ) m
  -- The plan rule in the database too: paid plans, and organisations that have been on one
  WHERE public.org_feature_allowed(p_org, 'donor_memo', 'read');
$$;

REVOKE ALL ON FUNCTION public.fund_memo_lines(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fund_memo_lines(uuid, uuid, date, date) TO authenticated, service_role;
