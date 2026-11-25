-- Simplification step 9: remove the database functions behind screens that no longer exist.
--
-- These read the documents table for the old Reports overview (Step 2 replaced it with the report hub)
-- and the old Ledger (Step 4 split it into the Inbox, Transactions and Bills & Invoices). Nothing in the
-- app, no other function, trigger, policy or view, and no test calls them any more (searched in src/,
-- supabase/ and scripts/ before writing this; the one SQL test on ledger_page moved to
-- src/utils/inbox.test.ts).
--
-- No CASCADE: if anything still depended on one of them, this migration fails instead of removing
-- something else with it. report_rows is dropped after the two functions that call it.
-- Kept on purpose: fund_budget_summary (Settings, Funds & Categories), dashboard_summary and
-- dashboard_cash_month (dashboard), and everything the statements, the document mirror and the tests use.

DROP FUNCTION IF EXISTS public.report_summary(uuid, integer, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.report_large_transactions(uuid, integer, integer, uuid, text, text, numeric, integer, integer);
DROP FUNCTION IF EXISTS public.report_rows(uuid, integer, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.ledger_page(uuid, text, uuid, date, date, text);
DROP FUNCTION IF EXISTS public.ledger_status_counts(uuid);
