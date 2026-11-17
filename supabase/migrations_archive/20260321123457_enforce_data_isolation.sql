-- Drop permissive policies on documents
DROP POLICY IF EXISTS "Public read documents" ON "public"."documents";
DROP POLICY IF EXISTS "Public insert documents" ON "public"."documents";
DROP POLICY IF EXISTS "Public update documents" ON "public"."documents";
DROP POLICY IF EXISTS "Public delete documents" ON "public"."documents";

-- Drop permissive policies on funds
DROP POLICY IF EXISTS "Public read funds" ON "public"."funds";
DROP POLICY IF EXISTS "Public insert funds" ON "public"."funds";
DROP POLICY IF EXISTS "Public update funds" ON "public"."funds";
DROP POLICY IF EXISTS "Public delete funds" ON "public"."funds";

-- Drop permissive policies on categories
DROP POLICY IF EXISTS "Public read categories" ON "public"."categories";
DROP POLICY IF EXISTS "Public insert categories" ON "public"."categories";
DROP POLICY IF EXISTS "Public update categories" ON "public"."categories";

-- Drop permissive policies on vendors
DROP POLICY IF EXISTS "Allow vendor creation" ON "public"."vendors";
DROP POLICY IF EXISTS "Allow vendor updates" ON "public"."vendors";
DROP POLICY IF EXISTS "Allow vendor selects" ON "public"."vendors";
DROP POLICY IF EXISTS "Allow vendor deletion" ON "public"."vendors";
