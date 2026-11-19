-- Bank statement import (PDF): the uploaded statement, the transactions read from it, and which
-- approved document each payment was matched to.
--
-- Only the last four digits of the account number are kept. Reading, matching and the paid/unpaid
-- changes all go through the signed-in user's session, so row-level security applies throughout.

CREATE TABLE IF NOT EXISTS public.bank_statements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_url               text NOT NULL,                 -- storage path: <organization id>/statements/<file>
  file_name              text,
  file_hash              varchar(64) NOT NULL,
  status                 text NOT NULL DEFAULT 'extracting'
                           CHECK (status IN ('extracting', 'ready', 'failed')),
  error_message          text,
  warning                text,                          -- e.g. the rows do not add up to the closing balance
  bank_name              text,
  account_last4          text CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9A-Za-z]{1,4}$'),
  currency               text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  period_start           date,
  period_end             date,
  opening_balance        numeric(15,2),
  closing_balance        numeric(15,2),
  transaction_count      integer NOT NULL DEFAULT 0,
  duplicate_count        integer NOT NULL DEFAULT 0,    -- rows skipped because an earlier statement already had them
  extraction_started_at  timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid
);

-- The same file cannot be imported twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statements_file_hash
  ON public.bank_statements (organization_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_bank_statements_org_created
  ON public.bank_statements (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  statement_id         uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  txn_date             date NOT NULL,
  description          text NOT NULL DEFAULT '',
  amount               numeric(15,2) NOT NULL,          -- negative = money out, positive = money in
  balance              numeric(15,2),
  -- Identifies a row across overlapping statements, so importing March and then "January to April"
  -- does not count March twice.
  fingerprint          text NOT NULL,
  match_status         text NOT NULL DEFAULT 'unmatched'
                         CHECK (match_status IN ('unmatched', 'matched', 'ignored')),
  matched_document_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  matched_by           uuid,
  matched_at           timestamptz,
  ignore_reason        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- A matched payment always points at a document
  CONSTRAINT bank_transactions_match_consistent CHECK (
    match_status <> 'matched' OR matched_document_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_fingerprint
  ON public.bank_transactions (organization_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement
  ON public.bank_transactions (statement_id, txn_date, id);
-- A document can be matched to one payment only
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_document
  ON public.bank_transactions (matched_document_id)
  WHERE matched_document_id IS NOT NULL AND match_status = 'matched';

-- When a matched document is deleted, its payment goes back to "unmatched"
CREATE OR REPLACE FUNCTION public.release_bank_transactions_of_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bank_transactions
     SET match_status = 'unmatched', matched_by = NULL, matched_at = NULL
   WHERE matched_document_id = OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.release_bank_transactions_of_document() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_release_bank_transactions ON public.documents;
CREATE TRIGGER trg_release_bank_transactions
  BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.release_bank_transactions_of_document();

-- ---------------------------------------------------------------- row-level security
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbac_bank_statements_select ON public.bank_statements;
CREATE POLICY rbac_bank_statements_select ON public.bank_statements
  FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());

DROP POLICY IF EXISTS rbac_bank_statements_insert ON public.bank_statements;
CREATE POLICY rbac_bank_statements_insert ON public.bank_statements
  FOR INSERT TO authenticated
  WITH CHECK (organization_id::text = public.get_user_org_id()
              AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']));

DROP POLICY IF EXISTS rbac_bank_statements_update ON public.bank_statements;
CREATE POLICY rbac_bank_statements_update ON public.bank_statements
  FOR UPDATE TO authenticated
  USING (organization_id::text = public.get_user_org_id()
         AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']))
  WITH CHECK (organization_id::text = public.get_user_org_id()
              AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']));

DROP POLICY IF EXISTS rbac_bank_statements_delete ON public.bank_statements;
CREATE POLICY rbac_bank_statements_delete ON public.bank_statements
  FOR DELETE TO authenticated
  USING (organization_id::text = public.get_user_org_id()
         AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']));

DROP POLICY IF EXISTS rbac_bank_transactions_select ON public.bank_transactions;
CREATE POLICY rbac_bank_transactions_select ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());

DROP POLICY IF EXISTS rbac_bank_transactions_insert ON public.bank_transactions;
CREATE POLICY rbac_bank_transactions_insert ON public.bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id::text = public.get_user_org_id()
              AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']));

DROP POLICY IF EXISTS rbac_bank_transactions_update ON public.bank_transactions;
CREATE POLICY rbac_bank_transactions_update ON public.bank_transactions
  FOR UPDATE TO authenticated
  USING (organization_id::text = public.get_user_org_id()
         AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']))
  WITH CHECK (organization_id::text = public.get_user_org_id()
              AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']));

DROP POLICY IF EXISTS rbac_bank_transactions_delete ON public.bank_transactions;
CREATE POLICY rbac_bank_transactions_delete ON public.bank_transactions
  FOR DELETE TO authenticated
  USING (organization_id::text = public.get_user_org_id()
         AND public.get_user_role() = ANY (ARRAY['Admin', 'Editor']));

REVOKE ALL ON public.bank_statements, public.bank_transactions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements, public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_statements, public.bank_transactions TO service_role;

-- Counts per statement for the statements list: payments out, how many are matched, and how many
-- still need attention (money out that is neither matched nor ignored). Done in SQL because the
-- API returns at most 1,000 rows per request, which a long statement can exceed.
CREATE OR REPLACE FUNCTION public.bank_statement_stats(p_org uuid)
RETURNS TABLE (statement_id uuid, money_out integer, matched integer, needs_attention integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.statement_id,
    (count(*) FILTER (WHERE t.amount < 0))::integer,
    (count(*) FILTER (WHERE t.match_status = 'matched'))::integer,
    (count(*) FILTER (WHERE t.amount < 0 AND t.match_status = 'unmatched'))::integer
  FROM public.bank_transactions t
  WHERE t.organization_id = p_org
  GROUP BY t.statement_id;
$$;

GRANT EXECUTE ON FUNCTION public.bank_statement_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bank_statement_stats(uuid) TO service_role;
