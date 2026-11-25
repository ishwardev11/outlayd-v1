-- Invoices and AI plan, step 5: AI usage, plan gating and monthly limits.
--   * ai_usage: one row per organisation, AI feature and day (in the organisation's own timezone) with how
--     many AI calls were made and how many succeeded. Never holds document contents.
--   * claim_ai_call(org, feature): the one gate before any AI call. For the AI assistants (reading invoices
--     you issued, payment slips, category suggestions) it checks the plan (paid only) and the monthly limit,
--     and counts the call, in one step so two requests at the same moment cannot pass the limit. Returns
--     'ok', 'plan' (not on this plan) or 'limit' (limit reached this month).
--     Receipt and bank statement reading keep their own existing rules (free plan: 5 uploads a month;
--     statements: paid plans) and are only counted here, never blocked.
--   * finish_ai_call(org, feature, success): records whether the call worked.
-- Both functions are for the server only (service role): people cannot change their own counts.
-- Reading: Admins and Editors of the organisation can see its usage.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature         text NOT NULL CHECK (feature IN ('receipt_extraction', 'bank_statement', 'issued_invoice', 'payment_slip', 'categorise')),
  usage_date      date NOT NULL,
  calls           integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  successes       integer NOT NULL DEFAULT 0 CHECK (successes >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, feature, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_date ON public.ai_usage (organization_id, usage_date);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rbac_ai_usage_select ON public.ai_usage;
CREATE POLICY rbac_ai_usage_select ON public.ai_usage FOR SELECT TO authenticated
  USING ((organization_id)::text = public.get_user_org_id() AND public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]));
REVOKE ALL ON public.ai_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_usage FROM authenticated;
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

-- AI assistant calls allowed per calendar month, all assistants together. Free plans have none.
CREATE OR REPLACE FUNCTION public.ai_monthly_limit(p_paid boolean)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_paid THEN 300 ELSE 0 END;
$$;

-- Today in the organisation's own timezone
CREATE OR REPLACE FUNCTION public.org_today(p_org uuid)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.organizations WHERE id = p_org), 'UTC'))::date;
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_call(p_org uuid, p_feature text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_used integer;
  v_paid boolean;
BEGIN
  IF p_feature NOT IN ('receipt_extraction', 'bank_statement', 'issued_invoice', 'payment_slip', 'categorise') THEN
    RAISE EXCEPTION 'Unknown AI feature: %', p_feature;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org) THEN
    RAISE EXCEPTION 'No such organisation';
  END IF;
  v_today := public.org_today(p_org);

  IF p_feature IN ('issued_invoice', 'payment_slip', 'categorise') THEN
    -- One claim at a time per organisation, so the count below cannot be passed by two at once
    PERFORM pg_advisory_xact_lock(hashtext('ai_usage:' || p_org::text));
    SELECT paid INTO v_paid FROM public.org_plan_state(p_org);
    IF NOT COALESCE(v_paid, false) THEN
      RETURN 'plan';
    END IF;
    SELECT COALESCE(sum(calls), 0) INTO v_used FROM public.ai_usage
    WHERE organization_id = p_org AND feature IN ('issued_invoice', 'payment_slip', 'categorise')
      AND usage_date >= date_trunc('month', v_today)::date;
    IF v_used >= public.ai_monthly_limit(true) THEN
      RETURN 'limit';
    END IF;
  END IF;

  INSERT INTO public.ai_usage (organization_id, feature, usage_date, calls)
  VALUES (p_org, p_feature, v_today, 1)
  ON CONFLICT (organization_id, feature, usage_date)
  DO UPDATE SET calls = public.ai_usage.calls + 1, updated_at = now();
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_ai_call(p_org uuid, p_feature text, p_success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.ai_usage SET successes = LEAST(successes + 1, calls), updated_at = now()
    WHERE organization_id = p_org AND feature = p_feature AND usage_date = public.org_today(p_org);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_call(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_ai_call(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_call(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ai_call(uuid, text, boolean) TO service_role;
