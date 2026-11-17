-- When the current AI extraction attempt started. created_at cannot be used for this: a document
-- that is re-read with "Try reading again" is old, but its new attempt has only just begun.
-- Existing rows get the time this migration runs, so anything already stuck on "extracting" is
-- handed to a person two minutes after the next page load.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS extraction_started_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_documents_extracting
  ON public.documents (organization_id, extraction_started_at)
  WHERE status = 'extracting';
