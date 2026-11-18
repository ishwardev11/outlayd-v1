-- Optional accounting code per category (the account code from the organisation's chart of accounts,
-- for example "6100"). The accounting export writes it into the AccountCode column so imports into
-- Xero and similar software post each expense to the right account. Leaving it empty is allowed.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS account_code text;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_account_code_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_account_code_check
  CHECK (account_code IS NULL OR char_length(account_code) BETWEEN 1 AND 30);
