-- 1. Create a secure function to fetch the organization_id from user_metadata in real-time
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT raw_user_meta_data->>'organization_id' FROM auth.users WHERE id = auth.uid();
$$;

-- 2. Update Documents Policies
DROP POLICY IF EXISTS "tenant_isolation_documents_select" ON "public"."documents";
DROP POLICY IF EXISTS "tenant_isolation_documents_insert" ON "public"."documents";
DROP POLICY IF EXISTS "tenant_isolation_documents_update" ON "public"."documents";
DROP POLICY IF EXISTS "tenant_isolation_documents_delete" ON "public"."documents";

CREATE POLICY "tenant_isolation_documents_select" ON "public"."documents" FOR SELECT USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_documents_insert" ON "public"."documents" FOR INSERT WITH CHECK ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_documents_update" ON "public"."documents" FOR UPDATE USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_documents_delete" ON "public"."documents" FOR DELETE USING ((organization_id)::text = public.get_user_org_id());

-- 3. Update Vendors Policies
DROP POLICY IF EXISTS "tenant_isolation_vendors_select" ON "public"."vendors";
DROP POLICY IF EXISTS "tenant_isolation_vendors_insert" ON "public"."vendors";
DROP POLICY IF EXISTS "tenant_isolation_vendors_update" ON "public"."vendors";
DROP POLICY IF EXISTS "tenant_isolation_vendors_delete" ON "public"."vendors";

CREATE POLICY "tenant_isolation_vendors_select" ON "public"."vendors" FOR SELECT USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_vendors_insert" ON "public"."vendors" FOR INSERT WITH CHECK ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_vendors_update" ON "public"."vendors" FOR UPDATE USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_vendors_delete" ON "public"."vendors" FOR DELETE USING ((organization_id)::text = public.get_user_org_id());

-- 4. Update Categories Policies
DROP POLICY IF EXISTS "tenant_isolation_categories_select" ON "public"."categories";
DROP POLICY IF EXISTS "tenant_isolation_categories_insert" ON "public"."categories";
DROP POLICY IF EXISTS "tenant_isolation_categories_update" ON "public"."categories";
DROP POLICY IF EXISTS "tenant_isolation_categories_delete" ON "public"."categories";

CREATE POLICY "tenant_isolation_categories_select" ON "public"."categories" FOR SELECT USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_categories_insert" ON "public"."categories" FOR INSERT WITH CHECK ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_categories_update" ON "public"."categories" FOR UPDATE USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_categories_delete" ON "public"."categories" FOR DELETE USING ((organization_id)::text = public.get_user_org_id());

-- 5. Update Funds Policies
DROP POLICY IF EXISTS "tenant_isolation_funds_select" ON "public"."funds";
DROP POLICY IF EXISTS "tenant_isolation_funds_insert" ON "public"."funds";
DROP POLICY IF EXISTS "tenant_isolation_funds_update" ON "public"."funds";
DROP POLICY IF EXISTS "tenant_isolation_funds_delete" ON "public"."funds";

CREATE POLICY "tenant_isolation_funds_select" ON "public"."funds" FOR SELECT USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_funds_insert" ON "public"."funds" FOR INSERT WITH CHECK ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_funds_update" ON "public"."funds" FOR UPDATE USING ((organization_id)::text = public.get_user_org_id());
CREATE POLICY "tenant_isolation_funds_delete" ON "public"."funds" FOR DELETE USING ((organization_id)::text = public.get_user_org_id());
