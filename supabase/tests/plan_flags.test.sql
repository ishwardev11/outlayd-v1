-- Automated test for plan flags (Phase 1, step 5). Run on a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/plan_flags.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- Organisations: free (never paid), paid (growth), nonprofit tier, cancelled (was paid, now free),
-- and another paid organisation for the cross-organisation checks. "past_due" is stored as 'pro' by
-- the Stripe sync, so it is the same as paid here (stripe-sync.test.ts checks that mapping).
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE p_ctx (org_free uuid, org_paid uuid, org_np uuid, org_cancel uuid, org_other uuid,
                         fund_free uuid, fund_paid uuid, stmt_cancel uuid, proj_cancel uuid,
                         u_free uuid, u_paid uuid, u_viewer uuid, u_cancel uuid, u_other uuid);
GRANT ALL ON p_ctx TO authenticated;

-- Signs in as one of the test users for the rest of the current block
CREATE OR REPLACE FUNCTION pg_temp.sign_in(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',p_uid,'email',p_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END $$;

DO $$
DECLARE o_free uuid; o_paid uuid; o_np uuid; o_cancel uuid; o_other uuid; f_free uuid; f_paid uuid; st uuid; pr uuid;
        uf uuid; up uuid; uv uuid; uc uuid; uo uuid;
BEGIN
  INSERT INTO organizations (name) VALUES ('Free Society') RETURNING id INTO o_free;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Paid Society', 'pro', 'growth') RETURNING id INTO o_paid;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Nonprofit Society', 'pro', 'nonprofit') RETURNING id INTO o_np;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Cancelled Society', 'pro', 'growth') RETURNING id INTO o_cancel;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Other Society', 'pro', 'growth') RETURNING id INTO o_other;

  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'plan-free@example.com') RETURNING id INTO uf;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'plan-paid@example.com') RETURNING id INTO up;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'plan-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'plan-cancel@example.com') RETURNING id INTO uc;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'plan-other@example.com') RETURNING id INTO uo;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (o_free, 'plan-free@example.com', 'Admin'), (o_paid, 'plan-paid@example.com', 'Admin'),
    (o_paid, 'plan-viewer@example.com', 'Viewer'), (o_cancel, 'plan-cancel@example.com', 'Admin'),
    (o_other, 'plan-other@example.com', 'Admin');

  INSERT INTO funds (organization_id, name) VALUES (o_free, 'Building Fund') RETURNING id INTO f_free;
  INSERT INTO funds (organization_id, name) VALUES (o_paid, 'Building Fund') RETURNING id INTO f_paid;
  -- data the cancelled organisation created while it was paid
  INSERT INTO bank_statements (organization_id, file_url, file_hash, status) VALUES (o_cancel, 'x/statements/a.pdf', 'hash-a', 'ready') RETURNING id INTO st;
  INSERT INTO procurement_projects (organization_id, title) VALUES (o_cancel, 'Projector') RETURNING id INTO pr;
  -- ... then it cancelled (this is what the Stripe sync writes)
  UPDATE organizations SET subscription_status = 'free', subscription_tier = 'free' WHERE id = o_cancel;

  INSERT INTO p_ctx VALUES (o_free, o_paid, o_np, o_cancel, o_other, f_free, f_paid, st, pr, uf, up, uv, uc, uo);
END $$;

