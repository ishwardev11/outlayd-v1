-- Plan flags, step 5 of Phase 1 (spec section 9).
--
-- One database answer to "may this organisation use feature X?", used by row-level security on the
-- tables each paid feature owns, and by the app (through the same function) for everything else.
--
-- Plans as stored today (set only by the server, see stripe-sync.ts):
--   * paid       subscription_status = 'pro', or tier 'growth' / 'nonprofit'. A failed card payment
--                (Stripe past_due) is still stored as 'pro', so it keeps paid access.
--   * free       anything else. The webhook switches to free only when no live subscription is left,
--                which in practice means the subscription was cancelled.
--   * has_been_paid (new) is set the first time an organisation is on a paid plan and never cleared.
--
-- What each plan may do (decided with the owner on 2026-11-20):
--   use  = create or change            read = view existing data, or export it
--   feature              use    read
--   funds                paid   everyone   (free orgs still allocate expenses to existing funds)
--   accounts             paid   everyone
--   bank_statements      paid   everyone   (a downgraded org keeps read-only access to its statements)
--   procurement          paid   everyone   (likewise for projects and quotes)
--   accounting_export    paid   paid, or has been paid
--   donor_memo           paid   paid, or has been paid
--   audit_log            everyone          (the document audit log stays free)
--   income, invoices, assets, period_lock, reconciliation   paid / everyone   (later phases)
--   financial_statements paid   paid, or has been paid                        (later phase)
-- Nothing is ever deleted on downgrade.

-- ---------------------------------------------------------------- has_been_paid
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS has_been_paid boolean NOT NULL DEFAULT false;

-- Backfill: paid now, or evidence of an earlier paid plan (a Stripe customer is only saved when a
-- checkout completes; bank statements and procurement projects can only be created on a paid plan).
UPDATE public.organizations o
SET has_been_paid = true
WHERE NOT o.has_been_paid
  AND (o.subscription_status = 'pro'
       OR o.subscription_tier IN ('growth', 'nonprofit')
       OR o.stripe_customer_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.bank_statements b WHERE b.organization_id = o.id)
       OR EXISTS (SELECT 1 FROM public.procurement_projects p WHERE p.organization_id = o.id));

-- Kept up to date by the database: set when the organisation is on a paid plan, never cleared.
-- A signed-in user cannot set it; the server (service role) may set it by hand but never clear it.
CREATE OR REPLACE FUNCTION public.track_has_been_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  jwt_role text;
  paid_now boolean;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  paid_now := COALESCE(NEW.subscription_status = 'pro', false)
              OR COALESCE(NEW.subscription_tier IN ('growth', 'nonprofit'), false);

  IF TG_OP = 'INSERT' THEN
    IF jwt_role IN ('anon', 'authenticated') THEN
      NEW.has_been_paid := paid_now;
    ELSE
      NEW.has_been_paid := COALESCE(NEW.has_been_paid, false) OR paid_now;
    END IF;
  ELSE
    IF jwt_role IN ('anon', 'authenticated') THEN
      NEW.has_been_paid := OLD.has_been_paid OR paid_now;
    ELSE
      NEW.has_been_paid := COALESCE(NEW.has_been_paid, false) OR OLD.has_been_paid OR paid_now;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_has_been_paid ON public.organizations;
CREATE TRIGGER track_has_been_paid
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.track_has_been_paid();

