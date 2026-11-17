-- Multi-currency documents.
--
-- documents.amount (and subtotal, tax_amount, line_items, splits) are ALWAYS in the
-- organization's base currency, so every total, report and memo keeps working.
-- For a document printed in another currency, the original figures are kept here:
--   original_currency       ISO code printed on the document (NULL = same as base currency)
--   original_amount         the total as printed, in original_currency
--   exchange_rate           base-currency units per 1 unit of original_currency
--   exchange_rate_source    'ecb' (looked up for the document date) or 'manual' (typed in)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS original_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source text;

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_fx_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_fx_check CHECK (
    (original_currency IS NULL OR original_currency ~ '^[A-Z]{3}$')
    AND (exchange_rate IS NULL OR exchange_rate > 0)
    AND (exchange_rate_source IS NULL OR exchange_rate_source IN ('ecb', 'manual'))
  );
