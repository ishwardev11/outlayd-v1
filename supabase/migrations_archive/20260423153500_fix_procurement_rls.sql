-- Ensure Dev Tenant exists in organizations to prevent FK constraint failures
INSERT INTO public.organizations (id, name, subscription_status)
VALUES ('00000000-0000-0000-0000-000000000000', 'Dev Tenant', 'pro')
ON CONFLICT (id) DO UPDATE SET subscription_status = 'pro';

-- Procurement Projects RLS Updates
DROP POLICY IF EXISTS "tenant_isolation_projects_select" ON "public"."procurement_projects";
DROP POLICY IF EXISTS "tenant_isolation_projects_insert" ON "public"."procurement_projects";
DROP POLICY IF EXISTS "tenant_isolation_projects_update" ON "public"."procurement_projects";
DROP POLICY IF EXISTS "tenant_isolation_projects_delete" ON "public"."procurement_projects";

CREATE POLICY "tenant_isolation_projects_select" ON "public"."procurement_projects" FOR SELECT TO public USING (((organization_id)::text = get_user_org_id()));
CREATE POLICY "tenant_isolation_projects_insert" ON "public"."procurement_projects" FOR INSERT TO public WITH CHECK (((organization_id)::text = get_user_org_id()));
CREATE POLICY "tenant_isolation_projects_update" ON "public"."procurement_projects" FOR UPDATE TO public USING (((organization_id)::text = get_user_org_id()));
CREATE POLICY "tenant_isolation_projects_delete" ON "public"."procurement_projects" FOR DELETE TO public USING (((organization_id)::text = get_user_org_id()));

-- Quotes RLS Updates
DROP POLICY IF EXISTS "tenant_isolation_quotes_select" ON "public"."quotes";
DROP POLICY IF EXISTS "tenant_isolation_quotes_insert" ON "public"."quotes";
DROP POLICY IF EXISTS "tenant_isolation_quotes_update" ON "public"."quotes";
DROP POLICY IF EXISTS "tenant_isolation_quotes_delete" ON "public"."quotes";

CREATE POLICY "tenant_isolation_quotes_select" ON "public"."quotes" FOR SELECT TO public USING (((organization_id)::text = get_user_org_id()));
CREATE POLICY "tenant_isolation_quotes_insert" ON "public"."quotes" FOR INSERT TO public WITH CHECK (((organization_id)::text = get_user_org_id()));
CREATE POLICY "tenant_isolation_quotes_update" ON "public"."quotes" FOR UPDATE TO public USING (((organization_id)::text = get_user_org_id()));
CREATE POLICY "tenant_isolation_quotes_delete" ON "public"."quotes" FOR DELETE TO public USING (((organization_id)::text = get_user_org_id()));
