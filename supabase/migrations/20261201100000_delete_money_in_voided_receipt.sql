-- Fix: money in whose donation receipt was voided could not be deleted.
--
-- delete_money_in refused when ANY receipt existed for the entry, voided or not, and the foreign key
-- from donation_receipts to transactions (NO ACTION) refused the delete as well. A voided receipt is
-- no longer in force, so it should not keep the entry alive.
--
-- After this migration:
--   - A receipt IN FORCE still blocks deleting its entry (now checked by a trigger, since the foreign
--     key no longer does), so a receipt that a donor holds can never lose its entry.
--   - A VOIDED receipt does not block it. When the entry is deleted the voided receipt stays on record:
--     its number (never reused), donor, date, amount, what was printed, and the void reason are all
--     kept in donation_receipts; only its link to the deleted entry is cleared.
--   - A receipt without an entry must be void (check constraint).

-- 1. The link from a receipt to its entry: cleared when a (voided) receipt's entry is deleted
ALTER TABLE public.donation_receipts ALTER COLUMN transaction_id DROP NOT NULL;
ALTER TABLE public.donation_receipts DROP CONSTRAINT IF EXISTS donation_receipts_transaction_id_fkey;
ALTER TABLE public.donation_receipts
  ADD CONSTRAINT donation_receipts_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE public.donation_receipts DROP CONSTRAINT IF EXISTS donation_receipts_entry_or_void;
ALTER TABLE public.donation_receipts
  ADD CONSTRAINT donation_receipts_entry_or_void CHECK (transaction_id IS NOT NULL OR voided_at IS NOT NULL);

-- 2. A receipt in force protects its entry, whoever deletes it and however
CREATE OR REPLACE FUNCTION public.guard_receipted_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.donation_receipts r WHERE r.transaction_id = OLD.id AND r.voided_at IS NULL) THEN
    RAISE EXCEPTION 'A donation receipt was issued for this entry, so it cannot be deleted. Void the receipt first.';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_receipted_transaction() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_receipted_transaction ON public.transactions;
CREATE TRIGGER trg_guard_receipted_transaction
  BEFORE DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipted_transaction();

-- 3. delete_money_in, re-created from its exact text in 20261122100000_money_in_foundation.sql; only
--    a receipt in force (not voided) stops the delete, and the message says what to do
CREATE OR REPLACE FUNCTION public.delete_money_in(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.donation_receipts r WHERE r.transaction_id = p_id AND r.voided_at IS NULL) THEN
    RAISE EXCEPTION 'A donation receipt was issued for this entry, so it cannot be deleted. Void the receipt first.';
  END IF;
  DELETE FROM public.transactions
  WHERE id = p_id AND source = 'manual' AND tx_type = 'money_in'
    AND organization_id::text = public.get_user_org_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry was not found, or you cannot delete it';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_money_in(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_money_in(uuid) TO authenticated, service_role;
