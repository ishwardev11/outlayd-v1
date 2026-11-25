-- Automated test for invoices (Phase 3, stage 4a). Run on a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/invoices.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
-- pg_temp.commit_checks() runs the commit-time checks (lines add up, payments within the total) now.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE i_ctx (org uuid, org_free uuid, org_other uuid,
                         fund_gen uuid, fund_bld uuid, fund_other uuid,
                         cat_rent uuid, cat_staff uuid, cat_fees uuid, cat_don uuid, cat_arch uuid, cat_other uuid,
                         payee uuid, payee_other uuid,
                         u_admin uuid, u_editor uuid, u_viewer uuid, u_free uuid, u_other uuid,
                         inv_pay uuid, inv_rec uuid, pay1 uuid, rec_pay uuid);
GRANT ALL ON i_ctx TO authenticated;

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
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.commit_checks() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text) TO authenticated;

-- A payable invoice payload (rent 300 on the General Fund, salaries 200 on the Building Fund)
CREATE OR REPLACE FUNCTION pg_temp.bill(c i_ctx, p_issue date, p_extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('direction', 'payable', 'payee_id', c.payee, 'issue_date', p_issue, 'invoice_no', 'SUP-1',
    'lines', jsonb_build_array(
      jsonb_build_object('description', 'Hall rent', 'amount', 300, 'category_id', c.cat_rent),
      jsonb_build_object('description', 'Part-time staff', 'amount', 200, 'fund_id', c.fund_bld, 'category_id', c.cat_staff))) || p_extra;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.bill(i_ctx, date, jsonb) TO authenticated;

-- ---------------------------------------------------------------- setup (as the server)
DO $$
DECLARE o uuid; o_free uuid; o_other uuid; fg uuid; fb uuid; fo uuid;
        cr uuid; cs uuid; cf uuid; cd uuid; ca uuid; co uuid; p uuid; po uuid;
        ua uuid; ue uuid; uv uuid; uf uuid; uo uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Invoice Society', 'pro', 'growth') RETURNING id INTO o;
  INSERT INTO organizations (name) VALUES ('Free Invoice Society') RETURNING id INTO o_free;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Other Invoice Society', 'pro', 'growth') RETURNING id INTO o_other;

  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'iv-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'iv-editor@example.com') RETURNING id INTO ue;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'iv-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'iv-free@example.com') RETURNING id INTO uf;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'iv-other@example.com') RETURNING id INTO uo;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (o, 'iv-admin@example.com', 'Admin'), (o, 'iv-editor@example.com', 'Editor'), (o, 'iv-viewer@example.com', 'Viewer'),
    (o_free, 'iv-free@example.com', 'Admin'), (o_other, 'iv-other@example.com', 'Admin');

  SELECT id INTO fg FROM funds WHERE organization_id = o AND is_default;
  INSERT INTO funds (organization_id, name) VALUES (o, 'Building Fund') RETURNING id INTO fb;
  SELECT id INTO fo FROM funds WHERE organization_id = o_other AND is_default;
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (o, 'Rent', 'expense', 'Administration') RETURNING id INTO cr;
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (o, 'Salaries', 'expense', 'Staff') RETURNING id INTO cs;
  SELECT id INTO cf FROM categories WHERE organization_id = o AND name = 'Programme and course fees';
  SELECT id INTO cd FROM categories WHERE organization_id = o AND name = 'General donations';
  INSERT INTO categories (organization_id, name, kind, archived_at) VALUES (o, 'Old Expense', 'expense', now()) RETURNING id INTO ca;
  INSERT INTO categories (organization_id, name, kind) VALUES (o_other, 'Rent', 'expense') RETURNING id INTO co;
  INSERT INTO vendors (organization_id, name) VALUES (o, 'Dewan Komuniti') RETURNING id INTO p;
  INSERT INTO vendors (organization_id, name) VALUES (o_other, 'Other Payee') RETURNING id INTO po;

  INSERT INTO i_ctx (org, org_free, org_other, fund_gen, fund_bld, fund_other, cat_rent, cat_staff, cat_fees, cat_don, cat_arch, cat_other,
                     payee, payee_other, u_admin, u_editor, u_viewer, u_free, u_other)
  VALUES (o, o_free, o_other, fg, fb, fo, cr, cs, cf, cd, ca, co, p, po, ua, ue, uv, uf, uo);
