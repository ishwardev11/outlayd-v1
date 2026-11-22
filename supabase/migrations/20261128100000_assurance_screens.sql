-- Assurance, stage 6b of Phase 5: small follow-ups for the screens.
--   * Lock messages show dates the way people write them (31 Jan 2026) and point to Settings, Year end.
--   * Adding or removing the attached file of a locked entry or invoice is allowed: it is evidence, not
--     a figure (the change is still recorded in the history).
--   * audit_changes: the history grouped into one row per change (an entry and its lines saved together),
--     with filters, for the Audit log page and the History panels of invoices and assets.

-- ================================================================ 1. Lock messages
CREATE OR REPLACE FUNCTION public.assert_not_locked(p_org uuid, p_date date, p_what text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock date;
BEGIN
  IF COALESCE(current_setting('app.bypass_lock', true), '') = 'on' OR p_date IS NULL THEN
    RETURN;
  END IF;
  SELECT lock_date INTO v_lock FROM public.organizations WHERE id = p_org;
  IF v_lock IS NOT NULL AND p_date <= v_lock THEN
    RAISE EXCEPTION 'This % is dated %, which is in a locked period (up to %). An Admin can unlock it in Settings, Year end.',
      p_what, to_char(p_date, 'FMDD Mon YYYY'), to_char(v_lock, 'FMDD Mon YYYY')
      USING ERRCODE = 'OL001';
  END IF;
END;
$$;

-- ================================================================ 2. The lock trigger
-- Re-created from its exact current text (20261127100000_assurance.sql); changes: the attached file is
-- left out of the comparison, and the messages point to Settings, Year end.
CREATE OR REPLACE FUNCTION public.enforce_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.row_changed(to_jsonb(OLD) - 'attachment_url', to_jsonb(NEW) - 'attachment_url') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'transactions' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM public.assert_not_locked(OLD.organization_id, OLD.tx_date, 'entry'); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public.assert_not_locked(NEW.organization_id, NEW.tx_date, 'entry'); END IF;

  ELSIF TG_TABLE_NAME = 'transaction_lines' THEN
    SELECT t.tx_date INTO v_date FROM public.transactions t WHERE t.id = COALESCE(NEW.transaction_id, OLD.transaction_id);
    PERFORM public.assert_not_locked(COALESCE(NEW.organization_id, OLD.organization_id), v_date, 'entry');

  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM public.assert_not_locked(OLD.organization_id, OLD.issue_date, 'invoice'); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public.assert_not_locked(NEW.organization_id, NEW.issue_date, 'invoice'); END IF;

  ELSIF TG_TABLE_NAME = 'invoice_lines' THEN
    SELECT i.issue_date INTO v_date FROM public.invoices i WHERE i.id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    PERFORM public.assert_not_locked(COALESCE(NEW.organization_id, OLD.organization_id), v_date, 'invoice');

  ELSIF TG_TABLE_NAME = 'items' THEN
    -- Its name, notes and archiving can always change; what it is worth cannot, in a locked period
    IF TG_OP = 'UPDATE' AND ROW(OLD.kind, OLD.classification, OLD.fund_id, OLD.opening_balance, OLD.acquired_date, OLD.opening_cost,
                                OLD.opening_accumulated_depreciation, OLD.residual_value, OLD.useful_life_months, OLD.disposed_date)
                         IS NOT DISTINCT FROM
                         ROW(NEW.kind, NEW.classification, NEW.fund_id, NEW.opening_balance, NEW.acquired_date, NEW.opening_cost,
                             NEW.opening_accumulated_depreciation, NEW.residual_value, NEW.useful_life_months, NEW.disposed_date) THEN
      RETURN NEW;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      PERFORM public.assert_not_locked(OLD.organization_id, OLD.acquired_date, 'asset');
      PERFORM public.assert_not_locked(OLD.organization_id, OLD.disposed_date, 'disposal');
      IF (OLD.opening_balance <> 0 OR OLD.opening_cost <> 0) AND public.opening_locked(OLD.organization_id) THEN
        RAISE EXCEPTION 'The opening position is in a locked period. An Admin can unlock it in Settings, Year end.' USING ERRCODE = 'OL001';
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM public.assert_not_locked(NEW.organization_id, NEW.acquired_date, 'asset');
      PERFORM public.assert_not_locked(NEW.organization_id, NEW.disposed_date, 'disposal');
      IF (NEW.opening_balance <> 0 OR NEW.opening_cost <> 0) AND public.opening_locked(NEW.organization_id) THEN
        RAISE EXCEPTION 'The opening position is in a locked period. An Admin can unlock it in Settings, Year end.' USING ERRCODE = 'OL001';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'reconciliations' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM public.assert_not_locked(OLD.organization_id, OLD.period_end, 'reconciliation'); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM public.assert_not_locked(NEW.organization_id, NEW.period_end, 'reconciliation'); END IF;

  ELSIF TG_TABLE_NAME IN ('accounts', 'funds') THEN
    -- Opening balances are part of the opening position
    IF (TG_OP = 'UPDATE' AND NEW.opening_balance IS DISTINCT FROM OLD.opening_balance)
       OR (TG_OP = 'INSERT' AND NEW.opening_balance <> 0)
       OR (TG_OP = 'DELETE' AND OLD.opening_balance <> 0) THEN
      IF public.opening_locked(COALESCE(NEW.organization_id, OLD.organization_id)) THEN
        RAISE EXCEPTION 'Opening balances are in a locked period. An Admin can unlock it in Settings, Year end.' USING ERRCODE = 'OL001';
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ================================================================ 3. The history, grouped
-- One row per change: the events of one record (an entry or invoice together with its lines) made by one
-- person in one save. kind is what the filter on the Audit log page uses: money, transfers, invoices,
-- assets, reconciliations or settings. snapshot is the record as it was after the change (or before it,
-- for a deletion, or as it is now, when only its lines changed). Dates p_from and p_to are days in the
-- time zone of the organisation. Row-level security on audit_events limits it to the own organisation.
CREATE OR REPLACE FUNCTION public.audit_changes(
  p_org uuid, p_kinds text[] DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_record uuid DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE (root_entity text, root_id uuid, kind text, changed_at timestamptz, actor_email text, action text, reason text,
               before jsonb, after jsonb, snapshot jsonb, lines_before jsonb, lines_after jsonb, total_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tz AS (SELECT COALESCE(o.timezone, 'UTC') AS z FROM public.organizations o WHERE o.id = p_org),
  e AS (
    SELECT a.*,
           CASE a.entity WHEN 'transaction_lines' THEN 'transactions' WHEN 'invoice_lines' THEN 'invoices' ELSE a.entity END AS r_entity,
           COALESCE(a.parent_id, a.entity_id) AS r_id
    FROM public.audit_events a, tz
    WHERE a.organization_id = p_org
      AND (p_record IS NULL OR a.entity_id = p_record OR a.parent_id = p_record)
      AND (p_from IS NULL OR a.created_at >= (p_from::timestamp AT TIME ZONE tz.z))
      AND (p_to IS NULL OR a.created_at < ((p_to + 1)::timestamp AT TIME ZONE tz.z))
  ),
  g AS (
    SELECT e.r_entity, e.r_id, e.created_at, e.actor_id,
           max(e.actor_email) AS actor_email,
           max(e.reason) AS reason,
           (array_agg(e.action) FILTER (WHERE e.entity = e.r_entity))[1] AS head_action,
           (array_agg(e.before) FILTER (WHERE e.entity = e.r_entity))[1] AS before,
           (array_agg(e.after) FILTER (WHERE e.entity = e.r_entity))[1] AS after,
           jsonb_agg(e.before ORDER BY (e.before ->> 'line_no')::integer) FILTER (WHERE e.entity <> e.r_entity AND e.before IS NOT NULL) AS lines_before,
           jsonb_agg(e.after ORDER BY (e.after ->> 'line_no')::integer) FILTER (WHERE e.entity <> e.r_entity AND e.after IS NOT NULL) AS lines_after
    FROM e
    GROUP BY e.r_entity, e.r_id, e.created_at, e.actor_id
  ),
  k AS (
    SELECT g.*,
           COALESCE(g.after, g.before,
                    (SELECT to_jsonb(t) FROM public.transactions t WHERE g.r_entity = 'transactions' AND t.id = g.r_id),
                    (SELECT to_jsonb(i) FROM public.invoices i WHERE g.r_entity = 'invoices' AND i.id = g.r_id)) AS snap
    FROM g
  ),
  c AS (
    SELECT k.*,
           CASE
             WHEN k.r_entity = 'transactions' AND k.snap ->> 'tx_type' IN ('fund_transfer', 'account_transfer') THEN 'transfers'
             WHEN k.r_entity = 'transactions' AND (
                    EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(k.lines_after, '[]') || COALESCE(k.lines_before, '[]')) x WHERE x ->> 'item_id' IS NOT NULL)
                    OR EXISTS (SELECT 1 FROM public.transaction_lines l WHERE l.transaction_id = k.r_id AND l.item_id IS NOT NULL)) THEN 'assets'
             WHEN k.r_entity = 'transactions' THEN 'money'
             WHEN k.r_entity = 'invoices' THEN 'invoices'
             WHEN k.r_entity = 'items' THEN 'assets'
             WHEN k.r_entity = 'reconciliations' THEN 'reconciliations'
             ELSE 'settings'
           END AS kind
    FROM k
  )
  SELECT c.r_entity, c.r_id, c.kind, c.created_at, c.actor_email, COALESCE(c.head_action, 'update'), c.reason,
         c.before, c.after, c.snap, c.lines_before, c.lines_after, count(*) OVER ()
  FROM c
  WHERE p_kinds IS NULL OR c.kind = ANY (p_kinds)
  ORDER BY c.created_at DESC, c.r_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION public.audit_changes(uuid, text[], date, date, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_changes(uuid, text[], date, date, uuid, integer, integer) TO authenticated, service_role;
