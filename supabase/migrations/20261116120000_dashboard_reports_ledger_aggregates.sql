-- Server-side aggregation + pagination for the dashboard, reports and ledger, so the browser no
-- longer downloads every document just to add them up.
--
-- All functions are SECURITY INVOKER, so the existing row-level security on `documents`
-- (tenant isolation via get_user_org_id()) still applies. They also filter on p_org so the
-- planner can use the (organization_id, ...) indexes.

-- 1. Indexes for the new access paths ------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_org_status
  ON public.documents (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_org_created
  ON public.documents (organization_id, created_at DESC);

-- 2. Safe date parsing (document_date can hold odd text; never let one bad row break a report)
CREATE OR REPLACE FUNCTION public.safe_iso_date(p text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN NULL;
  END IF;
  RETURN left(p, 10)::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- 3. Dashboard KPIs + 14-day cash flow ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_summary(p_org uuid, p_today date, p_tz text DEFAULT 'UTC')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      d.status,
      COALESCE(d.amount, 0) AS amount,
      COALESCE(public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date) AS doc_day,
      COALESCE(d.paid_date, public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date) AS paid_day
    FROM public.documents d
    WHERE d.organization_id = p_org
      AND d.status IN ('awaiting_payment', 'needs_review', 'paid')
  ),
  days AS (
    SELECT (p_today - 13 + n)::date AS day FROM generate_series(0, 13) AS n
  )
  SELECT jsonb_build_object(
    'awaiting_total',
      COALESCE((SELECT sum(amount) FROM base WHERE status = 'awaiting_payment'), 0),
    'needs_review_count',
      (SELECT count(*) FROM base WHERE status = 'needs_review'),
    'needs_review_total',
      COALESCE((SELECT sum(amount) FROM base WHERE status = 'needs_review'), 0),
    'paid_this_month',
      COALESCE((
        SELECT sum(amount) FROM base
        WHERE status = 'paid'
          AND paid_day >= date_trunc('month', p_today)::date
          AND paid_day <  (date_trunc('month', p_today) + interval '1 month')::date
      ), 0),
    'cash_flow',
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'date', to_char(days.day, 'YYYY-MM-DD'),
                  'amount', COALESCE((
                    SELECT sum(b.amount) FROM base b
                    WHERE b.status IN ('paid', 'awaiting_payment') AND b.doc_day = days.day
                  ), 0)
                ) ORDER BY days.day)
       FROM days)
  );
$$;

-- 4. Reports --------------------------------------------------------------------------------
-- The rows a report covers. Needs-review and duplicate-warning rows are excluded because they
-- are not real spend yet (a duplicate copies the original's amount and would double count it).
CREATE OR REPLACE FUNCTION public.report_rows(
  p_org uuid,
  p_year int DEFAULT NULL,
  p_month int DEFAULT NULL,
  p_fund uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_tz text DEFAULT 'UTC'
)
RETURNS SETOF public.documents
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.documents d
  WHERE d.organization_id = p_org
    AND d.status NOT IN ('needs_review', 'DUPLICATE_WARNING')
    AND COALESCE(d.amount, 0) > 0
    AND (p_fund IS NULL OR d.fund_id = p_fund)
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_year IS NULL OR EXTRACT(year FROM COALESCE(
          public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date)) = p_year)
    AND (p_month IS NULL OR EXTRACT(month FROM COALESCE(
          public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date)) = p_month);
$$;

