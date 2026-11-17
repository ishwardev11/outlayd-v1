-- Each organisation gets a timezone so "today", "this month" and the day a payment is recorded follow
-- the organisation's own calendar day instead of UTC (which is a day behind Malaysia from midnight
-- to 8am). Existing organisations default to Kuala Lumpur; it can be changed in Settings.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur';
