-- Simplification step 3: bank statement lines matched to the ledger. Run on a LOCAL database after
-- `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/bank_match.test.sql
-- Everything happens inside a transaction that is rolled back. It stops on the first failure.
--
-- A paid society with two accounts (Main Bank, the main account, and Petty Cash), an Admin, an Editor
-- and a Viewer; a user from another (paid) organisation; and a society that downgraded. Checked as
-- real signed-in roles: each statement belongs to an account; lines (money in too) match entries;
-- nothing is matched twice, including an upload and its own entry; the account and direction must
-- agree; deleting an entry releases its line; the statement counts; the month-end suggestion.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE b_ctx (org uuid, org_other uuid, org_down uuid, main uuid, petty uuid, other_acct uuid, gen uuid,
                         c_don uuid, c_rent uuid, u_admin uuid, u_editor uuid, u_viewer uuid, u_other uuid, u_down uuid,
                         st_main uuid, st_petty uuid, st_down uuid, st_other uuid,
                         l_in1 uuid, l_in2 uuid, l_out1 uuid, l_out2 uuid, l_out3 uuid, l_petty uuid, l_down uuid, l_other uuid,
                         tx_don uuid, tx_petty uuid, doc_paid uuid, doc_paid2 uuid, tx_transfer uuid);
GRANT ALL ON b_ctx TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.sign_in(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',p_uid,'email',p_email)::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_server() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
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
-- Match a line as the signed-in user; returns how many rows the update reached (0 when RLS hides it)
CREATE OR REPLACE FUNCTION pg_temp.match_tx(p_line uuid, p_tx uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE bank_transactions SET match_status = 'matched', matched_transaction_id = p_tx, matched_document_id = NULL
   WHERE id = p_line AND match_status = 'unmatched';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.match_doc(p_line uuid, p_doc uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE bank_transactions SET match_status = 'matched', matched_document_id = p_doc, matched_transaction_id = NULL
   WHERE id = p_line AND match_status = 'unmatched';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.sign_in(uuid, text), pg_temp.as_server(), pg_temp.commit_checks(),
  pg_temp.expect_error(text, text, text), pg_temp.eq(numeric, numeric, text),
  pg_temp.match_tx(uuid, uuid), pg_temp.match_doc(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- set-up (as the server)
DO $$
DECLARE o uuid; oo uuid; od uuid; ua uuid; ue uuid; uv uuid; uo uuid; ud uuid;
BEGIN
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Bank Society', 'pro', 'nonprofit') RETURNING id INTO o;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Bank Other Society', 'pro', 'growth') RETURNING id INTO oo;
  INSERT INTO organizations (name, subscription_status, subscription_tier) VALUES ('Bank Downgraded Society', 'pro', 'growth') RETURNING id INTO od;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bm-admin@example.com') RETURNING id INTO ua;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bm-editor@example.com') RETURNING id INTO ue;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bm-viewer@example.com') RETURNING id INTO uv;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bm-other@example.com') RETURNING id INTO uo;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'bm-down@example.com') RETURNING id INTO ud;
  INSERT INTO user_roles (organization_id, email, role) VALUES
    (o, 'bm-admin@example.com', 'Admin'), (o, 'bm-editor@example.com', 'Editor'), (o, 'bm-viewer@example.com', 'Viewer'),
    (oo, 'bm-other@example.com', 'Admin'), (od, 'bm-down@example.com', 'Editor');
  UPDATE accounts SET name = 'Main Bank', opening_balance = 1000 WHERE organization_id = o AND is_default;
  INSERT INTO accounts (organization_id, name, account_type) VALUES (o, 'Petty Cash', 'cash');
  INSERT INTO categories (organization_id, name, kind, group_name) VALUES (o, 'Rent', 'expense', 'Administration');
  INSERT INTO b_ctx (org, org_other, org_down, u_admin, u_editor, u_viewer, u_other, u_down,
                     main, petty, other_acct, gen, c_don, c_rent) VALUES (o, oo, od, ua, ue, uv, uo, ud,
    (SELECT id FROM accounts WHERE organization_id = o AND is_default),
    (SELECT id FROM accounts WHERE organization_id = o AND name = 'Petty Cash'),
    (SELECT id FROM accounts WHERE organization_id = oo AND is_default),
    (SELECT id FROM funds WHERE organization_id = o AND is_default),
    (SELECT id FROM categories WHERE organization_id = o AND name = 'General donations'),
    (SELECT id FROM categories WHERE organization_id = o AND name = 'Rent'));
END $$;

-- ---------------------------------------------------------------- 1. each statement belongs to an account
DO $$
DECLARE c b_ctx; s uuid;
BEGIN
  SELECT * INTO c FROM b_ctx;
  -- the Editor imports through row-level security; no account given = the main account
  PERFORM pg_temp.sign_in(c.u_editor, 'bm-editor@example.com');
  SET LOCAL ROLE authenticated;
  INSERT INTO bank_statements (organization_id, file_url, file_hash, status, period_start, period_end, opening_balance, closing_balance)
  VALUES (c.org, c.org || '/statements/jan.pdf', 'h-jan', 'ready', '2026-01-01', '2026-02-28', 1000, 1310) RETURNING id INTO s;
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_statements WHERE id = s AND account_id = c.main), 1, 'no account given: the main account');
  UPDATE b_ctx SET st_main = s;
  INSERT INTO bank_statements (organization_id, file_url, file_hash, status, period_start, period_end, closing_balance, account_id)
  VALUES (c.org, c.org || '/statements/petty.pdf', 'h-petty', 'ready', '2026-01-01', '2026-01-31', 280, c.petty) RETURNING id INTO s;
  UPDATE b_ctx SET st_petty = s;
  PERFORM pg_temp.expect_error(format($q$INSERT INTO bank_statements (organization_id, file_url, file_hash, status, account_id) VALUES ('%s', 'x/statements/y.pdf', 'h-x', 'ready', '%s')$q$, c.org, c.other_acct),
    'That account was not found', 'an account of another organisation');
  RESET ROLE;
  SELECT * INTO c FROM b_ctx;
  -- a Viewer cannot change the account
  PERFORM pg_temp.sign_in(c.u_viewer, 'bm-viewer@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE bank_statements SET account_id = c.petty WHERE id = c.st_main;
  RESET ROLE;
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_statements WHERE id = c.st_main AND account_id = c.main), 1, 'a Viewer cannot change the account');
  RAISE NOTICE 'PASS each statement belongs to an account: main by default, chosen account kept, another organisation''s refused, Viewer read-only';
END $$;

-- ---------------------------------------------------------------- set-up: lines and entries (as the server / the Editor)
DO $$
DECLARE c b_ctx; x uuid;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.as_server();
  INSERT INTO bank_transactions (organization_id, statement_id, txn_date, description, amount, balance, fingerprint) VALUES
    (c.org, c.st_main, '2026-01-10', 'DUITNOW FROM PUAN AMINAH', 500, 1500, 'f-in1') RETURNING id INTO x; UPDATE b_ctx SET l_in1 = x;
  INSERT INTO bank_transactions (organization_id, statement_id, txn_date, description, amount, balance, fingerprint) VALUES
    (c.org, c.st_main, '2026-01-11', 'DUITNOW FROM PUAN AMINAH', 500, 2000, 'f-in2') RETURNING id INTO x; UPDATE b_ctx SET l_in2 = x;
  INSERT INTO bank_transactions (organization_id, statement_id, txn_date, description, amount, balance, fingerprint) VALUES
    (c.org, c.st_main, '2026-01-20', 'IBG LANDLORD RENT JAN', -300, 1700, 'f-out1') RETURNING id INTO x; UPDATE b_ctx SET l_out1 = x;
  INSERT INTO bank_transactions (organization_id, statement_id, txn_date, description, amount, balance, fingerprint) VALUES
    (c.org, c.st_main, '2026-01-21', 'IBG LANDLORD RENT JAN', -300, 1400, 'f-out2') RETURNING id INTO x; UPDATE b_ctx SET l_out2 = x;
  INSERT INTO bank_transactions (organization_id, statement_id, txn_date, description, amount, balance, fingerprint) VALUES
    (c.org, c.st_main, '2026-02-05', 'TRF TO PETTY CASH', -90, 1310, 'f-out3') RETURNING id INTO x; UPDATE b_ctx SET l_out3 = x;
  INSERT INTO bank_transactions (organization_id, statement_id, txn_date, description, amount, fingerprint) VALUES
    (c.org, c.st_petty, '2026-01-25', 'CASH PAYMENT', -300, 'f-petty') RETURNING id INTO x; UPDATE b_ctx SET l_petty = x;

  -- two paid uploads (the mirror records each as money out in the main account)
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (c.org, 'Landlord', 'paid', 'receipt', 300, '2026-01-20', '2026-01-20', c.gen, c.c_rent) RETURNING id INTO x; UPDATE b_ctx SET doc_paid = x;
  INSERT INTO documents (organization_id, vendor_name, status, document_type, amount, document_date, paid_date, fund_id, category_id)
  VALUES (c.org, 'Landlord', 'paid', 'receipt', 300, '2026-01-21', '2026-01-21', c.gen, c.c_rent) RETURNING id INTO x; UPDATE b_ctx SET doc_paid2 = x;
  -- a transfer from Main Bank to Petty Cash
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, to_account_id, total, source)
  VALUES (c.org, 'account_transfer', '2026-02-05', c.main, c.petty, 90, 'manual') RETURNING id INTO x; UPDATE b_ctx SET tx_transfer = x;

  -- a donation into Main Bank and a donation into Petty Cash, recorded by the Editor
  PERFORM pg_temp.sign_in(c.u_editor, 'bm-editor@example.com');
  SET LOCAL ROLE authenticated;
  UPDATE b_ctx SET tx_don = save_money_in(jsonb_build_object('tx_date', '2026-01-10', 'payee_name', 'Puan Aminah', 'account_id', c.main,
    'lines', jsonb_build_array(jsonb_build_object('amount', 500, 'category_id', c.c_don))));
  UPDATE b_ctx SET tx_petty = save_money_in(jsonb_build_object('tx_date', '2026-01-25', 'payee_name', 'Walk-in', 'account_id', c.petty,
    'lines', jsonb_build_array(jsonb_build_object('amount', 300, 'category_id', c.c_don))));
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------- 2. matching, as the Editor
DO $$
DECLARE c b_ctx; mirror uuid; mirror2 uuid;
BEGIN
  SELECT * INTO c FROM b_ctx;
  mirror := (SELECT id FROM transactions WHERE document_id = c.doc_paid);
  mirror2 := (SELECT id FROM transactions WHERE document_id = c.doc_paid2);
  ASSERT mirror IS NOT NULL AND mirror2 IS NOT NULL, 'each paid upload has its money-out entry';
  PERFORM pg_temp.sign_in(c.u_editor, 'bm-editor@example.com');
  SET LOCAL ROLE authenticated;

  -- money in: a line coming in matches the donation
  PERFORM pg_temp.eq(pg_temp.match_tx(c.l_in1, c.tx_don), 1, 'money in matched to money in');
  -- ... and the same donation cannot be matched to a second line
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_tx(%L, %L)', c.l_in2, c.tx_don), 'duplicate key', 'an entry matched twice');
  -- direction: money leaving the bank is never money in, and the other way round
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_tx(%L, %L)', c.l_out1, c.tx_don), 'can only be matched to money out', 'a payment out against money in');
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_tx(%L, %L)', c.l_in2, mirror), 'can only be matched to money in', 'money in against money out');
  -- account: an entry in Petty Cash is not on the Main Bank statement
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_tx(%L, %L)', c.l_in2, c.tx_petty), 'different account', 'an entry in another account');

  -- an upload and its own entry are the same payment
  PERFORM pg_temp.eq(pg_temp.match_doc(c.l_out1, c.doc_paid), 1, 'a payment matched to a paid upload (as before)');
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_tx(%L, %L)', c.l_out2, mirror), 'document is already matched', 'the upload''s entry after the upload');
  PERFORM pg_temp.eq(pg_temp.match_tx(c.l_out2, mirror2), 1, 'a payment matched to an upload''s entry');
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_doc(%L, %L)', c.l_out3, c.doc_paid2), 'entry is already matched', 'the upload after its entry');
  -- documents are only matched to money going out
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_doc(%L, %L)', c.l_in2, c.doc_paid2), 'Only payments going out', 'money in against a document');

  -- a transfer out of Main Bank matches the line on the Main Bank statement
  PERFORM pg_temp.eq(pg_temp.match_tx(c.l_out3, c.tx_transfer), 1, 'a transfer out matched');
  RESET ROLE;

  -- Petty Cash statement: its own entries only, and never an upload (uploads are paid from the main account)
  PERFORM pg_temp.sign_in(c.u_admin, 'bm-admin@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_doc(%L, %L)', c.l_petty, c.doc_paid2), 'main account', 'an upload on a Petty Cash statement');
  PERFORM pg_temp.expect_error(format('SELECT pg_temp.match_tx(%L, %L)', c.l_petty, c.tx_petty), 'can only be matched to money out', 'a cash payment against money in');
  RESET ROLE;

  PERFORM pg_temp.eq((SELECT count(*) FROM bank_transactions WHERE organization_id = c.org AND match_status = 'matched'), 4, 'four lines matched');
  RAISE NOTICE 'PASS lines match entries (money in too); never twice, including an upload and its own entry; direction and account enforced';
END $$;

-- ---------------------------------------------------------------- 3. who may match
DO $$
DECLARE c b_ctx; x uuid; ox uuid; dl uuid; dt uuid;
BEGIN
  SELECT * INTO c FROM b_ctx;
  -- a Viewer: the update reaches nothing
  PERFORM pg_temp.sign_in(c.u_viewer, 'bm-viewer@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq(pg_temp.match_tx(c.l_in2, c.tx_don), 0, 'a Viewer cannot match');
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_transactions WHERE organization_id = c.org), 6, 'a Viewer can read the lines');
  RESET ROLE;

  -- another organisation: sees nothing and changes nothing, even with a paid plan
  PERFORM pg_temp.sign_in(c.u_other, 'bm-other@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_transactions WHERE organization_id = c.org), 0, 'another organisation reads nothing');
  PERFORM pg_temp.eq(pg_temp.match_tx(c.l_in2, c.tx_don), 0, 'another organisation matches nothing');
  RESET ROLE;

  -- a downgraded organisation: read-only
  PERFORM pg_temp.as_server();
  INSERT INTO bank_statements (organization_id, file_url, file_hash, status) VALUES (c.org_down, c.org_down || '/statements/d.pdf', 'h-d', 'ready') RETURNING id INTO x;
  INSERT INTO bank_transactions (organization_id, statement_id, txn_date, description, amount, fingerprint)
  VALUES (c.org_down, x, '2026-01-05', 'DEPOSIT', 40, 'f-d') RETURNING id INTO dl;
  INSERT INTO accounts (organization_id, name, account_type) VALUES (c.org_down, 'Savings', 'bank');
  INSERT INTO transactions (organization_id, tx_type, tx_date, account_id, to_account_id, total, source)
  VALUES (c.org_down, 'account_transfer', '2026-01-05', (SELECT id FROM accounts WHERE organization_id = c.org_down AND name = 'Savings'),
          (SELECT id FROM accounts WHERE organization_id = c.org_down AND is_default), 40, 'manual') RETURNING id INTO dt;
  UPDATE organizations SET subscription_status = 'free', subscription_tier = 'free' WHERE id = c.org_down;
  PERFORM pg_temp.sign_in(c.u_down, 'bm-down@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_transactions WHERE id = dl), 1, 'downgraded: still reads its lines');
  PERFORM pg_temp.eq(pg_temp.match_tx(dl, dt), 0, 'downgraded: cannot match');
  RESET ROLE;
  RAISE NOTICE 'PASS a Viewer, another organisation and a downgraded organisation cannot match';
END $$;

-- ---------------------------------------------------------------- 4. deleting a matched entry releases its line
DO $$
DECLARE c b_ctx;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.sign_in(c.u_editor, 'bm-editor@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM delete_money_in(c.tx_don);
  PERFORM pg_temp.commit_checks();
  RESET ROLE;
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_transactions WHERE id = c.l_in1 AND match_status = 'unmatched' AND matched_transaction_id IS NULL), 1,
    'the line is unmatched again');
  -- a deleted upload releases its line as before
  PERFORM pg_temp.as_server();
  DELETE FROM documents WHERE id = c.doc_paid;
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_transactions WHERE id = c.l_out1 AND match_status = 'unmatched'), 1, 'a deleted upload releases its line');
  RAISE NOTICE 'PASS deleting a matched entry or upload puts its line back to unmatched';
END $$;

-- ---------------------------------------------------------------- 5. counts and the month-end suggestion
DO $$
DECLARE c b_ctx; r record; failed boolean;
BEGIN
  SELECT * INTO c FROM b_ctx;
  PERFORM pg_temp.sign_in(c.u_viewer, 'bm-viewer@example.com');
  SET LOCAL ROLE authenticated;
  SELECT * INTO r FROM bank_statement_stats(c.org) WHERE statement_id = c.st_main;
  PERFORM pg_temp.eq(r.line_count, 5, 'five lines on the Main Bank statement');
  PERFORM pg_temp.eq(r.matched, 2, 'two still matched (the upload''s entry and the transfer)');
  PERFORM pg_temp.eq(r.needs_attention, 3, 'money in counts as needing attention too');

  -- 31 Jan: the Main Bank statement runs to 28 Feb, so opening 1,000 plus the January lines (+500 +500 -300 -300)
  SELECT * INTO r FROM reconciliation_status(c.org, '2026-01-31') WHERE account_id = c.main;
  PERFORM pg_temp.eq(r.suggested_balance, 1400, 'Main Bank at 31 Jan: opening balance plus the lines up to that day');
  ASSERT r.suggested_source = 'statement (1 Jan 2026 to 28 Feb 2026): opening balance plus the lines up to this day', 'says where it came from: ' || r.suggested_source;
  -- 31 Jan Petty Cash: its own statement ends that day, so its closing balance
  SELECT * INTO r FROM reconciliation_status(c.org, '2026-01-31') WHERE account_id = c.petty;
  PERFORM pg_temp.eq(r.suggested_balance, 280, 'Petty Cash at 31 Jan: its own statement''s closing balance');
  ASSERT r.suggested_source = 'statement (1 Jan 2026 to 31 Jan 2026): closing balance', 'closing balance source: ' || r.suggested_source;
  -- 28 Feb Main Bank: closing balance; Petty Cash: no statement covers it
  PERFORM pg_temp.eq((SELECT suggested_balance FROM reconciliation_status(c.org, '2026-02-28') WHERE account_id = c.main), 1310, 'closing balance on the last day');
  PERFORM pg_temp.eq((SELECT count(*) FROM reconciliation_status(c.org, '2026-02-28') WHERE account_id = c.petty AND suggested_balance IS NULL), 1,
    'no suggestion for an account no statement covers');
  RESET ROLE;

  -- a statement that skipped duplicate lines cannot be added up, so only its closing day is suggested
  PERFORM pg_temp.as_server();
  UPDATE bank_statements SET duplicate_count = 1 WHERE id = c.st_main;
  PERFORM pg_temp.eq((SELECT count(*) FROM reconciliation_status(c.org, '2026-01-31') WHERE account_id = c.main AND suggested_balance IS NULL), 1,
    'skipped lines: no worked-out balance');

  -- another organisation sees nothing
  PERFORM pg_temp.sign_in(c.u_other, 'bm-other@example.com');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq((SELECT count(*) FROM bank_statement_stats(c.org)), 0, 'another organisation: no counts');
  PERFORM pg_temp.eq((SELECT count(*) FROM reconciliation_status(c.org, '2026-01-31')), 0, 'another organisation: no accounts');
  RESET ROLE;

  -- anonymous callers cannot run either function
  failed := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM bank_statement_stats(c.org);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  RESET ROLE;
  ASSERT failed, 'anon must not run bank_statement_stats';
  failed := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM reconciliation_status(c.org, '2026-01-31');
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  RESET ROLE;
  ASSERT failed, 'anon must not run reconciliation_status';
  RAISE NOTICE 'PASS statement counts include money in; the month-end suggestion comes from a statement of that account covering the day, with its source';
END $$;

ROLLBACK;
