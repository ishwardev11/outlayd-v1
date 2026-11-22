-- Automated test for the balance sheet (Phase 4, stage 5a). Run on a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/balance_sheet.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- The scenario, worked out by hand (start date 1 January 2026):
--   Opening: Main account 10,000, cash box 500; owed to us 800 (invoice of 10 Dec 2025); we owe 300
--   (bill of 20 Dec 2025); van bought Jan 2024, cost 60,000, depreciated 24,000, 60-month life;
--   deposit 1,500; loan 20,000. Net assets 28,500. Building Fund 3,000, so the General Fund is 25,500.
--   A donation of 999 dated 31 Dec 2025 is before the start date and must not move any balance.
--   2026: 1 Jan printer 1,000 (3 months: 333.33 / 333.34 / 333.33); 10 Jan donation 2,000;
--   1 Feb laptop 3,600 on the Building Fund (36 months, 100 a month); 5 Mar rent bill 500, 200 paid
--   20 Mar; 15 Mar the 800 owed to us is received; 1 Apr loan repayment 1,000; 10 Apr transfer 500
--   General -> Building; 30 Jun laptop sold for 2,500 (4 months charged = 400, net book value 3,200,
--   loss 700).
--   30 June: funds General 19,500 + Building 2,400 = 21,900 = net assets.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE b_ctx (org uuid, org_free uuid, org_other uuid, fund_gen uuid, fund_bld uuid,
                         cat_rent uuid, cat_fees uuid, cat_don uuid, payee uuid, acct_main uuid, acct_box uuid,
                         u_admin uuid, u_editor uuid, u_viewer uuid, u_free uuid, u_other uuid,
                         van uuid, deposit uuid, loan uuid, laptop uuid, printer uuid, inv_rec uuid, inv_pay uuid);
GRANT ALL ON b_ctx TO authenticated;

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
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.commit_checks() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.eq(numeric, numeric, text) TO authenticated;

-- ---------------------------------------------------------------- setup (as the server)
DO $$
DECLARE o uuid; o_free uuid; o_other uuid; fg uuid; fb uuid; cr uuid; cf uuid; cd uuid; p uuid; am uuid; ab uuid;
        ua uuid; ue uuid; uv uuid; uf uuid; uo uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Balance Society', 'pro', 'growth') RETURNING id INTO o;
  INSERT INTO organizations (name) VALUES ('Free Balance Society') RETURNING id INTO o_free;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Other Balance Society', 'pro', 'growth') RETURNING id INTO o_other;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bs-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bs-editor@example.com') RETURNING id INTO ue;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bs-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bs-free@example.com') RETURNING id INTO uf;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bs-other@example.com') RETURNING id INTO uo;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (o, 'bs-admin@example.com', 'Admin'), (o, 'bs-editor@example.com', 'Editor'), (o, 'bs-viewer@example.com', 'Viewer'),
    (o_free, 'bs-free@example.com', 'Admin'), (o_other, 'bs-other@example.com', 'Admin');

  SELECT id INTO fg FROM funds WHERE organization_id = o AND is_default;
  INSERT INTO funds (organization_id, name, fund_type, opening_balance) VALUES (o, 'Building Fund', 'restricted', 3000) RETURNING id INTO fb;
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (o, 'Rent', 'expense', 'Administration') RETURNING id INTO cr;
  SELECT id INTO cf FROM categories WHERE organization_id = o AND name = 'Programme and course fees';
  SELECT id INTO cd FROM categories WHERE organization_id = o AND name = 'General donations';
  INSERT INTO vendors (organization_id, name) VALUES (o, 'Dewan Komuniti') RETURNING id INTO p;
  UPDATE accounts SET opening_balance = 10000 WHERE organization_id = o AND is_default RETURNING id INTO am;
  INSERT INTO accounts (organization_id, name, account_type, opening_balance) VALUES (o, 'Cash box', 'cash', 500) RETURNING id INTO ab;

  INSERT INTO b_ctx (org, org_free, org_other, fund_gen, fund_bld, cat_rent, cat_fees, cat_don, payee, acct_main, acct_box,
                     u_admin, u_editor, u_viewer, u_free, u_other)
  VALUES (o, o_free, o_other, fg, fb, cr, cf, cd, p, am, ab, ua, ue, uv, uf, uo);
