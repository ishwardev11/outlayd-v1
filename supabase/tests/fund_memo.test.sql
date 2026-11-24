-- Simplification step 1: the Donor & Audit Memo reads the ledger (fund_memo_lines). Run on a LOCAL
-- database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/fund_memo.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- Uses the demo society from spec section 11 (the same set-up steps as demo_society.test.sql) and
-- checks, as real signed-in roles, that the memo's income and expenditure per fund equal the Income &
-- Expenditure statement (rule R1), how a part-paid bill, a refund, depreciation and an asset purchase
-- appear, and that another organisation, a never-paid organisation and anonymous callers get nothing.
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
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'demo-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'demo-editor@example.com') RETURNING id INTO ue;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'demo-admin@example.com', 'Admin'), (o, 'demo-editor@example.com', 'Editor');
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

-- ---------------------------------------------------------------- a Viewer, and other organisations (as the server)
CREATE TEMP TABLE m_ctx (viewer uuid, o_other uuid, u_other uuid, o_free uuid, u_free uuid, f_free uuid,
                         o_cancel uuid, u_cancel uuid, f_cancel uuid);
GRANT ALL ON m_ctx TO authenticated;
DO $$
DECLARE c d_ctx; uv uuid; o_other uuid; u_other uuid; o_free uuid; u_free uuid; o_cancel uuid; u_cancel uuid;
BEGIN
  SELECT * INTO c FROM d_ctx;
  -- act as the server: no signed-in user (the billing guard rejects plan changes from a user)
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'memo-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO user_roles (organization_id, email, role) VALUES (c.org, 'memo-viewer@example.com', 'Viewer');

  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Memo Other Society', 'pro', 'growth') RETURNING id INTO o_other;
  INSERT INTO organizations (name) VALUES ('Memo Free Society') RETURNING id INTO o_free;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Memo Cancelled Society', 'pro', 'growth') RETURNING id INTO o_cancel;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'memo-other@example.com') RETURNING id INTO u_other;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'memo-free@example.com') RETURNING id INTO u_free;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'memo-cancel@example.com') RETURNING id INTO u_cancel;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (o_other, 'memo-other@example.com', 'Admin'), (o_free, 'memo-free@example.com', 'Admin'), (o_cancel, 'memo-cancel@example.com', 'Admin');
  -- a paid receipt in each (the mirror turns it into money out)
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  SELECT o, 'Kedai', 'paid', 'receipt', 85.50, '2026-11-05', '2026-11-05',
         (SELECT id FROM funds WHERE organization_id = o AND is_default),
         (SELECT id FROM categories WHERE organization_id = o AND kind = 'expense' AND NOT is_system ORDER BY name LIMIT 1)
  FROM unnest(ARRAY[o_free, o_cancel]) AS o;
  -- the cancelled organisation was paid, then downgraded (what the Stripe sync writes)
  UPDATE organizations SET subscription_status = 'free', subscription_tier = 'free' WHERE id = o_cancel;
  INSERT INTO m_ctx VALUES (uv, o_other, u_other, o_free, u_free,
    (SELECT id FROM funds WHERE organization_id = o_free AND is_default), o_cancel, u_cancel,
    (SELECT id FROM funds WHERE organization_id = o_cancel AND is_default));
END $$;

-- ---------------------------------------------------------------- R1 parity, as Admin, Editor and Viewer
DO $$
DECLARE c d_ctx; u record; f uuid; p record; got numeric; want numeric; k text;
BEGIN
  SELECT * INTO c FROM d_ctx;
  FOR u IN SELECT * FROM (VALUES (c.u_admin, 'demo-admin@example.com'), (c.u_editor, 'demo-editor@example.com'),
                                 ((SELECT viewer FROM m_ctx), 'memo-viewer@example.com')) v(uid, email) LOOP
    PERFORM pg_temp.sign_in(u.uid, u.email);
    SET LOCAL ROLE authenticated;
    FOREACH f IN ARRAY ARRAY[c.gen, c.edu, c.bld] LOOP
      FOR p IN SELECT * FROM (VALUES ('2026-01-01'::date, '2026-12-31'::date), ('2026-03-01', '2026-06-30'), ('2025-01-01', '2025-12-31')) v(d1, d2) LOOP
        FOREACH k IN ARRAY ARRAY['income', 'expense'] LOOP
          got := COALESCE((SELECT sum(amount) FROM fund_memo_lines(c.org, f, p.d1, p.d2) WHERE kind = k), 0);
          want := COALESCE((SELECT sum(amount) FROM income_expenditure(c.org, p.d1, p.d2) WHERE fund_id = f AND kind = k), 0);
          PERFORM pg_temp.eq(got, want, format('%s %s %s to %s as %s', (SELECT name FROM funds WHERE id = f), k, p.d1, p.d2, u.email));
        END LOOP;
      END LOOP;
    END LOOP;
    RESET ROLE;
  END LOOP;
  RAISE NOTICE 'PASS memo income and expenditure equal Income & Expenditure for every fund and period, as Admin, Editor and Viewer';
END $$;

