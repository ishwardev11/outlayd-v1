-- Safely update workspace_invites role constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE public.workspace_invites DROP CONSTRAINT IF EXISTS workspace_invites_role_check;
  
  -- Add new constraint
  ALTER TABLE public.workspace_invites ADD CONSTRAINT workspace_invites_role_check 
  CHECK (role = ANY (ARRAY['Admin'::text, 'Editor'::text, 'Viewer'::text]));
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table workspace_invites does not exist yet';
END $$;

-- Update existing Treasurer roles to Editor
UPDATE public.workspace_invites SET role = 'Editor' WHERE role = 'Treasurer';

-- Attempt to update user_roles constraint as well, just in case it exists
DO $$
BEGIN
  -- Drop existing constraint if it exists (the name might vary, so we just attempt common names or we would need dynamic SQL. To be safe, we just update the constraint if we know it. Assuming it's named user_roles_role_check)
  ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
  
  -- Add new constraint
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check 
  CHECK (role = ANY (ARRAY['Admin'::text, 'Editor'::text, 'Viewer'::text]));
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table user_roles does not exist yet';
  WHEN others THEN
    RAISE NOTICE 'Could not update user_roles constraint: %', SQLERRM;
END $$;

-- Update existing Treasurer roles to Editor
UPDATE public.user_roles SET role = 'Editor' WHERE role = 'Treasurer';
