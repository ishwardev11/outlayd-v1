-- Automated test for the Uncategorised queue (invoices and AI plan, step 8). Run on a LOCAL database
-- after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/uncategorised.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- An uploaded receipt paid with no category, a bill approved with a split missing its category, a typed
-- money-in line and an invoice line in the system Uncategorised categories: all four are listed, the
-- integrity check blocks, each is fixed with set_item_category (with the refusals), and then the queue
-- is empty and the check passes. The period lock and the roles hold.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE u_ctx (org uuid, u_editor uuid, u_viewer uuid, fund uuid, cat_rent uuid, cat_print uuid, cat_fees uuid,
                         unc uuid, unc_in uuid, doc_paid uuid, doc_bill uuid, tx uuid, tx_line uuid, inv uuid, inv_line uuid);
GRANT ALL ON u_ctx TO authenticated;

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

-- ---------------------------------------------------------------- set-up (as the server)
DO $$
DECLARE o uuid; ue uuid; uv uuid; f uuid; c_rent uuid; c_print uuid; c_fees uuid; c_unc uuid; c_unc_in uuid;
        d1 uuid; d2 uuid; t uuid; tl uuid; i uuid; il uuid; acc uuid; payee uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Queue Society', 'pro', 'nonprofit') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'uq-editor@example.com') RETURNING id INTO ue;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'uq-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO user_roles (organization_id, email, role) VALUES (o, 'uq-editor@example.com', 'Editor'), (o, 'uq-viewer@example.com', 'Viewer');
  SELECT id INTO f FROM funds WHERE organization_id = o AND is_default;
  SELECT id INTO acc FROM accounts WHERE organization_id = o AND is_default;
  SELECT id INTO c_unc FROM categories WHERE organization_id = o AND is_system AND name = 'Uncategorised';
  SELECT id INTO c_unc_in FROM categories WHERE organization_id = o AND is_system AND name = 'Uncategorised income';
  INSERT INTO categories (organization_id, name, kind) VALUES (o, 'Rent', 'expense') RETURNING id INTO c_rent;
  INSERT INTO categories (organization_id, name, kind) VALUES (o, 'Printing', 'expense') RETURNING id INTO c_print;
  INSERT INTO categories (organization_id, name, kind) VALUES (o, 'Hall rental income', 'income') RETURNING id INTO c_fees;
  INSERT INTO vendors (organization_id, name) VALUES (o, 'Hangover Club') RETURNING id INTO payee;

  -- a receipt approved and paid with no category: its cash book line is Uncategorised
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id)
  VALUES (o, 'Kedai Cetak', 'paid', 'receipt', 120, current_date - 3, current_date - 3, f) RETURNING id INTO d1;
  -- an unpaid bill split in two, one split without a category: its bill has one Uncategorised line
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, due_date, fund_id, splits)
  VALUES (o, 'TNB', 'awaiting_payment', 'invoice', 300, current_date - 2, current_date + 20, f,
          jsonb_build_array(jsonb_build_object('amount', 200, 'category_id', c_rent::text, 'fund_id', f::text),
                            jsonb_build_object('amount', 100, 'fund_id', f::text))) RETURNING id INTO d2;
  -- a typed money-in entry with a line in Uncategorised income (as older data or an import may have)
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, payee_id, payee_name, remarks, total, source)
  VALUES (o, 'money_in', current_date - 1, acc, payee, 'Hangover Club', 'Hall hire', 500, 'manual') RETURNING id INTO t;
  INSERT INTO transaction_lines (transaction_id, organization_id, line_no, amount, fund_id, category_id) VALUES (t, o, 1, 500, f, c_unc_in) RETURNING id INTO tl;
  -- an invoice you issued with a line in Uncategorised income
  INSERT INTO invoices (organization_id, direction, payee_id, payee_name, issue_date, total, status, source)
  VALUES (o, 'receivable', payee, 'Hangover Club', current_date - 1, 800, 'open', 'manual') RETURNING id INTO i;
  INSERT INTO invoice_lines (invoice_id, organization_id, line_no, description, amount, fund_id, category_id) VALUES (i, o, 1, 'Hall rental', 800, f, c_unc_in) RETURNING id INTO il;
  PERFORM pg_temp.commit_checks();
  INSERT INTO u_ctx VALUES (o, ue, uv, f, c_rent, c_print, c_fees, c_unc, c_unc_in, d1, d2, t, tl, i, il);
END $$;

