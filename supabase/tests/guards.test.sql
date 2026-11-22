-- Automated test for the protected defaults (Phase 1 steps 1 and 2): default fund, default account,
-- system categories and built-in payees. Run on a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/guards.test.sql
-- Everything happens inside a transaction that is rolled back.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE g_ctx (org uuid, uid uuid);
GRANT ALL ON g_ctx TO authenticated;

DO $$
DECLARE o uuid; u uuid;
BEGIN
  -- On a paid plan: since plan flags (step 5), creating funds and accounts is a paid feature, and this
  -- test checks that the guards do not stop a signed-in Admin from creating them.
  INSERT INTO public.organizations (name, subscription_status, subscription_tier) VALUES ('Guard Test Org', 'pro', 'growth') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'guard-admin@example.com') RETURNING id INTO u;
  INSERT INTO public.user_roles (organization_id, email, role) VALUES (o, 'guard-admin@example.com', 'Admin');
  INSERT INTO g_ctx VALUES (o, u);

  ASSERT (SELECT count(*) FROM public.funds WHERE organization_id = o AND is_default) = 1, 'one default fund';
  ASSERT (SELECT count(*) FROM public.accounts WHERE organization_id = o AND is_default) = 1, 'one default account';
  -- Uncategorised, Uncategorised income, Depreciation and (stage 5a) Gain/loss on disposal
  ASSERT (SELECT count(*) FROM public.categories WHERE organization_id = o AND is_system) = 4, 'four system categories';
  ASSERT (SELECT count(*) FROM public.vendors WHERE organization_id = o AND is_system) = 2, 'two built-in payees';
  RAISE NOTICE 'PASS a new organisation gets its defaults automatically';
END $$;

-- Everything below runs as a signed-in Admin
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM g_ctx;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',c.uid,'email','guard-admin@example.com')::text, true);
  PERFORM set_config('request.jwt.claim.sub', c.uid::text, true);
  SET LOCAL ROLE authenticated;

  -- things that must WORK (this is what the first version of the guards broke)
  INSERT INTO public.funds (organization_id, name) VALUES (c.org, 'Building Fund');
  INSERT INTO public.categories (organization_id, name) VALUES (c.org, 'Rent');
  INSERT INTO public.vendors (organization_id, name, payee_type) VALUES (c.org, 'TNB', 'vendor');
  INSERT INTO public.accounts (organization_id, name) VALUES (c.org, 'Cash box');
  UPDATE public.funds SET name = 'Operating Fund' WHERE organization_id = c.org AND is_default;
  UPDATE public.vendors SET email = 'a@b.com' WHERE organization_id = c.org AND name = 'Anonymous donor';
  RAISE NOTICE 'PASS Admin can create funds, categories, payees and accounts, and edit allowed fields';

  -- things that must be REFUSED
  BEGIN UPDATE public.funds SET archived_at = now() WHERE organization_id = c.org AND is_default;
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'default fund was archived'; END IF; END;
  BEGIN DELETE FROM public.funds WHERE organization_id = c.org AND is_default;
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'default fund was deleted'; END IF; END;
  BEGIN UPDATE public.funds SET fund_type = 'restricted' WHERE organization_id = c.org AND is_default;
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'default fund was made restricted'; END IF; END;
  BEGIN UPDATE public.accounts SET archived_at = now() WHERE organization_id = c.org AND is_default;
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'default account was archived'; END IF; END;
  BEGIN DELETE FROM public.categories WHERE organization_id = c.org AND is_system;
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'system category was deleted'; END IF; END;
  BEGIN UPDATE public.categories SET name = 'Hacked' WHERE organization_id = c.org AND name = 'Depreciation';
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'system category was renamed'; END IF; END;
  BEGIN UPDATE public.vendors SET name = 'Hacked' WHERE organization_id = c.org AND name = 'Anonymous donor';
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'built-in payee was renamed'; END IF; END;
  BEGIN DELETE FROM public.vendors WHERE organization_id = c.org AND is_system;
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'built-in payee was deleted'; END IF; END;
  BEGIN INSERT INTO public.categories (organization_id, name, is_system) VALUES (c.org, 'Fake', true);
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'fake system category created'; END IF; END;
  BEGIN INSERT INTO public.funds (organization_id, name, is_default) VALUES (c.org, 'Fake', true);
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'second default fund created'; END IF; END;
  BEGIN INSERT INTO public.vendors (organization_id, name, is_system) VALUES (c.org, 'Fake', true);
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'fake built-in payee created'; END IF; END;
  BEGIN INSERT INTO public.accounts (organization_id, name, is_default) VALUES (c.org, 'Fake', true);
        RAISE EXCEPTION 'x'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'x' THEN RAISE 'second default account created'; END IF; END;
  RAISE NOTICE 'PASS defaults cannot be archived, deleted, renamed, demoted or faked';
  RESET ROLE;
END $$;

-- A signed-in user's request may need to restore a missing default (for example an old organisation)
DO $$
DECLARE c record; n int; doc uuid;
BEGIN
  SELECT * INTO c FROM g_ctx;
  -- Simulate an organisation that lost its default account (done as the database owner, not a signed-in user)
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM public.accounts WHERE organization_id = c.org AND is_default;
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, paid_date)
    VALUES (c.org, 'late doc', 'paid', 40, '2026-11-02') RETURNING id INTO doc;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',c.uid,'email','guard-admin@example.com')::text, true);
  PERFORM set_config('request.jwt.claim.sub', c.uid::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.documents SET amount = 45 WHERE id = doc;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.accounts WHERE organization_id = c.org AND is_default;
  ASSERT n = 1, 'the default account should have been restored';
  ASSERT (SELECT total FROM public.transactions WHERE document_id = doc) = 45, 'the mirror should follow the edit';
  RAISE NOTICE 'PASS a signed-in edit can restore a missing default and still be mirrored';
END $$;

ROLLBACK;
