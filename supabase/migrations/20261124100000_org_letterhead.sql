-- Letterhead image (Settings > Organization Profile > Receipts & letterhead).
-- Storage path of a PNG or JPEG in the private bucket: "<organization id>/letterhead-<random>.<png|jpg>".
-- When set, donation receipts (and, later, financial statements) print it across the top instead of
-- the typed name and address. Admins change it through the app, which checks the file type and size.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS letterhead_path text;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_letterhead_path_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_letterhead_path_check
  CHECK (letterhead_path IS NULL OR (
    char_length(letterhead_path) <= 200
    AND letterhead_path NOT LIKE '%..%'
    AND letterhead_path LIKE id::text || '/letterhead-%'
  ));