-- ---------------------------------------------------------------- what is listed
DO $$
DECLARE c u_ctx;
BEGIN
  SELECT * INTO c FROM u_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'uq-editor@example.com');
  SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM uncategorised_items(c.org)) = 4, format('four items, got %s', (SELECT count(*) FROM uncategorised_items(c.org)));
  ASSERT (SELECT amount FROM uncategorised_items(c.org) WHERE kind = 'document' AND record_id = c.doc_bill) = 100, 'the bill: only its uncategorised 100';
  ASSERT (SELECT amount FROM uncategorised_items(c.org) WHERE kind = 'document' AND record_id = c.doc_paid) = 120, 'the receipt: 120';
  ASSERT (SELECT direction FROM uncategorised_items(c.org) WHERE kind = 'transaction') = 'in', 'money in needs an income category';
  ASSERT (SELECT count(*) FROM uncategorised_items(c.org, current_date - 1, current_date)) = 2, 'a period limits the list';
  ASSERT NOT (SELECT passed FROM integrity_checks(c.org, current_date - 30, current_date) WHERE code = 'uncategorised'), 'the integrity check blocks';
  RESET ROLE;
  RAISE NOTICE 'PASS the queue lists uploaded documents, typed entries and invoices that are Uncategorised';
END $$;

-- ---------------------------------------------------------------- refusals
DO $$
DECLARE c u_ctx;
BEGIN
  SELECT * INTO c FROM u_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'uq-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT set_item_category('document', '%s', NULL, '%s')$q$, c.doc_paid, c.cat_print), 'Only Admins and Editors', 'a Viewer');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_editor, 'uq-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT set_item_category('transaction', '%s', '%s', '%s')$q$, c.tx, c.tx_line, c.cat_rent), 'income categories', 'an expense category on money in');
  PERFORM pg_temp.expect_error(format($q$SELECT set_item_category('document', '%s', NULL, '%s')$q$, c.doc_paid, c.unc), 'expense categories', 'a system category');
  PERFORM pg_temp.expect_error(format($q$SELECT set_item_category('invoice', '%s', '%s', '%s')$q$, c.inv, c.tx_line, c.cat_fees), 'not found', 'a line of another entry');
  RESET ROLE;

  -- the period lock holds
  PERFORM set_config('app.lock_change', 'on', true);
  UPDATE organizations SET lock_date = current_date - 3 WHERE id = c.org;
  PERFORM set_config('app.lock_change', 'off', true);
  PERFORM pg_temp.sign_in(c.u_editor, 'uq-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format($q$SELECT set_item_category('document', '%s', NULL, '%s')$q$, c.doc_paid, c.cat_print), 'locked period', 'a receipt in a locked period');
  RESET ROLE;
  PERFORM set_config('app.lock_change', 'on', true);
  UPDATE organizations SET lock_date = NULL WHERE id = c.org;
  PERFORM set_config('app.lock_change', 'off', true);
  RAISE NOTICE 'PASS Viewers, wrong kinds, system categories and locked periods are refused';
END $$;

-- ---------------------------------------------------------------- accepting clears the queue
DO $$
DECLARE c u_ctx;
BEGIN
  SELECT * INTO c FROM u_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'uq-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM set_item_category('document', c.doc_paid, NULL, c.cat_print);
  PERFORM set_item_category('document', c.doc_bill, NULL, c.cat_rent);
  PERFORM set_item_category('transaction', c.tx, c.tx_line, c.cat_fees);
  PERFORM set_item_category('invoice', c.inv, c.inv_line, c.cat_fees);
  PERFORM pg_temp.commit_checks();
  ASSERT (SELECT count(*) FROM uncategorised_items(c.org)) = 0, 'the queue is empty';
  ASSERT (SELECT passed FROM integrity_checks(c.org, current_date - 30, current_date) WHERE code = 'uncategorised'), 'the integrity check passes';
  RESET ROLE;

  ASSERT (SELECT category_id FROM documents WHERE id = c.doc_paid) = c.cat_print, 'the receipt document has the category';
  ASSERT (SELECT l.category_id FROM transaction_lines l JOIN transactions t ON t.id = l.transaction_id WHERE t.document_id = c.doc_paid) = c.cat_print,
    'its cash book line followed';
  ASSERT (SELECT splits -> 0 ->> 'category_id' FROM documents WHERE id = c.doc_bill) = c.cat_rent::text, 'the split that had a category kept it';
  ASSERT (SELECT splits -> 1 ->> 'category_id' FROM documents WHERE id = c.doc_bill) = c.cat_rent::text, 'the split without one got it';
  ASSERT (SELECT total FROM invoices WHERE document_id = c.doc_bill) = 300, 'the bill''s amounts did not change';
  ASSERT EXISTS (SELECT 1 FROM audit_events WHERE entity_id = c.tx_line AND action = 'update'), 'the change history records it';
  ASSERT (SELECT count(*) FROM accounting_parity_check(c.org)) = 0, 'documents and the cash book still agree';
  -- the history behind "Used for Hangover Club 2 times": the money-in line and the invoice line
  ASSERT (SELECT u.uses FROM payee_category_usage(c.org) u JOIN vendors v ON v.id = u.payee_id
          WHERE v.name = 'Hangover Club' AND u.category_id = c.cat_fees) = 2, 'a contact''s category history counts its entries and invoices';
  ASSERT NOT EXISTS (SELECT 1 FROM payee_category_usage(c.org) u WHERE u.category_id IN (c.unc, c.unc_in)), 'system categories are never counted';
  RAISE NOTICE 'PASS accepting every item clears the queue and the integrity check passes';
END $$;

ROLLBACK;