END $$;

-- ---------------------------------------------------------------- creating invoices (Editor)
DO $$
DECLARE c i_ctx; v_pay uuid; v_rec uuid; v_rec2 uuid; i invoices%ROWTYPE;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;

  v_pay := save_invoice(pg_temp.bill(c, current_date, jsonb_build_object('due_date', current_date + 30)));
  PERFORM pg_temp.commit_checks();
  SELECT * INTO i FROM invoices WHERE id = v_pay;
  ASSERT i.total = 500 AND i.status = 'open' AND i.seq IS NULL AND i.invoice_no = 'SUP-1' AND i.payee_name = 'Dewan Komuniti' AND i.source = 'manual',
    'a bill saved with its total, the supplier number and no sequence';
  ASSERT (SELECT fund_id FROM invoice_lines WHERE invoice_id = v_pay AND line_no = 1) = c.fund_gen, 'a line with no fund goes to the General Fund';

  -- Receivable: a draft has no number; opening it takes INV-1; the next is INV-2
  v_rec := save_invoice(jsonb_build_object('direction', 'receivable', 'status', 'draft', 'payee_id', c.payee, 'issue_date', current_date,
    'invoice_no', 'IGNORED', 'lines', jsonb_build_array(jsonb_build_object('amount', 800, 'category_id', c.cat_fees))));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT seq IS NULL AND invoice_no IS NULL FROM invoices WHERE id = v_rec), 'a draft receivable has no number';
  PERFORM save_invoice(jsonb_build_object('id', v_rec, 'direction', 'receivable', 'status', 'open', 'payee_id', c.payee, 'issue_date', current_date,
    'due_date', current_date + 14, 'lines', jsonb_build_array(jsonb_build_object('amount', 800, 'category_id', c.cat_fees))));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT invoice_no FROM invoices WHERE id = v_rec) = 'INV-1', 'opening it takes INV-1';
  v_rec2 := save_invoice(jsonb_build_object('direction', 'receivable', 'payee_id', c.payee, 'issue_date', current_date,
    'lines', jsonb_build_array(jsonb_build_object('amount', 50, 'category_id', c.cat_fees))));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT invoice_no FROM invoices WHERE id = v_rec2) = 'INV-2', 'the next one is INV-2';
  PERFORM save_invoice(jsonb_build_object('id', v_rec, 'direction', 'receivable', 'payee_id', c.payee, 'issue_date', current_date,
    'remarks', 'edited', 'lines', jsonb_build_array(jsonb_build_object('amount', 800, 'category_id', c.cat_fees))));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT invoice_no FROM invoices WHERE id = v_rec) = 'INV-1', 'editing keeps the number';
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"id":"%s","direction":"receivable","status":"draft","payee_id":"%s","issue_date":"%s","lines":[{"amount":800,"category_id":"%s"}]}')$q$,
    v_rec, c.payee, current_date, c.cat_fees), 'cannot go back to draft', 'a numbered invoice back to draft');

  UPDATE i_ctx SET inv_pay = v_pay, inv_rec = v_rec;
  RAISE NOTICE 'PASS an Editor creates bills and invoices; receivable numbers are taken when opened, kept on edit';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- refusals