CREATE OR REPLACE FUNCTION public.report_summary(
  p_org uuid,
  p_year int DEFAULT NULL,
  p_month int DEFAULT NULL,
  p_fund uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_tz text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH r AS (
    SELECT * FROM public.report_rows(p_org, p_year, p_month, p_fund, p_status, p_tz)
  ),
  every_row AS (
    SELECT * FROM public.report_rows(p_org, NULL, NULL, NULL, NULL, p_tz)
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT sum(amount) FROM r), 0),
    'by_fund', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'total', t.total) ORDER BY t.total DESC)
      FROM (
        SELECT COALESCE(f.name, 'Unassigned') AS name, sum(r.amount) AS total
        FROM r LEFT JOIN public.funds f ON f.id = r.fund_id
        GROUP BY COALESCE(f.name, 'Unassigned')
      ) t
    ), '[]'::jsonb),
    'top_categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'total', t.total) ORDER BY t.total DESC)
      FROM (
        SELECT COALESCE(c.name, 'Uncategorized') AS name, sum(r.amount) AS total
        FROM r LEFT JOIN public.categories c ON c.id = r.category_id
        GROUP BY COALESCE(c.name, 'Uncategorized')
        ORDER BY sum(r.amount) DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'years', COALESCE((
      SELECT jsonb_agg(y ORDER BY y DESC)
      FROM (
        SELECT DISTINCT EXTRACT(year FROM COALESCE(
          public.safe_iso_date(e.document_date::text), (e.created_at AT TIME ZONE p_tz)::date))::int AS y
        FROM every_row e
      ) s
    ), '[]'::jsonb),
    'statuses', COALESCE((
      SELECT jsonb_agg(s ORDER BY s)
      FROM (SELECT DISTINCT e.status AS s FROM every_row e WHERE e.status IS NOT NULL) x
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.report_large_transactions(
  p_org uuid,
  p_year int DEFAULT NULL,
  p_month int DEFAULT NULL,
  p_fund uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_tz text DEFAULT 'UTC',
  p_min numeric DEFAULT 500,
  p_limit int DEFAULT 10,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH r AS (
    SELECT * FROM public.report_rows(p_org, p_year, p_month, p_fund, p_status, p_tz)
    WHERE amount >= p_min
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM r),
    'rows', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.created_at DESC)
      FROM (
        SELECT
          r.created_at,
          jsonb_build_object(
            'id', r.id,
            'vendor_name', r.vendor_name,
            'document_date', r.document_date,
            'amount', r.amount,
            'funds', CASE WHEN f.name IS NULL THEN NULL ELSE jsonb_build_object('name', f.name) END,
            'categories', CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('name', c.name) END
          ) AS obj
        FROM r
        LEFT JOIN public.funds f ON f.id = r.fund_id
        LEFT JOIN public.categories c ON c.id = r.category_id
        ORDER BY r.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) x
    ), '[]'::jsonb)
  );
$$;

-- 5. Ledger: filtered, searchable, paginated list -------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_page(
  p_org uuid,
  p_status text DEFAULT NULL,
  p_fund uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_q text DEFAULT NULL
)
RETURNS SETOF public.documents
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.documents d
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN p_q IS NULL OR btrim(p_q) = '' THEN NULL
      ELSE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    END AS pat
  ) q
  WHERE d.organization_id = p_org
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_fund IS NULL OR d.fund_id = p_fund)
    AND (
      (p_from IS NULL AND p_to IS NULL)
      OR public.safe_iso_date(d.document_date::text) IS NULL
      OR (public.safe_iso_date(d.document_date::text) >= COALESCE(p_from, '-infinity'::date)
          AND public.safe_iso_date(d.document_date::text) <= COALESCE(p_to, 'infinity'::date))
    )
    AND (
      q.pat IS NULL
      OR d.vendor_name::text ILIKE q.pat
      OR d.invoice_number::text ILIKE q.pat
      OR d.amount::text ILIKE q.pat
      OR d.line_items::text ILIKE q.pat
    )
  ORDER BY d.created_at DESC, d.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.ledger_status_counts(p_org uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'all', count(*),
    'needs_review', count(*) FILTER (WHERE status = 'needs_review'),
    'awaiting_payment', count(*) FILTER (WHERE status = 'awaiting_payment'),
    'paid', count(*) FILTER (WHERE status = 'paid')
  )
  FROM public.documents
  WHERE organization_id = p_org;
$$;

-- 6. Only signed-in users may call these (RLS still limits the rows they can see) ------------
REVOKE ALL ON FUNCTION public.safe_iso_date(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dashboard_summary(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_rows(uuid, int, int, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_summary(uuid, int, int, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_large_transactions(uuid, int, int, uuid, text, text, numeric, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ledger_page(uuid, text, uuid, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ledger_status_counts(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.safe_iso_date(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_rows(uuid, int, int, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_summary(uuid, int, int, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_large_transactions(uuid, int, int, uuid, text, text, numeric, int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ledger_page(uuid, text, uuid, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ledger_status_counts(uuid) TO authenticated, service_role;
