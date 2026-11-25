-- Invoices and AI plan, step 8: the Uncategorised queue.
-- "Uncategorised" is what integrity check 1 counts (20261127100000_assurance.sql): lines in the system
-- categories Uncategorised / Uncategorised income, on money in and out (not invoice payments, which
-- follow their invoice) and on open invoices.
--   * uncategorised_items(org, from?, to?): those lines as items to fix, one per
--       - uploaded document (its lines in the cash book and on its bill come from the document, so the
--         category is set on the document and the mirror updates both),
--       - line of a typed money in / money out entry,
--       - line of an invoice entered on the Invoices page.
--   * set_item_category(kind, record, line, category): gives one item a real category. Admins and Editors;
--     money in needs the income feature and invoices the invoices feature (as when entering them); the
--     category must be the organisation's own, not archived, not a system one, and of the right kind
--     (income for money in and invoices you issued, expense otherwise). The period lock and the change
--     history apply through the existing triggers. Nothing else about the entry changes.
-- Suggestions (the payee's default, its most used category, or the AI) are made in the app; a person
-- accepts each one.

CREATE OR REPLACE FUNCTION public.uncategorised_items(p_org uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (kind text, record_id uuid, line_id uuid, item_date date, direction text, payee_id uuid, payee_name text,
               description text, amount numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH unc AS (
    SELECT id FROM public.categories
    WHERE organization_id = p_org AND is_system AND name IN ('Uncategorised', 'Uncategorised income')
  ),
  tl AS (
    SELECT t.id AS tx_id, t.document_id, l.id AS line_id, t.tx_date AS d, t.tx_type, t.payee_id, t.payee_name,
           COALESCE(NULLIF(t.remarks, ''), t.reference) AS descr, l.amount
    FROM public.transactions t JOIN public.transaction_lines l ON l.transaction_id = t.id
    WHERE t.organization_id = p_org AND l.invoice_id IS NULL AND l.category_id IN (SELECT id FROM unc)
      AND (p_from IS NULL OR t.tx_date >= p_from) AND (p_to IS NULL OR t.tx_date <= p_to)
  ),
  il AS (
    SELECT i.id AS inv_id, i.document_id, l.id AS line_id, i.issue_date AS d, i.direction, i.payee_id, i.payee_name,
           COALESCE(NULLIF(l.description, ''), i.invoice_no) AS descr, l.amount
    FROM public.invoices i JOIN public.invoice_lines l ON l.invoice_id = i.id
    WHERE i.organization_id = p_org AND i.status = 'open' AND l.category_id IN (SELECT id FROM unc)
      AND (p_from IS NULL OR i.issue_date >= p_from) AND (p_to IS NULL OR i.issue_date <= p_to)
  ),
  docs AS (
    SELECT document_id, d, amount FROM tl WHERE document_id IS NOT NULL
    UNION ALL
    SELECT document_id, d, amount FROM il WHERE document_id IS NOT NULL
  )
  -- uploaded documents: one item each (a bill part-paid has lines on its invoice and its payment;
  -- the amount is the document's uncategorised part)
  SELECT 'document', doc.id, NULL::uuid, min(x.d), 'out', doc.vendor_id, doc.vendor_name,
         COALESCE(NULLIF(doc.line_items -> 0 ->> 'description', ''), doc.invoice_number, doc.reference_number),
         (SELECT COALESCE(sum(c.amount), 0) FROM public.document_cash_lines(doc.id) c WHERE c.category_id IN (SELECT id FROM unc))
  FROM docs x JOIN public.documents doc ON doc.id = x.document_id
  GROUP BY doc.id
  UNION ALL
  SELECT 'transaction', tx_id, line_id, d, CASE WHEN tx_type = 'money_in' THEN 'in' ELSE 'out' END, payee_id, payee_name, descr, amount
  FROM tl WHERE document_id IS NULL
  UNION ALL
  SELECT 'invoice', inv_id, line_id, d, CASE WHEN direction = 'receivable' THEN 'in' ELSE 'out' END, payee_id, payee_name, descr, amount
  FROM il WHERE document_id IS NULL
  ORDER BY 4 DESC, 2, 3;
$$;
REVOKE ALL ON FUNCTION public.uncategorised_items(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uncategorised_items(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_item_category(p_kind text, p_record uuid, p_line uuid, p_category uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_kind text;        -- the kind of category this item needs: income or expense
  v_unc uuid[];
  d public.documents%ROWTYPE;
  v_splits jsonb;
  v_tx public.transactions%ROWTYPE;
  v_inv public.invoices%ROWTYPE;
BEGIN
  v_org := NULLIF(public.get_user_org_id(), '')::uuid;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation';
  END IF;
  IF public.get_user_role() IS DISTINCT FROM 'Admin' AND public.get_user_role() IS DISTINCT FROM 'Editor' THEN
    RAISE EXCEPTION 'Only Admins and Editors can change categories';
  END IF;
  SELECT array_agg(id) INTO v_unc FROM public.categories
  WHERE organization_id = v_org AND is_system AND name IN ('Uncategorised', 'Uncategorised income');

  IF p_kind = 'document' THEN
    SELECT * INTO d FROM public.documents WHERE id = p_record AND organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That entry was not found';
    END IF;
    v_kind := 'expense';
  ELSIF p_kind = 'transaction' THEN
    SELECT t.* INTO v_tx FROM public.transactions t JOIN public.transaction_lines l ON l.transaction_id = t.id
    WHERE t.id = p_record AND l.id = p_line AND t.organization_id = v_org AND t.document_id IS NULL AND l.invoice_id IS NULL
      AND t.tx_type IN ('money_in', 'money_out');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That entry was not found';
    END IF;
    IF v_tx.tx_type = 'money_in' AND NOT public.org_feature_allowed(v_org, 'income', 'use') THEN
      RAISE EXCEPTION 'Recording income is available on the Growth and Nonprofit plans';
    END IF;
    v_kind := CASE WHEN v_tx.tx_type = 'money_in' THEN 'income' ELSE 'expense' END;
  ELSIF p_kind = 'invoice' THEN
    SELECT i.* INTO v_inv FROM public.invoices i JOIN public.invoice_lines l ON l.invoice_id = i.id
    WHERE i.id = p_record AND l.id = p_line AND i.organization_id = v_org AND i.source = 'manual' AND i.status <> 'void';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That invoice was not found';
    END IF;
    IF NOT public.org_feature_allowed(v_org, 'invoices', 'use') THEN
      RAISE EXCEPTION 'Invoices are available on the Growth and Nonprofit plans';
    END IF;
    v_kind := CASE WHEN v_inv.direction = 'receivable' THEN 'income' ELSE 'expense' END;
  ELSE
    RAISE EXCEPTION 'Unknown kind of entry: %', p_kind;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = p_category AND c.organization_id = v_org
                 AND c.archived_at IS NULL AND NOT c.is_system AND c.kind = v_kind) THEN
    RAISE EXCEPTION 'Choose one of your % categories', v_kind;
  END IF;

  IF p_kind = 'document' THEN
    -- Every line of the document without a valid expense category gets this one; the mirror then
    -- updates its cash book entry and its bill (the lock applies there)
    IF jsonb_typeof(d.splits) = 'array' AND jsonb_array_length(d.splits) > 0 THEN
      SELECT jsonb_agg(
               CASE WHEN EXISTS (SELECT 1 FROM public.categories c WHERE c.id::text = s.elem ->> 'category_id'
                                 AND c.organization_id = v_org AND c.kind = 'expense' AND NOT (c.id = ANY (COALESCE(v_unc, '{}'))))
                    THEN s.elem
                    ELSE jsonb_set(s.elem, '{category_id}', to_jsonb(p_category::text)) END
               ORDER BY s.ord)
      INTO v_splits
      FROM jsonb_array_elements(d.splits) WITH ORDINALITY AS s(elem, ord);
      UPDATE public.documents SET splits = v_splits WHERE id = d.id;
    ELSE
      UPDATE public.documents SET category_id = p_category WHERE id = d.id;
    END IF;
  ELSIF p_kind = 'transaction' THEN
    UPDATE public.transaction_lines SET category_id = p_category WHERE id = p_line AND category_id = ANY (COALESCE(v_unc, '{}'));
  ELSE
    UPDATE public.invoice_lines SET category_id = p_category WHERE id = p_line AND category_id = ANY (COALESCE(v_unc, '{}'));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_item_category(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_item_category(text, uuid, uuid, uuid) TO authenticated, service_role;

-- How often each contact's entries used each real category (money in and out lines, and invoice lines),
-- for "Used for Grab 12 times". System categories are left out. Read with the caller's own access.
CREATE OR REPLACE FUNCTION public.payee_category_usage(p_org uuid)
RETURNS TABLE (payee_id uuid, category_id uuid, kind text, uses integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT x.payee_id, x.category_id, c.kind, count(*)::integer
  FROM (
    SELECT t.payee_id, l.category_id
    FROM public.transactions t JOIN public.transaction_lines l ON l.transaction_id = t.id
    WHERE t.organization_id = p_org AND t.payee_id IS NOT NULL AND l.invoice_id IS NULL AND t.tx_type IN ('money_in', 'money_out')
    UNION ALL
    SELECT i.payee_id, il.category_id
    FROM public.invoices i JOIN public.invoice_lines il ON il.invoice_id = i.id
    WHERE i.organization_id = p_org AND i.payee_id IS NOT NULL AND i.status <> 'void'
  ) x
  JOIN public.categories c ON c.id = x.category_id AND NOT c.is_system
  GROUP BY x.payee_id, x.category_id, c.kind;
$$;
REVOKE ALL ON FUNCTION public.payee_category_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payee_category_usage(uuid) TO authenticated, service_role;
