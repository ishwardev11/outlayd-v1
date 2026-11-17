-- Real extraction checks replace the old hardcoded confidence score.
-- extraction_flags holds the list of problems found, e.g. [{"code":"TOTALS_MISMATCH","message":"..."}]
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS extraction_flags jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Every document so far was saved with a hardcoded 95, which says nothing about the document.
-- Clear those so the app shows no score instead of a made-up one.
UPDATE public.documents SET confidence_score = NULL WHERE confidence_score = 95;