-- ---------------------------------------------------------------- the plan answer (as the server)
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM p_ctx;
  ASSERT NOT (SELECT has_been_paid FROM organizations WHERE id = c.org_free), 'free org has never been paid';
  ASSERT (SELECT has_been_paid FROM organizations WHERE id = c.org_paid), 'paid org has been paid';
  ASSERT (SELECT has_been_paid FROM organizations WHERE id = c.org_cancel), 'cancelled org keeps has_been_paid after downgrading';
  RAISE NOTICE 'PASS has_been_paid is set by the database and survives a downgrade';

  ASSERT (SELECT paid FROM org_plan_state(c.org_paid)), 'growth is paid';
  ASSERT (SELECT paid FROM org_plan_state(c.org_np)), 'nonprofit tier is paid';
  ASSERT NOT (SELECT paid FROM org_plan_state(c.org_free)), 'free is not paid';
  ASSERT NOT (SELECT paid FROM org_plan_state(c.org_cancel)), 'cancelled is not paid';
  RAISE NOTICE 'PASS paid means status pro or tier growth/nonprofit';

  -- free: everything read, nothing new
  ASSERT org_feature_allowed(c.org_free, 'funds', 'read') AND NOT org_feature_allowed(c.org_free, 'funds', 'use'), 'free funds';
  ASSERT NOT org_feature_allowed(c.org_free, 'bank_statements', 'use') AND NOT org_feature_allowed(c.org_free, 'procurement', 'use'), 'free bank/procurement use';
  ASSERT NOT org_feature_allowed(c.org_free, 'accounting_export', 'read') AND NOT org_feature_allowed(c.org_free, 'donor_memo', 'read'), 'never-paid: no exports';
  ASSERT org_feature_allowed(c.org_free, 'audit_log', 'use') AND org_feature_allowed(c.org_free, 'audit_log', 'read'), 'audit log stays free';
  -- paid: everything
  ASSERT org_feature_allowed(c.org_paid, 'funds', 'use') AND org_feature_allowed(c.org_paid, 'procurement', 'use')
     AND org_feature_allowed(c.org_paid, 'bank_statements', 'use') AND org_feature_allowed(c.org_paid, 'donor_memo', 'use')
     AND org_feature_allowed(c.org_np, 'accounting_export', 'use'), 'paid can use everything';
  -- cancelled: read-only, but its exports keep working
  ASSERT NOT org_feature_allowed(c.org_cancel, 'bank_statements', 'use') AND org_feature_allowed(c.org_cancel, 'bank_statements', 'read'), 'cancelled bank read-only';
  ASSERT org_feature_allowed(c.org_cancel, 'accounting_export', 'read') AND org_feature_allowed(c.org_cancel, 'donor_memo', 'read'), 'cancelled keeps exports';
  ASSERT NOT org_feature_allowed(c.org_cancel, 'donor_memo', 'use'), 'cancelled cannot use memo as a paid feature';
  RAISE NOTICE 'PASS the feature matrix (free, paid, nonprofit, cancelled)';

  BEGIN PERFORM org_feature_allowed(c.org_paid, 'fundz', 'use'); RAISE EXCEPTION 'unknown feature accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Unknown plan feature%' THEN RAISE; END IF; END;
  BEGIN PERFORM org_feature_allowed(c.org_paid, 'funds', 'write'); RAISE EXCEPTION 'unknown access accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Unknown plan access%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS an unknown feature or access level is an error, never a silent yes';
END $$;

-- ---------------------------------------------------------------- free organisation (Admin)
DO $$
DECLARE c record; n int; s record;
BEGIN
  SELECT * INTO c FROM p_ctx;
  PERFORM pg_temp.sign_in(c.u_free, 'plan-free@example.com');
  SET LOCAL ROLE authenticated;

  SELECT * INTO s FROM org_plan_state(c.org_paid);
  ASSERT NOT s.paid AND NOT s.has_been_paid, 'another organisation''s plan is not revealed';
  ASSERT (SELECT count(*) FROM funds WHERE organization_id = c.org_free) >= 2, 'free org can read its funds';

  BEGIN INSERT INTO funds (organization_id, name) VALUES (c.org_free, 'New Fund'); RAISE EXCEPTION 'free org created a fund';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE funds SET name = 'Renamed' WHERE id = c.fund_free; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'free org renamed a fund';
  UPDATE funds SET budget = 100 WHERE id = c.fund_free; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'free org set a fund budget';
  UPDATE funds SET archived_at = now() WHERE id = c.fund_free; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'free org archived a fund';
  DELETE FROM funds WHERE id = c.fund_free; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'free org deleted a fund';
  RAISE NOTICE 'PASS a free org can read its funds but not create, rename, edit or archive them';

  INSERT INTO documents (organization_id, vendor_name, status, amount, fund_id, splits)
    VALUES (c.org_free, 'TNB', 'needs_review', 50, c.fund_free,
            jsonb_build_array(jsonb_build_object('amount', 50, 'fund_id', c.fund_free)));
  ASSERT (SELECT count(*) FROM documents WHERE organization_id = c.org_free AND fund_id = c.fund_free) = 1, 'document saved';
  RAISE NOTICE 'PASS a free org still records expenses against its existing funds';

  BEGIN INSERT INTO procurement_projects (organization_id, title) VALUES (c.org_free, 'X'); RAISE EXCEPTION 'free org created a project';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO bank_statements (organization_id, file_url, file_hash) VALUES (c.org_free, 'f', 'h-free'); RAISE EXCEPTION 'free org created a statement';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO accounts (organization_id, name) VALUES (c.org_free, 'Cash box'); RAISE EXCEPTION 'free org created an account';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS a free org cannot start procurement, bank statements or new accounts';

  UPDATE organizations SET has_been_paid = true, name = 'Free Society Renamed' WHERE id = c.org_free; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'admin can still edit organisation settings';
  ASSERT NOT (SELECT has_been_paid FROM organizations WHERE id = c.org_free), 'a signed-in user cannot mark the org as paid';
  RAISE NOTICE 'PASS a signed-in user cannot fake has_been_paid';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- paid organisation (Admin, Viewer)
