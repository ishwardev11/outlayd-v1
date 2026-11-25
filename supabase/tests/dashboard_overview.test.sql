-- Dashboard redesign: dashboard_overview(org, today, days). Run on a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/dashboard_overview.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- "Dashboard Test Society", today = 25 Nov 2026, start date 1 Jan 2026:
--   Opening: Main Bank 10,000, Petty Cash 500. Funds: General (default), Education (restricted, budget 5,000),
--            Old Fund (archived, must not show).
--   Money in : 10 Nov donation 3,000 (General); 20 Nov grant 2,000 (Education); 5 Nov deposit 400 on our invoice
--   Money out: 15 Nov rent 1,500 paid on the spot (General); 28 Oct printing 400 paid (Education);
--              20 Oct 300 paid towards the 800 printing bill (due 31 Oct, so 500 is overdue)
--   Bills still open: 500 overdue + 200 due 15 Dec = 700, 1 overdue
--   Invoice we issued 1 Nov, due 10 Nov, 1,000 less 400 deposit = 600 owed to us, overdue
--   Cash in bank: 10,500 + 3,000 + 2,000 + 400 - 1,500 - 400 - 300 = 13,700
--   November: in 5,400, out 1,500. Last 30 days (27 Oct - 25 Nov): in 5,400, out 1,900.
--   Reconciled: Jan for both accounts, Feb for Main only -> last fully reconciled 31 Jan; Feb-Oct = 9 months open.
--   Inbox: 1 to check, 1 possible duplicate, 1 being read, 1 whose reading failed -> to review 2, extracting 1, failed 1.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE d_ctx (org uuid, empty_org uuid, u_admin uuid, u_viewer uuid, u_other uuid, gen uuid, edu uuid,
                         main uuid, petty uuid, c_don uuid, c_grant uuid, c_rent uuid, c_print uuid, c_fees uuid, printer uuid, club uuid);
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

-- ---------------------------------------------------------------- organisations and people (as the server)
DO $$
DECLARE o uuid; o2 uuid; ua uuid; uv uuid; uo uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier, fiscal_year_start, timezone) VALUES ('Dashboard Test Society', 'pro', 'nonprofit', 1, 'Asia/Kuala_Lumpur') RETURNING id INTO o;
  INSERT INTO organizations (name, subscription_status, fiscal_year_start) VALUES ('Brand New Club', 'free', 1) RETURNING id INTO o2;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dash-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dash-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dash-other@example.com') RETURNING id INTO uo;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'dash-admin@example.com', 'Admin'), (o, 'dash-viewer@example.com', 'Viewer'), (o2, 'dash-other@example.com', 'Admin');
  INSERT INTO d_ctx (org, empty_org, u_admin, u_viewer, u_other) VALUES (o, o2, ua, uv, uo);
  UPDATE d_ctx SET
    gen = (SELECT id FROM funds WHERE organization_id = o AND is_default),
    main = (SELECT id FROM accounts WHERE organization_id = o AND is_default),
    c_grant = (SELECT id FROM categories WHERE organization_id = o AND name = 'Government grants'),
    c_don = (SELECT id FROM categories WHERE organization_id = o AND name = 'General donations'),
    c_fees = (SELECT id FROM categories WHERE organization_id = o AND name = 'Programme and course fees');
END $$;

