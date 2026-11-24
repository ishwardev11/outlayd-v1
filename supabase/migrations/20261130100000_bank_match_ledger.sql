-- Simplification step 3: bank statement lines can be matched to the ledger, not only to documents.
--
-- 1. Each statement belongs to one account (Dev's decision): chosen on upload, defaulting to the main
--    account; statements imported before this migration are set to the main account.
-- 2. A statement line can be matched to a cash book entry (money in, money out, an account transfer)
--    as well as to an approved document. Money-in lines can be matched too.
--    Uploads can only be matched on a statement of the main account, because the mirror records every
--    paid upload in the main account.
-- 3. One entry is matched to at most one line, and an entry that came from an upload counts as that
--    upload: if the document is matched, its entry cannot be matched again, and the other way round.
-- 4. Deleting a matched entry puts its line back to "unmatched", as deleting a document already does.
-- 5. The statement list counts every line that still needs attention (money in now too).
-- 6. The month-end reconciliation suggests a statement balance when a statement of that account
--    covers the month-end, and says where it came from.
--
-- Nothing is dropped except bank_statement_stats and reconciliation_status, which are re-created at
-- once with an extra column (their return type changes, which CREATE OR REPLACE cannot do).

-- ---------------------------------------------------------------- 1. the statement's account
ALTER TABLE public.bank_statements ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id);

UPDATE public.bank_statements s
   SET account_id = a.id
  FROM public.accounts a
 WHERE a.organization_id = s.organization_id AND a.is_default AND s.account_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON public.bank_statements (account_id, period_end);

-- A new statement without an account gets the main account; an account must belong to the same organisation
CREATE OR REPLACE FUNCTION public.check_bank_statement_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    SELECT a.id INTO NEW.account_id FROM public.accounts a
     WHERE a.organization_id = NEW.organization_id AND a.is_default;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'That account was not found';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_bank_statement_account ON public.bank_statements;
CREATE TRIGGER trg_check_bank_statement_account
  BEFORE INSERT OR UPDATE OF account_id, organization_id ON public.bank_statements
  FOR EACH ROW EXECUTE FUNCTION public.check_bank_statement_account();

-- ---------------------------------------------------------------- 2. matching a line to an entry
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

-- A matched line points at exactly one thing: a document or an entry
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_match_consistent;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_match_consistent CHECK (
  match_status <> 'matched'
  OR (matched_document_id IS NOT NULL AND matched_transaction_id IS NULL)
  OR (matched_document_id IS NULL AND matched_transaction_id IS NOT NULL)
);

-- An entry can be matched to one line only (documents already have uq_bank_transactions_document)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_transaction
  ON public.bank_transactions (matched_transaction_id)
  WHERE matched_transaction_id IS NOT NULL AND match_status = 'matched';

-- What a match may point at. Runs as the caller, so row-level security keeps it inside the caller's
-- organisation; the update policy already requires Admin or Editor on a paid plan.
-- Nested IFs on purpose: PL/pgSQL does not short-circuit AND/OR.
CREATE OR REPLACE FUNCTION public.check_bank_match()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t public.transactions%ROWTYPE;
  v_account uuid;
BEGIN
  IF NEW.match_status <> 'matched' THEN
    RETURN NEW;
  END IF;
  SELECT s.account_id INTO v_account FROM public.bank_statements s WHERE s.id = NEW.statement_id;

  IF NEW.matched_transaction_id IS NOT NULL THEN
    SELECT * INTO t FROM public.transactions WHERE id = NEW.matched_transaction_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That entry was not found';
    END IF;
    IF t.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'That entry was not found';
    END IF;
    IF t.tx_type NOT IN ('money_in', 'money_out', 'account_transfer') THEN
      RAISE EXCEPTION 'Only money in, money out and transfers between accounts can be matched to a bank line';
    END IF;
    -- The direction must agree with the line, and the entry must move money in the statement's account
    IF NEW.amount < 0 THEN
      IF t.tx_type = 'money_in' THEN
        RAISE EXCEPTION 'Money leaving the bank can only be matched to money out or a transfer';
      END IF;
      IF v_account IS NOT NULL THEN
        IF t.account_id <> v_account THEN
          RAISE EXCEPTION 'That entry is in a different account from this statement';
        END IF;
      END IF;
    ELSE
      IF t.tx_type = 'money_out' THEN
        RAISE EXCEPTION 'Money coming into the bank can only be matched to money in or a transfer';
      END IF;
      IF v_account IS NOT NULL THEN
        IF t.tx_type = 'account_transfer' THEN
          IF t.to_account_id IS DISTINCT FROM v_account THEN
            RAISE EXCEPTION 'That transfer does not go into this statement''s account';
          END IF;
        ELSE
          IF t.account_id <> v_account THEN
            RAISE EXCEPTION 'That entry is in a different account from this statement';
          END IF;
        END IF;
      END IF;
    END IF;
    -- An entry from an upload is the same payment as the upload: never matched twice
    IF t.document_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.bank_transactions b
                 WHERE b.matched_document_id = t.document_id AND b.match_status = 'matched' AND b.id <> NEW.id) THEN
        RAISE EXCEPTION 'That entry''s document is already matched to another bank line';
      END IF;
    END IF;
  END IF;

  IF NEW.matched_document_id IS NOT NULL THEN
    IF NEW.amount >= 0 THEN
      RAISE EXCEPTION 'Only payments going out can be matched to an invoice or receipt';
    END IF;
    -- A paid upload is recorded in the main account (the mirror), so only a statement of that account
    -- can be matched to uploads
    IF v_account IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v_account AND a.is_default) THEN
        RAISE EXCEPTION 'Uploaded invoices and receipts are paid from your main account, so they can only be matched on a statement of that account';
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.bank_transactions b
               JOIN public.transactions x ON x.id = b.matched_transaction_id
               WHERE x.document_id = NEW.matched_document_id AND b.match_status = 'matched' AND b.id <> NEW.id) THEN
      RAISE EXCEPTION 'That document''s entry is already matched to another bank line';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_bank_match ON public.bank_transactions;
