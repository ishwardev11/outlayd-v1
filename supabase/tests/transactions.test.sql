-- Automated test for the transactions mirror (Phase 1, step 3).
-- Run against a LOCAL database after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/transactions.test.sql
-- It creates its own demo organisation inside a transaction and rolls everything back at the end.
-- It prints a NOTICE for each passed check and stops with an ERROR on the first failure.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE t_ctx (org uuid, fund uuid, fund_y uuid, cat_rent uuid, cat_print uuid, uid uuid);
GRANT ALL ON t_ctx TO authenticated;

DO $$
DECLARE o uuid; f uuid; fy uuid; c1 uuid; c2 uuid; u uuid;
BEGIN
  INSERT INTO public.organizations (name) VALUES ('Test Org') RETURNING id INTO o;          -- defaults are created by trigger
  INSERT INTO public.funds (organization_id, name) VALUES (o, 'Building Fund') RETURNING id INTO f;
  INSERT INTO public.funds (organization_id, name) VALUES (o, 'Grant Y') RETURNING id INTO fy;
  INSERT INTO public.categories (organization_id, name) VALUES (o, 'Rent') RETURNING id INTO c1;
  INSERT INTO public.categories (organization_id, name) VALUES (o, 'Printing') RETURNING id INTO c2;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'test-editor@example.com') RETURNING id INTO u;
  INSERT INTO public.user_roles (organization_id, email, role) VALUES (o, 'test-editor@example.com', 'Editor');
  INSERT INTO t_ctx VALUES (o, f, fy, c1, c2, u);

  -- 1 simple, 2 split, 3 no fund/category, 4 dangling references, 5 refund, 6 unpaid, 7 mixed signs
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, fund_id, category_id, paid_date)
    VALUES (o, 'simple', 'paid', 100, f, c1, '2026-10-07');
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, fund_id, category_id, paid_date, splits)
    VALUES (o, 'split', 'paid', 100, f, c1, '2026-10-08',
      jsonb_build_array(jsonb_build_object('amount',60,'fund_id',f,'category_id',c1),
                        jsonb_build_object('amount',40,'fund_id',fy,'category_id',c2)));
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, document_date)
    VALUES (o, 'no fund no category', 'paid', 50, '2026-10-05');
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, paid_date, splits)
    VALUES (o, 'dangling', 'paid', 70, '2026-10-09',
      jsonb_build_array(jsonb_build_object('amount',30,'fund_id','not-a-uuid','category_id','x'),
                        jsonb_build_object('amount',40,'fund_id','00000000-0000-0000-0000-000000000001','category_id','00000000-0000-0000-0000-000000000002')));
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, fund_id, category_id, paid_date)
    VALUES (o, 'refund', 'paid', -30, f, c1, '2026-10-10');
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, fund_id, category_id)
    VALUES (o, 'unpaid', 'awaiting_payment', 200, f, c1);
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, paid_date, splits)
    VALUES (o, 'mixed signs', 'paid', 60, '2026-10-11',
      jsonb_build_array(jsonb_build_object('amount',80,'fund_id',f,'category_id',c1),
                        jsonb_build_object('amount',-20,'fund_id',fy,'category_id',c2)));
END $$;

DO $$
DECLARE o uuid := (SELECT org FROM t_ctx); n int; v numeric;
BEGIN
  -- Rows are created by the trigger as the documents are inserted
  SELECT count(*) INTO n FROM public.transactions WHERE organization_id = o;
  ASSERT n = 7, format('expected 7 transactions (mixed-sign document gives two), got %s', n);
  RAISE NOTICE 'PASS paid documents are mirrored, unpaid is not';

  SELECT count(*) INTO n FROM public.accounting_parity_check(o);
  ASSERT n = 0, 'parity check must be empty';
  RAISE NOTICE 'PASS parity check is empty';

  SELECT count(*) INTO n FROM public.transactions WHERE organization_id = o AND date_estimated;
  ASSERT n = 1, 'only the document without a payment date is date_estimated';
  RAISE NOTICE 'PASS estimated payment date is flagged';

  SELECT sum(CASE t.tx_type WHEN 'money_out' THEN l.amount ELSE -l.amount END) INTO v
    FROM public.transaction_lines l JOIN public.transactions t ON t.id = l.transaction_id
    WHERE t.organization_id = o AND l.fund_id = (SELECT id FROM public.funds WHERE organization_id = o AND is_default);
  ASSERT v = 120, format('General Fund should hold the 50 + 70 with no valid fund, got %s', v);
  RAISE NOTICE 'PASS missing or invalid fund becomes the General Fund';

  SELECT count(*) INTO n FROM public.transaction_lines l JOIN public.categories c ON c.id = l.category_id
    WHERE l.organization_id = o AND c.name = 'Uncategorised';
  ASSERT n = 3, format('expected 3 Uncategorised lines, got %s', n);
  RAISE NOTICE 'PASS missing or invalid category becomes Uncategorised';
END $$;

