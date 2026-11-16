


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."ai_recommendation_status" AS ENUM (
    'Recommended',
    'Alternative',
    'Rejected'
);


ALTER TYPE "public"."ai_recommendation_status" OWNER TO "postgres";


CREATE TYPE "public"."procurement_status" AS ENUM (
    'Drafting',
    'Collecting Bids',
    'Evaluating',
    'Awarded'
);


ALTER TYPE "public"."procurement_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dashboard_summary"("p_org" "uuid", "p_today" "date", "p_tz" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH base AS (
    SELECT
      d.status,
      COALESCE(d.amount, 0) AS amount,
      COALESCE(public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date) AS doc_day,
      COALESCE(d.paid_date, public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date) AS paid_day
    FROM public.documents d
    WHERE d.organization_id = p_org
      AND d.status IN ('awaiting_payment', 'needs_review', 'paid')
  ),
  days AS (
    SELECT (p_today - 13 + n)::date AS day FROM generate_series(0, 13) AS n
  )
  SELECT jsonb_build_object(
    'awaiting_total',
      COALESCE((SELECT sum(amount) FROM base WHERE status = 'awaiting_payment'), 0),
    'needs_review_count',
      (SELECT count(*) FROM base WHERE status = 'needs_review'),
    'needs_review_total',
      COALESCE((SELECT sum(amount) FROM base WHERE status = 'needs_review'), 0),
    'paid_this_month',
      COALESCE((
        SELECT sum(amount) FROM base
        WHERE status = 'paid'
          AND paid_day >= date_trunc('month', p_today)::date
          AND paid_day <  (date_trunc('month', p_today) + interval '1 month')::date
      ), 0),
    'cash_flow',
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'date', to_char(days.day, 'YYYY-MM-DD'),
                  'amount', COALESCE((
                    SELECT sum(b.amount) FROM base b
                    WHERE b.status IN ('paid', 'awaiting_payment') AND b.doc_day = days.day
                  ), 0)
                ) ORDER BY days.day)
       FROM days)
  );
$$;