DO $$
DECLARE c record; n int; s record;
BEGIN
  SELECT * INTO c FROM p_ctx;
  PERFORM pg_temp.sign_in(c.u_paid, 'plan-paid@example.com');
  SET LOCAL ROLE authenticated;

  SELECT * INTO s FROM org_plan_state(c.org_paid);
  ASSERT s.paid, 'own plan is paid';
  INSERT INTO funds (organization_id, name) VALUES (c.org_paid, 'Grant Y');
  UPDATE funds SET name = 'Building Fund 2', budget = 5000 WHERE id = c.fund_paid; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'paid admin edits a fund';
  INSERT INTO procurement_projects (organization_id, title) VALUES (c.org_paid, 'Laptops');
  INSERT INTO bank_statements (organization_id, file_url, file_hash) VALUES (c.org_paid, 'f', 'h-paid');
  INSERT INTO accounts (organization_id, name) VALUES (c.org_paid, 'Cash box');
  RAISE NOTICE 'PASS a paid org can create and edit funds, accounts, projects and statements';
END $$;
RESET ROLE;

DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM p_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'plan-viewer@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM funds WHERE organization_id = c.org_paid) >= 2, 'viewer reads funds';
  BEGIN INSERT INTO funds (organization_id, name) VALUES (c.org_paid, 'Viewer Fund'); RAISE EXCEPTION 'viewer created a fund';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO procurement_projects (organization_id, title) VALUES (c.org_paid, 'V'); RAISE EXCEPTION 'viewer created a project';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS a Viewer on a paid plan still cannot write (role rules unchanged)';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- cancelled organisation (Admin)
DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM p_ctx;
  PERFORM pg_temp.sign_in(c.u_cancel, 'plan-cancel@example.com');
  SET LOCAL ROLE authenticated;

  ASSERT (SELECT count(*) FROM bank_statements WHERE organization_id = c.org_cancel) = 1, 'cancelled org still sees its statement';
  ASSERT (SELECT count(*) FROM procurement_projects WHERE organization_id = c.org_cancel) = 1, 'cancelled org still sees its project';
  UPDATE bank_statements SET warning = 'x' WHERE id = c.stmt_cancel; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'cancelled org changed a statement';
  DELETE FROM bank_statements WHERE id = c.stmt_cancel; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'cancelled org deleted a statement';
  UPDATE procurement_projects SET title = 'x' WHERE id = c.proj_cancel; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'cancelled org changed a project';
  BEGIN INSERT INTO quotes (organization_id, project_id, vendor_name) VALUES (c.org_cancel, c.proj_cancel, 'Q'); RAISE EXCEPTION 'cancelled org added a quote';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO funds (organization_id, name) VALUES (c.org_cancel, 'After cancel'); RAISE EXCEPTION 'cancelled org created a fund';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT org_feature_allowed(c.org_cancel, 'accounting_export', 'read') AND org_feature_allowed(c.org_cancel, 'donor_memo', 'read'), 'cancelled keeps exports';
  RAISE NOTICE 'PASS a cancelled org keeps read-only access and its exports; nothing was deleted';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- another organisation
DO $$
DECLARE c record; s record;
BEGIN
  SELECT * INTO c FROM p_ctx;
  PERFORM pg_temp.sign_in(c.u_other, 'plan-other@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM funds WHERE organization_id IN (c.org_paid, c.org_free, c.org_cancel)) = 0, 'other org sees no funds';
  ASSERT (SELECT count(*) FROM bank_statements WHERE organization_id = c.org_cancel) = 0, 'other org sees no statements';
  SELECT * INTO s FROM org_plan_state(c.org_cancel);
  ASSERT NOT s.paid AND NOT s.has_been_paid, 'other org cannot read the plan';
  ASSERT NOT org_feature_allowed(c.org_paid, 'funds', 'use'), 'other org gets no for another org''s feature';
  BEGIN INSERT INTO funds (organization_id, name) VALUES (c.org_paid, 'Sneaky'); RAISE EXCEPTION 'other org wrote into a paid org';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS a user from another organisation can neither read nor write, even with a paid plan';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- upgrade and downgrade
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM p_ctx;
  -- Act as the server (the Stripe webhook): no signed-in user
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE organizations SET subscription_status = 'pro', subscription_tier = 'growth' WHERE id = c.org_free;  -- checkout completed
  ASSERT (SELECT has_been_paid FROM organizations WHERE id = c.org_free), 'upgrade sets has_been_paid';
  ASSERT org_feature_allowed(c.org_free, 'funds', 'use'), 'upgrade unlocks funds';
  UPDATE organizations SET subscription_status = 'free', subscription_tier = 'free' WHERE id = c.org_free;  -- cancelled
  ASSERT (SELECT has_been_paid FROM organizations WHERE id = c.org_free), 'downgrade keeps has_been_paid';
  ASSERT NOT org_feature_allowed(c.org_free, 'funds', 'use') AND org_feature_allowed(c.org_free, 'donor_memo', 'read'), 'downgrade: read-only + exports';
  UPDATE organizations SET has_been_paid = false WHERE id = c.org_free;  -- even the server cannot clear it
  ASSERT (SELECT has_been_paid FROM organizations WHERE id = c.org_free), 'has_been_paid is never cleared';
  RAISE NOTICE 'PASS upgrading unlocks at once, downgrading is read-only, has_been_paid is never cleared';
END $$;

ROLLBACK;