-- A signed-in Editor edits a document the normal way; the mirror must follow
DO $$
DECLARE c record; n numeric; doc uuid;
BEGIN
  SELECT * INTO c FROM t_ctx;
  SELECT id INTO doc FROM public.documents WHERE vendor_name = 'simple' AND organization_id = c.org;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',c.uid,'email','test-editor@example.com')::text, true);
  PERFORM set_config('request.jwt.claim.sub', c.uid::text, true);
  SET LOCAL ROLE authenticated;

  UPDATE public.documents SET amount = 150, remarks = 'edited by editor' WHERE id = doc;
  SELECT total INTO n FROM public.transactions WHERE document_id = doc;
  ASSERT n = 150, format('mirror did not follow a signed-in edit (total %s)', n);
  ASSERT (SELECT remarks FROM public.transactions WHERE document_id = doc) = 'edited by editor', 'remarks follow the document remarks';
  RAISE NOTICE 'PASS a signed-in Editor''s edit is mirrored (total and remarks)';

  BEGIN
    UPDATE public.transactions SET remarks = 'x';
    RAISE EXCEPTION 'update should have been refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.transactions;
    RAISE EXCEPTION 'delete should have been refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.transactions (organization_id, tx_type, tx_date, account_id, total)
      SELECT organization_id, 'money_out', current_date, account_id, 1 FROM public.transactions LIMIT 1;
    RAISE EXCEPTION 'insert should have been refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS signed-in users cannot write transactions directly';
  RESET ROLE;
END $$;

-- Unpay, repay, delete
DO $$
DECLARE o uuid := (SELECT org FROM t_ctx); doc uuid; n int;
BEGIN
  SELECT id INTO doc FROM public.documents WHERE vendor_name = 'simple' AND organization_id = o;
  UPDATE public.documents SET status = 'awaiting_payment' WHERE id = doc;
  SELECT count(*) INTO n FROM public.transactions WHERE document_id = doc;  ASSERT n = 0, 'unpaid removes the transaction';
  UPDATE public.documents SET status = 'paid' WHERE id = doc;
  SELECT count(*) INTO n FROM public.transactions WHERE document_id = doc;  ASSERT n = 1, 'repaid restores the transaction';
  DELETE FROM public.documents WHERE id = doc;
  SELECT count(*) INTO n FROM public.transactions WHERE document_id = doc;  ASSERT n = 0, 'deleting the document deletes the transaction';
  RAISE NOTICE 'PASS unpay, repay and delete follow the document';
END $$;

-- The lines must add up to the total
DO $$
DECLARE o uuid := (SELECT org FROM t_ctx); a uuid; f uuid := (SELECT fund FROM t_ctx); c uuid := (SELECT cat_rent FROM t_ctx); t uuid := gen_random_uuid();
BEGIN
  SELECT id INTO a FROM public.accounts WHERE organization_id = o AND is_default;
  SET CONSTRAINTS ALL IMMEDIATE;
  BEGIN
    INSERT INTO public.transactions (id, organization_id, tx_type, tx_date, account_id, total) VALUES (t, o, 'money_out', current_date, a, 100);
    RAISE EXCEPTION 'a transaction without lines should have been refused';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%at least one line%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS a transaction with no lines is refused';
END $$;
SET CONSTRAINTS ALL DEFERRED;

-- Remarks: copied to the transaction, never from notes, limited to 500 characters, searchable
DO $$
DECLARE o uuid := (SELECT org FROM t_ctx); doc uuid; n int; r text;
BEGIN
  INSERT INTO public.documents (organization_id, vendor_name, status, amount, paid_date, notes, remarks)
    VALUES (o, 'notes vs remarks', 'paid', 10, '2026-11-03', 'AI Extraction Error: boom', 'cheque 4471')
    RETURNING id INTO doc;
  SELECT remarks INTO r FROM public.transactions WHERE document_id = doc;
  ASSERT r = 'cheque 4471', format('the transaction should carry the remarks, got %L', r);
  RAISE NOTICE 'PASS remarks are mirrored and the extraction error note is not';

  UPDATE public.documents SET remarks = NULL WHERE id = doc;
  SELECT remarks INTO r FROM public.transactions WHERE document_id = doc;
  ASSERT r IS NULL, 'clearing the remarks clears them on the transaction, notes never fill in';
  RAISE NOTICE 'PASS clearing remarks is mirrored';

  BEGIN
    UPDATE public.documents SET remarks = repeat('x', 501) WHERE id = doc;
    RAISE EXCEPTION 'a 501 character remark should have been refused';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS remarks are limited to 500 characters';

  UPDATE public.documents SET remarks = 'March committee approval' WHERE id = doc;
  SELECT count(*) INTO n FROM public.ledger_page(o, NULL, NULL, NULL, NULL, 'committee');
  ASSERT n = 1, format('ledger search should find the remark, found %s', n);
  SELECT count(*) INTO n FROM public.ledger_page(o, NULL, NULL, NULL, NULL, 'AI Extraction');
  ASSERT n = 0, 'ledger search must not search the notes column';
  RAISE NOTICE 'PASS ledger search finds remarks';
END $$;

ROLLBACK;
