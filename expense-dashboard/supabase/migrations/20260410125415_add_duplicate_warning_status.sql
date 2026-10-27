-- Add fields to documents table to help with duplicate detection
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS alternative_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS transaction_time VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_last4 VARCHAR(20),
ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vendor_branch_or_location VARCHAR(255);

-- We need to check if the status check constraint exists and modify it
do $$
declare
  constraint_definition text;
begin
  select pg_get_constraintdef(oid) into constraint_definition 
  from pg_constraint 
  where conrelid = 'documents'::regclass and conname = 'documents_status_check';
  
  if constraint_definition is not null then
    alter table documents drop constraint documents_status_check;
  end if;
  
  alter table documents add constraint documents_status_check check (status in ('extracting', 'needs_review', 'verified', 'DUPLICATE_WARNING'));
end;
$$;