END $$;

-- ---------------------------------------------------------------- opening position
DO $$
DECLARE c b_ctx; v uuid;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'bs-editor@example.com');
  SET LOCAL ROLE authenticated;
  -- Before the start date: an unpaid invoice we issued, an unpaid bill, and a donation
  v := save_invoice(jsonb_build_object('direction', 'receivable', 'payee_id', c.payee, 'issue_date', '2025-12-10',
         'lines', jsonb_build_array(jsonb_build_object('amount', 800, 'category_id', c.cat_fees))));
  UPDATE b_ctx SET inv_rec = v;
  v := save_invoice(jsonb_build_object('direction', 'payable', 'payee_id', c.payee, 'issue_date', '2025-12-20',
         'lines', jsonb_build_array(jsonb_build_object('amount', 300, 'category_id', c.cat_rent))));
  PERFORM save_money_in(jsonb_build_object('tx_date', '2025-12-31', 'lines', jsonb_build_array(jsonb_build_object('amount', 999, 'category_id', c.cat_don))));
  PERFORM pg_temp.commit_checks();
  PERFORM pg_temp.expect_error($q$SELECT save_opening_position('{"start_date":"2026-01-01"}')$q$, 'Only Admins', 'an Editor setting the start date');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_admin, 'bs-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT save_opening_position('{"start_date":"2026-01-15"}')$q$, 'first day of a month', 'a start date mid-month');
  PERFORM save_opening_position('{"start_date":"2026-01-01","complete":true}');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_editor, 'bs-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_item('{"name":"Old van","kind":"fixed_asset","fund_id":"%s","acquired_date":"2024-01-15","useful_life_months":60}')$q$, c.fund_gen),
    'enter its cost and depreciation to date', 'an asset owned before the start with no cost');
  UPDATE b_ctx SET van = save_item(jsonb_build_object('name', 'Van', 'kind', 'fixed_asset', 'fund_id', c.fund_gen, 'acquired_date', '2024-01-15',
    'opening_cost', 60000, 'opening_accumulated_depreciation', 24000, 'useful_life_months', 60));
  UPDATE b_ctx SET deposit = save_item(jsonb_build_object('name', 'Rental deposit', 'kind', 'other_asset', 'classification', 'current', 'opening_balance', 1500));
  UPDATE b_ctx SET loan = save_item(jsonb_build_object('name', 'Bank loan', 'kind', 'liability', 'classification', 'non_current', 'opening_balance', 20000));
  PERFORM pg_temp.expect_error($q$SELECT save_item('{"name":"Bank loan","kind":"liability","opening_balance":1}')$q$, 'already exists', 'a duplicate name');
  RESET ROLE;

  PERFORM pg_temp.eq(opening_net_assets(c.org), 28500, 'opening net assets 10,500 + 800 + 1,500 + 36,000 - 300 - 20,000');
  PERFORM pg_temp.eq((SELECT opening FROM fund_openings(c.org) WHERE fund_id = c.fund_gen), 25500, 'General Fund is the balancing figure');
  PERFORM pg_temp.eq((SELECT opening FROM fund_openings(c.org) WHERE fund_id = c.fund_bld), 3000, 'Building Fund as entered');
  PERFORM pg_temp.eq((SELECT difference FROM balance_check(c.org, '2026-01-01')), 0, 'balances on day one');
  PERFORM pg_temp.eq((SELECT opening FROM cash_position(c.org, '2026-01-01', '2026-01-31')), 10500, 'the 999 before the start date does not move cash');
  RAISE NOTICE 'PASS opening position: start date, opening items, General Fund as the balancing figure, balanced on day one';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- the year's events
