-- Automated test for the report checks' counts and Fix lists (invoices and AI plan, step 9). Run on a
-- LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/integrity_fix.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- Each failure is created, then: the check fails, says how many records (affected), and the list its Fix
-- link opens holds exactly those records. Two failures the app normally prevents (an entry that does not
-- add up, an overpaid invoice) are forced by switching their guard triggers off inside the transaction.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE x_ctx (org uuid, u_editor uuid, fund uuid, acc uuid, cat_rent uuid, cat_fees uuid, unc uuid, payee uuid,
                         doc uuid, tx_unc uuid, inv_rec uuid, tx_bad uuid, inv_over uuid);
GRANT ALL ON x_ctx TO authenticated;
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
-- One check of the period
CREATE OR REPLACE FUNCTION pg_temp.chk(p_org uuid, p_code text) RETURNS record LANGUAGE sql AS $$
  SELECT passed, affected, amount FROM integrity_checks(p_org, '2026-03-01', '2026-03-31') WHERE code = p_code;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text), pg_temp.commit_checks(), pg_temp.chk(uuid, text) TO authenticated;

DO $$
DECLARE o uuid; ue uuid; f uuid; a uuid; c_rent uuid; c_fees uuid; c_unc uuid; p uuid; d uuid; t uuid; i uuid; tx uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Checks Society', 'pro', 'nonprofit') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'xf-editor@example.com') RETURNING id INTO ue;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'xf-editor@example.com', 'Editor');
  SELECT id INTO f FROM funds WHERE organization_id = o AND is_default;
  SELECT id INTO a FROM accounts WHERE organization_id = o AND is_default;
  SELECT id INTO c_unc FROM categories WHERE organization_id = o AND is_system AND name = 'Uncategorised';
  INSERT INTO categories (organization_id, name, kind) VALUES (o, 'Rent', 'expense') RETURNING id INTO c_rent;
  INSERT INTO categories (organization_id, name, kind) VALUES (o, 'Hall hire', 'income') RETURNING id INTO c_fees;
  INSERT INTO vendors (organization_id, name) VALUES (o, 'Hangover Club') RETURNING id INTO p;

  -- Uncategorised in March: a receipt approved without a category, and a typed money-out line
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id)
  VALUES (o, 'Kedai Cetak', 'paid', 'receipt', 80, '2026-03-05', '2026-03-05', f) RETURNING id INTO d;
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, payee_name, total, source)
  VALUES (o, 'money_out', '2026-03-10', a, 'Pasar', 30, 'manual') RETURNING id INTO t;
  INSERT INTO transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id) VALUES (t, o, 1, 30, f, c_unc);
  -- ... and one in April, outside the period
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, payee_name, total, source)
  VALUES (o, 'money_out', '2026-04-02', a, 'Pasar', 10, 'manual') RETURNING id INTO tx;
  INSERT INTO transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id) VALUES (tx, o, 1, 10, f, c_unc);

  -- An invoice issued in March with a payment that has no receipt (from before step 1)
  INSERT INTO invoices (organization_id, direction, payee_id, payee_name, issue_date, total, status, source)
  VALUES (o, 'receivable', p, 'Hangover Club', '2026-03-12', 500, 'open', 'manual') RETURNING id INTO i;
  INSERT INTO invoice_lines (invoice_id, organization_id, line_no, amount, fund_id, category_id) VALUES (i, o, 1, 500, f, c_fees);
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, payee_id, payee_name, total, source)
  VALUES (o, 'money_in', '2026-03-20', a, p, 'Hangover Club', 200, 'manual') RETURNING id INTO tx;
  INSERT INTO transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id, invoice_id) VALUES (tx, o, 1, 200, f, c_fees, i);
  PERFORM pg_temp.commit_checks();
  INSERT INTO x_ctx (org, u_editor, fund, acc, cat_rent, cat_fees, unc, payee, doc, tx_unc, inv_rec) VALUES (o, ue, f, a, c_rent, c_fees, c_unc, p, d, t, i);
END $$;

-- ---------------------------------------------------------------- forced failures (guards off for this test only)
DO $$
DECLARE c x_ctx; t uuid; i uuid;
BEGIN
  SELECT * INTO c FROM x_ctx;
  ALTER TABLE transaction_lines DISABLE TRIGGER trg_transaction_lines_balanced;
  ALTER TABLE transactions DISABLE TRIGGER trg_transactions_balanced;
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, payee_name, total, source)
  VALUES (c.org, 'money_out', '2026-03-15', c.acc, 'Short line', 100, 'manual') RETURNING id INTO t;
  INSERT INTO transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id) VALUES (t, c.org, 1, 60, c.fund, c.cat_rent);
  ALTER TABLE transaction_lines DISABLE TRIGGER trg_check_invoice_payment;
  INSERT INTO invoices (organization_id, direction, payee_id, payee_name, issue_date, total, status, source)
  VALUES (c.org, 'payable', c.payee, 'Hangover Club', '2026-03-02', 100, 'open', 'manual') RETURNING id INTO i;
  INSERT INTO invoice_lines (invoice_id, organization_id, line_no, amount, fund_id, category_id) VALUES (i, c.org, 1, 100, c.fund, c.cat_rent);
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, payee_name, total, source)
  VALUES (c.org, 'money_out', '2026-03-03', c.acc, 'Hangover Club', 150, 'manual') RETURNING id INTO t;
  INSERT INTO transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id, invoice_id) VALUES (t, c.org, 1, 150, c.fund, c.cat_rent, i);
  UPDATE x_ctx SET tx_bad = (SELECT id FROM transactions WHERE organization_id = c.org AND payee_name = 'Short line'), inv_over = i;