ALTER FUNCTION "public"."dashboard_summary"("p_org" "uuid", "p_today" "date", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_organization_data"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.quotes               WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.procurement_projects WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.documents            WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.vendors              WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.funds                WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.categories           WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.workspace_invites    WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.user_profiles        WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.user_roles           WHERE organization_id::text = p_org_id::text;
  DELETE FROM public.organizations        WHERE id::text = p_org_id::text;
END;
$$;


ALTER FUNCTION "public"."delete_organization_data"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email_address" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT id INTO user_id FROM auth.users WHERE email = email_address LIMIT 1;
  RETURN user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("email_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_org_id"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  active_org text;
  user_email text;
BEGIN
  user_email := lower(auth.jwt()->>'email');
  IF user_email IS NULL THEN
    RETURN NULL;
  END IF;

  active_org := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-active-org-id';

  IF active_org IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE lower(email) = user_email AND organization_id::text = active_org
  ) THEN
    RETURN active_org;
  END IF;

  SELECT organization_id::text INTO active_org
  FROM public.user_roles
  WHERE lower(email) = user_email
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN active_org;
END;
$$;


ALTER FUNCTION "public"."get_user_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role
  FROM public.user_roles
  WHERE lower(email) = lower(auth.jwt()->>'email')
    AND organization_id::text = public.get_user_org_id()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vendor_name" "text",
    "amount" numeric,
    "document_date" "date",
    "document_type" "text",
    "status" "text" DEFAULT 'extracting'::"text",
    "fund_id" "uuid",
    "category_id" "uuid",
    "image_url" "text",
    "is_urgent" boolean DEFAULT false,
    "confidence_score" numeric(5,2),
    "splits" "jsonb" DEFAULT '[]'::"jsonb",
    "vendor_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "due_date" "date",
    "reference_number" "text",
    "notes" "text",
    "line_items" "jsonb" DEFAULT '[]'::"jsonb",
    "file_hash" character varying(255),
    "invoice_number" character varying(255),
    "alternative_id" character varying(255),
    "transaction_time" character varying(50),
    "payment_last4" character varying(20),
    "subtotal" numeric(15,2),
    "tax_amount" numeric(15,2),
    "vendor_branch_or_location" character varying(255),
    "extraction_flags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "original_currency" "text",
    "original_amount" numeric(15,2),
    "exchange_rate" numeric(18,8),
    "exchange_rate_source" "text",
    "paid_date" "date",
    CONSTRAINT "documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['receipt'::"text", 'invoice'::"text"]))),
    CONSTRAINT "documents_fx_check" CHECK (((("original_currency" IS NULL) OR ("original_currency" ~ '^[A-Z]{3}$'::"text")) AND (("exchange_rate" IS NULL) OR ("exchange_rate" > (0)::numeric)) AND (("exchange_rate_source" IS NULL) OR ("exchange_rate_source" = ANY (ARRAY['ecb'::"text", 'manual'::"text"]))))),
    CONSTRAINT "documents_status_check" CHECK (("status" = ANY (ARRAY['extracting'::"text", 'needs_review'::"text", 'verified'::"text", 'DUPLICATE_WARNING'::"text", 'paid'::"text", 'awaiting_payment'::"text", 'PENDING'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."documents"."invoice_number" IS 'Official invoice or reference number extracted from or assigned to the document';



CREATE OR REPLACE FUNCTION "public"."ledger_page"("p_org" "uuid", "p_status" "text" DEFAULT NULL::"text", "p_fund" "uuid" DEFAULT NULL::"uuid", "p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date", "p_q" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."documents"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT d.*
  FROM public.documents d
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN p_q IS NULL OR btrim(p_q) = '' THEN NULL
      ELSE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    END AS pat
  ) q
  WHERE d.organization_id = p_org
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_fund IS NULL OR d.fund_id = p_fund)
    AND (
      (p_from IS NULL AND p_to IS NULL)
      OR public.safe_iso_date(d.document_date::text) IS NULL
      OR (public.safe_iso_date(d.document_date::text) >= COALESCE(p_from, '-infinity'::date)
          AND public.safe_iso_date(d.document_date::text) <= COALESCE(p_to, 'infinity'::date))
    )
    AND (
      q.pat IS NULL
      OR d.vendor_name::text ILIKE q.pat
      OR d.invoice_number::text ILIKE q.pat
      OR d.amount::text ILIKE q.pat
      OR d.line_items::text ILIKE q.pat
    )
  ORDER BY d.created_at DESC, d.id DESC;
$$;


ALTER FUNCTION "public"."ledger_page"("p_org" "uuid", "p_status" "text", "p_fund" "uuid", "p_from" "date", "p_to" "date", "p_q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ledger_status_counts"("p_org" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'all', count(*),
    'needs_review', count(*) FILTER (WHERE status = 'needs_review'),
    'awaiting_payment', count(*) FILTER (WHERE status = 'awaiting_payment'),
    'paid', count(*) FILTER (WHERE status = 'paid')
  )
  FROM public.documents
  WHERE organization_id = p_org;
$$;


ALTER FUNCTION "public"."ledger_status_counts"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_billing_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated') THEN
    IF NEW.subscription_status  IS DISTINCT FROM OLD.subscription_status
    OR NEW.subscription_tier    IS DISTINCT FROM OLD.subscription_tier
    OR NEW.stripe_customer_id   IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
    OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date THEN
      RAISE EXCEPTION 'Billing fields can only be changed by the server'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_billing_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_org_billing_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE jwt_role text;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  IF jwt_role IN ('anon', 'authenticated') THEN
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
       OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date THEN
      RAISE EXCEPTION 'Billing fields can only be changed by the server';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_org_billing_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_large_transactions"("p_org" "uuid", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_fund" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT NULL::"text", "p_tz" "text" DEFAULT 'UTC'::"text", "p_min" numeric DEFAULT 500, "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH r AS (
    SELECT * FROM public.report_rows(p_org, p_year, p_month, p_fund, p_status, p_tz)
    WHERE amount >= p_min
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM r),
    'rows', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.created_at DESC)
      FROM (
        SELECT
          r.created_at,
          jsonb_build_object(
            'id', r.id,
            'vendor_name', r.vendor_name,
            'document_date', r.document_date,
            'amount', r.amount,
            'funds', CASE WHEN f.name IS NULL THEN NULL ELSE jsonb_build_object('name', f.name) END,
            'categories', CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('name', c.name) END
          ) AS obj
        FROM r
        LEFT JOIN public.funds f ON f.id = r.fund_id
        LEFT JOIN public.categories c ON c.id = r.category_id
        ORDER BY r.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) x
    ), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."report_large_transactions"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text", "p_min" numeric, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_rows"("p_org" "uuid", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_fund" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT NULL::"text", "p_tz" "text" DEFAULT 'UTC'::"text") RETURNS SETOF "public"."documents"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT d.*
  FROM public.documents d
  WHERE d.organization_id = p_org
    AND d.status NOT IN ('needs_review', 'DUPLICATE_WARNING')
    AND COALESCE(d.amount, 0) > 0
    AND (p_fund IS NULL OR d.fund_id = p_fund)
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_year IS NULL OR EXTRACT(year FROM COALESCE(
          public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date)) = p_year)
    AND (p_month IS NULL OR EXTRACT(month FROM COALESCE(
          public.safe_iso_date(d.document_date::text), (d.created_at AT TIME ZONE p_tz)::date)) = p_month);
$$;


ALTER FUNCTION "public"."report_rows"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_summary"("p_org" "uuid", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_fund" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT NULL::"text", "p_tz" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH r AS (
    SELECT * FROM public.report_rows(p_org, p_year, p_month, p_fund, p_status, p_tz)
  ),
  every_row AS (
    SELECT * FROM public.report_rows(p_org, NULL, NULL, NULL, NULL, p_tz)
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT sum(amount) FROM r), 0),
    'by_fund', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'total', t.total) ORDER BY t.total DESC)
      FROM (
        SELECT COALESCE(f.name, 'Unassigned') AS name, sum(r.amount) AS total
        FROM r LEFT JOIN public.funds f ON f.id = r.fund_id
        GROUP BY COALESCE(f.name, 'Unassigned')
      ) t
    ), '[]'::jsonb),
    'top_categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'total', t.total) ORDER BY t.total DESC)
      FROM (
        SELECT COALESCE(c.name, 'Uncategorized') AS name, sum(r.amount) AS total
        FROM r LEFT JOIN public.categories c ON c.id = r.category_id
        GROUP BY COALESCE(c.name, 'Uncategorized')
        ORDER BY sum(r.amount) DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'years', COALESCE((
      SELECT jsonb_agg(y ORDER BY y DESC)
      FROM (
        SELECT DISTINCT EXTRACT(year FROM COALESCE(
          public.safe_iso_date(e.document_date::text), (e.created_at AT TIME ZONE p_tz)::date))::int AS y
        FROM every_row e
      ) s
    ), '[]'::jsonb),
    'statuses', COALESCE((
      SELECT jsonb_agg(s ORDER BY s)
      FROM (SELECT DISTINCT e.status AS s FROM every_row e WHERE e.status IS NOT NULL) x
    ), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."report_summary"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_iso_date"("p" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN NULL;
  END IF;
  RETURN left(p, 10)::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."safe_iso_date"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upgrade_org_to_pro"("org_id" "uuid", "p_tier" "text" DEFAULT 'growth'::"text", "p_customer_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.organizations
  SET 
    subscription_status = 'pro',
    subscription_tier = COALESCE(p_tier, 'growth'),
    stripe_customer_id = COALESCE(p_customer_id, stripe_customer_id),
    cancel_at_period_end = false,
    subscription_end_date = NULL
  WHERE id = org_id;
END;
$$;


ALTER FUNCTION "public"."upgrade_org_to_pro"("org_id" "uuid", "p_tier" "text", "p_customer_id" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "is_archived" boolean DEFAULT false
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "is_archived" boolean DEFAULT false,
    "donor_name" "text",
    "grant_reference" "text",
    "purpose" "text",
    "award_amount" numeric(15,2),
    "period_start" "date",
    "period_end" "date",
    "archived_at" timestamp with time zone,
    CONSTRAINT "funds_award_amount_check" CHECK ((("award_amount" IS NULL) OR ("award_amount" >= (0)::numeric))),
    CONSTRAINT "funds_grant_period_check" CHECK ((("period_start" IS NULL) OR ("period_end" IS NULL) OR ("period_start" <= "period_end")))
);


ALTER TABLE "public"."funds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "registration_id" "text",
    "base_currency" "text",
    "fiscal_year_start" integer,
    "subscription_status" "text" DEFAULT 'free'::"text",
    "stripe_customer_id" "text",
    "cancel_at_period_end" boolean DEFAULT false,
    "subscription_end_date" timestamp with time zone,
    "subscription_tier" "text" DEFAULT 'free'::"text"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."procurement_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "budget_ceiling" numeric,
    "required_deadline" "date",
    "mandatory_requirements" "text"[],
    "status" "public"."procurement_status" DEFAULT 'Drafting'::"public"."procurement_status",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."procurement_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "vendor_name" "text" NOT NULL,
    "total_amount" numeric NOT NULL,
    "payment_terms" "text",
    "extracted_data" "jsonb",
    "ai_recommendation_status" "public"."ai_recommendation_status",
    "ai_rationale" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "file_url" "text",
    "file_size" "text",
    "status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "notes" "text",
    "is_recommended" boolean DEFAULT false,
    CONSTRAINT "quotes_status_check" CHECK (("status" = ANY (ARRAY['uploaded'::"text", 'evaluating'::"text", 'evaluated'::"text", 'awarded'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_roles_role_check" CHECK (("role" = ANY (ARRAY['Admin'::"text", 'Editor'::"text", 'Viewer'::"text"])))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "default_category_id" "uuid",
    "default_fund_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workspace_invites_role_check" CHECK (("role" = ANY (ARRAY['Admin'::"text", 'Editor'::"text", 'Viewer'::"text"])))
);


ALTER TABLE "public"."workspace_invites" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_organization_id_key" UNIQUE ("name", "organization_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_submissions"
    ADD CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funds"
    ADD CONSTRAINT "funds_name_organization_id_key" UNIQUE ("name", "organization_id");



ALTER TABLE ONLY "public"."funds"
    ADD CONSTRAINT "funds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procurement_projects"
    ADD CONSTRAINT "procurement_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_organization_id_email_key" UNIQUE ("organization_id", "email");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id");



CREATE INDEX "contact_submissions_created_idx" ON "public"."contact_submissions" USING "btree" ("created_at" DESC);



CREATE INDEX "contact_submissions_ip_created_idx" ON "public"."contact_submissions" USING "btree" ("ip_hash", "created_at" DESC);



CREATE INDEX "idx_documents_invoice_number" ON "public"."documents" USING "btree" ("organization_id", "invoice_number");



CREATE INDEX "idx_documents_org_created" ON "public"."documents" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_documents_org_status" ON "public"."documents" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_documents_organization_id" ON "public"."documents" USING "btree" ("organization_id");



CREATE INDEX "idx_user_roles_email" ON "public"."user_roles" USING "btree" ("email");



CREATE UNIQUE INDEX "unique_active_file_hash_per_org" ON "public"."documents" USING "btree" ("organization_id", "file_hash") WHERE ("status" <> 'DUPLICATE_WARNING'::"text");



CREATE UNIQUE INDEX "unique_awarded_quote_per_project" ON "public"."quotes" USING "btree" ("project_id") WHERE ("status" = 'awarded'::"text");



CREATE UNIQUE INDEX "workspace_invites_org_email_idx" ON "public"."workspace_invites" USING "btree" ("organization_id", "email");



CREATE OR REPLACE TRIGGER "protect_billing_columns" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."protect_billing_columns"();



CREATE OR REPLACE TRIGGER "protect_org_billing" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."protect_org_billing_columns"();



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."funds"
    ADD CONSTRAINT "funds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."procurement_projects"
    ADD CONSTRAINT "procurement_projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."procurement_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_default_fund_id_fkey" FOREIGN KEY ("default_fund_id") REFERENCES "public"."funds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."funds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."procurement_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rbac_categories_delete" ON "public"."categories" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_categories_insert" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_categories_select" ON "public"."categories" FOR SELECT TO "authenticated" USING ((("organization_id")::"text" = "public"."get_user_org_id"()));



CREATE POLICY "rbac_categories_update" ON "public"."categories" FOR UPDATE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"])))) WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_documents_delete" ON "public"."documents" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_documents_insert" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_documents_select" ON "public"."documents" FOR SELECT TO "authenticated" USING ((("organization_id")::"text" = "public"."get_user_org_id"()));



CREATE POLICY "rbac_documents_update" ON "public"."documents" FOR UPDATE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"])))) WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_funds_delete" ON "public"."funds" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_funds_insert" ON "public"."funds" FOR INSERT TO "authenticated" WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_funds_select" ON "public"."funds" FOR SELECT TO "authenticated" USING ((("organization_id")::"text" = "public"."get_user_org_id"()));



CREATE POLICY "rbac_funds_update" ON "public"."funds" FOR UPDATE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"])))) WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_invites_delete" ON "public"."workspace_invites" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text")));



CREATE POLICY "rbac_invites_select" ON "public"."workspace_invites" FOR SELECT TO "authenticated" USING ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR ((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text"))));



CREATE POLICY "rbac_organizations_delete" ON "public"."organizations" FOR DELETE TO "authenticated" USING (((("id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text")));



CREATE POLICY "rbac_organizations_select" ON "public"."organizations" FOR SELECT TO "authenticated" USING (((("id")::"text" = "public"."get_user_org_id"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."organization_id" = "organizations"."id") AND ("lower"("ur"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "rbac_organizations_update" ON "public"."organizations" FOR UPDATE TO "authenticated" USING (((("id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text"))) WITH CHECK (((("id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text")));



CREATE POLICY "rbac_procurement_projects_delete" ON "public"."procurement_projects" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_procurement_projects_insert" ON "public"."procurement_projects" FOR INSERT TO "authenticated" WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_procurement_projects_select" ON "public"."procurement_projects" FOR SELECT TO "authenticated" USING ((("organization_id")::"text" = "public"."get_user_org_id"()));



CREATE POLICY "rbac_procurement_projects_update" ON "public"."procurement_projects" FOR UPDATE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"])))) WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_quotes_delete" ON "public"."quotes" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_quotes_insert" ON "public"."quotes" FOR INSERT TO "authenticated" WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_quotes_select" ON "public"."quotes" FOR SELECT TO "authenticated" USING ((("organization_id")::"text" = "public"."get_user_org_id"()));



CREATE POLICY "rbac_quotes_update" ON "public"."quotes" FOR UPDATE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"])))) WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_user_roles_delete" ON "public"."user_roles" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text")));



CREATE POLICY "rbac_user_roles_select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR (("organization_id")::"text" = "public"."get_user_org_id"())));



CREATE POLICY "rbac_user_roles_update" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text"))) WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = 'Admin'::"text")));



CREATE POLICY "rbac_vendors_delete" ON "public"."vendors" FOR DELETE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_vendors_insert" ON "public"."vendors" FOR INSERT TO "authenticated" WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



CREATE POLICY "rbac_vendors_select" ON "public"."vendors" FOR SELECT TO "authenticated" USING ((("organization_id")::"text" = "public"."get_user_org_id"()));



CREATE POLICY "rbac_vendors_update" ON "public"."vendors" FOR UPDATE TO "authenticated" USING (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"])))) WITH CHECK (((("organization_id")::"text" = "public"."get_user_org_id"()) AND ("public"."get_user_role"() = ANY (ARRAY['Admin'::"text", 'Editor'::"text"]))));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_invites" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."dashboard_summary"("p_org" "uuid", "p_today" "date", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dashboard_summary"("p_org" "uuid", "p_today" "date", "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dashboard_summary"("p_org" "uuid", "p_today" "date", "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_organization_data"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_organization_data"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_id_by_email"("email_address" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("email_address" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



REVOKE ALL ON FUNCTION "public"."ledger_page"("p_org" "uuid", "p_status" "text", "p_fund" "uuid", "p_from" "date", "p_to" "date", "p_q" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ledger_page"("p_org" "uuid", "p_status" "text", "p_fund" "uuid", "p_from" "date", "p_to" "date", "p_q" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ledger_page"("p_org" "uuid", "p_status" "text", "p_fund" "uuid", "p_from" "date", "p_to" "date", "p_q" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ledger_status_counts"("p_org" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ledger_status_counts"("p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ledger_status_counts"("p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_billing_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_billing_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_billing_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_org_billing_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_org_billing_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_org_billing_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_large_transactions"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text", "p_min" numeric, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_large_transactions"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text", "p_min" numeric, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_large_transactions"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text", "p_min" numeric, "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_rows"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_rows"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_rows"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_summary"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_summary"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_summary"("p_org" "uuid", "p_year" integer, "p_month" integer, "p_fund" "uuid", "p_status" "text", "p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_iso_date"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_iso_date"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_iso_date"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upgrade_org_to_pro"("org_id" "uuid", "p_tier" "text", "p_customer_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upgrade_org_to_pro"("org_id" "uuid", "p_tier" "text", "p_customer_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."contact_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."funds" TO "anon";
GRANT ALL ON TABLE "public"."funds" TO "authenticated";
GRANT ALL ON TABLE "public"."funds" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."organizations" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."procurement_projects" TO "anon";
GRANT ALL ON TABLE "public"."procurement_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."procurement_projects" TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invites" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invites" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