DO $$
DECLARE c b_ctx; v uuid; v_pay uuid;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'bs-editor@example.com');
  SET LOCAL ROLE authenticated;

  UPDATE b_ctx SET printer = save_item(jsonb_build_object('name', 'Printer', 'kind', 'fixed_asset', 'acquired_date', '2026-01-01', 'useful_life_months', 3));
  SELECT * INTO c FROM b_ctx;
  PERFORM record_item_transaction(jsonb_build_object('item_id', c.printer, 'action', 'purchase', 'amount', 1000, 'tx_date', '2026-01-01'));
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-01-10', 'lines', jsonb_build_array(jsonb_build_object('amount', 2000, 'category_id', c.cat_don))));

  UPDATE b_ctx SET laptop = save_item(jsonb_build_object('name', 'Laptop', 'kind', 'fixed_asset', 'fund_id', c.fund_bld, 'acquired_date', '2026-02-01', 'useful_life_months', 36));
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.expect_error(format($q$SELECT record_item_transaction('{"item_id":"%s","action":"purchase","amount":3600,"tx_date":"2026-02-02"}')$q$, c.laptop),
    'acquired date', 'a purchase on another date');
  PERFORM record_item_transaction(jsonb_build_object('item_id', c.laptop, 'action', 'purchase', 'amount', 3600, 'tx_date', '2026-02-01'));
  PERFORM pg_temp.expect_error(format($q$SELECT record_item_transaction('{"item_id":"%s","action":"purchase","amount":10,"tx_date":"2026-02-01"}')$q$, c.laptop),
    'already recorded', 'a second purchase');

  v := save_invoice(jsonb_build_object('direction', 'payable', 'payee_id', c.payee, 'issue_date', '2026-03-05',
         'lines', jsonb_build_array(jsonb_build_object('amount', 500, 'category_id', c.cat_rent))));
  PERFORM pg_temp.commit_checks();
  UPDATE b_ctx SET inv_pay = v;
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', v, 'amount', 200, 'tx_date', '2026-03-20'));
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', c.inv_rec, 'amount', 800, 'tx_date', '2026-03-15'));

  PERFORM pg_temp.expect_error(format($q$SELECT record_item_transaction('{"item_id":"%s","action":"repay","amount":1000,"tx_date":"2025-12-15"}')$q$, c.loan),
    'before your tracking start date', 'an item entry before the start date');
  PERFORM pg_temp.expect_error(format($q$SELECT record_item_transaction('{"item_id":"%s","action":"repay","amount":20000.01,"tx_date":"2026-04-01"}')$q$, c.loan),
    'more than the balance', 'repaying more than is owed');
  PERFORM pg_temp.expect_error(format($q$SELECT record_item_transaction('{"item_id":"%s","action":"receive","amount":10,"tx_date":"2026-04-01"}')$q$, c.van),
    'does not apply', 'a loan action on a fixed asset');
  PERFORM record_item_transaction(jsonb_build_object('item_id', c.loan, 'action', 'repay', 'amount', 1000, 'tx_date', '2026-04-01', 'reference', 'LOAN-APR'));
  PERFORM save_fund_transfer(jsonb_build_object('from_fund_id', c.fund_gen, 'to_fund_id', c.fund_bld, 'amount', 500, 'tx_date', '2026-04-10', 'remarks', 'Top up'));
  PERFORM dispose_item(jsonb_build_object('item_id', c.laptop, 'disposed_date', '2026-06-30', 'proceeds', 2500));
  PERFORM pg_temp.commit_checks();
  RAISE NOTICE 'PASS the year''s events are recorded, and bad item entries are refused';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- depreciation, disposal and Income & Expenditure
