-- Dashboard redesign: one read-only function that adds up everything the new dashboard shows, so the
-- page makes a single round trip and never sums rows in the app.
--   * No tables or columns change. This only adds a function (and drops dashboard_summary, which fed the
--     old "14-Day Money Out" chart and is no longer called by anything).
--   * SECURITY INVOKER: row-level security still applies, so a user only ever sees their own
--     organisation's figures. Viewers can call it (it only reads).
--   * p_today is "today" in the organisation's timezone, worked out by the app (todayInTimezone), the
--     same way dashboard_cash_month is called. invoice_summary already uses the organisation's timezone.
--
-- What each part means (plain words):
--   cash          Cash in bank: every account's opening balance plus all money in, money out and
--                 transfers from the start date up to today (account_balances, the same figure as the
--                 balance sheet). Only filled once the opening position is complete; before that the
--                 balance would be wrong, so the app shows "Not set up" instead.
--   month         Money in and money out this month by payment date (same rule as dashboard_cash_month).
--   payable /     Open bills you owe and invoices you issued: what is still to pay or collect, after
--   receivable    deposits and part payments, and the overdue part. Same rows as Bills & Invoices.
--   inbox         Documents waiting for review (incl. possible duplicates), still being read, or whose
--                 reading failed. Failed ones are counted only under "failed", not under "to review".
--   unreconciled  Month-ends from the start date's month up to last month where at least one active
--                 account has no reconciliation saved.
--   cash_flow     Money in and money out per day for the last p_days days (today included).
--   recent        The latest money in and money out entries.
--   funds         Each active (not archived) fund: balance today (from changes_in_funds, only once the
--                 opening position is complete), budget and spent (fund_budget_summary, the same figure
--                 as Settings > Funds).

