-- Automated test for assurance (Phase 5, stage 6a): period locks, change history, reconciliations and
-- the integrity checks. Run on a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/assurance.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- The scenario (start date 1 January 2026, Main account opening 1,000, Rental deposit 100):
--   January: a donation of 500 (10 Jan), a bill uploaded for 300 (20 Jan, unpaid), an invoice we owe of
--   200 (25 Jan, unpaid), a transfer of 50 to the Building Fund (28 Jan). Then January is locked.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE a_ctx (org uuid, org_free uuid, org_other uuid, fund_gen uuid, fund_bld uuid, cat_rent uuid, cat_don uuid,
                         cat_unc uuid, payee uuid, acct_main uuid, deposit uuid, u_admin uuid, u_editor uuid, u_viewer uuid,
                         u_free uuid, u_other uuid, tx_jan uuid, doc_bill uuid, inv_jan uuid, transfer_jan uuid);
GRANT ALL ON a_ctx TO authenticated;

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
CREATE OR REPLACE FUNCTION pg_temp.check_passed(p_org uuid, p_from date, p_to date, p_code text) RETURNS boolean LANGUAGE sql AS $$
  SELECT passed FROM integrity_checks(p_org, p_from, p_to) WHERE code = p_code;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.commit_checks() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.eq(numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.check_passed(uuid, date, date, text) TO authenticated;

-- ---------------------------------------------------------------- setup (as the server)
DO $$
DECLARE o uuid; o_free uuid; o_other uuid; fg uuid; fb uuid; cr uuid; cd uuid; cu uuid; p uuid; am uuid;
        ua uuid; ue uuid; uv uuid; uf uuid; uo uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Lock Society', 'pro', 'growth') RETURNING id INTO o;
  INSERT INTO organizations (name) VALUES ('Free Lock Society') RETURNING id INTO o_free;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Other Lock Society', 'pro', 'growth') RETURNING id INTO o_other;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'as-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'as-editor@example.com') RETURNING id INTO ue;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'as-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'as-free@example.com') RETURNING id INTO uf;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'as-other@example.com') RETURNING id INTO uo;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (o, 'as-admin@example.com', 'Admin'), (o, 'as-editor@example.com', 'Editor'), (o, 'as-viewer@example.com', 'Viewer'),
    (o_free, 'as-free@example.com', 'Admin'), (o_other, 'as-other@example.com', 'Admin');

  SELECT id INTO fg FROM funds WHERE organization_id = o AND is_default;
  INSERT INTO funds (organization_id, name, fund_type) VALUES (o, 'Building Fund', 'restricted') RETURNING id INTO fb;
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (o, 'Rent', 'expense', 'Administration') RETURNING id INTO cr;
  SELECT id INTO cd FROM categories WHERE organization_id = o AND name = 'General donations';
  SELECT id INTO cu FROM categories WHERE organization_id = o AND is_system AND name = 'Uncategorised income';
  INSERT INTO vendors (organization_id, name) VALUES (o, 'Dewan Komuniti') RETURNING id INTO p;
  UPDATE accounts SET opening_balance = 1000 WHERE organization_id = o AND is_default RETURNING id INTO am;

  INSERT INTO a_ctx (org, org_free, org_other, fund_gen, fund_bld, cat_rent, cat_don, cat_unc, payee, acct_main,
                     u_admin, u_editor, u_viewer, u_free, u_other)
  VALUES (o, o_free, o_other, fg, fb, cr, cd, cu, p, am, ua, ue, uv, uf, uo);
END $$;