DO $$
DECLARE c b_ctx;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'bs-viewer@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT array_agg(amount ORDER BY month) FROM fixed_asset_charges(c.org) WHERE item_id = c.printer) = ARRAY[333.33, 333.34, 333.33]::numeric[],
    'printer: three months in whole cents adding up to the cost';
  PERFORM pg_temp.eq((SELECT sum(amount) FROM fixed_asset_charges(c.org) WHERE item_id = c.van AND month BETWEEN '2026-01-01' AND '2026-06-30'), 6000,
    'van: (36,000 left) / 36 remaining months = 1,000 a month');
  PERFORM pg_temp.eq((SELECT count(*) FROM fixed_asset_charges(c.org) WHERE item_id = c.van), 36, 'van: 36 months left from the start date');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM fixed_asset_charges(c.org) WHERE item_id = c.laptop), 400, 'laptop: Feb to May, nothing in the month of sale');
  PERFORM pg_temp.eq((SELECT loss FROM disposal_results(c.org) WHERE item_id = c.laptop), 700, 'laptop: 3,200 book value - 2,500 proceeds = 700 loss');

  -- Income & Expenditure, Jan to Jun: income 2,000; rent 500 + depreciation 7,400 + loss 700 = 8,600
  PERFORM pg_temp.eq((SELECT sum(amount) FROM income_expenditure(c.org, '2026-01-01', '2026-06-30') WHERE kind = 'income'), 2000, 'income');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM income_expenditure(c.org, '2026-01-01', '2026-06-30') WHERE kind = 'expense'), 8600, 'expenditure');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM income_expenditure(c.org, '2026-01-01', '2026-06-30') WHERE category_name = 'Depreciation'), 7400, 'depreciation');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM income_expenditure(c.org, '2026-01-01', '2026-06-30', c.fund_bld)), 1100, 'Building Fund: laptop depreciation 400 + loss 700');
  PERFORM pg_temp.eq((SELECT count(*) FROM income_expenditure(c.org, '2026-04-01', '2026-04-30') WHERE category_name NOT IN ('Depreciation')), 0,
    'April: the loan repayment and the transfer are not income or expenditure');
  RAISE NOTICE 'PASS depreciation (whole cents, from the start date, stops at disposal), disposal loss and Income & Expenditure, worked by hand';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- funds, balance sheet and R5 at every month-end
DO $$
DECLARE c b_ctx; m integer; d date; r record;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'bs-viewer@example.com');
  SET LOCAL ROLE authenticated;

  SELECT * INTO r FROM changes_in_funds(c.org, '2026-01-01', '2026-06-30') WHERE fund_id = c.fund_gen;
  PERFORM pg_temp.eq(r.opening, 25500, 'General opening');
  PERFORM pg_temp.eq(r.income, 2000, 'General income');
  PERFORM pg_temp.eq(r.expense, 7500, 'General expenditure: rent 500 + van 6,000 + printer 1,000');
  PERFORM pg_temp.eq(r.transfers_out, 500, 'General transfer out');
  PERFORM pg_temp.eq(r.closing, 19500, 'General closing');
  SELECT * INTO r FROM changes_in_funds(c.org, '2026-01-01', '2026-06-30') WHERE fund_id = c.fund_bld;
  PERFORM pg_temp.eq(r.closing, 2400, 'Building closing: 3,000 + 500 - 400 - 700');
  -- A later period starts where the earlier one ended
  PERFORM pg_temp.eq((SELECT opening FROM changes_in_funds(c.org, '2026-04-01', '2026-06-30') WHERE fund_id = c.fund_gen),
                     (SELECT closing FROM changes_in_funds(c.org, '2026-01-01', '2026-03-31') WHERE fund_id = c.fund_gen), 'periods join up');

  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE section = 'cash' AND ref_id = c.acct_main), 9500, 'Main account');
  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE section = 'cash' AND ref_id = c.acct_box), 500, 'cash box');
  PERFORM pg_temp.eq((SELECT COALESCE(sum(amount), 0) FROM balance_sheet(c.org, '2026-06-30') WHERE section = 'receivables'), 0, 'nothing owed to us');
  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE section = 'payables'), 600, 'we owe 300 + 300');
  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE ref_id = c.van), 30000, 'van book value');
  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE ref_id = c.printer), 0, 'printer fully depreciated');
  PERFORM pg_temp.eq((SELECT count(*) FROM balance_sheet(c.org, '2026-06-30') WHERE ref_id = c.laptop), 0, 'laptop sold, not listed');
  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE ref_id = c.deposit AND section = 'other_current_assets'), 1500, 'deposit');
  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE ref_id = c.loan AND section = 'non_current_liabilities'), 19000, 'loan');
  PERFORM pg_temp.eq((SELECT net_assets FROM balance_check(c.org, '2026-06-30')), 21900, 'net assets');
  PERFORM pg_temp.eq((SELECT funds_total FROM balance_check(c.org, '2026-06-30')), 21900, 'funds');

  FOR m IN 1..12 LOOP
    d := (make_date(2026, m, 1) + interval '1 month - 1 day')::date;
    PERFORM pg_temp.eq((SELECT difference FROM balance_check(c.org, d)), 0, format('R5 at %s', d));
  END LOOP;
  RAISE NOTICE 'PASS Changes in Funds, the balance sheet, and the balance check at every month-end of 2026, worked by hand';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- Receipts & Payments and the schedule
