-- Grant / donor details used by the Donor & Audit Memo Generator.
-- All columns are optional so existing funds keep working unchanged.
ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS donor_name text,
  ADD COLUMN IF NOT EXISTS grant_reference text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS award_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;

ALTER TABLE public.funds
  DROP CONSTRAINT IF EXISTS funds_grant_period_check;
ALTER TABLE public.funds
  ADD CONSTRAINT funds_grant_period_check
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end);

ALTER TABLE public.funds
  DROP CONSTRAINT IF EXISTS funds_award_amount_check;
ALTER TABLE public.funds
  ADD CONSTRAINT funds_award_amount_check
  CHECK (award_amount IS NULL OR award_amount >= 0);