-- ---------------------------------------------------------------- the rows themselves (as the Viewer)
DO $$
DECLARE c d_ctx; r record;
BEGIN
  SELECT * INTO c FROM d_ctx;
  PERFORM pg_temp.sign_in((SELECT viewer FROM m_ctx), 'memo-viewer@example.com');
  SET LOCAL ROLE authenticated;
  -- Education Fund 2026: grant 12,000; printing bill 2,000 (part-paid 800) less the 250 refund
  PERFORM pg_temp.eq((SELECT sum(amount) FROM fund_memo_lines(c.org, c.edu, '2026-01-01', '2026-12-31') WHERE kind = 'income'), 12000, 'Education income');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM fund_memo_lines(c.org, c.edu, '2026-01-01', '2026-12-31') WHERE kind = 'expense'), 1750, 'Education expenditure');
  SELECT * INTO r FROM fund_memo_lines(c.org, c.edu, '2026-01-01', '2026-12-31') WHERE row_kind = 'invoice';
  PERFORM pg_temp.eq(r.amount, 2000, 'the uploaded bill counts in full on its invoice date');
  PERFORM pg_temp.eq(r.invoice_paid, 800, 'paid by the end of the period');
  ASSERT r.reference = 'CJ-310' AND r.payee = 'Cetak Jaya' AND r.document_id = c.doc_print, 'bill details and its upload';
  PERFORM pg_temp.eq((SELECT invoice_paid FROM fund_memo_lines(c.org, c.edu, '2026-01-01', '2026-03-30') WHERE row_kind = 'invoice'), 0,
    'a payment after the period end is not counted as paid');
  PERFORM pg_temp.eq((SELECT count(*) FROM fund_memo_lines(c.org, c.edu, '2026-01-01', '2026-12-31') WHERE reference = 'CJ-310'), 1,
    'the 800 payment is not a second row');
  SELECT * INTO r FROM fund_memo_lines(c.org, c.edu, '2026-01-01', '2026-12-31') WHERE reference = 'CN-15';
  ASSERT r.amount = -250 AND r.is_refund AND r.kind = 'expense' AND r.category_name = 'Printing', 'the refund reduces printing';
  -- Building Fund: the van bought (listed, not counted), depreciation February to December
  SELECT * INTO r FROM fund_memo_lines(c.org, c.bld, '2026-01-01', '2026-12-31') WHERE row_kind = 'asset_purchase';
  ASSERT r.amount = 36000 AND r.kind IS NULL AND r.item_name = 'Van' AND r.payee = 'Toyota', 'the van purchase is listed with no kind';
  PERFORM pg_temp.eq((SELECT count(*) FROM fund_memo_lines(c.org, c.bld, '2026-01-01', '2026-12-31') WHERE row_kind = 'depreciation'), 11, 'eleven months');
  PERFORM pg_temp.eq((SELECT sum(amount) FROM fund_memo_lines(c.org, c.bld, '2026-01-01', '2026-12-31') WHERE row_kind = 'depreciation'), 8250, 'depreciation');
  -- General Fund: donation, rental invoice and rent; the opening bill and invoice are not this year's
  PERFORM pg_temp.eq((SELECT sum(amount) FROM fund_memo_lines(c.org, c.gen, '2026-01-01', '2026-12-31') WHERE kind = 'income'), 5500, 'General income');
  PERFORM pg_temp.eq((SELECT count(*) FROM fund_memo_lines(c.org, c.gen, '2026-01-01', '2026-12-31') WHERE category_id IN (c.c_fees, c.c_util)), 0,
    'the invoice and bill from before the start date are not this year''s, and neither are their 2026 payments');
  -- loan cash and the fund transfer are not income or expenditure (R6)
  PERFORM pg_temp.eq((SELECT count(*) FROM fund_memo_lines(c.org, c.gen, '2026-01-01', '2026-12-31') WHERE payee = 'Bank Islam'), 0, 'loan cash is left out');
  RESET ROLE;
  RAISE NOTICE 'PASS part-paid bill, refund, depreciation, asset purchase, opening balances and loans appear as designed';
END $$;

-- ---------------------------------------------------------------- other organisations, plans and anonymous callers
DO $$
DECLARE c d_ctx; m m_ctx; failed boolean;
BEGIN
  SELECT * INTO c FROM d_ctx;
  SELECT * INTO m FROM m_ctx;
  -- a paid user from another organisation sees nothing of the demo society
  PERFORM pg_temp.sign_in(m.u_other, 'memo-other@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM fund_memo_lines(c.org, c.edu, '2000-01-01', '2100-12-31')), 0, 'another organisation');
  PERFORM pg_temp.eq((SELECT count(*) FROM fund_memo_lines(m.o_other, c.edu, '2000-01-01', '2100-12-31')), 0, 'another organisation, its own id');
  RESET ROLE;
  -- a never-paid organisation gets no memo, even of its own data
  PERFORM pg_temp.sign_in(m.u_free, 'memo-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM transactions WHERE organization_id = m.o_free), 1, 'the free organisation can read its own cash book');
  PERFORM pg_temp.eq((SELECT count(*) FROM fund_memo_lines(m.o_free, m.f_free, '2000-01-01', '2100-12-31')), 0, 'never paid: no memo');
  RESET ROLE;
  -- an organisation that downgraded keeps a memo of its existing data
  PERFORM pg_temp.sign_in(m.u_cancel, 'memo-cancel@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT sum(amount) FROM fund_memo_lines(m.o_cancel, m.f_cancel, '2026-01-01', '2026-12-31') WHERE kind = 'expense'), 85.50, 'downgraded: read-only memo');
  RESET ROLE;
  -- anonymous callers may not run it at all
  failed := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM fund_memo_lines(c.org, c.edu, '2000-01-01', '2100-12-31');
  EXCEPTION WHEN insufficient_privilege THEN
    failed := true;
  END;
  RESET ROLE;
  ASSERT failed, 'anon must not be able to run fund_memo_lines';
  RAISE NOTICE 'PASS another organisation, a never-paid organisation and anonymous callers get nothing; a downgraded one keeps read access';
END $$;

ROLLBACK;
