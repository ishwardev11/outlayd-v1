-- LOCAL DATABASE ONLY. Loads the demo society (spec section 11, same steps as supabase/tests/demo_society.test.sql)
-- and keeps it (COMMIT), plus a free-plan organisation, so the running app can be checked by hand.
-- Before running: npx supabase db reset, then create the five local users listed in
-- docs/simplification-baseline.md (section "Recreating the demo data").
-- Run (PowerShell): Get-Content scripts\load-demo-society.sql -Raw | docker exec -i supabase_db_Outlayd_Proper psql -U postgres -d postgres -v ON_ERROR_STOP=1

--
-- "Harapan Demo Society": two restricted funds, one grant, a part-paid bill (from an upload), an
-- invoice we issued, an asset purchase with depreciation, a loan, a refund and a fund transfer.
-- Every figure below is worked out by hand; the balance check (R5) must hold at every month-end.
--
-- Opening position on 1 Jan 2026 (start date):
--   Main Bank 20,000; Petty Cash 300; owed to us 1,200 (invoice of 15 Nov 2025); we owe 450 (bill of
--   15 Dec 2025); rental deposit 2,000. Net assets 23,050. Education Fund (restricted) 5,000, Building
--   Fund (restricted) 0, so the General Fund is 18,050.
-- 2026:
--   15 Jan  grant 12,000 (Government grants, Education Fund)
--    1 Feb  loan received 30,000; van bought 36,000 (Building Fund, 48 months = 750 a month from Feb)
--   10 Feb  the opening bill of 450 is paid
--   10 Mar  printing bill uploaded and approved, 2,000 (Education Fund), 800 paid on 31 Mar
--    5 Apr  we invoice Kelab Sukan 1,500 for hall rental (General), paid 20 May
--   20 Apr  the opening 1,200 owed to us is received
--    2 May  rent 3,000 paid on the spot (a receipt from an upload, General)
--   15 Jun  supplier refund 250 on printing (Education Fund)
--    1 Jul  loan repayment 5,000
--    1 Aug  transfer 10,000 General -> Building Fund
--    1 Sep  donation 4,000 (General)
-- Year to 31 Dec 2026:
--   Income 17,500 = grants 12,000 + rental 1,500 + donations 4,000
--   Expenditure 13,000 = printing 2,000 - refund 250 + rent 3,000 + depreciation 11 x 750 = 8,250
--   Funds: Education 5,000 + 12,000 - 1,750 = 15,250; Building 10,000 - 8,250 = 1,750;
--          General 18,050 + 5,500 - 3,000 - 10,000 = 10,550; total 27,550
--   Balance sheet: cash 23,700 + 300 = 24,000; deposit 2,000; van 27,750; we owe 1,200; loan 25,000
--   Receipts 48,950, payments 45,250, cash 20,300 -> 24,000
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE d_ctx (org uuid, u_admin uuid, u_editor uuid, gen uuid, edu uuid, bld uuid, main uuid, petty uuid,
                         c_grant uuid, c_rental uuid, c_fees uuid, c_don uuid, c_print uuid, c_rent uuid, c_util uuid,
                         school uuid, club uuid, printer_co uuid, van uuid, loan uuid, deposit uuid,
                         inv_open_rec uuid, inv_open_pay uuid, inv_rental uuid, doc_print uuid);
GRANT ALL ON d_ctx TO authenticated;

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
CREATE OR REPLACE FUNCTION pg_temp.eq(p_got numeric, p_want numeric, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION '% : expected %, got %', p_label, p_want, p_got;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.commit_checks() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.eq(numeric, numeric, text) TO authenticated;

-- ---------------------------------------------------------------- the society (as the server)
DO $$
DECLARE o uuid; ua uuid; ue uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier, fiscal_year_start) VALUES ('Harapan Demo Society', 'pro', 'nonprofit', 1) RETURNING id INTO o;
  SELECT id INTO ua FROM auth.users WHERE email = 'demo-admin@example.com';
  SELECT id INTO ue FROM auth.users WHERE email = 'demo-editor@example.com';
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'demo-admin@example.com', 'Admin'), (o, 'demo-editor@example.com', 'Editor'), (o, 'demo-viewer@example.com', 'Viewer');
  INSERT INTO d_ctx (org, u_admin, u_editor) VALUES (o, ua, ue);
  UPDATE d_ctx SET
    gen = (SELECT id FROM funds WHERE organization_id = o AND is_default),
    main = (SELECT id FROM accounts WHERE organization_id = o AND is_default),
    c_grant = (SELECT id FROM categories WHERE organization_id = o AND name = 'Government grants'),
    c_rental = (SELECT id FROM categories WHERE organization_id = o AND name = 'Rental income'),
    c_fees = (SELECT id FROM categories WHERE organization_id = o AND name = 'Programme and course fees'),
    c_don = (SELECT id FROM categories WHERE organization_id = o AND name = 'General donations');