-- ---------------------------------------------------------------- the plan answer
-- Plan state of one organisation. A signed-in user only gets an answer for their own active
-- organisation (anything else returns "free"), so it cannot be used to look up other customers.
CREATE OR REPLACE FUNCTION public.org_plan_state(p_org uuid)
RETURNS TABLE (paid boolean, has_been_paid boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IN ('anon', 'authenticated') AND p_org::text IS DISTINCT FROM public.get_user_org_id() THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT COALESCE(o.subscription_status = 'pro', false) OR COALESCE(o.subscription_tier IN ('growth', 'nonprofit'), false),
         o.has_been_paid
  FROM public.organizations o
  WHERE o.id = p_org;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false;
  END IF;
END;
$$;

-- May this organisation use (create or change) or read (view or export existing data) a feature?
-- An unknown feature or access level is an error, so a typo can never silently open a gate.
CREATE OR REPLACE FUNCTION public.org_feature_allowed(p_org uuid, p_feature text, p_access text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  IF p_access NOT IN ('use', 'read') THEN
    RAISE EXCEPTION 'Unknown plan access level: %', p_access;
  END IF;

  SELECT * INTO s FROM public.org_plan_state(p_org);

  CASE p_feature
    WHEN 'audit_log' THEN
      RETURN true;
    WHEN 'funds', 'accounts', 'bank_statements', 'procurement', 'income', 'invoices', 'assets',
         'period_lock', 'reconciliation' THEN
      RETURN CASE WHEN p_access = 'use' THEN s.paid ELSE true END;
    WHEN 'accounting_export', 'donor_memo', 'financial_statements' THEN
      RETURN CASE WHEN p_access = 'use' THEN s.paid ELSE (s.paid OR s.has_been_paid) END;
    ELSE
      RAISE EXCEPTION 'Unknown plan feature: %', p_feature;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.org_plan_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_feature_allowed(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_plan_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_feature_allowed(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------- row-level security
-- Reads are unchanged (an organisation always sees its own data). Every create, change and delete
-- on a paid feature's tables now also needs the plan. Each policy keeps its existing organisation
-- and role rules exactly as they were, with the plan check added at the end.

-- funds
ALTER POLICY rbac_funds_insert ON public.funds
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'funds', 'use'));
ALTER POLICY rbac_funds_update ON public.funds
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'funds', 'use'))
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'funds', 'use'));
ALTER POLICY rbac_funds_delete ON public.funds
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'funds', 'use'));

-- accounts (Admin only, as before)
ALTER POLICY rbac_accounts_insert ON public.accounts
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = 'Admin'::text)
              AND public.org_feature_allowed(organization_id, 'accounts', 'use'));
ALTER POLICY rbac_accounts_update ON public.accounts
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = 'Admin'::text)
         AND public.org_feature_allowed(organization_id, 'accounts', 'use'))
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = 'Admin'::text)
              AND public.org_feature_allowed(organization_id, 'accounts', 'use'));
ALTER POLICY rbac_accounts_delete ON public.accounts
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = 'Admin'::text)
         AND public.org_feature_allowed(organization_id, 'accounts', 'use'));

-- bank statements and their transactions
ALTER POLICY rbac_bank_statements_insert ON public.bank_statements
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'));
ALTER POLICY rbac_bank_statements_update ON public.bank_statements
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'))
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'));
ALTER POLICY rbac_bank_statements_delete ON public.bank_statements
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'));
ALTER POLICY rbac_bank_transactions_insert ON public.bank_transactions
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'));
ALTER POLICY rbac_bank_transactions_update ON public.bank_transactions
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'))
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'));
ALTER POLICY rbac_bank_transactions_delete ON public.bank_transactions
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'bank_statements', 'use'));

-- procurement projects and quotes
ALTER POLICY rbac_procurement_projects_insert ON public.procurement_projects
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'procurement', 'use'));
ALTER POLICY rbac_procurement_projects_update ON public.procurement_projects
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'procurement', 'use'))
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'procurement', 'use'));
ALTER POLICY rbac_procurement_projects_delete ON public.procurement_projects
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'procurement', 'use'));
ALTER POLICY rbac_quotes_insert ON public.quotes
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'procurement', 'use'));
ALTER POLICY rbac_quotes_update ON public.quotes
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'procurement', 'use'))
  WITH CHECK (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
              AND public.org_feature_allowed(organization_id, 'procurement', 'use'));
ALTER POLICY rbac_quotes_delete ON public.quotes
  USING (((organization_id)::text = public.get_user_org_id()) AND (public.get_user_role() = ANY (ARRAY['Admin'::text, 'Editor'::text]))
         AND public.org_feature_allowed(organization_id, 'procurement', 'use'));