DO $$
DECLARE c i_ctx;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, c.payee, current_date, c.cat_fees),
    'A bill uses expense categories', 'a bill with an income category');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, c.payee, current_date, c.cat_other),
    'category does not belong', 'another organisation''s category');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":10,"fund_id":"%s","category_id":"%s"}]}')$q$, c.payee, current_date, c.fund_other, c.cat_rent),
    'fund does not belong', 'another organisation''s fund');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, c.payee_other, current_date, c.cat_rent),
    'payee does not belong', 'another organisation''s payee');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, c.payee, current_date, c.cat_arch),
    'archived', 'an archived category');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","due_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, c.payee, current_date, current_date - 1, c.cat_rent),
    'due date cannot be before', 'due before issue');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[]}')$q$, c.payee, current_date), 'at least one line', 'no lines');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":-1,"category_id":"%s"}]}')$q$, c.payee, current_date, c.cat_rent), 'above zero', 'a negative amount');
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","issue_date":"%s","lines":[{"amount":1,"category_id":"%s"}]}')$q$, current_date, c.cat_rent), 'Choose who', 'no payee');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO invoices (organization_id, direction, payee_name, issue_date, total) VALUES ('%s', 'payable', 'x', current_date, 1)$q$, c.org),
    'permission denied', 'writing an invoice directly');
  PERFORM pg_temp.expect_error(format($q$UPDATE invoices SET total = 1 WHERE id = '%s'$q$, c.inv_pay), 'permission denied', 'changing an invoice directly');
  RAISE NOTICE 'PASS bad invoices are refused: wrong category kind, other organisation, archived, dates, empty, negative, direct writes';
END $$;
RESET ROLE;

DO $$
DECLARE c i_ctx; v_cat uuid; v_payee uuid;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'iv-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('%s')$q$, pg_temp.bill(c, current_date)), 'Only Admins and Editors', 'a Viewer saving');
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":1,"tx_date":"%s"}')$q$, c.inv_pay, current_date), 'Only Admins and Editors', 'a Viewer paying');
  ASSERT (SELECT count(*) FROM invoice_summary WHERE organization_id = c.org) = 3, 'a Viewer can read invoices';
  RESET ROLE;

  SELECT id INTO v_cat FROM categories WHERE organization_id = c.org_free AND kind = 'expense' LIMIT 1;
  INSERT INTO vendors (organization_id, name) VALUES (c.org_free, 'Free Payee') RETURNING id INTO v_payee;
  PERFORM pg_temp.sign_in(c.u_free, 'iv-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":10,"category_id":"%s"}]}')$q$, v_payee, current_date, v_cat),
    'Growth and Nonprofit plans', 'a free organisation creating an invoice');
  RESET ROLE;

  PERFORM pg_temp.sign_in(c.u_other, 'iv-other@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM invoice_summary WHERE organization_id = c.org) = 0, 'another organisation sees no invoices';
  ASSERT (SELECT count(*) FROM invoice_lines WHERE organization_id = c.org) = 0, 'another organisation sees no invoice lines';
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":1,"tx_date":"%s"}')$q$, c.inv_pay, current_date), 'not found', 'another organisation paying');
  PERFORM pg_temp.expect_error(format($q$SELECT void_invoice('%s', 'x')$q$, c.inv_pay), 'not found', 'another organisation voiding');
  RAISE NOTICE 'PASS a Viewer reads only; a free organisation cannot create invoices; another organisation sees and changes nothing';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- payments
DO $$
DECLARE c i_ctx; v_pay1 uuid; v_pay2 uuid; v_rec_pay uuid; s record;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;

  v_pay1 := record_invoice_payment(jsonb_build_object('invoice_id', c.inv_pay, 'amount', 200, 'tx_date', current_date));
  PERFORM pg_temp.commit_checks();
  -- 200 of a 500 bill split in proportion: rent 300/500 -> 120, salaries 200/500 -> 80
  ASSERT (SELECT tx_type FROM transactions WHERE id = v_pay1) = 'money_out', 'paying a bill is money out';
  ASSERT (SELECT amount FROM transaction_lines WHERE transaction_id = v_pay1 AND category_id = c.cat_rent) = 120, 'rent share 120';
  ASSERT (SELECT amount FROM transaction_lines WHERE transaction_id = v_pay1 AND category_id = c.cat_staff AND fund_id = c.fund_bld) = 80, 'salaries share 80 on the Building Fund';
  SELECT * INTO s FROM invoice_summary WHERE id = c.inv_pay;
  ASSERT s.paid = 200 AND s.balance = 300 AND s.derived_status = 'part_paid', format('part-paid 200/300, got %s %s %s', s.paid, s.balance, s.derived_status);

  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":300.01,"tx_date":"%s"}')$q$, c.inv_pay, current_date),
    'more than the balance', 'overpaying a bill');
  PERFORM pg_temp.expect_error(format($q$SELECT void_invoice('%s', 'mistake')$q$, c.inv_pay), 'with payments cannot be voided', 'voiding a bill with payments');

  v_pay2 := record_invoice_payment(jsonb_build_object('invoice_id', c.inv_pay, 'amount', 300, 'tx_date', current_date));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT derived_status FROM invoice_summary WHERE id = c.inv_pay) = 'paid', 'paid in full';
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":0.01,"tx_date":"%s"}')$q$, c.inv_pay, current_date),
    'more than the balance', 'paying a paid bill');

  PERFORM delete_invoice_payment(v_pay2);
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT balance FROM invoice_summary WHERE id = c.inv_pay) = 300, 'deleting a payment reopens the balance';

  -- Receivable: paid with money in, income categories
  v_rec_pay := record_invoice_payment(jsonb_build_object('invoice_id', c.inv_rec, 'amount', 500, 'tx_date', current_date, 'reference', 'FPX-1', 'attachment_path', c.org || '/transactions/test-receipt.pdf'));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT tx_type || '/' || reference FROM transactions WHERE id = v_rec_pay) = 'money_in/FPX-1', 'paying an invoice you issued is money in';

  UPDATE i_ctx SET pay1 = v_pay1, rec_pay = v_rec_pay;
  RAISE NOTICE 'PASS payments split in proportion, part-paid and paid are derived, overpaying and voiding with payments are refused';
