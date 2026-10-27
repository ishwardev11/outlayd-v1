CREATE POLICY "Enable insert for authenticated users" ON "public"."organizations"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);
