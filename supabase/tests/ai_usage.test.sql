-- Automated test for AI usage, plan gating and monthly limits (invoices and AI plan, step 5). Run on a
-- LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/ai_usage.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE a_ctx (org_free uuid, org_paid uuid, org_other uuid, u_admin uuid, u_viewer uuid);
GRANT ALL ON a_ctx TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.sign_in(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',p_uid,'email',p_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END $$;

DO $$
DECLARE o_free uuid; o_paid uuid; o_other uuid; ua uuid; uv uuid;
BEGIN
  INSERT INTO organizations (name) VALUES ('AI Free Society') RETURNING id INTO o_free;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('AI Paid Society', 'pro', 'growth') RETURNING id INTO o_paid;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('AI Other Society', 'pro', 'growth') RETURNING id INTO o_other;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ai-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ai-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o_paid, 'ai-admin@example.com', 'Admin'), (o_paid, 'ai-viewer@example.com', 'Viewer');
  INSERT INTO a_ctx VALUES (o_free, o_paid, o_other, ua, uv);
END $$;

-- ---------------------------------------------------------------- the gate (as the server)
DO $$
DECLARE c a_ctx; r text;
BEGIN
  SELECT * INTO c FROM a_ctx;
  -- receipt and statement reading are counted, never blocked (they keep their own rules)
  ASSERT claim_ai_call(c.org_free, 'receipt_extraction') = 'ok', 'a free organisation reading a receipt is counted, not blocked';
  ASSERT claim_ai_call(c.org_free, 'receipt_extraction') = 'ok', 'a second receipt the same day';
  PERFORM finish_ai_call(c.org_free, 'receipt_extraction', true);
  ASSERT (SELECT calls || '/' || successes FROM ai_usage WHERE organization_id = c.org_free AND feature = 'receipt_extraction') = '2/1',
    'one row per day: 2 calls, 1 success';

  -- the AI assistants are for paid plans
  ASSERT claim_ai_call(c.org_free, 'issued_invoice') = 'plan', 'a free organisation cannot use an AI assistant';
  ASSERT NOT EXISTS (SELECT 1 FROM ai_usage WHERE organization_id = c.org_free AND feature = 'issued_invoice'), 'a refused call is not counted';
  ASSERT claim_ai_call(c.org_paid, 'issued_invoice') = 'ok', 'a paid organisation can';

  -- the monthly limit covers all assistants together; receipts do not use it up
  INSERT INTO ai_usage (organization_id, feature, usage_date, calls)
  VALUES (c.org_paid, 'payment_slip', org_today(c.org_paid), ai_monthly_limit(true) - 2)
  ON CONFLICT (organization_id, feature, usage_date) DO UPDATE SET calls = EXCLUDED.calls;
  PERFORM claim_ai_call(c.org_paid, 'receipt_extraction');
  ASSERT claim_ai_call(c.org_paid, 'categorise') = 'ok', 'the last call within the limit';
  ASSERT claim_ai_call(c.org_paid, 'categorise') = 'limit', 'over the limit: refused';
  ASSERT claim_ai_call(c.org_paid, 'payment_slip') = 'limit', 'the limit is shared by all assistants';
  ASSERT claim_ai_call(c.org_paid, 'receipt_extraction') = 'ok', 'receipt reading still works over the assistant limit';
  ASSERT claim_ai_call(c.org_other, 'categorise') = 'ok', 'another organisation has its own limit';

  -- last month's calls do not count
  UPDATE ai_usage SET usage_date = (date_trunc('month', org_today(c.org_paid)) - interval '1 day')::date
  WHERE organization_id = c.org_paid AND feature = 'payment_slip';
  ASSERT claim_ai_call(c.org_paid, 'categorise') = 'ok', 'a new month starts afresh';

  BEGIN
    PERFORM claim_ai_call(c.org_paid, 'chat');
    RAISE EXCEPTION 'an unknown feature was accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'Unknown AI feature%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS AI calls are counted; assistants need a paid plan and stay within the shared monthly limit';
END $$;

-- ---------------------------------------------------------------- people cannot change their own counts
DO $$
DECLARE c a_ctx; n int;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'ai-admin@example.com');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM ai_usage;
  ASSERT n > 0 AND NOT EXISTS (SELECT 1 FROM ai_usage WHERE organization_id <> c.org_paid), 'an Admin sees only their organisation''s usage';
  BEGIN
    PERFORM claim_ai_call(c.org_paid, 'categorise');
    RAISE EXCEPTION 'a signed-in user could claim an AI call';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM ai_usage WHERE organization_id = c.org_paid;
    RAISE EXCEPTION 'a signed-in user could delete usage';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_viewer, 'ai-viewer@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT NOT EXISTS (SELECT 1 FROM ai_usage), 'a Viewer does not see usage';
  RESET ROLE;
  RAISE NOTICE 'PASS usage is written only by the server and read only by Admins and Editors';
END $$;

ROLLBACK;
