-- Fix: money in whose donation receipt was voided can be deleted; a receipt in force still blocks it.
-- Run on a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/receipts_delete.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE r_ctx (org uuid, u_editor uuid, u_viewer uuid, u_other uuid, cat uuid, tx uuid, tx2 uuid, rcp uuid);
GRANT ALL ON r_ctx TO authenticated;

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
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text), pg_temp.commit_checks(), pg_temp.expect_error(text, text, text) TO authenticated;

DO $$
DECLARE o uuid; oo uuid; x uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Receipt Society', 'pro', 'nonprofit') RETURNING id INTO o;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Receipt Other', 'pro', 'growth') RETURNING id INTO oo;
  INSERT INTO r_ctx (org, cat) VALUES (o, (SELECT id FROM categories WHERE organization_id = o AND name = 'General donations'));
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'rd-editor@example.com') RETURNING id INTO x; UPDATE r_ctx SET u_editor = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'rd-viewer@example.com') RETURNING id INTO x; UPDATE r_ctx SET u_viewer = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'rd-other@example.com') RETURNING id INTO x; UPDATE r_ctx SET u_other = x;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'rd-editor@example.com', 'Editor'), (o, 'rd-viewer@example.com', 'Viewer'), (oo, 'rd-other@example.com', 'Admin');
END $$;

DO $$
DECLARE c r_ctx; r donation_receipts%ROWTYPE;
BEGIN
  SELECT * INTO c FROM r_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'rd-editor@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE r_ctx SET tx = save_money_in(jsonb_build_object('tx_date', '2026-11-10', 'payee_name', 'Puan Aminah',
    'lines', jsonb_build_array(jsonb_build_object('amount', 250, 'category_id', c.cat))));
  UPDATE r_ctx SET tx2 = save_money_in(jsonb_build_object('tx_date', '2026-11-11', 'payee_name', 'Encik Ali',
    'lines', jsonb_build_array(jsonb_build_object('amount', 90, 'category_id', c.cat))));
  PERFORM pg_temp.commit_checks();
  SELECT * INTO c FROM r_ctx;
  r := issue_donation_receipt(c.tx);
  UPDATE r_ctx SET rcp = r.id;
  -- a receipt in force: the entry cannot be deleted
  PERFORM pg_temp.expect_error(format('SELECT delete_money_in(%L)', c.tx), 'Void the receipt first', 'deleting an entry with a receipt in force');
  RESET ROLE;
  -- not even directly by the server: the trigger protects a receipt in force
  PERFORM pg_temp.expect_error(format('DELETE FROM transactions WHERE id = %L', c.tx), 'Void the receipt first', 'deleting it directly');
  RAISE NOTICE 'PASS a receipt in force still protects its entry, however it is deleted';
END $$;

DO $$
DECLARE c r_ctx; r donation_receipts%ROWTYPE;
BEGIN
  SELECT * INTO c FROM r_ctx;
  -- a Viewer cannot void
  PERFORM pg_temp.sign_in(c.u_viewer, 'rd-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format('SELECT void_donation_receipt(%L, %L)', c.rcp, 'wrong amount'), 'Only Admins and Editors', 'a Viewer voiding');
  RESET ROLE;
  -- the Editor voids it, then deletes the entry (the bug: this used to be refused)
  PERFORM pg_temp.sign_in(c.u_editor, 'rd-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM void_donation_receipt(c.rcp, 'Wrong amount, entered twice');
  -- a Viewer cannot delete it even now
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_viewer, 'rd-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format('SELECT delete_money_in(%L)', c.tx), 'not found, or you cannot delete it', 'a Viewer deleting');
  RESET ROLE;
  -- nor another organisation
  PERFORM pg_temp.sign_in(c.u_other, 'rd-other@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format('SELECT delete_money_in(%L)', c.tx), 'not found, or you cannot delete it', 'another organisation deleting');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_editor, 'rd-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM delete_money_in(c.tx);
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  ASSERT NOT EXISTS (SELECT 1 FROM transactions WHERE id = c.tx), 'the entry is deleted';

  -- the voided receipt stays on record: number, donor, amount, date, void reason; only the link is cleared
  SELECT * INTO r FROM donation_receipts WHERE id = c.rcp;
  ASSERT r.receipt_no = 'RCP-1' AND r.donor_name = 'Puan Aminah' AND r.amount = 250 AND r.donation_date = '2026-11-10', 'the voided receipt keeps what was printed';
  ASSERT r.voided_at IS NOT NULL AND r.void_reason = 'Wrong amount, entered twice', 'and why it was voided';
  ASSERT r.transaction_id IS NULL, 'its link to the deleted entry is cleared';

  -- its number is never reused
  PERFORM pg_temp.sign_in(c.u_editor, 'rd-editor@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (issue_donation_receipt(c.tx2)).receipt_no = 'RCP-2', 'the next receipt takes the next number, not RCP-1 again';
  RESET ROLE;
  -- and a receipt in force can never be left without its entry
  PERFORM pg_temp.expect_error(format('UPDATE donation_receipts SET transaction_id = NULL WHERE transaction_id = %L', c.tx2),
    'donation_receipts_entry_or_void', 'a receipt in force without its entry');
  RAISE NOTICE 'PASS after voiding its receipt, money in can be deleted by an Admin or Editor (not a Viewer or another organisation); the voided receipt and its number stay on record';
END $$;

ROLLBACK;
