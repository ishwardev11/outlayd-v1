-- Make the bucket private
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- Remove any storage policies that mention the receipts bucket.
-- With none left, browsers cannot read, list, upload or delete files directly;
-- only the server (service role) can.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual, '') ILIKE '%receipts%' OR coalesce(with_check, '') ILIKE '%receipts%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;