-- ---------------------------------------------------------------- January, then lock it
DO $$
DECLARE c a_ctx; v uuid;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'as-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM save_opening_position('{"start_date":"2026-01-01","complete":true}');
  UPDATE a_ctx SET deposit = save_item(jsonb_build_object('name', 'Rental deposit', 'kind', 'other_asset', 'opening_balance', 100));
  UPDATE a_ctx SET tx_jan = save_money_in(jsonb_build_object('tx_date', '2026-01-10', 'payee_id', c.payee,
                    'lines', jsonb_build_array(jsonb_build_object('amount', 500, 'category_id', c.cat_don))));
  UPDATE a_ctx SET inv_jan = save_invoice(jsonb_build_object('direction', 'payable', 'payee_id', c.payee, 'issue_date', '2026-01-25',
                    'lines', jsonb_build_array(jsonb_build_object('amount', 200, 'category_id', c.cat_rent))));
  UPDATE a_ctx SET transfer_jan = save_fund_transfer(jsonb_build_object('from_fund_id', c.fund_gen, 'to_fund_id', c.fund_bld, 'amount', 50, 'tx_date', '2026-01-28'));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  VALUES (c.org, 'Electric Co', 'awaiting_payment', 'invoice', 300, '2026-01-20', '2026-02-20', c.fund_gen, c.cat_rent, 'EL-1') RETURNING id INTO v;
  UPDATE a_ctx SET doc_bill = v;
  PERFORM pg_temp.commit_checks();

  -- Who may lock
  PERFORM pg_temp.sign_in(c.u_editor, 'as-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT set_lock_date('2026-01-31')$q$, 'Only Admins', 'an Editor locking');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_free, 'as-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT set_lock_date('2026-01-31')$q$, 'Growth and Nonprofit', 'a free organisation locking');
  RESET ROLE;
  PERFORM pg_temp.expect_error(format($q$UPDATE organizations SET lock_date = '2026-01-31' WHERE id = '%s'$q$, c.org), 'changed from Settings', 'setting the lock date directly');

  PERFORM pg_temp.sign_in(c.u_admin, 'as-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT set_lock_date(current_date + 1)$q$, 'up to today', 'locking the future');
  PERFORM set_lock_date('2026-01-31');
  RESET ROLE;
  ASSERT (SELECT lock_date FROM organizations WHERE id = c.org) = '2026-01-31', 'January is locked';
  RAISE NOTICE 'PASS only a paid Admin can lock, never directly and never into the future';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- the lock holds on every record type
DO $$
DECLARE c a_ctx; v uuid;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'as-editor@example.com');
  SET LOCAL ROLE authenticated;
  -- Money in: new, changed (into and out of the period), deleted
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"2026-01-15","lines":[{"amount":10,"category_id":"%s"}]}')$q$, c.cat_don),
    'locked period', 'new money in dated in January');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"id":"%s","tx_date":"2026-01-10","lines":[{"amount":501,"category_id":"%s"}]}')$q$, c.tx_jan, c.cat_don),
    'locked period', 'changing the January donation');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"id":"%s","tx_date":"2026-02-10","lines":[{"amount":500,"category_id":"%s"}]}')$q$, c.tx_jan, c.cat_don),
    'locked period', 'moving the January donation out of the period');
  PERFORM pg_temp.expect_error(format($q$SELECT delete_money_in('%s')$q$, c.tx_jan), 'locked period', 'deleting the January donation');
  -- February is open: a new entry, and changing it, are fine
  v := save_money_in(jsonb_build_object('tx_date', '2026-02-01', 'lines', jsonb_build_array(jsonb_build_object('amount', 45, 'category_id', c.cat_don))));
  PERFORM save_money_in(jsonb_build_object('id', v, 'tx_date', '2026-02-01', 'lines', jsonb_build_array(jsonb_build_object('amount', 40, 'category_id', c.cat_don))));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  RAISE NOTICE 'PASS money in: nothing in the locked period can be added, changed, moved out or deleted; the open period works';
END $$;
RESET ROLE;