END $$;
RESET ROLE;

-- Money received for an invoice you issued needs its receipt (invoices and AI plan, step 1)
DO $$
DECLARE c i_ctx; v_path text; v_status text;
BEGIN
  SELECT * INTO c FROM i_ctx;
  v_path := c.org || '/transactions/test-receipt.pdf';
  SELECT derived_status INTO v_status FROM invoice_summary WHERE id = c.inv_rec;
  ASSERT (SELECT receipts_missing FROM invoice_summary WHERE id = c.inv_rec) = 0, 'no receipt missing when every payment has one';
  ASSERT (SELECT receipts_missing FROM invoice_summary WHERE id = c.inv_pay) = 0, 'bills never count a receipt missing';
  ASSERT (SELECT attachment_url FROM transactions WHERE id = c.rec_pay) = v_path, 'the receipt is saved with the payment';

  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":1,"tx_date":"%s"}')$q$, c.inv_rec, current_date),
    'Attach the receipt', 'a payment received without a receipt');
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":1,"tx_date":"%s","attachment_path":"%s/transactions/x.pdf"}')$q$, c.inv_rec, current_date, c.org_other),
    'could not be attached', 'a receipt from another organisation''s folder');
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":1,"tx_date":"%s","attachment_path":"%s/../x.pdf"}')$q$, c.inv_rec, current_date, c.org),
    'could not be attached', 'a receipt path leaving the folder');
  PERFORM pg_temp.expect_error(format($q$SELECT set_invoice_payment_receipt('%s', '%s')$q$, c.rec_pay, v_path), 'already has a receipt', 'replacing a receipt');
  PERFORM pg_temp.expect_error(format($q$SELECT set_invoice_payment_receipt('%s', '%s')$q$, c.pay1, v_path), 'not found', 'a receipt on a bill payment');
  RESET ROLE;

  -- An older payment without a receipt (from before this rule) can get one
  UPDATE transactions SET attachment_url = NULL WHERE id = c.rec_pay;
  ASSERT (SELECT receipts_missing FROM invoice_summary WHERE id = c.inv_rec) = 1, 'a payment without its receipt is counted';
  ASSERT (SELECT derived_status FROM invoice_summary WHERE id = c.inv_rec) = v_status, 'the derived status itself is unchanged';
  PERFORM pg_temp.sign_in(c.u_viewer, 'iv-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT set_invoice_payment_receipt('%s', '%s')$q$, c.rec_pay, v_path), 'Only Admins and Editors', 'a Viewer adding a receipt');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT set_invoice_payment_receipt('%s', '%s/transactions/x.pdf')$q$, c.rec_pay, c.org_other), 'could not be attached', 'adding a receipt from another folder');
  RESET ROLE;

  -- ... but not in a locked period
  PERFORM set_config('app.lock_change', 'on', true);
  UPDATE organizations SET lock_date = current_date WHERE id = c.org;
  PERFORM set_config('app.lock_change', 'off', true);
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT set_invoice_payment_receipt('%s', '%s')$q$, c.rec_pay, v_path), 'locked period', 'adding a receipt in a locked period');
  RESET ROLE;
  PERFORM set_config('app.lock_change', 'on', true);
  UPDATE organizations SET lock_date = NULL WHERE id = c.org;
  PERFORM set_config('app.lock_change', 'off', true);

  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM set_invoice_payment_receipt(c.rec_pay, v_path);
  RESET ROLE;
  ASSERT (SELECT attachment_url FROM transactions WHERE id = c.rec_pay) = v_path, 'the receipt is added to the older payment';
  ASSERT (SELECT receipts_missing FROM invoice_summary WHERE id = c.inv_rec) = 0, 'adding the receipt clears receipt missing';
  ASSERT (SELECT attachment_url FROM transactions WHERE id = c.pay1) IS NULL, 'bills are paid without a receipt, as before';
  RAISE NOTICE 'PASS a payment received needs its receipt; older payments can get one, not in a locked period';