-- ---------------------------------------------------------------- a brand-new organisation: nothing set up
DO $$
DECLARE c d_ctx; r jsonb;
BEGIN
  SELECT * INTO c FROM d_ctx;
  PERFORM pg_temp.sign_in(c.u_other, 'dash-other@example.com');
  SET LOCAL ROLE authenticated;
  r := dashboard_overview(c.empty_org, '2026-11-25', 30);
  RESET ROLE;
  IF r IS NULL THEN RAISE EXCEPTION 'a member must see their own organisation'; END IF;
  IF (r -> 'cash' ->> 'set_up')::boolean THEN RAISE EXCEPTION 'cash in bank must say not set up before the opening position'; END IF;
  PERFORM pg_temp.eq((r -> 'month' ->> 'money_in')::numeric, 0, 'new org: money in');
  PERFORM pg_temp.eq((r -> 'payable' ->> 'count')::numeric, 0, 'new org: no bills');
  PERFORM pg_temp.eq((r -> 'unreconciled' ->> 'count')::numeric, 0, 'new org: nothing to reconcile yet');
  PERFORM pg_temp.eq(jsonb_array_length(r -> 'cash_flow'), 30, 'new org: 30 days of cash flow, all zero');
  PERFORM pg_temp.eq((SELECT sum((p ->> 'money_out')::numeric) FROM jsonb_array_elements(r -> 'cash_flow') p), 0, 'new org: no money out');
  PERFORM pg_temp.eq(jsonb_array_length(r -> 'recent'), 0, 'new org: no recent activity');
  PERFORM pg_temp.eq(jsonb_array_length(r -> 'funds'), 1, 'new org: only the General Fund');
  RAISE NOTICE 'PASS a brand-new organisation shows empty figures and "not set up"';
END $$;

-- ---------------------------------------------------------------- set-up (Admin, through the app's own paths)
DO $$
DECLARE c d_ctx;
BEGIN
  SELECT * INTO c FROM d_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'dash-admin@example.com');
  SET LOCAL ROLE authenticated;
  INSERT INTO funds (organization_id, name, fund_type, budget) VALUES (c.org, 'Education Fund', 'restricted', 5000);
  INSERT INTO funds (organization_id, name, fund_type) VALUES (c.org, 'Old Fund', 'unrestricted');
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (c.org, 'Printing', 'expense', 'Programme'), (c.org, 'Rent', 'expense', 'Administration');
  INSERT INTO vendors (organization_id, name, payee_type) VALUES (c.org, 'Cetak Jaya', 'vendor'), (c.org, 'Kelab Sukan', 'customer');
  UPDATE accounts SET opening_balance = 10000, name = 'Main Bank' WHERE id = c.main;
  INSERT INTO accounts (organization_id, name, account_type, opening_balance) VALUES (c.org, 'Petty Cash', 'cash', 500);
  PERFORM save_opening_position('{"start_date":"2026-01-01"}');
  PERFORM save_opening_position('{"start_date":"2026-01-01","complete":true}');
  UPDATE funds SET archived_at = now() WHERE organization_id = c.org AND name = 'Old Fund';
  RESET ROLE;
  UPDATE d_ctx SET
    edu = (SELECT id FROM funds WHERE organization_id = c.org AND name = 'Education Fund'),
    petty = (SELECT id FROM accounts WHERE organization_id = c.org AND name = 'Petty Cash'),
    c_print = (SELECT id FROM categories WHERE organization_id = c.org AND name = 'Printing'),
    c_rent = (SELECT id FROM categories WHERE organization_id = c.org AND name = 'Rent'),
    printer = (SELECT id FROM vendors WHERE organization_id = c.org AND name = 'Cetak Jaya'),
    club = (SELECT id FROM vendors WHERE organization_id = c.org AND name = 'Kelab Sukan');
END $$;

