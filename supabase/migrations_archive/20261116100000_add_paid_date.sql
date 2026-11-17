-- Real payment date, so "Paid this month" reflects when money was paid, not the invoice date.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS paid_date date;

-- Existing paid documents keep counting in the month of their document date
UPDATE public.documents
SET paid_date = CASE
    WHEN document_date::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(document_date::text, 10)::date
    ELSE created_at::date
  END
WHERE status = 'paid' AND paid_date IS NULL;
