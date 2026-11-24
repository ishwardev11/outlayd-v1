-- Simplification step 4: a bill that came from an upload is paid from Bills & Invoices with "Mark as
-- paid", which goes through the document (the same path as the review drawer). Run on a LOCAL database
-- after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/bills_paid.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- Checked as real signed-in roles: a free organisation's Admin can mark its bill paid on a chosen day
-- (the invoice becomes paid and the payment appears in the cash book on that day), its Viewer cannot,
-- another organisation cannot; on a paid organisation a part-paid bill pays its remaining balance; a
-- payment date in a locked period is refused. What the Inbox lists (statuses) is checked too.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE p_ctx (o_free uuid, o_paid uuid, u_free uuid, u_fview uuid, u_padmin uuid, u_peditor uuid, u_other uuid,
                         bill_free uuid, bill_paid uuid, bill_locked uuid, inbox_review uuid, inbox_dup uuid, inbox_extr uuid);
GRANT ALL ON p_ctx TO authenticated;

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
-- What markUploadedBillPaid does through the user's session: the status, then the chosen payment date
CREATE OR REPLACE FUNCTION pg_temp.mark_paid(p_doc uuid, p_day date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE documents SET status = 'paid', paid_date = current_date WHERE id = p_doc AND status = 'awaiting_payment';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    UPDATE documents SET paid_date = p_day WHERE id = p_doc;
  END IF;
  PERFORM pg_temp.commit_checks();
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text), pg_temp.commit_checks(), pg_temp.expect_error(text, text, text),
  pg_temp.eq(numeric, numeric, text), pg_temp.mark_paid(uuid, date) TO authenticated;

-- ---------------------------------------------------------------- set-up (as the server)
DO $$
DECLARE of uuid; op uuid; oo uuid; x uuid;
BEGIN
  INSERT INTO organizations (name) VALUES ('Bills Free Club') RETURNING id INTO of;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Bills Paid Society', 'pro', 'nonprofit') RETURNING id INTO op;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Bills Other Society', 'pro', 'growth') RETURNING id INTO oo;
  INSERT INTO p_ctx (o_free, o_paid) VALUES (of, op);
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bp-free@example.com') RETURNING id INTO x; UPDATE p_ctx SET u_free = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bp-fview@example.com') RETURNING id INTO x; UPDATE p_ctx SET u_fview = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bp-padmin@example.com') RETURNING id INTO x; UPDATE p_ctx SET u_padmin = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bp-peditor@example.com') RETURNING id INTO x; UPDATE p_ctx SET u_peditor = x;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bp-other@example.com') RETURNING id INTO x; UPDATE p_ctx SET u_other = x;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (of, 'bp-free@example.com', 'Admin'), (of, 'bp-fview@example.com', 'Viewer'),
    (op, 'bp-padmin@example.com', 'Admin'), (op, 'bp-peditor@example.com', 'Editor'), (oo, 'bp-other@example.com', 'Admin');

  -- approved, unpaid bills from uploads (the mirror makes a payable invoice for each)
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  SELECT of, 'Hall Supplies', 'awaiting_payment', 'invoice', 320, '2026-11-02', '2026-11-30',
         (SELECT id FROM funds WHERE organization_id = of AND is_default),
         (SELECT id FROM categories WHERE organization_id = of AND kind = 'expense' AND NOT is_system ORDER BY name LIMIT 1), 'HS-11'
  RETURNING id INTO x; UPDATE p_ctx SET bill_free = x;
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  SELECT op, 'Cetak Jaya', 'awaiting_payment', 'invoice', 2000, '2026-03-10', '2026-04-10',
         (SELECT id FROM funds WHERE organization_id = op AND is_default),
         (SELECT id FROM categories WHERE organization_id = op AND kind = 'expense' AND NOT is_system ORDER BY name LIMIT 1), 'CJ-310'
  RETURNING id INTO x; UPDATE p_ctx SET bill_paid = x;
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, due_date, fund_id, category_id, invoice_number)
  SELECT op, 'TNB', 'awaiting_payment', 'invoice', 90, '2026-01-05', '2026-01-20',
         (SELECT id FROM funds WHERE organization_id = op AND is_default),
         (SELECT id FROM categories WHERE organization_id = op AND kind = 'expense' AND NOT is_system ORDER BY name LIMIT 1), 'TNB-1'
  RETURNING id INTO x; UPDATE p_ctx SET bill_locked = x;
  -- uploads still in the Inbox
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date) VALUES (of, 'Kedai A', 'needs_review', 'receipt', 10, '2026-11-01') RETURNING id INTO x; UPDATE p_ctx SET inbox_review = x;
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date) VALUES (of, 'Kedai A', 'DUPLICATE_WARNING', 'receipt', 10, '2026-11-01') RETURNING id INTO x; UPDATE p_ctx SET inbox_dup = x;
  INSERT INTO documents (organization_id, status) VALUES (of, 'extracting') RETURNING id INTO x; UPDATE p_ctx SET inbox_extr = x;
END $$;

