-- Rate-limit log for the public contact form. Only the server (service role) can read or write it.
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_submissions_ip_created_idx
  ON public.contact_submissions (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_submissions_created_idx
  ON public.contact_submissions (created_at DESC);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: browsers get no access at all.
REVOKE ALL ON public.contact_submissions FROM anon, authenticated;