DO $$
DECLARE c a_ctx; v uuid;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'as-editor@example.com');
  SET LOCAL ROLE authenticated;
  -- Invoices: new, changed, voided, deleted in the period refused; paying the old one after the lock works
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"2026-01-30","lines":[{"amount":5,"category_id":"%s"}]}')$q$, c.payee, c.cat_rent),
    'locked period', 'new invoice dated in January');
  PERFORM pg_temp.expect_error(format($q$SELECT void_invoice('%s', 'mistake')$q$, c.inv_jan), 'locked period', 'voiding the January invoice');
  PERFORM pg_temp.expect_error(format($q$SELECT delete_invoice('%s')$q$, c.inv_jan), 'Only a draft', 'deleting the January invoice (refused anyway)');
  RESET ROLE;
  PERFORM pg_temp.expect_error(format($q$DELETE FROM invoices WHERE id = '%s'$q$, c.inv_jan), 'locked period', 'deleting the January invoice directly');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":50,"tx_date":"2026-01-31"}')$q$, c.inv_jan),
    'locked period', 'a payment dated in January');
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', c.inv_jan, 'amount', 200, 'tx_date', '2026-02-05'));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT derived_status FROM invoice_summary WHERE id = c.inv_jan) = 'paid', 'the January invoice is paid in February';

  -- Fund transfers and asset entries
  PERFORM pg_temp.expect_error(format($q$SELECT save_fund_transfer('{"from_fund_id":"%s","to_fund_id":"%s","amount":5,"tx_date":"2026-01-29"}')$q$, c.fund_gen, c.fund_bld),
    'locked period', 'new transfer dated in January');
  PERFORM pg_temp.expect_error(format($q$SELECT delete_fund_transfer('%s')$q$, c.transfer_jan), 'locked period', 'deleting the January transfer');
  PERFORM pg_temp.expect_error(format($q$SELECT record_item_transaction('{"item_id":"%s","action":"return","amount":10,"tx_date":"2026-01-31"}')$q$, c.deposit),
    'locked period', 'an asset entry dated in January');
  PERFORM record_item_transaction(jsonb_build_object('item_id', c.deposit, 'action', 'return', 'amount', 10, 'tx_date', '2026-02-02'));
  PERFORM pg_temp.commit_checks();

  -- The opening position is frozen; a name is not
  PERFORM pg_temp.expect_error(format($q$SELECT save_item('{"id":"%s","name":"Rental deposit","kind":"other_asset","opening_balance":150}')$q$, c.deposit),
    'opening position is in a locked period', 'changing an opening item value');
  PERFORM save_item(jsonb_build_object('id', c.deposit, 'name', 'Hall deposit', 'kind', 'other_asset', 'opening_balance', 100));
  RESET ROLE;
  PERFORM pg_temp.expect_error(format($q$UPDATE accounts SET opening_balance = 1 WHERE id = '%s'$q$, c.acct_main), 'Opening balances are in a locked period', 'changing an account opening balance');
  PERFORM pg_temp.expect_error(format($q$UPDATE funds SET opening_balance = 1 WHERE id = '%s'$q$, c.fund_bld), 'Opening balances are in a locked period', 'changing a fund opening balance');
  PERFORM pg_temp.sign_in(c.u_admin, 'as-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT save_opening_position('{"start_date":"2025-12-01"}')$q$, 'start date is in a locked period', 'moving the start date');
  PERFORM save_opening_position('{"start_date":"2026-01-01","complete":true}');  -- same date: allowed
  RESET ROLE;
  RAISE NOTICE 'PASS the lock refuses new, changed, moved and deleted money in, invoices, payments, transfers, asset entries and the opening position; paying an old invoice later works';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- uploaded documents
DO $$
DECLARE c a_ctx; v uuid;
BEGIN
  SELECT * INTO c FROM a_ctx;
  -- Paying the January bill in February: its invoice is untouched, the payment is new
  UPDATE documents SET status = 'paid', paid_date = '2026-02-10' WHERE id = c.doc_bill;
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT total FROM transactions WHERE document_id = c.doc_bill AND tx_type = 'money_out') = 300, 'the January bill is paid in February';
  -- Saving it again with nothing changed is harmless
  UPDATE documents SET remarks = remarks WHERE id = c.doc_bill;
  PERFORM pg_temp.commit_checks();
  -- Changing what it is worth, or a new bill dated in January, is refused
  PERFORM pg_temp.expect_error(format($q$UPDATE documents SET amount = 350 WHERE id = '%s'$q$, c.doc_bill), 'locked period', 'changing the amount of the January bill');
  PERFORM pg_temp.expect_error(format($q$UPDATE documents SET paid_date = '2026-01-30' WHERE id = '%s'$q$, c.doc_bill), 'locked period', 'backdating its payment into January');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
    VALUES ('%s', 'Shop', 'paid', 'receipt', 12, '2026-01-05', '2026-01-05', '%s', '%s')$q$, c.org, c.fund_gen, c.cat_rent), 'locked period', 'a receipt dated in January');
  -- A document that feeds nothing (still being reviewed) can be added
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date)
  VALUES (c.org, 'Shop', 'needs_review', 'receipt', 12, '2026-01-05');
  PERFORM pg_temp.commit_checks();
  RAISE NOTICE 'PASS documents: the lock reaches what they feed into, paying an old bill later works, a no-op save is harmless';