-- ---------------------------------------------------------------- the activity
DO $$
DECLARE c d_ctx; d uuid; v uuid;
BEGIN
  SELECT * INTO c FROM d_ctx;
  -- Uploads (as the server, like the upload pipeline)
  INSERT INTO documents (organization_id, vendor_name, vendor_id, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  VALUES (c.org, 'Cetak Jaya', c.printer, 'awaiting_payment', 'invoice', 800, '2026-10-01', '2026-10-31', c.edu, c.c_print, 'CJ-1') RETURNING id INTO d;
  INSERT INTO documents (organization_id, vendor_name, vendor_id, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  VALUES (c.org, 'Cetak Jaya', c.printer, 'awaiting_payment', 'invoice', 200, '2026-11-15', '2026-12-15', c.edu, c.c_print, 'CJ-2');
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (c.org, 'Landlord', 'paid', 'receipt', 1500, '2026-11-15', '2026-11-15', c.gen, c.c_rent),
         (c.org, 'Cetak Jaya', 'paid', 'receipt', 400, '2026-10-28', '2026-10-28', c.edu, c.c_print);
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, extraction_flags)
  VALUES (c.org, 'Kedai A', 'needs_review', 'receipt', 50, '2026-11-20', '[]'),
         (c.org, 'Kedai B', 'DUPLICATE_WARNING', 'receipt', 60, '2026-11-20', '[]'),
         (c.org, NULL, 'extracting', 'receipt', NULL, NULL, '[]'),
         (c.org, '[Extraction Failed]', 'needs_review', 'receipt', NULL, NULL, '[{"code":"EXTRACTION_FAILED","message":"x"}]');

  PERFORM pg_temp.sign_in(c.u_admin, 'dash-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', (SELECT id FROM invoices WHERE document_id = d), 'amount', 300, 'tx_date', '2026-10-20'));
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-11-10', 'payee_name', 'Puan Aminah',
    'lines', jsonb_build_array(jsonb_build_object('amount', 3000, 'category_id', c.c_don))));
  PERFORM save_money_in(jsonb_build_object('tx_date', '2026-11-20', 'payee_name', 'Kementerian',
    'lines', jsonb_build_array(jsonb_build_object('amount', 2000, 'fund_id', c.edu, 'category_id', c.c_grant))));
  v := save_invoice(jsonb_build_object('direction', 'receivable', 'payee_id', c.club, 'issue_date', '2026-11-01', 'due_date', '2026-11-10',
    'lines', jsonb_build_array(jsonb_build_object('amount', 1000, 'category_id', c.c_fees))));
  PERFORM pg_temp.commit_checks();
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', v, 'amount', 400, 'tx_date', '2026-11-05', 'attachment_path', c.org || '/transactions/test-receipt.pdf'));
  PERFORM save_reconciliation(jsonb_build_object('account_id', c.main, 'period_end', '2026-01-31', 'statement_balance', 10000));
  PERFORM save_reconciliation(jsonb_build_object('account_id', c.petty, 'period_end', '2026-01-31', 'statement_balance', 500));
  PERFORM save_reconciliation(jsonb_build_object('account_id', c.main, 'period_end', '2026-02-28', 'statement_balance', 10000));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------- the figures, as the Admin and as a Viewer