DROP FUNCTION IF EXISTS public.dashboard_summary(uuid, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_overview(p_org uuid, p_today date, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_start        date;
  v_complete     boolean;
  v_month_start  date := date_trunc('month', p_today)::date;
  v_days         integer := LEAST(GREATEST(COALESCE(p_days, 30), 7), 90);
  v_cash         jsonb;
  v_unrec        jsonb;
  v_funds        jsonb;
BEGIN
  SELECT o.tracking_start_date, o.opening_position_completed_at IS NOT NULL
    INTO v_start, v_complete
  FROM public.organizations o WHERE o.id = p_org;

  -- Nothing visible (wrong organisation, or no access): return empty figures, never another org's data
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- ---------------------------------------------------------------- cash in bank
  IF v_complete AND v_start IS NOT NULL THEN
    SELECT jsonb_build_object(
             'set_up', true,
             'balance', COALESCE((SELECT sum(b.balance) FROM public.account_balances(p_org, p_today) b), 0),
             -- Latest month-end where every active account is reconciled
             'last_reconciled', (
               SELECT max(r.period_end) FROM (
                 SELECT r.period_end
                 FROM public.reconciliations r
                 JOIN public.accounts a ON a.id = r.account_id AND a.archived_at IS NULL
                 WHERE r.organization_id = p_org
                 GROUP BY r.period_end
                 HAVING count(DISTINCT r.account_id) >= (
                   SELECT count(*) FROM public.accounts a2 WHERE a2.organization_id = p_org AND a2.archived_at IS NULL)
               ) r))
      INTO v_cash;

    -- Month-ends from the start month to the end of last month that are not fully reconciled
    WITH months AS (
      SELECT (gs + interval '1 month' - interval '1 day')::date AS period_end
      FROM generate_series(date_trunc('month', v_start), v_month_start - interval '1 month', interval '1 month') gs
    ),
    active AS (
      SELECT a.id FROM public.accounts a WHERE a.organization_id = p_org AND a.archived_at IS NULL
    ),
    missing AS (
      SELECT m.period_end
      FROM months m
      WHERE EXISTS (
        SELECT 1 FROM active a
        WHERE NOT EXISTS (SELECT 1 FROM public.reconciliations r WHERE r.account_id = a.id AND r.period_end = m.period_end))
    )
    SELECT jsonb_build_object('count', count(*), 'first', min(period_end)) INTO v_unrec FROM missing;
  ELSE
    v_cash  := jsonb_build_object('set_up', false, 'balance', 0, 'last_reconciled', NULL);
    v_unrec := jsonb_build_object('count', 0, 'first', NULL);
  END IF;

  -- ---------------------------------------------------------------- funds
  WITH active_funds AS (
    SELECT f.id, f.name, f.fund_type, f.is_default, f.budget
    FROM public.funds f
    WHERE f.organization_id = p_org AND f.archived_at IS NULL
  ),
  bal AS (
    SELECT c.fund_id, c.closing
    FROM public.changes_in_funds(p_org, v_start, p_today) c
    WHERE v_complete AND v_start IS NOT NULL
  ),
  spent AS (
    SELECT s.fund_id, s.spent FROM public.fund_budget_summary(p_org) s
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', af.id,
           'name', af.name,
           'restricted', af.fund_type = 'restricted',
           'is_default', af.is_default,
           'balance', b.closing,
           'budget', af.budget,
           'spent', COALESCE(s.spent, 0))
         ORDER BY af.is_default DESC, (af.fund_type = 'restricted') DESC, af.name), '[]'::jsonb)
    INTO v_funds
  FROM active_funds af
  LEFT JOIN bal b ON b.fund_id = af.id
  LEFT JOIN spent s ON s.fund_id = af.id;

  RETURN jsonb_build_object(
    'today', p_today,
    'opening_complete', COALESCE(v_complete, false),
    'start_date', v_start,
    'cash', v_cash,

    'month', (
      SELECT jsonb_build_object(
        'money_in',  COALESCE(sum(t.total) FILTER (WHERE t.tx_type = 'money_in'), 0),
        'money_out', COALESCE(sum(t.total) FILTER (WHERE t.tx_type = 'money_out'), 0),
        'from', v_month_start,
        'to', (v_month_start + interval '1 month' - interval '1 day')::date)
      FROM public.transactions t
      WHERE t.organization_id = p_org
        AND t.tx_date >= v_month_start
        AND t.tx_date <  (v_month_start + interval '1 month')::date),

    'payable', (
      SELECT jsonb_build_object(
        'count', count(*),
        'total', COALESCE(sum(i.balance), 0),
        'overdue_count', count(*) FILTER (WHERE i.ageing_bucket <> 'current'),
        'overdue_total', COALESCE(sum(i.balance) FILTER (WHERE i.ageing_bucket <> 'current'), 0))
      FROM public.invoice_summary i
      WHERE i.organization_id = p_org AND i.direction = 'payable' AND i.ageing_bucket IS NOT NULL),

    'receivable', (
      SELECT jsonb_build_object(
        'count', count(*),
        'total', COALESCE(sum(i.balance), 0),
        'overdue_count', count(*) FILTER (WHERE i.ageing_bucket <> 'current'),
        'overdue_total', COALESCE(sum(i.balance) FILTER (WHERE i.ageing_bucket <> 'current'), 0),
        -- Invoices you issued with a payment that has no receipt yet (paid ones included)
        'receipts_missing', (SELECT count(*) FROM public.invoice_summary m
                             WHERE m.organization_id = p_org AND m.direction = 'receivable' AND m.receipts_missing > 0))
      FROM public.invoice_summary i
      WHERE i.organization_id = p_org AND i.direction = 'receivable' AND i.ageing_bucket IS NOT NULL),

    'inbox', (
      SELECT jsonb_build_object(
        'to_review',  count(*) FILTER (WHERE d.status IN ('needs_review', 'verified', 'PENDING', 'DUPLICATE_WARNING') AND NOT x.failed),
        'extracting', count(*) FILTER (WHERE d.status = 'extracting'),
        'failed',     count(*) FILTER (WHERE d.status IN ('needs_review', 'verified', 'PENDING') AND x.failed))
      FROM public.documents d
      CROSS JOIN LATERAL (SELECT (
        jsonb_typeof(d.extraction_flags) = 'array'
        AND (d.extraction_flags @> '[{"code":"EXTRACTION_FAILED"}]' OR d.extraction_flags @> '[{"code":"EXTRACTION_TIMED_OUT"}]')
      ) AS failed) x
      WHERE d.organization_id = p_org
        AND d.status IN ('needs_review', 'verified', 'PENDING', 'DUPLICATE_WARNING', 'extracting')),

    'unreconciled', v_unrec,

    'cash_flow', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d.day, 'money_in', d.money_in, 'money_out', d.money_out) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT gs::date AS day,
               COALESCE(sum(t.total) FILTER (WHERE t.tx_type = 'money_in'), 0)  AS money_in,
               COALESCE(sum(t.total) FILTER (WHERE t.tx_type = 'money_out'), 0) AS money_out
        FROM generate_series(p_today - (v_days - 1), p_today, interval '1 day') gs
        LEFT JOIN public.transactions t
          ON t.organization_id = p_org AND t.tx_date = gs::date AND t.tx_type IN ('money_in', 'money_out')
        GROUP BY gs
      ) d),

    'recent', (
      SELECT COALESCE(jsonb_agg(r.obj ORDER BY r.tx_date DESC, r.created_at DESC, r.id DESC), '[]'::jsonb)
      FROM (
        SELECT t.id, t.tx_date, t.created_at,
               jsonb_build_object(
                 'id', t.id,
                 'date', t.tx_date,
                 'type', t.tx_type,
                 'total', t.total,
                 'payee', t.payee_name,
                 'lines', l.n,
                 'fund', l.fund,
                 'category', l.category) AS obj
        FROM public.transactions t
        CROSS JOIN LATERAL (
          SELECT count(*) AS n, min(f.name) AS fund, min(c.name) AS category,
                 count(DISTINCT tl.fund_id) AS funds, count(DISTINCT tl.category_id) AS cats
          FROM public.transaction_lines tl
          LEFT JOIN public.funds f ON f.id = tl.fund_id
          LEFT JOIN public.categories c ON c.id = tl.category_id
          WHERE tl.transaction_id = t.id
        ) l0
        CROSS JOIN LATERAL (
          SELECT l0.n,
                 CASE WHEN l0.funds > 1 THEN NULL ELSE l0.fund END AS fund,
                 CASE WHEN l0.cats > 1 THEN NULL ELSE l0.category END AS category
        ) l
        WHERE t.organization_id = p_org AND t.tx_type IN ('money_in', 'money_out')
        ORDER BY t.tx_date DESC, t.created_at DESC, t.id DESC
        LIMIT 8
      ) r),

    'funds', v_funds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_overview(uuid, date, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.dashboard_overview(uuid, date, integer) TO authenticated, service_role;
