-- Migration: Secure Tenant Isolation, Stored Procedures, and Stripe Sync Fixes
-- Applied: 2026-09-21

-- 1. Ensure upgrade_org_to_pro updates both status, tier, and optionally customer ID
DROP FUNCTION IF EXISTS public.upgrade_org_to_pro(uuid);

CREATE OR REPLACE FUNCTION public.upgrade_org_to_pro(
  org_id uuid,
  p_tier text DEFAULT 'growth',
  p_customer_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.organizations
  SET 
    subscription_status = 'pro',
    subscription_tier = COALESCE(p_tier, 'growth'),
    stripe_customer_id = COALESCE(p_customer_id, stripe_customer_id),
    cancel_at_period_end = false,
    subscription_end_date = NULL
  WHERE id = org_id;
END;
$$;

-- 2. Drop insecure public/anon policies on sensitive tables if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable update for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.organizations;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.organizations;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.organizations;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.organizations;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.workspace_invites;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.workspace_invites;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.workspace_invites;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.workspace_invites;

-- 3. Tenant-isolated RLS for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_user_roles_select" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    email = auth.jwt()->>'email'
    OR organization_id::text = public.get_user_org_id()
  );

CREATE POLICY "tenant_isolation_user_roles_insert" ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id::text = public.get_user_org_id()
    OR email = auth.jwt()->>'email'
  );

CREATE POLICY "tenant_isolation_user_roles_update" ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (
    organization_id::text = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.email = auth.jwt()->>'email'
        AND r.organization_id = public.user_roles.organization_id
        AND r.role = 'Admin'
    )
  );

CREATE POLICY "tenant_isolation_user_roles_delete" ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    organization_id::text = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.email = auth.jwt()->>'email'
        AND r.organization_id = public.user_roles.organization_id
        AND r.role = 'Admin'
    )
  );

-- 4. Tenant-isolated RLS for organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_organizations_select" ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    id::text = public.get_user_org_id()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.organization_id = public.organizations.id
        AND user_roles.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "tenant_isolation_organizations_insert" ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_isolation_organizations_update" ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (
    id::text = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.organization_id = public.organizations.id
        AND user_roles.email = auth.jwt()->>'email'
        AND user_roles.role = 'Admin'
    )
  );

CREATE POLICY "tenant_isolation_organizations_delete" ON public.organizations
  FOR DELETE
  TO authenticated
  USING (
    id::text = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.organization_id = public.organizations.id
        AND user_roles.email = auth.jwt()->>'email'
        AND user_roles.role = 'Admin'
    )
  );

-- 5. Tenant-isolated RLS for workspace_invites
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_invites_select" ON public.workspace_invites
  FOR SELECT
  TO authenticated
  USING (
    email = auth.jwt()->>'email'
    OR organization_id::text = public.get_user_org_id()
  );

CREATE POLICY "tenant_isolation_invites_insert" ON public.workspace_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id::text = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.organization_id = public.workspace_invites.organization_id
        AND user_roles.email = auth.jwt()->>'email'
        AND user_roles.role = 'Admin'
    )
  );

CREATE POLICY "tenant_isolation_invites_update" ON public.workspace_invites
  FOR UPDATE
  TO authenticated
  USING (
    organization_id::text = public.get_user_org_id()
    OR email = auth.jwt()->>'email'
  );

CREATE POLICY "tenant_isolation_invites_delete" ON public.workspace_invites
  FOR DELETE
  TO authenticated
  USING (
    organization_id::text = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.organization_id = public.workspace_invites.organization_id
        AND user_roles.email = auth.jwt()->>'email'
        AND user_roles.role = 'Admin'
    )
  );