END $$;

-- ---------------------------------------------------------------- counts and Fix lists, as the Editor
DO $$
DECLARE c x_ctx; r record; n int;
BEGIN
  SELECT * INTO c FROM x_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'xf-editor@example.com');
  SET LOCAL ROLE authenticated;

  ASSERT (SELECT count(*) FROM integrity_checks(c.org, '2026-03-01', '2026-03-31')) = 9, 'nine checks';

  -- Uncategorised: 2 in March (the receipt and the typed line), not the April one; Fix lists those 2
  SELECT * INTO r FROM pg_temp.chk(c.org, 'uncategorised') AS (passed boolean, affected int, amount numeric);
  ASSERT r.passed = false AND r.affected = 2, format('uncategorised: 2 entries, got %s', r.affected);
  ASSERT (SELECT array_agg(record_id ORDER BY record_id) FROM uncategorised_items(c.org, '2026-03-01', '2026-03-31'))
       = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[c.doc, c.tx_unc]) x), 'the queue for March lists exactly those';

  -- Receipt missing: 1 invoice issued in March; the Receivable tab's filter lists exactly it
  SELECT * INTO r FROM pg_temp.chk(c.org, 'receipts_missing') AS (passed boolean, affected int, amount numeric);
  ASSERT r.passed = false AND r.affected = 1, format('receipts missing: 1 invoice, got %s', r.affected);
  ASSERT (SELECT array_agg(id) FROM invoice_summary WHERE organization_id = c.org AND direction = 'receivable'
          AND receipts_missing > 0 AND issue_date BETWEEN '2026-03-01' AND '2026-03-31') = ARRAY[c.inv_rec], 'the filtered list is that invoice';
  ASSERT (SELECT severity FROM integrity_checks(c.org, '2026-03-01', '2026-03-31') WHERE code = 'receipts_missing') = 'warning', 'a warning, not a block';

  -- An entry that does not add up: 1, and Fix lists exactly it
  SELECT * INTO r FROM pg_temp.chk(c.org, 'lines_balanced') AS (passed boolean, affected int, amount numeric);
  ASSERT r.passed = false AND r.affected = 1, format('lines balanced: 1 entry, got %s', r.affected);
  ASSERT (SELECT array_agg(record_id) FROM integrity_check_records(c.org, '2026-03-01', '2026-03-31', 'lines_balanced')) = ARRAY[c.tx_bad], 'Fix lists that entry';

  -- An overpaid invoice: 1, and Fix lists exactly it
  SELECT * INTO r FROM pg_temp.chk(c.org, 'invoices') AS (passed boolean, affected int, amount numeric);
  ASSERT r.passed = false AND r.affected = 1, format('invoices: 1, got %s', r.affected);
  ASSERT (SELECT array_agg(record_id) FROM integrity_check_records(c.org, NULL, NULL, 'invoices')) = ARRAY[c.inv_over], 'Fix lists that invoice';

  -- Not reconciled: the one account
  SELECT * INTO r FROM pg_temp.chk(c.org, 'reconciled') AS (passed boolean, affected int, amount numeric);
  ASSERT r.passed = false AND r.affected = 1, format('reconciled: 1 account, got %s', r.affected);

  -- Opening position not complete: no count, the balance checks do not apply yet
  SELECT * INTO r FROM pg_temp.chk(c.org, 'opening_complete') AS (passed boolean, affected int, amount numeric);
  ASSERT r.passed = false AND r.affected IS NULL, 'opening position: fails, no count';
  SELECT * INTO r FROM pg_temp.chk(c.org, 'balance_check') AS (passed boolean, affected int, amount numeric);
  ASSERT r.passed IS NULL AND r.amount IS NULL, 'balance check does not apply yet';

  -- integrity_check_records reads only the caller's own organisation
  SELECT count(*) INTO n FROM integrity_check_records(gen_random_uuid(), NULL, NULL, 'invoices');
  ASSERT n = 0, 'nothing for another organisation';
  RESET ROLE;
  RAISE NOTICE 'PASS each check says how many records, and its Fix list holds exactly those records';
END $$;

ROLLBACK;
