-- Money in and cash book, stage 3b of Phase 2 (spec sections 3.7 and 5.2).
--   * an optional attachment (a scan of a cheque, a bank slip) on a manual money-in entry
--   * the running balance of one account, for the cash book when it is filtered to that account

-- Storage path of the attachment: "<organization id>/transactions/<file>" in the private bucket
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS attachment_url text;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_attachment_url_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_attachment_url_check
  CHECK (attachment_url IS NULL OR (char_length(attachment_url) <= 500 AND attachment_url NOT LIKE '%..%'));

-- Running balance of one account after each of the given transactions: the account's opening
-- balance plus money in, minus money out, plus or minus transfers, in date order (ties broken by
-- when the entry was created). Every transaction on the account counts, whatever the cash book's
-- other filters are, so the balance is always the real one. SECURITY INVOKER: row-level security
-- limits it to the caller's own organisation.
CREATE OR REPLACE FUNCTION public.account_running_balance(p_account uuid, p_ids uuid[])
RETURNS TABLE (transaction_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH moves AS (
    SELECT t.id, t.tx_date, t.created_at,
           CASE
             WHEN t.tx_type = 'money_in'  AND t.account_id = p_account THEN t.total
             WHEN t.tx_type = 'money_out' AND t.account_id = p_account THEN -t.total
             WHEN t.tx_type = 'account_transfer' AND t.account_id = p_account THEN -t.total
             WHEN t.tx_type = 'account_transfer' AND t.to_account_id = p_account THEN t.total
             ELSE 0
           END AS signed
    FROM public.transactions t
    WHERE t.account_id = p_account OR t.to_account_id = p_account
  ),
  running AS (
    SELECT m.id,
           COALESCE((SELECT a.opening_balance FROM public.accounts a WHERE a.id = p_account), 0)
             + sum(m.signed) OVER (ORDER BY m.tx_date, m.created_at, m.id) AS bal
    FROM moves m
  )
  SELECT r.id, r.bal FROM running r WHERE r.id = ANY (p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.account_running_balance(uuid, uuid[]) TO authenticated, service_role;