CREATE TRIGGER trg_check_bank_match
  BEFORE INSERT OR UPDATE OF match_status, matched_document_id, matched_transaction_id ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.check_bank_match();

-- ---------------------------------------------------------------- 4. deleting a matched entry
-- Its line goes back to "unmatched" (whoever deletes it, so security definer, like the document one)
CREATE OR REPLACE FUNCTION public.release_bank_transactions_of_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bank_transactions
     SET match_status = 'unmatched', matched_transaction_id = NULL, matched_by = NULL, matched_at = NULL
   WHERE matched_transaction_id = OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.release_bank_transactions_of_transaction() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_release_bank_transactions ON public.transactions;
CREATE TRIGGER trg_release_bank_transactions
  BEFORE DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.release_bank_transactions_of_transaction();

-- ---------------------------------------------------------------- 5. counts for the statements list
-- Re-created from 20261118120000_bank_statements.sql: every line now counts (money in can be matched),
-- and "needs attention" is any line neither matched nor ignored.
DROP FUNCTION IF EXISTS public.bank_statement_stats(uuid);
CREATE FUNCTION public.bank_statement_stats(p_org uuid)
RETURNS TABLE (statement_id uuid, line_count integer, matched integer, needs_attention integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.statement_id,
    count(*)::integer,
    (count(*) FILTER (WHERE t.match_status = 'matched'))::integer,
    (count(*) FILTER (WHERE t.match_status = 'unmatched'))::integer
  FROM public.bank_transactions t
  WHERE t.organization_id = p_org
  GROUP BY t.statement_id;
$$;
REVOKE ALL ON FUNCTION public.bank_statement_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_statement_stats(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- 6. month-end suggestion
-- Re-created from 20261127100000_assurance.sql. The suggested statement balance now comes only from a
-- statement of the same account that covers the month-end:
--   the statement ends that day                  -> its closing balance
--   it ends later, and no line was skipped as a  -> its opening balance plus the lines up to that day
--   duplicate of an earlier statement
-- suggested_source says which statement it came from. integrity_checks reads the other columns by name.
DROP FUNCTION IF EXISTS public.reconciliation_status(uuid, date);
CREATE FUNCTION public.reconciliation_status(p_org uuid, p_period_end date)
RETURNS TABLE (account_id uuid, account_name text, archived boolean, outlayd_balance numeric, reconciliation_id uuid,
               statement_balance numeric, difference numeric, note text, suggested_balance numeric, suggested_source text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT a.id, a.name, a.archived_at IS NOT NULL, b.balance, r.id, r.statement_balance,
         CASE WHEN r.id IS NOT NULL THEN r.statement_balance - b.balance END, r.note,
         sg.balance, sg.source
  FROM public.accounts a
  JOIN public.account_balances(p_org, p_period_end) b ON b.account_id = a.id
  LEFT JOIN public.reconciliations r ON r.account_id = a.id AND r.period_end = p_period_end
  LEFT JOIN LATERAL (
    SELECT x.balance,
           -- e.g. "Maybank •••• 4821 statement (1 May 2026 to 30 Jun 2026): closing balance"
           concat_ws(' ', NULLIF(btrim(COALESCE(x.bank_name, '')), ''), CASE WHEN x.account_last4 IS NOT NULL THEN '•••• ' || x.account_last4 END, 'statement')
             || ' (' || to_char(x.period_start, 'FMDD Mon YYYY') || ' to ' || to_char(x.period_end, 'FMDD Mon YYYY') || ')'
             || CASE WHEN x.period_end = p_period_end THEN ': closing balance' ELSE ': opening balance plus the lines up to this day' END AS source
    FROM (
      SELECT s.bank_name, s.account_last4, s.period_start, s.period_end, s.created_at,
             CASE
               WHEN s.period_end = p_period_end THEN s.closing_balance
               WHEN s.duplicate_count = 0 AND s.opening_balance IS NOT NULL THEN
                 s.opening_balance + COALESCE((SELECT sum(t.amount) FROM public.bank_transactions t
                                               WHERE t.statement_id = s.id AND t.txn_date <= p_period_end), 0)
             END AS balance
      FROM public.bank_statements s
      WHERE s.organization_id = p_org AND s.account_id = a.id AND s.status = 'ready'
        AND s.period_start <= p_period_end AND s.period_end >= p_period_end
    ) x
    WHERE x.balance IS NOT NULL
    ORDER BY (x.period_end = p_period_end) DESC, x.created_at DESC
    LIMIT 1
  ) sg ON true
  WHERE a.organization_id = p_org;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_status(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconciliation_status(uuid, date) TO authenticated, service_role;
