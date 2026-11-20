-- Automated test for money in and donations (Phase 2, stage 3a). Run on a LOCAL database after
-- `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/money_in.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- Commit-time checks (lines add up, money-in category rule) normally run when the transaction
-- commits. Because this whole file is rolled back, pg_temp.commit_checks() forces them to run at
-- that point with SET CONSTRAINTS ALL IMMEDIATE, then switches back.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE m_ctx (org uuid, org_free uuid, org_other uuid, org_sb uuid,
                         fund_gen uuid, fund_bld uuid, fund_arch uuid, fund_other uuid,
                         cat_don uuid, cat_grant uuid, cat_rent uuid, cat_arch uuid, cat_other uuid, cat_unused uuid,
                         payee_other uuid,
                         u_admin uuid, u_editor uuid, u_viewer uuid, u_free uuid, u_other uuid,
                         tx1 uuid, tx2 uuid, tx_refund uuid, tx_grant uuid, rcpt1 uuid);
GRANT ALL ON m_ctx TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.sign_in(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',p_uid,'email',p_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END $$;

-- Runs the commit-time checks now (and switches back to normal)
CREATE OR REPLACE FUNCTION pg_temp.commit_checks() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END $$;

-- Asserts that running p_sql raises an error whose message contains p_expect
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
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.commit_checks() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text) TO authenticated;

-- ---------------------------------------------------------------- setup (as the server)
DO $$
DECLARE o uuid; o_free uuid; o_other uuid; o_sb uuid; fg uuid; fb uuid; fa uuid; fo uuid;
        cd uuid; cg uuid; cr uuid; ca uuid; co uuid; cu uuid; po uuid;
        ua uuid; ue uuid; uv uuid; uf uuid; uo uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Money Society', 'pro', 'growth') RETURNING id INTO o;
  INSERT INTO organizations (name) VALUES ('Free Money Society') RETURNING id INTO o_free;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Other Money Society', 'pro', 'growth') RETURNING id INTO o_other;
  INSERT INTO organizations (name, org_type, subscription_status, subscription_tier) VALUES ('Shop Sdn Bhd', 'small_business', 'pro', 'growth') RETURNING id INTO o_sb;

  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'mi-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'mi-editor@example.com') RETURNING id INTO ue;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'mi-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'mi-free@example.com') RETURNING id INTO uf;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'mi-other@example.com') RETURNING id INTO uo;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (o, 'mi-admin@example.com', 'Admin'), (o, 'mi-editor@example.com', 'Editor'), (o, 'mi-viewer@example.com', 'Viewer'),
    (o_free, 'mi-free@example.com', 'Admin'), (o_other, 'mi-other@example.com', 'Admin');

  SELECT id INTO fg FROM funds WHERE organization_id = o AND is_default;
  INSERT INTO funds (organization_id, name) VALUES (o, 'Building Fund') RETURNING id INTO fb;
  INSERT INTO funds (organization_id, name, archived_at) VALUES (o, 'Old Fund', now()) RETURNING id INTO fa;
  SELECT id INTO fo FROM funds WHERE organization_id = o_other AND is_default;

  SELECT id INTO cd FROM categories WHERE organization_id = o AND name = 'General donations';
  SELECT id INTO cg FROM categories WHERE organization_id = o AND name = 'Government grants';
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (o, 'Rent', 'expense', 'Administration') RETURNING id INTO cr;
  INSERT INTO categories (organization_id, name, kind, nature, archived_at) VALUES (o, 'Old Income', 'income', 'other_income', now()) RETURNING id INTO ca;
  INSERT INTO categories (organization_id, name, kind) VALUES (o, 'Never Used', 'expense') RETURNING id INTO cu;
  SELECT id INTO co FROM categories WHERE organization_id = o_other AND name = 'General donations';
  INSERT INTO vendors (organization_id, name) VALUES (o_other, 'Other Payee') RETURNING id INTO po;

  -- a paid expense document: the mirror creates its money-out transaction
  INSERT INTO documents (organization_id, vendor_name, status, amount, fund_id, category_id, paid_date)
    VALUES (o, 'Landlord', 'paid', 200, fg, cr, current_date);

  INSERT INTO m_ctx (org, org_free, org_other, org_sb, fund_gen, fund_bld, fund_arch, fund_other,
                     cat_don, cat_grant, cat_rent, cat_arch, cat_other, cat_unused, payee_other,
                     u_admin, u_editor, u_viewer, u_free, u_other)
  VALUES (o, o_free, o_other, o_sb, fg, fb, fa, fo, cd, cg, cr, ca, co, cu, po, ua, ue, uv, uf, uo);
END $$;

-- ---------------------------------------------------------------- income categories
DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM m_ctx;
  ASSERT (SELECT count(*) FROM categories WHERE organization_id = c.org AND kind = 'income' AND NOT is_system AND archived_at IS NULL) = 14,
    'a nonprofit gets the 14 income categories from spec section 7';
  ASSERT (SELECT count(*) FROM categories WHERE organization_id = c.org AND kind = 'income' AND nature = 'donation') = 2, 'two donation categories';
  ASSERT (SELECT nature FROM categories WHERE organization_id = c.org AND name = 'Bank interest') = 'other_income', 'nature is set';
  ASSERT (SELECT count(*) FROM categories WHERE organization_id = c.org_sb AND kind = 'income' AND NOT is_system) = 3, 'a small business gets the 3 revenue categories';
  ASSERT NOT EXISTS (SELECT 1 FROM categories WHERE organization_id = c.org_sb AND nature = 'donation'), 'no donation categories for a small business';

  UPDATE categories SET sort_order = 77 WHERE organization_id = c.org AND name = 'Sponsorships';
  PERFORM seed_income_categories(c.org);
  SELECT count(*) INTO n FROM categories WHERE organization_id = c.org;
  PERFORM seed_income_categories(c.org);
  ASSERT (SELECT count(*) FROM categories WHERE organization_id = c.org) = n, 'seeding twice adds nothing';
  ASSERT (SELECT sort_order FROM categories WHERE organization_id = c.org AND name = 'Sponsorships') = 77, 'an existing category is not changed by seeding';
  RAISE NOTICE 'PASS income categories are seeded per organisation type, once, without touching existing ones';
END $$;

-- ---------------------------------------------------------------- saving money in (Editor)
DO $$
DECLARE c record; v_id uuid; v_ref uuid; t record;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'mi-editor@example.com');
  SET LOCAL ROLE authenticated;

  v_id := save_money_in(jsonb_build_object(
    'tx_date', current_date, 'payee_name', 'Puan Aminah', 'reference', 'BANK-001', 'remarks', 'Hari Raya appeal',
    'lines', jsonb_build_array(
      jsonb_build_object('amount', 100, 'category_id', c.cat_don),
      jsonb_build_object('amount', 50.5, 'fund_id', c.fund_bld, 'category_id', c.cat_grant))));
  PERFORM pg_temp.commit_checks();
  SELECT * INTO t FROM transactions WHERE id = v_id;
  ASSERT t.total = 150.50 AND t.tx_type = 'money_in' AND t.source = 'manual' AND t.created_by = c.u_editor, 'header saved with the computed total';
  ASSERT (SELECT fund_id FROM transaction_lines WHERE transaction_id = v_id AND line_no = 1) = c.fund_gen, 'a line with no fund goes to the General Fund';
  ASSERT (SELECT account_id FROM transactions WHERE id = v_id) = (SELECT id FROM accounts WHERE organization_id = c.org AND is_default), 'no account means the Main Account';

  -- edit: replace the lines
  PERFORM save_money_in(jsonb_build_object('id', v_id, 'tx_date', current_date, 'payee_name', 'Puan Aminah',
    'lines', jsonb_build_array(jsonb_build_object('amount', 120, 'category_id', c.cat_don),
                               jsonb_build_object('amount', 50, 'fund_id', c.fund_bld, 'category_id', c.cat_grant))));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT total FROM transactions WHERE id = v_id) = 170, 'edit updates the total';
  ASSERT (SELECT count(*) FROM transaction_lines WHERE transaction_id = v_id) = 2, 'edit replaces the lines';

  -- a refund received against an expense category
  v_ref := save_money_in(jsonb_build_object('tx_date', current_date, 'payee_name', 'Landlord', 'is_refund', true,
    'lines', jsonb_build_array(jsonb_build_object('amount', 30, 'category_id', c.cat_rent))));
  PERFORM pg_temp.commit_checks();

  UPDATE m_ctx SET tx1 = v_id, tx_refund = v_ref;
  RAISE NOTICE 'PASS an Editor saves, splits, edits and records a refund; totals are worked out by the database';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- refusals
DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'mi-editor@example.com');
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, current_date, c.cat_rent),
    'Money in must use income categories', 'expense category without the refund flag');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","is_refund":true,"lines":[{"amount":10,"category_id":"%s"}]}')$q$, current_date, c.cat_don),
    'Money in must use income categories', 'refund flag with an income category');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, current_date, c.cat_other),
    'category does not belong', 'another organisation''s category');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":10,"fund_id":"%s","category_id":"%s"}]}')$q$, current_date, c.fund_other, c.cat_don),
    'fund does not belong', 'another organisation''s fund');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","payee_id":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, current_date, c.payee_other, c.cat_don),
    'payee does not belong', 'another organisation''s payee');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, current_date, c.cat_arch),
    'archived', 'an archived category');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":10,"fund_id":"%s","category_id":"%s"}]}')$q$, current_date, c.fund_arch, c.cat_don),
    'archived', 'an archived fund');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[]}')$q$, current_date), 'at least one line', 'no lines');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":-5,"category_id":"%s"}]}')$q$, current_date, c.cat_don), 'above zero', 'a negative amount');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":1.005,"category_id":"%s"}]}')$q$, current_date, c.cat_don), 'two decimals', 'three decimals');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"not a date","lines":[{"amount":1,"category_id":"%s"}]}')$q$, c.cat_don), 'valid date', 'a bad date');
  RAISE NOTICE 'PASS bad entries are refused: wrong category kind, other organisation, archived, empty, negative, too precise, bad date';

  -- direct writes: only manual money in; mirrored rows are untouchable
  PERFORM pg_temp.expect_error(format($q$INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, total)
      SELECT '%s', 'money_out', current_date, id, 1 FROM accounts WHERE organization_id = '%s' AND is_default$q$, c.org, c.org),
    'row-level security', 'a direct money-out insert');
  UPDATE transactions SET remarks = 'x' WHERE source = 'document'; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'an Editor changed a mirrored transaction';
  DELETE FROM transaction_lines WHERE transaction_id IN (SELECT id FROM transactions WHERE source = 'document'); GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'an Editor deleted a mirrored line';
  PERFORM pg_temp.expect_error(format($q$INSERT INTO transaction_lines (transaction_id, organization_id, amount, fund_id, category_id)
      VALUES ('%s', '%s', 5, '%s', '%s')$q$, c.tx1, c.org, c.fund_gen, c.cat_don),
    'must add up', 'an extra line that breaks the total');
  RAISE NOTICE 'PASS direct writes: no money out, mirrored rows untouchable, totals always balance';
END $$;
RESET ROLE;

DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'mi-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, current_date, c.cat_don),
    'Only Admins and Editors', 'a Viewer saving');
  PERFORM pg_temp.expect_error(format($q$SELECT issue_donation_receipt('%s')$q$, c.tx1), 'Only Admins and Editors', 'a Viewer issuing a receipt');
  ASSERT (SELECT count(*) FROM transactions WHERE organization_id = c.org AND source = 'manual') = 2, 'a Viewer can read money in';
  RAISE NOTICE 'PASS a Viewer can read but not record money in or issue receipts';
END $$;
RESET ROLE;

DO $$
DECLARE c record; v_free_cat uuid;
BEGIN
  SELECT * INTO c FROM m_ctx;
  SELECT id INTO v_free_cat FROM categories WHERE organization_id = c.org_free AND name = 'General donations';
  PERFORM pg_temp.sign_in(c.u_free, 'mi-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"tx_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, current_date, v_free_cat),
    'Growth and Nonprofit plans', 'a free organisation saving');
  RAISE NOTICE 'PASS a free organisation cannot record money in';
END $$;
RESET ROLE;

DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_other, 'mi-other@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM transactions WHERE organization_id = c.org) = 0, 'another organisation sees no transactions';
  ASSERT (SELECT count(*) FROM income_expenditure(c.org, current_date - 30, current_date + 1)) = 0, 'another organisation gets an empty statement';
  PERFORM pg_temp.expect_error(format($q$SELECT delete_money_in('%s')$q$, c.tx1), 'not found', 'another organisation deleting');
  PERFORM pg_temp.expect_error(format($q$SELECT issue_donation_receipt('%s')$q$, c.tx1), 'not found', 'another organisation issuing a receipt');
  RAISE NOTICE 'PASS a user from another organisation cannot read, delete or receipt the entries';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- donation receipts
DO $$
DECLARE c record; r donation_receipts%ROWTYPE; v_tx2 uuid; v_grant uuid; n int;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'mi-editor@example.com');
  SET LOCAL ROLE authenticated;

  r := issue_donation_receipt(c.tx1);
  ASSERT r.receipt_no = 'RCP-1' AND r.seq = 1, format('first receipt is RCP-1, got %s', r.receipt_no);
  ASSERT r.amount = 120, 'the receipt counts only the donation lines, not the grant';
  ASSERT r.donor_name = 'Puan Aminah' AND NOT r.tax_exempt, 'donor copied; not tax-exempt by default';

  v_tx2 := save_money_in(jsonb_build_object('tx_date', current_date,
    'lines', jsonb_build_array(jsonb_build_object('amount', 25, 'category_id', c.cat_don))));
  PERFORM pg_temp.commit_checks();
  ASSERT (issue_donation_receipt(v_tx2)).receipt_no = 'RCP-2', 'second receipt is RCP-2';
  ASSERT (SELECT donor_name FROM donation_receipts WHERE transaction_id = v_tx2) = 'Anonymous donor', 'no payee means Anonymous donor';

  PERFORM pg_temp.expect_error(format($q$SELECT issue_donation_receipt('%s')$q$, c.tx1), 'already been issued', 'a second receipt for the same entry');
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"id":"%s","tx_date":"%s","lines":[{"amount":1,"category_id":"%s"}]}')$q$, c.tx1, current_date, c.cat_don),
    'Void the receipt', 'editing a receipted entry');
  PERFORM pg_temp.expect_error(format($q$SELECT delete_money_in('%s')$q$, c.tx1), 'cannot be deleted', 'deleting a receipted entry');
  PERFORM pg_temp.expect_error(format($q$SELECT issue_donation_receipt('%s')$q$, c.tx_refund), 'only be issued for donations', 'a receipt for a refund');

  v_grant := save_money_in(jsonb_build_object('tx_date', current_date,
    'lines', jsonb_build_array(jsonb_build_object('amount', 500, 'category_id', c.cat_grant))));
  PERFORM pg_temp.commit_checks();
  PERFORM pg_temp.expect_error(format($q$SELECT issue_donation_receipt('%s')$q$, v_grant), 'no donation lines', 'a receipt for a grant');

  PERFORM pg_temp.expect_error(format($q$INSERT INTO donation_receipts (organization_id, transaction_id, seq, receipt_no, donor_name, donation_date, amount)
      VALUES ('%s', '%s', 99, 'FAKE-99', 'x', current_date, 1)$q$, c.org, c.tx1), 'permission denied', 'writing a receipt directly');

  PERFORM pg_temp.expect_error(format($q$SELECT void_donation_receipt('%s', '')$q$, r.id), 'Give a reason', 'voiding without a reason');
  PERFORM void_donation_receipt(r.id, 'Wrong donor name');
  PERFORM pg_temp.expect_error(format($q$SELECT void_donation_receipt('%s', 'again')$q$, r.id), 'already void', 'voiding twice');
  ASSERT (issue_donation_receipt(c.tx1)).receipt_no = 'RCP-3', 're-issuing after a void takes a NEW number';
  ASSERT (SELECT voided_at IS NOT NULL FROM donation_receipts WHERE receipt_no = 'RCP-1' AND organization_id = c.org), 'RCP-1 stays, marked void';
  ASSERT (SELECT array_agg(seq ORDER BY seq) FROM donation_receipts WHERE organization_id = c.org) = ARRAY[1,2,3], 'no gaps, no reuse';

  UPDATE m_ctx SET tx2 = v_tx2, tx_grant = v_grant, rcpt1 = r.id;
  RAISE NOTICE 'PASS receipts: sequential, donation lines only, one in force per entry, void keeps the number, entry locked while receipted';
END $$;
RESET ROLE;

DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'mi-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$UPDATE organizations SET receipt_next_number = 2 WHERE id = '%s'$q$, c.org),
    'must be after the last one issued', 'moving the receipt number back');
  UPDATE organizations SET receipt_next_number = 100 WHERE id = c.org;
  ASSERT (SELECT receipt_next_number FROM organizations WHERE id = c.org) = 100, 'moving it forward is allowed';
  RAISE NOTICE 'PASS the next receipt number can move forward but never back onto issued numbers';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- categories: archive, not delete
DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'mi-admin@example.com');
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.expect_error(format($q$DELETE FROM categories WHERE id = '%s'$q$, c.cat_don), 'Archive it instead', 'deleting a category used by money in');
  PERFORM pg_temp.expect_error(format($q$DELETE FROM categories WHERE id = '%s'$q$, c.cat_rent), 'Archive it instead', 'deleting a category used by a document');
  DELETE FROM categories WHERE id = c.cat_unused; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'an unused category can still be deleted';

  UPDATE categories SET archived_at = now() WHERE id = c.cat_grant;
  ASSERT (SELECT is_archived FROM categories WHERE id = c.cat_grant), 'the old is_archived flag follows archived_at';
  ASSERT (SELECT count(*) FROM transaction_lines WHERE category_id = c.cat_grant) >= 1, 'archiving keeps the history';
  UPDATE categories SET archived_at = NULL WHERE id = c.cat_grant;
  ASSERT NOT (SELECT is_archived FROM categories WHERE id = c.cat_grant), 'restore clears both';

  PERFORM pg_temp.expect_error(format($q$UPDATE categories SET archived_at = now() WHERE organization_id = '%s' AND name = 'Uncategorised income'$q$, c.org),
    'cannot be edited or archived', 'archiving a system category');
  PERFORM pg_temp.expect_error(format($q$DELETE FROM categories WHERE organization_id = '%s' AND name = 'Depreciation'$q$, c.org),
    'cannot be deleted', 'deleting a system category');
  RAISE NOTICE 'PASS categories in use are archived not deleted; unused ones can go; system ones are protected';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- attachments and running balance (stage 3b)
DO $$
DECLARE c record; n int; v_acct uuid; v_last uuid;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'mi-editor@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE transactions SET attachment_url = c.org || '/transactions/slip.pdf' WHERE id = c.tx_grant; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'an Editor can attach a file to money in';
  PERFORM pg_temp.expect_error(format($q$UPDATE transactions SET attachment_url = '../escape.pdf' WHERE id = '%s'$q$, c.tx_grant), 'attachment_url_check', 'a path that climbs out of the folder');

  SELECT id INTO v_acct FROM accounts WHERE organization_id = c.org AND is_default;
  SELECT id INTO v_last FROM transactions WHERE account_id = v_acct ORDER BY tx_date DESC, created_at DESC, id DESC LIMIT 1;
  -- opening 0, paid bill -200, then money in 170 + 30 + 25 + 500
  ASSERT (SELECT balance FROM account_running_balance(v_acct, ARRAY[v_last])) = 525,
    format('running balance after the last entry should be 525, got %s', (SELECT balance FROM account_running_balance(v_acct, ARRAY[v_last])));
  RAISE NOTICE 'PASS attachments on money in, and the account running balance';
END $$;
RESET ROLE;

DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'mi-viewer@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE transactions SET attachment_url = NULL WHERE id = c.tx_grant; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'a Viewer changed an attachment';
  RAISE NOTICE 'PASS a Viewer cannot change attachments';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- Income & Expenditure and dashboard
DO $$
DECLARE c record; v jsonb;
BEGIN
  SELECT * INTO c FROM m_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'mi-viewer@example.com');
  SET LOCAL ROLE authenticated;

  -- Worked by hand: donations 120 + 25 = 145; grants 50 + 500 = 550; Rent: paid bill 200 minus refund 30 = 170
  ASSERT (SELECT sum(amount) FROM income_expenditure(c.org, current_date - 1, current_date + 1) WHERE kind = 'income' AND nature = 'donation') = 145, 'donations 145';
  ASSERT (SELECT sum(amount) FROM income_expenditure(c.org, current_date - 1, current_date + 1) WHERE kind = 'income' AND nature = 'grant') = 550, 'grants 550';
  ASSERT (SELECT sum(amount) FROM income_expenditure(c.org, current_date - 1, current_date + 1) WHERE category_id = c.cat_rent) = 170, 'Rent 200 - 30 refund = 170';
  ASSERT (SELECT sum(amount) FROM income_expenditure(c.org, current_date - 1, current_date + 1, c.fund_bld)) = 50, 'fund filter: Building Fund has the 50 grant only';
  ASSERT (SELECT count(*) FROM income_expenditure(c.org, current_date + 10, current_date + 20)) = 0, 'outside the period: nothing';

  v := dashboard_cash_month(c.org, current_date);
  -- money in this month: 170 + 30 refund + 25 + 500 = 725; money out: the 200 bill
  ASSERT (v ->> 'money_in')::numeric = 725, format('money in 725, got %s', v ->> 'money_in');
  ASSERT (v ->> 'money_out')::numeric = 200, format('money out 200, got %s', v ->> 'money_out');
  RAISE NOTICE 'PASS Income & Expenditure and the dashboard match hand-worked figures';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- deleting and organisation clean-up
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM m_ctx;
  ASSERT (SELECT count(*) FROM accounting_parity_check(c.org)) = 0, 'documents and their mirrored transactions still agree';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM delete_organization_data(c.org);
  ASSERT NOT EXISTS (SELECT 1 FROM organizations WHERE id = c.org), 'an organisation with receipts can still be deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM donation_receipts WHERE organization_id = c.org), 'its receipts went with it';
  RAISE NOTICE 'PASS parity holds, and deleting an organisation with receipts works';
END $$;

ROLLBACK;