END $$;

-- ---------------------------------------------------------------- reconciliations
DO $$
DECLARE c a_ctx; r record;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'as-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_reconciliation('{"account_id":"%s","period_end":"2026-01-31","statement_balance":1450}')$q$, c.acct_main),
    'locked period', 'reconciling a locked month');
  PERFORM pg_temp.expect_error(format($q$SELECT save_reconciliation('{"account_id":"%s","period_end":"2026-02-27","statement_balance":1}')$q$, c.acct_main),
    'last day of a month', 'a date that is not a month-end');
  PERFORM pg_temp.expect_error(format($q$SELECT save_reconciliation('{"account_id":"%s","period_end":"2026-02-28","statement_balance":1.001}')$q$, c.acct_main),
    'two decimals', 'three decimals');
  -- Main account at 28 Feb: 1,000 + 500 + 40 - 200 - 300 + 10 deposit back = 1,050
  PERFORM save_reconciliation(jsonb_build_object('account_id', c.acct_main, 'period_end', '2026-02-28', 'statement_balance', 1045));
  SELECT * INTO r FROM reconciliation_status(c.org, '2026-02-28') WHERE account_id = c.acct_main;
  PERFORM pg_temp.eq(r.outlayd_balance, 1050, 'Outlayd balance at 28 Feb');
  PERFORM pg_temp.eq(r.difference, -5, 'difference = statement - Outlayd');
  PERFORM save_reconciliation(jsonb_build_object('account_id', c.acct_main, 'period_end', '2026-02-28', 'statement_balance', 1045, 'note', 'Bank fee not yet entered'));
  ASSERT (SELECT count(*) FROM reconciliations WHERE organization_id = c.org) = 1, 'saving again updates the same month-end';
  RESET ROLE;

  -- Prefilled from an uploaded bank statement ending that day
  INSERT INTO bank_statements (organization_id, file_url, file_hash, status, period_start, period_end, closing_balance)
  VALUES (c.org, c.org || '/statements/feb.pdf', 'h-feb', 'ready', '2026-02-01', '2026-02-28', 1045);
  PERFORM pg_temp.eq((SELECT suggested_balance FROM reconciliation_status(c.org, '2026-02-28') WHERE account_id = c.acct_main), 1045, 'suggested from the bank statement');

  PERFORM pg_temp.sign_in(c.u_viewer, 'as-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_reconciliation('{"account_id":"%s","period_end":"2026-02-28","statement_balance":1}')$q$, c.acct_main),
    'Only Admins and Editors', 'a Viewer reconciling');
  ASSERT (SELECT count(*) FROM reconciliations) = 1, 'a Viewer can read reconciliations';
  PERFORM pg_temp.expect_error(format($q$INSERT INTO reconciliations (organization_id, account_id, period_end, statement_balance) VALUES ('%s', '%s', '2026-03-31', 1)$q$, c.org, c.acct_main),
    'permission denied', 'writing a reconciliation directly');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_free, 'as-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_reconciliation('{"account_id":"%s","period_end":"2026-02-28","statement_balance":1}')$q$,
    (SELECT id FROM accounts WHERE organization_id = (SELECT org_free FROM a_ctx) AND is_default)), 'Growth and Nonprofit', 'a free organisation reconciling');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_other, 'as-other@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM reconciliations) = 0, 'another organisation sees no reconciliations';
  PERFORM pg_temp.expect_error(format($q$SELECT save_reconciliation('{"account_id":"%s","period_end":"2026-02-28","statement_balance":1}')$q$, c.acct_main),
    'not found', 'another organisation reconciling our account');
  RESET ROLE;
  RAISE NOTICE 'PASS reconciliations: difference worked out, one per month-end, prefilled from a bank statement, locked months, roles, plans and organisations';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- unlocking
