-- Audit log of who approved, paid and deleted documents.
--
-- The log is written by database triggers, not by application code, so every route that changes a
-- document is recorded the same way (the ledger, the dashboard queue, bulk approve, or a direct API
-- call by a signed-in user). Nobody can add, change or remove entries through the app: signed-in
-- users can only read their own organisation's entries.
--
-- What is recorded (an approved document is one that is awaiting_payment or paid):
--   approved            needs review / duplicate warning  -> awaiting_payment
--   approved_and_paid   needs review / duplicate warning  -> paid (receipts, or "mark paid" straight from the queue)
--   paid                awaiting_payment                  -> paid
--   marked_unpaid       paid                              -> awaiting_payment
--   returned_to_review  awaiting_payment / paid           -> anything else
--   deleted             an approved document was deleted
-- The AI extraction step (extracting -> needs_review) is not logged: no person approved anything.

CREATE TABLE IF NOT EXISTS public.document_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- No foreign key to documents: an entry must still exist after its document is deleted.
  document_id     uuid NOT NULL,
  action          text NOT NULL CHECK (action IN (
                    'approved', 'approved_and_paid', 'paid', 'marked_unpaid', 'returned_to_review', 'deleted'
                  )),
  from_status     text,
  to_status       text,
  -- Who did it. All null means a system or service-role change with no signed-in user.
  actor_id        uuid,
  actor_email     text,
  actor_name      text,
  actor_role      text,
  -- A copy of the key fields at that moment, so the entry still makes sense if the document changes
  -- later or is deleted.
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_audit_log_org_time
  ON public.document_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_audit_log_document
  ON public.document_audit_log (document_id, created_at DESC);

ALTER TABLE public.document_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbac_document_audit_log_select ON public.document_audit_log;
CREATE POLICY rbac_document_audit_log_select ON public.document_audit_log
  FOR SELECT TO authenticated
  USING (organization_id::text = public.get_user_org_id());

-- No insert/update/delete policies exist, and the table privileges are removed as well.
REVOKE ALL ON public.document_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.document_audit_log TO authenticated;
GRANT ALL ON public.document_audit_log TO service_role;

-- Entries are append-only: not even the service role may edit one.
CREATE OR REPLACE FUNCTION public.block_audit_log_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'document_audit_log entries cannot be changed';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_audit_log_update ON public.document_audit_log;
CREATE TRIGGER trg_block_audit_log_update
  BEFORE UPDATE ON public.document_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_log_update();

CREATE OR REPLACE FUNCTION public.log_document_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc        public.documents;
  v_action     text;
  v_from       text;
  v_to         text;
  v_old_ok     boolean;
  v_new_ok     boolean;
  v_uid        uuid;
  v_email      text;
  v_name       text;
  v_role       text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.status, '') NOT IN ('awaiting_payment', 'paid') THEN
      RETURN OLD;
    END IF;
    v_doc := OLD;
    v_action := 'deleted';
    v_from := OLD.status;
    v_to := NULL;
  ELSE
    v_old_ok := COALESCE(OLD.status, '') IN ('awaiting_payment', 'paid');
    v_new_ok := COALESCE(NEW.status, '') IN ('awaiting_payment', 'paid');
    IF OLD.status IS NOT DISTINCT FROM NEW.status OR (NOT v_old_ok AND NOT v_new_ok) THEN
      RETURN NEW;
    END IF;
    v_doc := NEW;
    v_from := OLD.status;
    v_to := NEW.status;
    v_action := CASE
      WHEN NEW.status = 'awaiting_payment' AND NOT v_old_ok THEN 'approved'
      WHEN NEW.status = 'paid' AND OLD.status = 'awaiting_payment' THEN 'paid'
      WHEN NEW.status = 'paid' AND NOT v_old_ok THEN 'approved_and_paid'
      WHEN NEW.status = 'awaiting_payment' AND OLD.status = 'paid' THEN 'marked_unpaid'
      ELSE 'returned_to_review'
    END;
  END IF;

  -- Who made the change: the signed-in user's JWT. Null for service-role or system changes.
  v_uid := auth.uid();
  v_email := lower(auth.jwt() ->> 'email');
  IF v_email IS NOT NULL THEN
    SELECT ur.full_name, ur.role INTO v_name, v_role
    FROM public.user_roles ur
    WHERE lower(ur.email) = v_email AND ur.organization_id = v_doc.organization_id
    LIMIT 1;
  END IF;

  INSERT INTO public.document_audit_log (
    organization_id, document_id, action, from_status, to_status,
    actor_id, actor_email, actor_name, actor_role, details
  ) VALUES (
    v_doc.organization_id, v_doc.id, v_action, v_from, v_to,
    v_uid, v_email, v_name, v_role,
    jsonb_build_object(
      'vendor_name', v_doc.vendor_name,
      'invoice_number', v_doc.invoice_number,
      'document_type', v_doc.document_type,
      'document_date', v_doc.document_date,
      'amount', v_doc.amount,
      'original_currency', v_doc.original_currency,
      'original_amount', v_doc.original_amount,
      'splits', COALESCE(v_doc.splits, '[]'::jsonb)
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_document_approval_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_log_document_status_change ON public.documents;
CREATE TRIGGER trg_log_document_status_change
  AFTER UPDATE OF status ON public.documents
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_document_approval_change();

DROP TRIGGER IF EXISTS trg_log_document_delete ON public.documents;
CREATE TRIGGER trg_log_document_delete
  AFTER DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_document_approval_change();
