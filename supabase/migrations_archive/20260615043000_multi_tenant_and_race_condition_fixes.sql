-- Redefine get_user_org_id function to extract x-active-org-id custom header
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_org text;
  user_email text;
BEGIN
  -- 1. Extract the active organization header from postgREST client request
  active_org := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-active-org-id';
  user_email := auth.jwt()->>'email';

  -- 2. Verify membership in user_roles
  IF active_org IS NOT NULL AND user_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE email = user_email AND organization_id::text = active_org
    ) THEN
      RETURN active_org;
    END IF;
  END IF;

  -- 3. Fallback: Query first organization they belong to in user_roles
  IF user_email IS NOT NULL THEN
    SELECT organization_id::text INTO active_org 
    FROM public.user_roles 
    WHERE email = user_email 
    ORDER BY created_at ASC 
    LIMIT 1;
    
    IF active_org IS NOT NULL THEN
      RETURN active_org;
    END IF;
  END IF;

  -- 4. Final legacy fallback (user metadata)
  RETURN (SELECT raw_user_meta_data->>'organization_id' FROM auth.users WHERE id = auth.uid());
END;
$$;

-- Create unique index to prevent double quote awarding race conditions
CREATE UNIQUE INDEX IF NOT EXISTS unique_awarded_quote_per_project 
ON public.quotes (project_id) 
WHERE (status = 'awarded');

-- Create unique index to prevent duplicate file uploads race conditions
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_file_hash_per_org 
ON public.documents (organization_id, file_hash) 
WHERE (status != 'DUPLICATE_WARNING');