DO $$
DECLARE c a_ctx;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'as-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT set_lock_date('2026-01-15')$q$, 'reason', 'unlocking without a reason');
  PERFORM pg_temp.expect_error($q$SELECT set_lock_date(NULL, '  ')$q$, 'reason', 'removing the lock with a blank reason');
  PERFORM set_lock_date('2025-12-31', 'Treasurer found a missing donation');
  RESET ROLE;

  -- January is open again, the opening position is still frozen (the lock is the day before the start)
  PERFORM pg_temp.sign_in(c.u_editor, 'as-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-01-15', 'lines', jsonb_build_array(jsonb_build_object('amount', 25, 'category_id', c.cat_don))));
  PERFORM pg_temp.expect_error(format($q$SELECT save_item('{"id":"%s","name":"Hall deposit","kind":"other_asset","opening_balance":150}')$q$, c.deposit),
    'opening position is in a locked period', 'opening still frozen');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_admin, 'as-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM set_lock_date(NULL, 'Correcting the opening deposit');
  PERFORM save_item(jsonb_build_object('id', c.deposit, 'name', 'Hall deposit', 'kind', 'other_asset', 'opening_balance', 150));
  PERFORM set_lock_date('2026-01-31');
  RESET ROLE;
  PERFORM pg_temp.commit_checks();
  RAISE NOTICE 'PASS unlocking needs a reason; January opens, the opening position opens only when the lock is removed';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- the change history