END $$;

-- ---------------------------------------------------------------- set-up through the app's own paths (Admin)
DO $$
DECLARE c d_ctx;
BEGIN
  SELECT * INTO c FROM d_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'demo-admin@example.com');
  SET LOCAL ROLE authenticated;
  -- funds, categories, payees, accounts as an Admin would create them
  INSERT INTO funds (organization_id, name, fund_type, opening_balance) VALUES (c.org, 'Education Fund', 'restricted', 5000);
  INSERT INTO funds (organization_id, name, fund_type) VALUES (c.org, 'Building Fund', 'restricted');
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (c.org, 'Printing', 'expense', 'Programme'), (c.org, 'Rent', 'expense', 'Administration'), (c.org, 'Utilities', 'expense', 'Administration');
  INSERT INTO vendors (organization_id, name, payee_type) VALUES (c.org, 'Sekolah ABC', 'customer'), (c.org, 'Kelab Sukan', 'customer'), (c.org, 'Cetak Jaya', 'vendor'), (c.org, 'TNB', 'vendor');
  UPDATE accounts SET opening_balance = 20000, name = 'Main Bank' WHERE id = c.main;
  INSERT INTO accounts (organization_id, name, account_type, opening_balance) VALUES (c.org, 'Petty Cash', 'cash', 300);
  PERFORM save_opening_position('{"start_date":"2026-01-01"}');
  RESET ROLE;
  UPDATE d_ctx SET
    edu = (SELECT id FROM funds WHERE organization_id = c.org AND name = 'Education Fund'),
    bld = (SELECT id FROM funds WHERE organization_id = c.org AND name = 'Building Fund'),
    petty = (SELECT id FROM accounts WHERE organization_id = c.org AND name = 'Petty Cash'),
    c_print = (SELECT id FROM categories WHERE organization_id = c.org AND name = 'Printing'),
    c_rent = (SELECT id FROM categories WHERE organization_id = c.org AND name = 'Rent'),
    c_util = (SELECT id FROM categories WHERE organization_id = c.org AND name = 'Utilities'),
    school = (SELECT id FROM vendors WHERE organization_id = c.org AND name = 'Sekolah ABC'),
    club = (SELECT id FROM vendors WHERE organization_id = c.org AND name = 'Kelab Sukan'),
    printer_co = (SELECT id FROM vendors WHERE organization_id = c.org AND name = 'Cetak Jaya');
END $$;