END $$;
RESET ROLE;

-- A payment can never be turned into plain income or expense (that would count it twice)
DO $$
DECLARE c i_ctx; n int;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_money_in('{"id":"%s","tx_date":"%s","lines":[{"amount":500,"category_id":"%s"}]}')$q$, c.rec_pay, current_date, c.cat_fees),
    'pays an invoice', 'editing a payment as plain money in');
  PERFORM pg_temp.expect_error(format($q$SELECT delete_money_in('%s')$q$, c.rec_pay), 'pays an invoice', 'deleting a payment as money in');
  PERFORM pg_temp.expect_error(format($q$UPDATE transaction_lines SET invoice_id = NULL WHERE transaction_id = '%s'$q$, c.rec_pay), 'pays an invoice', 'unlinking a payment line');
  PERFORM pg_temp.expect_error(format($q$UPDATE transactions SET total = 1 WHERE id = '%s'$q$, c.rec_pay), 'pays an invoice', 'changing a payment header');
  UPDATE transaction_lines SET amount = 1 WHERE transaction_id = c.pay1; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'a bill payment (money out) is not writable at all';
  RAISE NOTICE 'PASS payments of invoices can only be changed through the Invoices functions';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- derived status and ageing
DO $$
DECLARE c i_ctx; v1 uuid; v2 uuid; v3 uuid; v4 uuid; v_draft uuid;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  v1 := save_invoice(pg_temp.bill(c, current_date - 20, jsonb_build_object('due_date', current_date - 10)));
  v2 := save_invoice(pg_temp.bill(c, current_date - 60, jsonb_build_object('due_date', current_date - 45)));
  v3 := save_invoice(pg_temp.bill(c, current_date - 90, jsonb_build_object('due_date', current_date - 70)));
  v4 := save_invoice(pg_temp.bill(c, current_date, jsonb_build_object('due_date', current_date)));
  v_draft := save_invoice(pg_temp.bill(c, current_date, jsonb_build_object('status', 'draft')));
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT derived_status || '/' || days_overdue || '/' || ageing_bucket FROM invoice_summary WHERE id = v1) = 'overdue/10/1_30', 'overdue 10 days: 1-30';
  ASSERT (SELECT ageing_bucket FROM invoice_summary WHERE id = v2) = '31_60', '45 days: 31-60';
  ASSERT (SELECT ageing_bucket FROM invoice_summary WHERE id = v3) = '61_plus', '70 days: 61+';
  ASSERT (SELECT derived_status || '/' || ageing_bucket FROM invoice_summary WHERE id = v4) = 'open/current', 'due today is not overdue';
  ASSERT (SELECT derived_status || '/' || COALESCE(ageing_bucket, '-') FROM invoice_summary WHERE id = v_draft) = 'draft/-', 'a draft is not aged';

  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":1,"tx_date":"%s"}')$q$, v_draft, current_date), 'Only an open invoice', 'paying a draft');
  PERFORM delete_invoice(v_draft);
  ASSERT NOT EXISTS (SELECT 1 FROM invoices WHERE id = v_draft), 'a draft can be deleted';
  PERFORM pg_temp.expect_error(format($q$SELECT delete_invoice('%s')$q$, v4), 'Only a draft', 'deleting an open invoice');
  PERFORM pg_temp.expect_error(format($q$SELECT void_invoice('%s', '')$q$, v4), 'Give a reason', 'voiding without a reason');
  PERFORM void_invoice(v4, 'Entered twice');
  ASSERT (SELECT derived_status FROM invoice_summary WHERE id = v4) = 'void', 'voided';
  PERFORM pg_temp.expect_error(format($q$SELECT record_invoice_payment('{"invoice_id":"%s","amount":1,"tx_date":"%s"}')$q$, v4, current_date), 'Only an open invoice', 'paying a void invoice');
  RAISE NOTICE 'PASS overdue, ageing buckets, drafts and voids are derived and enforced';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- bills from uploads