DO $$
DECLARE c d_ctx; r jsonb; who record; f jsonb;
BEGIN
  SELECT * INTO c FROM d_ctx;
  FOR who IN SELECT * FROM (VALUES (c.u_admin, 'dash-admin@example.com'), (c.u_viewer, 'dash-viewer@example.com')) x(uid, email) LOOP
    PERFORM pg_temp.sign_in(who.uid, who.email);
    SET LOCAL ROLE authenticated;
    r := dashboard_overview(c.org, '2026-11-25', 30);
    RESET ROLE;

    IF NOT (r -> 'cash' ->> 'set_up')::boolean THEN RAISE EXCEPTION 'cash in bank must be set up'; END IF;
    PERFORM pg_temp.eq((r -> 'cash' ->> 'balance')::numeric, 13700, 'cash in bank');
    PERFORM pg_temp.eq((SELECT sum(balance) FROM account_balances(c.org, '2026-11-25')), 13700, 'same as account_balances');
    IF (r -> 'cash' ->> 'last_reconciled') IS DISTINCT FROM '2026-01-31' THEN
      RAISE EXCEPTION 'last fully reconciled month-end: expected 2026-01-31, got %', r -> 'cash' ->> 'last_reconciled';
    END IF;
    PERFORM pg_temp.eq((r -> 'month' ->> 'money_in')::numeric, 5400, 'money in this month');
    PERFORM pg_temp.eq((r -> 'month' ->> 'money_out')::numeric, 1500, 'money out this month');
    PERFORM pg_temp.eq((r -> 'payable' ->> 'count')::numeric, 2, 'open bills');
    PERFORM pg_temp.eq((r -> 'payable' ->> 'total')::numeric, 700, 'bills to pay');
    PERFORM pg_temp.eq((r -> 'payable' ->> 'overdue_count')::numeric, 1, 'overdue bills');
    PERFORM pg_temp.eq((r -> 'payable' ->> 'overdue_total')::numeric, 500, 'overdue bills total');
    PERFORM pg_temp.eq((r -> 'receivable' ->> 'count')::numeric, 1, 'open invoices');
    PERFORM pg_temp.eq((r -> 'receivable' ->> 'total')::numeric, 600, 'pending income after the deposit');
    PERFORM pg_temp.eq((r -> 'receivable' ->> 'overdue_count')::numeric, 1, 'overdue invoices');
    PERFORM pg_temp.eq((r -> 'inbox' ->> 'to_review')::numeric, 2, 'documents to review');
    PERFORM pg_temp.eq((r -> 'inbox' ->> 'extracting')::numeric, 1, 'documents being read');
    PERFORM pg_temp.eq((r -> 'inbox' ->> 'failed')::numeric, 1, 'documents whose reading failed');
    PERFORM pg_temp.eq((r -> 'unreconciled' ->> 'count')::numeric, 9, 'months not reconciled (Feb-Oct)');
    PERFORM pg_temp.eq(jsonb_array_length(r -> 'cash_flow'), 30, '30 days');
    IF (r -> 'cash_flow' -> 0 ->> 'date') <> '2026-10-27' OR (r -> 'cash_flow' -> 29 ->> 'date') <> '2026-11-25' THEN
      RAISE EXCEPTION 'cash flow must run 27 Oct to 25 Nov';
    END IF;
    PERFORM pg_temp.eq((SELECT sum((p ->> 'money_in')::numeric) FROM jsonb_array_elements(r -> 'cash_flow') p), 5400, '30-day money in');
    PERFORM pg_temp.eq((SELECT sum((p ->> 'money_out')::numeric) FROM jsonb_array_elements(r -> 'cash_flow') p), 1900, '30-day money out');
    PERFORM pg_temp.eq(jsonb_array_length(r -> 'recent'), 6, 'recent activity: every money in and out entry (6)');
    IF (r -> 'recent' -> 0 ->> 'date') <> '2026-11-20' THEN RAISE EXCEPTION 'recent activity must be newest first'; END IF;
    PERFORM pg_temp.eq(jsonb_array_length(r -> 'funds'), 2, 'active funds only (the archived one is left out)');
    SELECT x INTO f FROM jsonb_array_elements(r -> 'funds') x WHERE x ->> 'name' = 'Education Fund';
    PERFORM pg_temp.eq((f ->> 'budget')::numeric, 5000, 'Education budget');
    PERFORM pg_temp.eq((f ->> 'spent')::numeric, 400, 'Education spent (paid uploads, as in Settings > Funds)');
    PERFORM pg_temp.eq((f ->> 'balance')::numeric,
      (SELECT closing FROM changes_in_funds(c.org, '2026-01-01', '2026-11-25') WHERE fund_id = c.edu), 'Education balance matches Changes in Funds');
  END LOOP;
  RAISE NOTICE 'PASS the Admin and a Viewer see the same figures: cash 13,700, Nov in 5,400 / out 1,500, bills 700, owed to us 600';
END $$;

-- ---------------------------------------------------------------- someone from another organisation sees nothing
DO $$
DECLARE c d_ctx; r jsonb;
BEGIN
  SELECT * INTO c FROM d_ctx;
  PERFORM pg_temp.sign_in(c.u_other, 'dash-other@example.com');
  SET LOCAL ROLE authenticated;
  r := dashboard_overview(c.org, '2026-11-25', 30);
  RESET ROLE;
  IF r IS NOT NULL THEN RAISE EXCEPTION 'another organisation''s member must get nothing back, got %', r; END IF;
  RAISE NOTICE 'PASS a member of another organisation gets nothing';
END $$;

ROLLBACK;