-- ---------------------------------------------------------------- opening amounts owed, items (Editor)
DO $$
DECLARE c d_ctx;
BEGIN
  SELECT * INTO c FROM d_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'demo-editor@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE d_ctx SET inv_open_rec = save_invoice(jsonb_build_object('direction', 'receivable', 'payee_id', c.school, 'issue_date', '2025-11-15',
    'lines', jsonb_build_array(jsonb_build_object('amount', 1200, 'category_id', c.c_fees))));
  UPDATE d_ctx SET inv_open_pay = save_invoice(jsonb_build_object('direction', 'payable', 'payee_id', (SELECT id FROM vendors WHERE organization_id = c.org AND name = 'TNB'),
    'issue_date', '2025-12-15', 'lines', jsonb_build_array(jsonb_build_object('amount', 450, 'category_id', c.c_util))));
  UPDATE d_ctx SET deposit = save_item(jsonb_build_object('name', 'Hall rental deposit', 'kind', 'other_asset', 'classification', 'current', 'opening_balance', 2000));
  UPDATE d_ctx SET loan = save_item(jsonb_build_object('name', 'Bank Islam loan', 'kind', 'liability', 'classification', 'non_current'));
  UPDATE d_ctx SET van = save_item(jsonb_build_object('name', 'Van', 'kind', 'fixed_asset', 'fund_id', c.bld, 'acquired_date', '2026-02-01', 'useful_life_months', 48));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;

  PERFORM pg_temp.eq(opening_net_assets(c.org), 23050, 'opening net assets: 20,000 + 300 + 1,200 + 2,000 - 450');
  PERFORM pg_temp.eq((SELECT opening FROM fund_openings(c.org) WHERE fund_id = c.gen), 18050, 'General Fund opening (balancing figure)');
  PERFORM pg_temp.sign_in(c.u_admin, 'demo-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM save_opening_position('{"start_date":"2026-01-01","complete":true}');
  RESET ROLE;
  RAISE NOTICE 'PASS opening position: 23,050 of net assets, General Fund 18,050 as the balancing figure';
END $$;

-- ---------------------------------------------------------------- the year (as the people who would do it)
DO $$
DECLARE c d_ctx; v uuid; d uuid;
BEGIN
  SELECT * INTO c FROM d_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'demo-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-01-15', 'payee_name', 'Kementerian Pendidikan', 'reference', 'GRANT-26',
    'lines', jsonb_build_array(jsonb_build_object('amount', 12000, 'fund_id', c.edu, 'category_id', c.c_grant))));
  PERFORM record_item_transaction(jsonb_build_object('item_id', c.loan, 'action', 'receive', 'amount', 30000, 'tx_date', '2026-02-01', 'payee_name', 'Bank Islam'));
  PERFORM record_item_transaction(jsonb_build_object('item_id', c.van, 'action', 'purchase', 'amount', 36000, 'tx_date', '2026-02-01', 'payee_name', 'Toyota'));
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', c.inv_open_pay, 'amount', 450, 'tx_date', '2026-02-10'));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;

  -- 10 Mar: a printing bill is uploaded and approved (the mirror makes its payable invoice)
  INSERT INTO documents (organization_id, vendor_name, vendor_id, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  VALUES (c.org, 'Cetak Jaya', c.printer_co, 'awaiting_payment', 'invoice', 2000, '2026-03-10', '2026-04-10', c.edu, c.c_print, 'CJ-310') RETURNING id INTO d;
  UPDATE d_ctx SET doc_print = d;

  PERFORM pg_temp.sign_in(c.u_editor, 'demo-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', (SELECT id FROM invoices WHERE document_id = d), 'amount', 800, 'tx_date', '2026-03-31'));
  v := save_invoice(jsonb_build_object('direction', 'receivable', 'payee_id', c.club, 'issue_date', '2026-04-05', 'due_date', '2026-05-05',
    'lines', jsonb_build_array(jsonb_build_object('description', 'Hall rental, April', 'amount', 1500, 'category_id', c.c_rental))));
  PERFORM pg_temp.commit_checks();
  UPDATE d_ctx SET inv_rental = v;
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', c.inv_open_rec, 'amount', 1200, 'tx_date', '2026-04-20'));
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', v, 'amount', 1500, 'tx_date', '2026-05-20'));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;

  -- 2 May: rent paid on the spot, uploaded as a receipt and marked paid
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (c.org, 'Landlord', 'paid', 'receipt', 3000, '2026-05-02', '2026-05-02', c.gen, c.c_rent);

  PERFORM pg_temp.sign_in(c.u_editor, 'demo-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-06-15', 'payee_name', 'Cetak Jaya', 'is_refund', true, 'reference', 'CN-15',
    'lines', jsonb_build_array(jsonb_build_object('amount', 250, 'fund_id', c.edu, 'category_id', c.c_print))));
  PERFORM record_item_transaction(jsonb_build_object('item_id', c.loan, 'action', 'repay', 'amount', 5000, 'tx_date', '2026-07-01'));
  PERFORM save_fund_transfer(jsonb_build_object('from_fund_id', c.gen, 'to_fund_id', c.bld, 'amount', 10000, 'tx_date', '2026-08-01', 'remarks', 'Committee approved: van fund'));
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-09-01', 'payee_name', 'Puan Aminah',
    'lines', jsonb_build_array(jsonb_build_object('amount', 4000, 'category_id', c.c_don))));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  RAISE NOTICE 'PASS the year is recorded through the same functions the app uses';
END $$;
-- free-plan organisation with one approved unpaid bill and one paid receipt (uploads)
DO $$
DECLARE o uuid;
BEGIN
  INSERT INTO organizations (name, fiscal_year_start) VALUES ('Free Test Club', 1) RETURNING id INTO o;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'free-admin@example.com', 'Admin'), (o, 'free-viewer@example.com', 'Viewer');
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  VALUES (o, 'Hall Supplies', 'awaiting_payment', 'invoice', 320, '2026-11-02', '2026-11-30', (SELECT id FROM funds WHERE organization_id = o AND is_default), (SELECT id FROM categories WHERE organization_id = o AND kind = 'expense' ORDER BY name LIMIT 1), 'HS-11');
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (o, 'Kedai Runcit', 'paid', 'receipt', 85.5, '2026-11-05', '2026-11-05', (SELECT id FROM funds WHERE organization_id = o AND is_default), (SELECT id FROM categories WHERE organization_id = o AND kind = 'expense' ORDER BY name LIMIT 1));
END $$;
COMMIT;
