-- The private "receipts" storage bucket was originally created by hand in the Supabase dashboard,
-- so no migration created it and a database rebuilt from this repo had nowhere to store uploads.
-- Safe to run on the live database: the bucket already exists, so this only makes sure it is private.
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;
