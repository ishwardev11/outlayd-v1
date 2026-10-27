-- Ensure invoice_number column exists on documents table
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(255);

-- Create index on organization_id and invoice_number for performant lookups and filtering
CREATE INDEX IF NOT EXISTS idx_documents_invoice_number ON public.documents (organization_id, invoice_number);

-- Add comment documenting column purpose
COMMENT ON COLUMN public.documents.invoice_number IS 'Official invoice or reference number extracted from or assigned to the document';
