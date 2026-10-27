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
  
  alter table documents add constraint documents_status_check check (status in ('extracting', 'needs_review', 'verified', 'DUPLICATE_WARNING', 'paid', 'awaiting_payment', 'PENDING'));
end;
$$;