DO $$
DECLARE c b_ctx; cp record; s record;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'bs-viewer@example.com');
  SET LOCAL ROLE authenticated;
  -- Receipts: donation 2,000 + invoice 800 + laptop sale 2,500. Payments: printer 1,000 + laptop 3,600 + rent 200 + loan 1,000.
  PERFORM pg_temp.eq((SELECT sum(amount) FROM receipts_payments(c.org, '2026-01-01', '2026-06-30') WHERE section = 'receipts'), 5300, 'receipts');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM receipts_payments(c.org, '2026-01-01', '2026-06-30') WHERE section = 'payments'), 5800, 'payments');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM receipts_payments(c.org, '2026-01-01', '2026-06-30') WHERE group_name = 'Loan repayments'), 1000, 'loan repayment line');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM receipts_payments(c.org, '2026-01-01', '2026-06-30') WHERE group_name = 'Sale of fixed assets'), 2500, 'sale proceeds line');
  SELECT * INTO cp FROM cash_position(c.org, '2026-01-01', '2026-06-30');
  PERFORM pg_temp.eq(cp.opening, 10500, 'opening cash');
  PERFORM pg_temp.eq(cp.closing, 10000, 'closing cash = 10,500 + 5,300 - 5,800');

  SELECT * INTO s FROM fixed_asset_schedule(c.org, '2026-01-01', '2026-06-30') WHERE item_id = c.van;
  PERFORM pg_temp.eq(s.cost_open, 60000, 'van cost brought forward');
  PERFORM pg_temp.eq(s.dep_open, 24000, 'van depreciation brought forward');
  PERFORM pg_temp.eq(s.dep_charge, 6000, 'van charge');
  PERFORM pg_temp.eq(s.nbv_close, 30000, 'van carried forward');
  SELECT * INTO s FROM fixed_asset_schedule(c.org, '2026-01-01', '2026-06-30') WHERE item_id = c.laptop;
  PERFORM pg_temp.eq(s.additions, 3600, 'laptop addition');
  PERFORM pg_temp.eq(s.disposals_cost, 3600, 'laptop disposal at cost');
  PERFORM pg_temp.eq(s.dep_disposals, 400, 'laptop depreciation removed on disposal');
  PERFORM pg_temp.eq(s.cost_close, 0, 'laptop gone');
  RAISE NOTICE 'PASS Receipts & Payments include asset and loan cash and agree to the accounts; fixed asset schedule';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- refusals and protection