DO $$
DECLARE c i_ctx; d uuid; v_inv uuid; v_p uuid; v_p2 uuid; d_rcpt uuid; d_rcpt2 uuid; n int;
BEGIN
  SELECT * INTO c FROM i_ctx;
  -- an approved bill awaiting payment gets a payable invoice
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  VALUES (c.org, 'Electric Co', 'awaiting_payment', 'invoice', 400, current_date - 5, current_date + 25, c.fund_gen, c.cat_rent, 'EL-77') RETURNING id INTO d;
  SELECT id INTO v_inv FROM invoices WHERE document_id = d;
  ASSERT v_inv IS NOT NULL, 'approving a bill creates its invoice';
  ASSERT (SELECT total || '/' || invoice_no || '/' || source || '/' || due_date FROM invoices WHERE id = v_inv) = '400.00/EL-77/document/' || (current_date + 25), 'invoice copies the bill';
  ASSERT NOT EXISTS (SELECT 1 FROM transactions WHERE document_id = d), 'no cash yet';

  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT save_invoice('{"id":"%s","direction":"payable","payee_id":"%s","issue_date":"%s","lines":[{"amount":1,"category_id":"%s"}]}')$q$, v_inv, c.payee, current_date, c.cat_rent),
    'came from an upload', 'editing a bill invoice directly');
  v_p := record_invoice_payment(jsonb_build_object('invoice_id', v_inv, 'amount', 150, 'tx_date', current_date - 2));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  ASSERT (SELECT status FROM documents WHERE id = d) = 'awaiting_payment', 'a part-payment leaves the bill awaiting payment';

  -- marking the bill paid records only what is still owed
  UPDATE documents SET status = 'paid', paid_date = current_date WHERE id = d;
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT total FROM transactions WHERE document_id = d AND tx_type = 'money_out') = 250, 'the bill''s own payment is the remaining 250';
  ASSERT (SELECT derived_status FROM invoice_summary WHERE id = v_inv) = 'paid', 'the invoice is paid';
  ASSERT (SELECT count(*) FROM accounting_parity_check(c.org)) = 0, 'parity holds with part-payments';

  -- marking it unpaid removes only that payment
  UPDATE documents SET status = 'awaiting_payment', paid_date = NULL WHERE id = d;
  PERFORM pg_temp.commit_checks();
  ASSERT NOT EXISTS (SELECT 1 FROM transactions WHERE document_id = d), 'the bill''s own payment is gone';
  ASSERT (SELECT balance FROM invoice_summary WHERE id = v_inv) = 250, 'the part-payment stays';

  -- paying the rest on the Invoices page makes the bill paid; deleting that payment reverts it
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  v_p2 := record_invoice_payment(jsonb_build_object('invoice_id', v_inv, 'amount', 250, 'tx_date', current_date - 1));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  ASSERT (SELECT status || '/' || paid_date FROM documents WHERE id = d) = 'paid/' || (current_date - 1), 'paid in full on the Invoices page: the bill is paid';
  ASSERT NOT EXISTS (SELECT 1 FROM transactions WHERE document_id = d), 'no second payment from the bill itself';
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM delete_invoice_payment(v_p2);
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  ASSERT (SELECT status FROM documents WHERE id = d) = 'awaiting_payment', 'deleting that payment puts the bill back to awaiting payment';

  -- a bill with payments recorded on the Invoices page cannot be deleted
  PERFORM pg_temp.expect_error(format($q$DELETE FROM documents WHERE id = '%s'$q$, d), 'Delete those payments first', 'deleting a bill with payments');

  -- receipts: paid straight away stay plain money out; awaiting payment get an invoice until paid
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (c.org, 'Corner Shop', 'paid', 'receipt', 12.5, current_date, current_date, c.fund_gen, c.cat_rent) RETURNING id INTO d_rcpt;
  ASSERT NOT EXISTS (SELECT 1 FROM invoices WHERE document_id = d_rcpt), 'a receipt paid on the spot has no invoice';
  ASSERT (SELECT count(*) FROM transaction_lines l JOIN transactions t ON t.id = l.transaction_id WHERE t.document_id = d_rcpt AND l.invoice_id IS NULL) = 1, 'it is plain money out';
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, fund_id, category_id)
  VALUES (c.org, 'Hardware Shop', 'awaiting_payment', 'receipt', 80, current_date, c.fund_gen, c.cat_rent) RETURNING id INTO d_rcpt2;
  ASSERT EXISTS (SELECT 1 FROM invoices WHERE document_id = d_rcpt2), 'a receipt awaiting payment is owed: it has an invoice';
  UPDATE documents SET status = 'paid', paid_date = current_date WHERE id = d_rcpt2;
  PERFORM pg_temp.commit_checks();
  ASSERT NOT EXISTS (SELECT 1 FROM invoices WHERE document_id = d_rcpt2), 'once paid, the receipt is plain money out again';
  ASSERT (SELECT total FROM transactions WHERE document_id = d_rcpt2) = 80, 'with its full amount';

  -- a user deleting a paid bill (no Invoices-page payments) removes its invoice and payment
  UPDATE documents SET status = 'paid', paid_date = current_date WHERE vendor_name = 'Electric Co' AND organization_id = c.org;
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (c.org, 'Delete Me', 'paid', 'invoice', 99, current_date, current_date, c.fund_gen, c.cat_rent) RETURNING id INTO d;
  ASSERT EXISTS (SELECT 1 FROM transaction_lines l JOIN transactions t ON t.id = l.transaction_id WHERE t.document_id = d AND l.invoice_id IS NOT NULL), 'a paid bill pays its invoice';
  PERFORM pg_temp.sign_in(c.u_admin, 'iv-admin@example.com');
  SET LOCAL ROLE authenticated;
  DELETE FROM documents WHERE id = d; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  ASSERT n = 1 AND NOT EXISTS (SELECT 1 FROM invoices WHERE document_id = d) AND NOT EXISTS (SELECT 1 FROM transactions WHERE document_id = d),
    'deleting the bill removes its invoice and payment';
  ASSERT (SELECT count(*) FROM accounting_parity_check(c.org)) = 0, 'parity still holds';
  RAISE NOTICE 'PASS bills from uploads: invoice on approval, part-payments, paid/unpaid, auto-paid, receipts unchanged, delete rules';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- Income & Expenditure (R1, R3) and Receipts & Payments