-- ---------------------------------------------------------------- 1. the Inbox lists only uploads still to do
DO $$
DECLARE c p_ctx;
BEGIN
  SELECT * INTO c FROM p_ctx;
  PERFORM pg_temp.sign_in(c.u_fview, 'bp-fview@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM documents WHERE status IN ('extracting', 'needs_review', 'verified', 'PENDING', 'DUPLICATE_WARNING')), 3,
    'the Inbox statuses: extracting, needs review and the possible duplicate (a Viewer can read them)');
  PERFORM pg_temp.eq((SELECT count(*) FROM documents WHERE status IN ('extracting', 'needs_review', 'verified', 'PENDING', 'DUPLICATE_WARNING') AND id = c.bill_free), 0,
    'an approved bill is not in the Inbox');
  RESET ROLE;
  RAISE NOTICE 'PASS the Inbox shows uploads being read, waiting for review or possibly duplicated, and never approved bills';
END $$;

-- ---------------------------------------------------------------- 2. free plan: the Admin pays its bill, on the chosen day
DO $$
DECLARE c p_ctx; inv uuid;
BEGIN
  SELECT * INTO c FROM p_ctx;
  inv := (SELECT id FROM invoices WHERE document_id = c.bill_free);
  ASSERT inv IS NOT NULL, 'the approved bill has its payable invoice';

  -- the Viewer cannot
  PERFORM pg_temp.sign_in(c.u_fview, 'bp-fview@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq(pg_temp.mark_paid(c.bill_free, '2026-11-20'), 0, 'a Viewer cannot mark a bill paid');
  RESET ROLE;
  -- another organisation cannot, even on a paid plan
  PERFORM pg_temp.sign_in(c.u_other, 'bp-other@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq(pg_temp.mark_paid(c.bill_free, '2026-11-20'), 0, 'another organisation cannot mark it paid');
  RESET ROLE;
  PERFORM pg_temp.eq((SELECT count(*) FROM documents WHERE id = c.bill_free AND status = 'awaiting_payment'), 1, 'still unpaid');

  -- the free organisation's Admin can, through the document (no paid feature needed)
  PERFORM pg_temp.sign_in(c.u_free, 'bp-free@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq(pg_temp.mark_paid(c.bill_free, '2026-11-20'), 1, 'the free Admin marks the bill paid');
  PERFORM pg_temp.eq((SELECT balance FROM invoice_summary WHERE id = inv), 0, 'the invoice has nothing left to pay');
  ASSERT (SELECT derived_status FROM invoice_summary WHERE id = inv) = 'paid', 'the invoice shows as paid';
  PERFORM pg_temp.eq((SELECT count(*) FROM transactions t JOIN transaction_lines l ON l.transaction_id = t.id
                      WHERE l.invoice_id = inv AND t.tx_type = 'money_out' AND t.tx_date = '2026-11-20' AND l.amount = 320), 1,
    'the payment is in the cash book on the chosen day');
  RESET ROLE;
  RAISE NOTICE 'PASS free plan: the Admin marks an uploaded bill paid on a chosen day; a Viewer and another organisation cannot';
END $$;

-- ---------------------------------------------------------------- 3. paid plan: a part-paid bill pays what is left
DO $$
DECLARE c p_ctx; inv uuid;
BEGIN
  SELECT * INTO c FROM p_ctx;
  inv := (SELECT id FROM invoices WHERE document_id = c.bill_paid);
  PERFORM pg_temp.sign_in(c.u_peditor, 'bp-peditor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM record_invoice_payment(jsonb_build_object('invoice_id', inv, 'amount', 800, 'tx_date', '2026-03-31'));
  PERFORM pg_temp.commit_checks();
  PERFORM pg_temp.eq((SELECT balance FROM invoice_summary WHERE id = inv), 1200, 'part-paid with Record payment');
  PERFORM pg_temp.eq(pg_temp.mark_paid(c.bill_paid, '2026-04-15'), 1, 'Mark as paid on the part-paid bill');
  PERFORM pg_temp.eq((SELECT balance FROM invoice_summary WHERE id = inv), 0, 'nothing left to pay');
  PERFORM pg_temp.eq((SELECT sum(l.amount) FROM transaction_lines l JOIN transactions t ON t.id = l.transaction_id
                      WHERE l.invoice_id = inv AND t.tx_date = '2026-04-15'), 1200, 'only the remaining 1,200 is paid on that day');
  RESET ROLE;
  RAISE NOTICE 'PASS paid plan: Record payment for a part, then Mark as paid pays only what is left';
END $$;

-- ---------------------------------------------------------------- 4. a payment date in a locked period is refused
DO $$
DECLARE c p_ctx;
BEGIN
  SELECT * INTO c FROM p_ctx;
  PERFORM pg_temp.sign_in(c.u_padmin, 'bp-padmin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM set_lock_date('2026-01-31');
  RESET ROLE;
  PERFORM pg_temp.sign_in(c.u_peditor, 'bp-peditor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.mark_paid(%L, %L)', c.bill_locked, '2026-01-25'), 'locked', 'paying in a locked period');
  PERFORM pg_temp.eq(pg_temp.mark_paid(c.bill_locked, '2026-02-03'), 1, 'paying after the lock date works');
  RESET ROLE;
  RAISE NOTICE 'PASS a payment date in a locked period is refused; after the lock date it is accepted';
END $$;

ROLLBACK;