DO $$
DECLARE c b_ctx; v_tx uuid; n integer;
BEGIN
  SELECT * INTO c FROM b_ctx;
  SELECT t.id INTO v_tx FROM transactions t JOIN transaction_lines l ON l.transaction_id = t.id WHERE l.item_id = c.laptop AND t.tx_type = 'money_in';

  PERFORM pg_temp.sign_in(c.u_editor, 'bs-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT delete_money_in('%s')$q$, v_tx), 'Assets & Liabilities', 'deleting sale proceeds as money in');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"id":"%s","tx_date":"2026-06-30","lines":[{"amount":2500,"category_id":"%s"}]}')$q$, v_tx, c.cat_don),
    'Assets & Liabilities', 'turning sale proceeds into a donation');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO items (organization_id, name, kind, fund_id) VALUES ('%s', 'x', 'other_asset', '%s')$q$, c.org, c.fund_gen),
    'permission denied', 'writing an item directly');
  PERFORM pg_temp.expect_error(format($q$SELECT delete_item_transaction('%s')$q$, (SELECT t.id FROM transactions t JOIN transaction_lines l ON l.transaction_id = t.id WHERE l.item_id = c.laptop AND t.tx_type = 'money_out')),
    'Undo the disposal first', 'deleting a disposed asset''s purchase');
  PERFORM pg_temp.expect_error(format($q$SELECT delete_item('%s')$q$, c.loan), 'Archive it instead', 'deleting an item with entries');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_admin, 'bs-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT save_opening_position('{"start_date":"2026-03-01"}')$q$, 'dated before that start date', 'moving the start date after entries');
  PERFORM pg_temp.expect_error($q$SELECT save_opening_position('{"start_date":"2023-01-01"}')$q$, 'acquired on or after that start date', 'moving the start date before an opening asset');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_viewer, 'bs-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT save_item('{"name":"x","kind":"other_asset"}')$q$, 'Only Admins and Editors', 'a Viewer saving an item');
  ASSERT (SELECT count(*) FROM items WHERE organization_id = c.org) = 5, 'a Viewer can read items';
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_free, 'bs-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error($q$SELECT save_item('{"name":"x","kind":"other_asset"}')$q$, 'Growth and Nonprofit', 'a free organisation saving an item');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_other, 'bs-other@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM items WHERE organization_id = c.org) = 0, 'another organisation sees no items';
  ASSERT (SELECT count(*) FROM balance_sheet(c.org, '2026-06-30') WHERE amount <> 0) = 0, 'another organisation gets an empty balance sheet';
  PERFORM pg_temp.expect_error(format($q$SELECT record_item_transaction('{"item_id":"%s","action":"repay","amount":1,"tx_date":"2026-06-01"}')$q$, c.loan), 'not found', 'another organisation repaying');
  RESET ROLE;

  -- Undo the disposal: the asset is back, its proceeds are gone, and everything still balances
  PERFORM pg_temp.sign_in(c.u_editor, 'bs-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM undo_disposal(c.laptop);
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  PERFORM pg_temp.eq((SELECT amount FROM balance_sheet(c.org, '2026-06-30') WHERE ref_id = c.laptop), 3600 - 500, 'laptop back: 5 months charged by June');
  PERFORM pg_temp.eq((SELECT difference FROM balance_check(c.org, '2026-06-30')), 0, 'still balances after undoing');
  RAISE NOTICE 'PASS protection: item cash only through its functions, start date guarded, roles, plans and organisations enforced; undo disposal';
END $$;

-- ---------------------------------------------------------------- clean-up
DO $$
DECLARE c b_ctx;
BEGIN
  SELECT * INTO c FROM b_ctx;
  ASSERT (SELECT count(*) FROM accounting_parity_check(c.org)) = 0, 'documents parity unaffected';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM delete_organization_data(c.org);
  ASSERT NOT EXISTS (SELECT 1 FROM items WHERE organization_id = c.org), 'an organisation with items can be deleted';
  RAISE NOTICE 'PASS deleting an organisation with assets, loans and transfers works';
END $$;

ROLLBACK;