DO $$
DECLARE c i_ctx; v_bill uuid; v_open uuid; v_rec uuid; v_void uuid; v_draft uuid; v_ob uuid; v_don uuid; cp record;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'iv-editor@example.com');
  SET LOCAL ROLE authenticated;
  -- All in 2025, away from the rest of this test
  v_bill := save_invoice(pg_temp.bill(c, '2025-03-10'));
  v_rec := save_invoice(jsonb_build_object('direction', 'receivable', 'payee_id', c.payee, 'issue_date', '2025-03-15',
    'lines', jsonb_build_array(jsonb_build_object('amount', 800, 'category_id', c.cat_fees))));
  v_ob := save_invoice(pg_temp.bill(c, '2025-03-01', '{"is_opening_balance": true}'));
  v_void := save_invoice(pg_temp.bill(c, '2025-03-11'));
  v_draft := save_invoice(pg_temp.bill(c, '2025-03-12', '{"status": "draft"}'));
  PERFORM pg_temp.commit_checks();
  PERFORM void_invoice(v_void, 'Duplicate');
  v_don := save_money_in(jsonb_build_object('tx_date', '2025-03-20', 'lines', jsonb_build_array(jsonb_build_object('amount', 100, 'category_id', c.cat_don))));
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', v_bill, 'amount', 200, 'tx_date', '2025-04-05'));
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', v_rec, 'amount', 800, 'tx_date', '2025-04-06', 'attachment_path', c.org || '/transactions/test-receipt.pdf'));
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', v_ob, 'amount', 1000 - 500, 'tx_date', '2025-04-07'));
  PERFORM pg_temp.commit_checks();

  -- Hand-worked, March 2025: income = fees 800 (invoice, by issue date) + donation 100 = 900;
  -- expenditure = the bill 500 (rent 300 + salaries 200). Opening-balance, void and draft invoices: nothing.
  ASSERT (SELECT sum(amount) FROM income_expenditure(c.org, '2025-03-01', '2025-03-31') WHERE kind = 'income') = 900, 'March income 900';
  ASSERT (SELECT sum(amount) FROM income_expenditure(c.org, '2025-03-01', '2025-03-31') WHERE kind = 'expense') = 500,
    format('March expenditure 500, got %s', (SELECT sum(amount) FROM income_expenditure(c.org, '2025-03-01', '2025-03-31') WHERE kind = 'expense'));
  ASSERT (SELECT sum(amount) FROM income_expenditure(c.org, '2025-03-01', '2025-03-31', c.fund_bld)) = 200, 'Building Fund: salaries 200';
  -- April 2025: only payments of invoices happened, and they are never counted again (R1, R3)
  ASSERT (SELECT count(*) FROM income_expenditure(c.org, '2025-04-01', '2025-04-30')) = 0, 'April: payments are not counted again';

  -- Receipts & Payments, April 2025: cash by category. Payments 200 (rent 120, salaries 80) + 500 opening bill
  -- (rent 300/500 -> 300, salaries 200) ; receipts 800 fees.
  ASSERT (SELECT sum(amount) FROM receipts_payments(c.org, '2025-04-01', '2025-04-30') WHERE section = 'receipts') = 800, 'April receipts 800';
  ASSERT (SELECT sum(amount) FROM receipts_payments(c.org, '2025-04-01', '2025-04-30') WHERE section = 'payments') = 700, 'April payments 700';
  ASSERT (SELECT sum(amount) FROM receipts_payments(c.org, '2025-04-01', '2025-04-30') WHERE section = 'payments' AND category_id = c.cat_rent) = 420, 'rent 120 + 300';
  SELECT * INTO cp FROM cash_position(c.org, '2025-04-01', '2025-04-30');
  -- opening (before April 2025): the March donation 100; closing: 100 + 800 - 700 = 200
  ASSERT cp.opening = 100 AND cp.closing = 200, format('cash 100 -> 200, got %s -> %s', cp.opening, cp.closing);
  RAISE NOTICE 'PASS Income & Expenditure follows R1 and R3; Receipts & Payments and cash agree, worked by hand';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- numbering and organisation clean-up
DO $$
DECLARE c i_ctx;
BEGIN
  SELECT * INTO c FROM i_ctx;
  PERFORM pg_temp.sign_in(c.u_admin, 'iv-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$UPDATE organizations SET invoice_next_number = 2 WHERE id = '%s'$q$, c.org), 'must be after the last one issued', 'moving the invoice number back');
  RESET ROLE;
  ASSERT (SELECT count(*) FROM accounting_parity_check(c.org)) = 0, 'parity holds at the end';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM delete_organization_data(c.org);
  ASSERT NOT EXISTS (SELECT 1 FROM invoices WHERE organization_id = c.org), 'an organisation with invoices and payments can be deleted';
  RAISE NOTICE 'PASS invoice numbers never move back; parity holds; deleting an organisation with invoices works';
END $$;

ROLLBACK;