DO $$
DECLARE c a_ctx; r record;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'as-viewer@example.com');
  SET LOCAL ROLE authenticated;
  -- Who created the January donation
  SELECT * INTO r FROM audit_events WHERE entity = 'transactions' AND entity_id = c.tx_jan AND action = 'insert';
  ASSERT r.actor_email = 'as-admin@example.com' AND r.actor_id = c.u_admin, 'the donation was recorded by the Admin';
  ASSERT (r.after ->> 'total')::numeric = 500, 'with its values';
  ASSERT EXISTS (SELECT 1 FROM audit_events WHERE entity = 'transaction_lines' AND parent_id = c.tx_jan), 'its lines are in the history, under the entry';
  -- The deposit change: before and after
  SELECT * INTO r FROM audit_events WHERE entity = 'items' AND entity_id = c.deposit AND action = 'update'
    AND (before ->> 'opening_balance')::numeric = 100 AND (after ->> 'opening_balance')::numeric = 150;
  ASSERT FOUND AND r.actor_email = 'as-admin@example.com', 'the opening deposit change, with before and after';
  ASSERT EXISTS (SELECT 1 FROM audit_events WHERE entity = 'items' AND entity_id = c.deposit AND before ->> 'name' = 'Rental deposit' AND after ->> 'name' = 'Hall deposit'),
    'the rename is recorded';
  -- The lock changes, with reasons
  ASSERT (SELECT count(*) FROM audit_events WHERE entity = 'organizations' AND entity_id = c.org AND before ->> 'lock_date' IS DISTINCT FROM after ->> 'lock_date') = 4,
    'four lock changes';
  ASSERT EXISTS (SELECT 1 FROM audit_events WHERE entity = 'organizations' AND reason = 'Treasurer found a missing donation'
                 AND before ->> 'lock_date' = '2026-01-31' AND after ->> 'lock_date' = '2025-12-31'), 'the unlock and its reason';
  -- Invoices and payments by people are recorded; the bill mirror is not repeated
  ASSERT EXISTS (SELECT 1 FROM audit_events WHERE entity = 'invoices' AND entity_id = c.inv_jan AND action = 'insert'), 'the invoice';
  ASSERT EXISTS (SELECT 1 FROM audit_events WHERE entity = 'invoice_lines' AND parent_id = c.inv_jan), 'its lines';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_events WHERE entity = 'invoices' AND entity_id = (SELECT id FROM invoices WHERE document_id = c.doc_bill)), 'the bill mirror is not repeated';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_events a JOIN transactions t ON t.id = a.entity_id WHERE t.document_id IS NOT NULL), 'nor its payment';
  ASSERT EXISTS (SELECT 1 FROM audit_events WHERE entity = 'transactions' AND entity_id = c.transfer_jan), 'the fund transfer';
  -- Nobody can write or change history
  PERFORM pg_temp.expect_error(format($q$INSERT INTO audit_events (organization_id, entity, entity_id, action) VALUES ('%s', 'x', '%s', 'insert')$q$, c.org, c.org),
    'permission denied', 'writing history');
  PERFORM pg_temp.expect_error($q$DELETE FROM audit_events$q$, 'permission denied', 'deleting history');
  PERFORM pg_temp.expect_error($q$UPDATE audit_events SET reason = 'x'$q$, 'permission denied', 'changing history');
  RESET ROLE;

  -- Readable on the free plan too, and never across organisations
  PERFORM pg_temp.sign_in(c.u_free, 'as-free@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM audit_events) = 0, 'another organisation (free) sees none of it';
  RESET ROLE;
  INSERT INTO audit_events (organization_id, entity, entity_id, action) VALUES (c.org_free, 'transactions', c.org_free, 'insert');
  PERFORM pg_temp.sign_in(c.u_free, 'as-free@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM audit_events) = 1, 'a free organisation reads its own history';
  RESET ROLE;
  RAISE NOTICE 'PASS history: who, when, before and after, reasons; lines under their entry; mirror not repeated; read-only; per organisation';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- integrity checks
DO $$
DECLARE c a_ctx; v uuid;
BEGIN
  SELECT * INTO c FROM a_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'as-viewer@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM integrity_checks(c.org, '2026-02-01', '2026-02-28')) = 9, 'nine checks (the ninth, receipts missing, from the invoices and AI plan step 9)';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'uncategorised'), 'nothing Uncategorised';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'lines_balanced'), 'lines add up';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'opening_complete'), 'opening complete';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'balance_check'), 'balance check';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'prior_year'), 'last closing = this opening';
  ASSERT pg_temp.check_passed(c.org, '2026-01-01', '2026-01-31', 'prior_year') IS NULL, 'a period that starts at the opening position does not apply';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'invoices'), 'no overpaid invoice';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'reconciled'), 'reconciled at 28 Feb, the difference explained';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'restricted_negative'), 'Building Fund not below zero';
  ASSERT NOT pg_temp.check_passed(c.org, '2026-01-01', '2026-01-31', 'reconciled'), 'not reconciled at 31 Jan';
  ASSERT (SELECT severity FROM integrity_checks(c.org, '2026-01-01', '2026-01-31') WHERE code = 'reconciled') = 'warning', 'reconciling is a warning';
  RESET ROLE;

  -- Now break things on purpose, one at a time
  PERFORM pg_temp.sign_in(c.u_editor, 'as-editor@example.com');
  SET LOCAL ROLE authenticated;
  v := save_money_in(jsonb_build_object('tx_date', '2026-02-12', 'lines', jsonb_build_array(jsonb_build_object('amount', 7, 'category_id', c.cat_unc))));
  PERFORM pg_temp.commit_checks();
  ASSERT NOT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'uncategorised'), 'an Uncategorised line fails';
  ASSERT (SELECT detail FROM integrity_checks(c.org, '2026-02-01', '2026-02-28') WHERE code = 'uncategorised') = '1 line(s) still Uncategorised', 'and says how many';
  PERFORM save_money_in(jsonb_build_object('id', v, 'tx_date', '2026-02-12', 'lines', jsonb_build_array(jsonb_build_object('amount', 7, 'category_id', c.cat_don))));
  PERFORM pg_temp.commit_checks();
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'uncategorised'), 'and passes once categorised';

  PERFORM save_reconciliation(jsonb_build_object('account_id', c.acct_main, 'period_end', '2026-02-28', 'statement_balance', 1045));
  ASSERT NOT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'reconciled'), 'a difference without a note fails';
  RESET ROLE;

  -- Spending more than the Building Fund holds (50 in, 80 out)
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (c.org, 'Builder', 'paid', 'receipt', 80, '2026-02-15', '2026-02-15', c.fund_bld, c.cat_rent);
  PERFORM pg_temp.commit_checks();
  ASSERT NOT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'restricted_negative'), 'a restricted fund below zero is flagged';
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'balance_check'), 'the balance check still holds';

  -- Damage that the app never allows, made directly and rolled back, to prove the checks see it
  BEGIN
    PERFORM set_config('app.bypass_lock', 'on', true);
    UPDATE transactions SET total = total + 1 WHERE id = v;
    ASSERT NOT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'lines_balanced'), 'an entry that does not add up fails';
    UPDATE invoices SET total = 150 WHERE id = c.inv_jan;
    ASSERT NOT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'invoices'), 'an overpaid invoice fails';
    UPDATE organizations SET opening_position_completed_at = NULL WHERE id = c.org;
    ASSERT NOT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'opening_complete'), 'an incomplete opening position fails';
    ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'balance_check') IS NULL, 'and the balance check waits for it';
    RAISE EXCEPTION 'undo the damage';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'undo the damage' THEN RAISE; END IF;
  END;
  PERFORM set_config('app.bypass_lock', 'off', true);
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'lines_balanced') AND pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'invoices'),
    'back to normal';

  PERFORM pg_temp.sign_in(c.u_other, 'as-other@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT pg_temp.check_passed(c.org, '2026-02-01', '2026-02-28', 'opening_complete') IS NOT TRUE, 'another organisation learns nothing about ours';
  RESET ROLE;
  RAISE NOTICE 'PASS integrity checks: each passes on good books and fails when broken on purpose; warnings vs blocks';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- stage 6b: attachments, messages, grouped history
DO $$
DECLARE c a_ctx; r record; n integer;
BEGIN
  SELECT * INTO c FROM a_ctx;
  -- An attached file can be added to a locked entry; its figures still cannot change
  UPDATE transactions SET attachment_url = c.org || '/transactions/proof.pdf' WHERE id = c.tx_jan;
  PERFORM pg_temp.expect_error(format($q$UPDATE transactions SET remarks = 'x' WHERE id = '%s'$q$, c.tx_jan), 'which is in a locked period (up to 31 Jan 2026)', 'the message writes dates in words');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_viewer, 'as-viewer@example.com');
  SET LOCAL ROLE authenticated;
  -- The January donation: header and lines come back as one change
  SELECT * INTO r FROM audit_changes(c.org, NULL, NULL, NULL, c.tx_jan) WHERE action = 'insert';
  ASSERT r.kind = 'money' AND r.root_entity = 'transactions' AND r.actor_email = 'as-admin@example.com', 'one row for the new donation';
  ASSERT jsonb_array_length(r.lines_after) = 1 AND (r.lines_after -> 0 ->> 'amount')::numeric = 500, 'with its line';
  ASSERT (SELECT count(*) FROM audit_changes(c.org, NULL, NULL, NULL, c.tx_jan) WHERE action = 'update' AND (after ->> 'attachment_url') IS NOT NULL) = 1, 'the attachment is in the history';
  -- Filters
  -- (inside this one test transaction every change has the same time, so the lock changes group together)
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['settings']) WHERE root_entity = 'organizations'), 'the lock changes are settings';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['settings']) WHERE kind <> 'settings'), 'only settings';
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['assets']) WHERE root_id = c.deposit), 'the deposit is an asset';
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['assets']) WHERE root_entity = 'transactions'), 'so are its entries';
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['transfers']) WHERE root_id = c.transfer_jan), 'the fund transfer';
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['reconciliations'])), 'reconciliations';
  ASSERT EXISTS (SELECT 1 FROM audit_changes(c.org, ARRAY['invoices'], NULL, NULL, c.inv_jan)), 'the invoice history';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_changes(c.org, NULL, current_date + 1, NULL)), 'nothing after today';
  SELECT total_count INTO n FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 2, 0) LIMIT 1;
  ASSERT n > 2 AND (SELECT count(*) FROM audit_changes(c.org, NULL, NULL, NULL, NULL, 2, 0)) = 2, 'pages, with the full count';
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_other, 'as-other@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT NOT EXISTS (SELECT 1 FROM audit_changes(c.org)), 'another organisation reads none of it';
  RESET ROLE;
  RAISE NOTICE 'PASS 6b: attachments on locked entries, dates in words, history grouped by change with filters and pages';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- deleting an organisation with a lock
DO $$
DECLARE c a_ctx;
BEGIN
  SELECT * INTO c FROM a_ctx;
  ASSERT (SELECT count(*) FROM accounting_parity_check(c.org)) = 0, 'documents parity unaffected';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM delete_organization_data(c.org);
  PERFORM pg_temp.commit_checks();
  ASSERT NOT EXISTS (SELECT 1 FROM transactions WHERE organization_id = c.org), 'everything is gone, locked or not';
  ASSERT NOT EXISTS (SELECT 1 FROM audit_events WHERE organization_id = c.org), 'with its history';
  ASSERT NOT EXISTS (SELECT 1 FROM reconciliations WHERE organization_id = c.org), 'and reconciliations';
  ASSERT COALESCE(current_setting('app.bypass_lock', true), '') <> 'on', 'the bypass is switched off again';
  RAISE NOTICE 'PASS deleting a locked organisation works and leaves the lock bypass off';
END $$;

ROLLBACK;
