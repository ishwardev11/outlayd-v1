-- Deletes everything that belongs to one organisation in a single transaction.
-- Callable only by the server (service role), never from a browser session.
CREATE OR REPLACE FUNCTION public.delete_organization_data(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.quotes               WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.procurement_projects WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.documents            WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.vendors              WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.funds                WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.categories           WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.workspace_invites    WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.user_profiles        WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.user_roles           WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.organizations        WHERE id::text = p_org_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_organization_data(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization_data(uuid) TO service_role;