-- Create workspace_invites table to track pending team invites
CREATE TABLE IF NOT EXISTS public.workspace_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL CHECK (role = ANY (ARRAY['Admin'::text, 'Treasurer'::text, 'Viewer'::text])),
    created_at timestamp with time zone DEFAULT now()
);

-- Prevent duplicate pending invitations for the same user email in a single workspace
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_org_email_idx ON public.workspace_invites(organization_id, email);

-- Enable Row Level Security (RLS)
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
