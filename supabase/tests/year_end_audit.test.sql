-- Simplification step 5: one audit log (changes and uploaded documents in one timeline, with a user
-- filter) and the lock messages that point to the Year end page. Run on a LOCAL database after
-- `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/year_end_audit.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE y_ctx (org uuid, org_free uuid, org_other uuid, u_admin uuid, u_editor uuid, u_viewer uuid, u_free uuid, u_other uuid,
                         cat_don uuid, cat_exp uuid, fund uuid, doc uuid, doc_free uuid);
GRANT ALL ON y_ctx TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.sign_in(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',p_uid,'email',p_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.commit_checks() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expect text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.commit_checks();
  EXCEPTION WHEN others THEN
    IF position(lower(p_expect) IN lower(SQLERRM)) = 0 THEN
      RAISE EXCEPTION '% : expected an error containing "%", got "%"', p_label, p_expect, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION '% : expected an error containing "%", but it succeeded', p_label, p_expect;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.eq(p_got numeric, p_want numeric, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION '% : expected %, got %', p_label, p_want, p_got;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text), pg_temp.commit_checks(), pg_temp.expect_error(text, text, text), pg_temp.eq(numeric, numeric, text) TO authenticated;

-- ---------------------------------------------------------------- set-up (as the server)
DO $$
DECLARE o uuid; ofr uuid; oo uuid; x uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Audit Society', 'pro', 'nonprofit') RETURNING id INTO o;
  INSERT INTO organizations (name) VALUES ('Audit Free Club') RETURNING id INTO ofr;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Audit Other', 'pro', 'growth') RETURNING id INTO oo;
  INSERT INTO y_ctx (org, org_free, org_other, cat_don, cat_exp, fund) VALUES (o, ofr, oo,
    (SELECT id FROM categories WHERE organization_id = o AND name = 'General donations'),
    (SELECT id FROM categories WHERE organization_id = o AND kind = 'expense' AND NOT is_system ORDER BY name LIMIT 1),
    (SELECT id FROM funds WHERE organization_id = o AND is_default));
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ya-admin@example.com') RETURNING id INTO x; UPDATE y_ctx SET u_admin = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ya-editor@example.com') RETURNING id INTO x; UPDATE y_ctx SET u_editor = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ya-viewer@example.com') RETURNING id INTO x; UPDATE y_ctx SET u_viewer = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ya-free@example.com') RETURNING id INTO x; UPDATE y_ctx SET u_free = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ya-other@example.com') RETURNING id INTO x; UPDATE y_ctx SET u_other = x;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'ya-admin@example.com', 'Admin'), (o, 'ya-editor@example.com', 'Editor'),
    (o, 'ya-viewer@example.com', 'Viewer'), (ofr, 'ya-free@example.com', 'Admin'), (oo, 'ya-other@example.com', 'Admin');
  -- uploads waiting for review (approving them writes the document history)
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, fund_id, category_id, invoice_number, notes)
  SELECT o, 'Cetak Jaya', 'needs_review', 'invoice', 2000, '2026-03-10', y.fund, y.cat_exp, 'CJ-310', 'AI Extraction Error: secret' FROM y_ctx y
  RETURNING id INTO x; UPDATE y_ctx SET doc = x;
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, fund_id, category_id)
  VALUES (ofr, 'Kedai', 'needs_review', 'receipt', 20, '2026-03-11', (SELECT id FROM funds WHERE organization_id = ofr AND is_default),
          (SELECT id FROM categories WHERE organization_id = ofr AND kind = 'expense' AND NOT is_system ORDER BY name LIMIT 1))
  RETURNING id INTO x; UPDATE y_ctx SET doc_free = x;
END $$;

-- ---------------------------------------------------------------- the history: an entry by the Admin, an approval by the Editor
DO $$
DECLARE c y_ctx;
BEGIN
  SELECT * INTO c FROM y_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'ya-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-03-01', 'payee_name', 'Puan Aminah',
    'lines', jsonb_build_array(jsonb_build_object('amount', 100, 'category_id', c.cat_don))));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_editor, 'ya-editor@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE documents SET status = 'awaiting_payment' WHERE id = c.doc;
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_free, 'ya-free@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE documents SET status = 'paid', paid_date = '2026-03-11' WHERE id = c.doc_free;
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------- 1. one timeline, as a Viewer
DO $$
DECLARE c y_ctx; r record;
BEGIN
  SELECT * INTO c FROM y_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'ya-viewer@example.com');
  SET LOCAL ROLE authenticated;
  -- everything: the money in (and the invoice the approval created) and the document approval, newest first, one total
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org) WHERE kind = 'money'), 'the money in is in the timeline';
  SELECT * INTO r FROM audit_changes(c.org) WHERE kind = 'documents';
  ASSERT r.action = 'approved' AND r.root_id = c.doc, 'the approval of the upload is in the same timeline';
  ASSERT r.snapshot ->> 'vendor_name' = 'Cetak Jaya' AND r.snapshot ->> 'invoice_number' = 'CJ-310' AND (r.snapshot ->> 'amount')::numeric = 2000, 'with its payee, number and amount';
  ASSERT r.before ->> 'status' = 'needs_review' AND r.after ->> 'status' = 'awaiting_payment', 'and the status change';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_changes(c.org) a WHERE a.snapshot::text LIKE '%Extraction Error%' OR a.before::text LIKE '%Extraction Error%'),
    'the AI error notes never reach the timeline';
  PERFORM pg_temp.eq((SELECT max(total_count) FROM audit_changes(c.org)), (SELECT count(*) FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 200)),
    'one total for the whole timeline');
  ASSERT (SELECT bool_and(a.changed_at >= b.changed_at) FROM
            (SELECT changed_at, row_number() OVER () n FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 200)) a
            JOIN (SELECT changed_at, row_number() OVER () n FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 200)) b ON b.n = a.n + 1),
    'newest first';
  -- the record type filter
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org, ARRAY['documents'])), 1, 'only uploaded documents');
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org, ARRAY['money']) WHERE kind <> 'money'), 0, 'only money');
  -- the user filter
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 200, 0, 'ya-editor@example.com') WHERE actor_email <> 'ya-editor@example.com'), 0, 'only the Editor''s changes');
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 200, 0, 'YA-EDITOR@example.com') WHERE kind = 'documents'), 'the Editor approved the upload (any letter case)';
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 200, 0, 'ya-admin@example.com') WHERE kind = 'documents'), 0, 'the Admin did not');
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 200, 0, 'System') WHERE actor_email IS NOT NULL), 0, 'System: changes by no one signed in');
  -- the date filter (days in the organisation's time zone)
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org, NULL, '2000-01-01', '2000-12-31')), 0, 'nothing in another period');
  -- the people for the user filter
  ASSERT (SELECT array_agg(actor_email ORDER BY actor_email) FROM audit_actors(c.org)) = ARRAY['ya-admin@example.com', 'ya-editor@example.com'], 'both people listed';
  -- one record's history still works the old way (positional call, as the History panels make it)
  ASSERT (SELECT count(*) FROM audit_changes(c.org, NULL, NULL, NULL, c.doc)) = 1, 'the history of one record';
  RESET ROLE;
  RAISE NOTICE 'PASS one timeline: changes and uploaded documents together, newest first, filtered by type, user and date; no AI notes';
END $$;

-- ---------------------------------------------------------------- 2. who sees what
DO $$
DECLARE c y_ctx; failed boolean;
BEGIN
  SELECT * INTO c FROM y_ctx;
  -- another organisation sees nothing of it
  PERFORM pg_temp.sign_in(c.u_other, 'ya-other@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org)), 0, 'another organisation: no history');
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_actors(c.org)), 0, 'another organisation: no people');
  RESET ROLE;
  -- the audit log stays free: a free organisation reads its own, documents included
  PERFORM pg_temp.sign_in(c.u_free, 'ya-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org_free, ARRAY['documents'])), 1, 'a free organisation reads its own document history');
  PERFORM pg_temp.eq((SELECT count(*) FROM audit_changes(c.org)), 0, 'and nothing of another organisation');
  RESET ROLE;
  -- anonymous callers cannot run either function
  failed := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM audit_changes(c.org);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  RESET ROLE;
  ASSERT failed, 'anon must not run audit_changes';
  failed := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM audit_actors(c.org);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  RESET ROLE;
  ASSERT failed, 'anon must not run audit_actors';
  RAISE NOTICE 'PASS another organisation and anonymous callers see nothing; the audit log stays free';
END $$;

-- ---------------------------------------------------------------- 3. the lock: Admin only, logged, messages point to the Year end page
DO $$
DECLARE c y_ctx;
BEGIN
  SELECT * INTO c FROM y_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'ya-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT set_lock_date('2026-03-31')$q$, 'Only Admins', 'an Editor locking');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_admin, 'ya-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM set_lock_date('2026-03-31');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"2026-03-15","payee_name":"Late","lines":[{"amount":5,"category_id":"%s"}]}')$q$, c.cat_don),
    'on the Year end page (Reports, Year end)', 'the lock message points to the Year end page');
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['settings']) WHERE root_entity = 'organizations' AND after ->> 'lock_date' = '2026-03-31'), 'the lock is logged';
  RESET ROLE;
  RAISE NOTICE 'PASS the lock is Admin-only and logged, and its messages point to the Year end page';
END $$;

ROLLBACK;
