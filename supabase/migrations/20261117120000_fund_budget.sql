-- Optional internal budget per fund, plus a function that adds up what has been spent against
-- each fund from the document splits.
--
-- Budget is separate from award_amount: award_amount is what the donor granted (used by the Donor
-- & Audit Memo), budget is the organisation's own spending limit for the fund. Both are optional.

ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS budget numeric(15,2);

ALTER TABLE public.funds
  DROP CONSTRAINT IF EXISTS funds_budget_check;
ALTER TABLE public.funds
  ADD CONSTRAINT funds_budget_check
  CHECK (budget IS NULL OR budget >= 0);

-- Spent / committed per fund, using the same rules as the Donor & Audit Memo:
--   * "paid" documents count as spent, "awaiting_payment" documents count as committed.
--   * A document with splits is allocated by its splits; one without splits goes to its fund_id.
--   * needs_review, duplicate warnings, rejected and error documents are not counted.
-- SECURITY INVOKER, so row-level security on documents and funds still applies.
CREATE OR REPLACE FUNCTION public.fund_budget_summary(p_org uuid)
RETURNS TABLE (fund_id uuid, spent numeric, committed numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH lines AS (
    -- Documents that have splits: one line per split
    SELECT
      d.status,
      s.elem ->> 'fund_id' AS fund_text,
      CASE WHEN (s.elem ->> 'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (s.elem ->> 'amount')::numeric ELSE 0 END AS amount
    FROM public.documents d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.splits) = 'array' THEN d.splits ELSE '[]'::jsonb END
    ) AS s(elem)
    WHERE d.organization_id = p_org
      AND d.status IN ('paid', 'awaiting_payment')

    UNION ALL

    -- Documents without splits: the whole amount goes to the main fund
    SELECT
      d.status,
      d.fund_id::text AS fund_text,
      COALESCE(d.amount, 0) AS amount
    FROM public.documents d
    WHERE d.organization_id = p_org
      AND d.status IN ('paid', 'awaiting_payment')
      AND d.fund_id IS NOT NULL
      AND (
        jsonb_typeof(d.splits) IS DISTINCT FROM 'array'
        OR jsonb_array_length(d.splits) = 0
      )
  )
  SELECT
    f.id AS fund_id,
    COALESCE(sum(l.amount) FILTER (WHERE l.status = 'paid'), 0) AS spent,
    COALESCE(sum(l.amount) FILTER (WHERE l.status = 'awaiting_payment'), 0) AS committed
  FROM public.funds f
  JOIN lines l ON l.fund_text = f.id::text
  WHERE f.organization_id = p_org
  GROUP BY f.id;
$$;

GRANT EXECUTE ON FUNCTION public.fund_budget_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fund_budget_summary(uuid) TO service_role;
