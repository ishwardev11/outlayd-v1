-- Invoices and AI plan, step 2: "Receipt missing".
-- invoice_summary is re-created from its exact text in 20261125100000_invoices.sql with one new column
-- at the end, receipts_missing: for an invoice you issued, how many of its payments have no receipt
-- attached (0 for bills). derived_status is unchanged, so everything that checks 'paid' keeps working;
-- the app shows a paid invoice with receipts_missing > 0 as "Paid · receipt missing". Payment status
-- stays derived, never stored.
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
  END AS ageing_bucket,
  r.receipts_missing
FROM public.invoices i
JOIN public.organizations o ON o.id = i.organization_id
CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'UTC'))::date AS today) d
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(l.amount), 0)::numeric(15,2) AS paid FROM public.transaction_lines l WHERE l.invoice_id = i.id
) p
CROSS JOIN LATERAL (
  SELECT CASE WHEN i.direction = 'receivable' THEN (
    SELECT count(DISTINCT t.id)::integer
    FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
    WHERE l.invoice_id = i.id AND t.attachment_url IS NULL
  ) ELSE 0 END AS receipts_missing
) r;

REVOKE ALL ON public.invoice_summary FROM anon;
GRANT SELECT ON public.invoice_summary TO authenticated, service_role;
