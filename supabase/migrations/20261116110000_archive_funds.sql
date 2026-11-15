-- Funds are archived instead of deleted, so old documents never point at a missing fund.
ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
