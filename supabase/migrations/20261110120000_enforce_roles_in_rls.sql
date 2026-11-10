-- 1. Active org: membership only. Removed the user_metadata fallback (users can edit their own metadata).
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_org text;
  user_email text;
BEGIN
  user_email := lower(auth.jwt()->>'email');
  IF user_email IS NULL THEN
    RETURN NULL;
  END IF;

  active_org := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-active-org-id';

  IF active_org IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE lower(email) = user_email AND organization_id::text = active_org
  ) THEN
    RETURN active_org;
  END IF;

  SELECT organization_id::text INTO active_org
  FROM public.user_roles
  WHERE lower(email) = user_email
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN active_org;
END;
$$;

-- 2. Role of the current user in the active org
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE lower(email) = lower(auth.jwt()->>'email')
    AND organization_id::text = public.get_user_org_id()
  LIMIT 1;
$$;

-- 3. Wipe ALL existing policies on these tables (leftover permissive ones would override the new rules)
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'documents','vendors','categories','funds','procurement_projects','quotes',
    'user_roles','organizations','workspace_invites'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- 4. Data tables: any member can read; only Admin/Editor can write; rows can't be moved between orgs
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents','vendors','categories','funds','procurement_projects','quotes']
  LOOP
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (organization_id::text = public.get_user_org_id())$f$, 'rbac_'||t||'_select', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (organization_id::text = public.get_user_org_id()
                  AND public.get_user_role() IN ('Admin','Editor'))$f$, 'rbac_'||t||'_insert', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (organization_id::text = public.get_user_org_id()
             AND public.get_user_role() IN ('Admin','Editor'))
      WITH CHECK (organization_id::text = public.get_user_org_id()
                  AND public.get_user_role() IN ('Admin','Editor'))$f$, 'rbac_'||t||'_update', t);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (organization_id::text = public.get_user_org_id()
             AND public.get_user_role() IN ('Admin','Editor'))$f$, 'rbac_'||t||'_delete', t);
  END LOOP;
END $$;

-- 5. user_roles: members can read; NO insert policy (server/admin client only); Admin-only update/delete
CREATE POLICY rbac_user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.jwt()->>'email')
         OR organization_id::text = public.get_user_org_id());

CREATE POLICY rbac_user_roles_update ON public.user_roles FOR UPDATE TO authenticated
  USING (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin')
  WITH CHECK (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

CREATE POLICY rbac_user_roles_delete ON public.user_roles FOR DELETE TO authenticated
  USING (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

-- 6. organizations: members read; Admin updates/deletes; NO insert policy (onboarding uses the admin client)
CREATE POLICY rbac_organizations_select ON public.organizations FOR SELECT TO authenticated
  USING (
    id::text = public.get_user_org_id()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.organization_id = public.organizations.id
        AND lower(ur.email) = lower(auth.jwt()->>'email')
    )
  );

CREATE POLICY rbac_organizations_update ON public.organizations FOR UPDATE TO authenticated
  USING (id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin')
  WITH CHECK (id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

CREATE POLICY rbac_organizations_delete ON public.organizations FOR DELETE TO authenticated
  USING (id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

-- 7. workspace_invites: the invitee or an Admin can read; Admin can delete; inserts/updates are server-only
CREATE POLICY rbac_invites_select ON public.workspace_invites FOR SELECT TO authenticated
  USING (
    lower(email) = lower(auth.jwt()->>'email')
    OR (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin')
  );

CREATE POLICY rbac_invites_delete ON public.workspace_invites FOR DELETE TO authenticated
  USING (organization_id::text = public.get_user_org_id() AND public.get_user_role() = 'Admin');

-- 8. Safety net: browser sessions can never change billing columns on organizations
CREATE OR REPLACE FUNCTION public.protect_org_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE jwt_role text;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IN ('anon', 'authenticated') THEN
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
       OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date THEN
      RAISE EXCEPTION 'Billing fields can only be changed by the server';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_org_billing ON public.organizations;
CREATE TRIGGER protect_org_billing
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_org_billing_columns();