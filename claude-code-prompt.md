# Outlayd accounting upgrade: working brief for Claude Code

You are continuing a staged build of the Outlayd accounting upgrade. Read this whole brief before touching anything.

**Repo:** `ishwardev11/outlayd-v1` (Next.js App Router, TypeScript, Supabase with row-level security, Stripe, Vercel).
**Spec:** the full build spec is "Outlayd Accounting Upgrade: Full Build Spec" (prepared 16 Nov 2026). Save it in the repo as `docs/accounting-spec.md` if it is not there already, and treat it as the source of truth for what each feature must do. This brief says what is already done and what order to work in.
**Owner:** Dev (solo founder, finance background). Explain what you change and why in plain language.

---

## 1. Ground rules (read twice)

1. **One feature at a time.** Finish a feature completely, prove it works, report, then **stop and wait**. Do not start the next feature until Dev writes "proceed" (or "proceed with feature N"). Never batch features.
2. **A feature is not done until every check in section 5 passes with zero errors.** If anything fails, fix it before reporting. Never report "done" with known failures, skipped tests, or unverified claims. If you could not verify something, say so plainly in the report.
3. **Never run anything against the live Supabase project or push to the production branch.** Work on a feature branch (`feature/<name>`), commit locally, and use a local database (`supabase start` / `supabase db reset`). Dev reviews and applies changes to production himself.
4. **Never rewrite or edit a migration that has already been applied.** Add a new migration with a later timestamp. The one exception is a migration you created in the current feature and Dev has not applied yet.
5. **Do not change anything outside the current feature's scope**, and do not change numbers that existing screens, reports or exports show today, unless the feature says so. Existing totals must stay identical.
6. **Security is part of every feature:** server-side validation, row-level security on every new table, role checks (Viewer can never write; Editor creates and edits; Admin/Owner changes settings), and no trust in client input. Enforce plan gates on the server and in database policies, not only by hiding buttons.
7. Dev works on Windows (PowerShell, project at `E:\Outlayd Proper`). Give commands that work there.

---

## 2. Current state of the product

- Money documents (receipts and bills) live in the `documents` table, with a `splits` JSON array of `{amount, fund_id, category_id}`. Statuses include `extracting`, `needs_review`, `DUPLICATE_WARNING`, `awaiting_payment`, `paid`. Paid documents have a `paid_date`.
- Today's Reports page, dashboard and "Settings > Funds > Spent" read from `documents` through database functions (`report_summary`, `report_rows`, `ledger_page`, `fund_budget_summary`). **These two rules differ today:** reports allocate by the document's header fund/category by `document_date` and include unpaid items; `fund_budget_summary` allocates by splits for paid and awaiting-payment documents. Do not "fix" this unless a feature says so.
- Plans: Free, and paid (Growth and Nonprofit). See `src/utils/plan.ts` and the Stripe webhook. Decisions already made: nonprofit pricing is handled manually (a nonprofit contacts Dev, then gets a discount code for the nonprofit price for life); a payment that fails (`past_due`) keeps paid access, downgrade happens only on cancellation; income tracking, invoices, financial statements, bank statement import and accounting export are paid features; expense tracking is the free core.
- Roles in the database: `Admin`, `Editor`, `Viewer` (`user_roles` table; `get_user_org_id()` and `get_user_role()` helpers). Server code uses the user's own Supabase session; a service-role admin client is used only for things like onboarding and account deletion.

---

## 3. What is already done

Each item is merged on `main` unless marked pending. **Before anything else, run `git log --oneline -15` and list `supabase/migrations` to confirm this matches reality, and tell Dev about any difference.**

**Phase 0 (done):** payment date (`paid_date`) exists and "paid this month" uses it; funds are archived (`archived_at`), never deleted; the invites banner works for users who already have an organisation.

**Phase 1, foundation (done in four steps):**

| Step | Migration | What it added |
|---|---|---|
| 1. Accounting foundation | `20261119120000_accounting_foundation.sql` | Organisation settings columns (type, legal name, address, up to 3 signatories, invoice/receipt prefix and next number). `funds`: `fund_type`, `opening_balance`, `is_default`. `categories`: `kind` (income/expense), `group_name`, `nature`, `sort_order`, `is_system`. New `accounts` table with RLS. `ensure_org_accounting_defaults(org)` guarantees every organisation has a default "General Fund", a default "Main Account" and system categories ("Uncategorised", "Uncategorised income", "Depreciation"); a trigger runs it for new organisations. Guard triggers stop signed-in users archiving, deleting, renaming or faking those defaults. `vendors` name is now unique per organisation, not globally. |
| 2. Payees | `20261119140000_payees.sql` | `vendors` extended into payees: `payee_type`, email, phone, address, registration number, notes, `archived_at`, `is_system`. Built-in payees "Anonymous donor" and "Cash donations (unnamed)". Payee with documents is archived, not deleted. Nav says "Payees" (route is still `/vendors`). |
| 3. Transactions | `20261119160000_transactions.sql` | `transactions` and `transaction_lines` tables. Every **paid** document is mirrored automatically by trigger (`sync_document_transaction`, `documents_sync_transaction_trigger`). Lines must add up to the total (deferred constraint trigger). Tables are **read-only to signed-in users**; only the database mirror writes. Functions `document_cash_lines`, `resync_org_transactions(org)` and `accounting_parity_check(org)` (empty result = identical totals). No screen reads these tables yet. |
| 3b. Fix | `20261119170000_fix_insert_guards.sql` | Fixed a bug where signed-in users could not create funds, accounts, categories or payees. Added the `app.accounting_bootstrap` session flag that lets `ensure_org_accounting_defaults` bypass the guards. |
| 4. Remarks (**check if merged**) | `20261120100000_document_remarks.sql` | `documents.remarks` (max 500 characters; separate from `documents.notes`). Mirror copies remarks. `ledger_page` search also searches remarks. Drawer has a Remarks box, ledger has a Remarks column, "Vendor" header renamed "Payee". |

**Tests that exist and must keep passing:** `supabase/tests/guards.test.sql` and `supabase/tests/transactions.test.sql`. Run them with:

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/guards.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/transactions.test.sql
```

---

## 4. Hard-won lessons (do not repeat these mistakes)

- **PL/pgSQL does not short-circuit `AND`/`OR`.** An expression like `TG_TABLE_NAME = 'funds' AND NEW.is_system` still fails when the table has no `is_system`. Use nested `IF` per table. This bug shipped once and broke fund/payee creation.
- **`documents.notes` holds AI extraction error messages** ("AI Extraction Error: ..."). Never show it as user-facing text or copy it anywhere. User remarks are `documents.remarks`.
- **Guards check the JWT role** (`request.jwt.claims`), so they also apply inside `SECURITY DEFINER` functions called from a signed-in user's request. Anything that must write protected rows or `transactions` needs `SECURITY DEFINER` (and a trigger that calls it must itself be `SECURITY DEFINER`), plus the bootstrap flag where relevant. The service role is exempt from guards.
- **Failsafe wrappers hide bugs.** The document-to-transaction mirror catches its own errors so a person can always save a document. That means a broken mirror fails silently. Tests must exercise it **as a signed-in role** (`SET LOCAL ROLE authenticated` with `request.jwt.claims` set), not only as the database owner.
- **Test as real roles and check for real errors.** Tests that run as superuser pass things that fail in production. Every test script must stop on the first error (`\set ON_ERROR_STOP on`).
- Postgres does not guarantee a deleted fund/category stays referenced: today deleting a category moves its transaction lines to "Uncategorised" (trigger `reassign_lines_before_delete`). The spec wants archive instead of delete; convert this when income categories ship (Feature 3).
- Changing a column or return type of a function that other code calls needs the full function re-created from its exact existing definition. Generate it from the existing migration text, never from memory.
- `tsc` must be run, not assumed. A missing type field (`fund.is_default`) once broke `npx tsc --noEmit`.

---

## 5. Definition of done (every feature, no exceptions)

A feature is done only when **all** of these are true. Show the actual output of each command in your report.

1. `supabase db reset` applies every migration from scratch with **no errors or warnings**.
2. Existing tests pass: `guards.test.sql`, `transactions.test.sql`, plus every test added by earlier features.
3. New SQL tests cover the feature's rules, including: the happy path, each constraint refusing bad data, each role (Admin, Editor, Viewer, and a signed-in user from a **different** organisation), and plan gating. Run them as real roles.
4. For features that touch existing data: `accounting_parity_check(org)` returns no rows, and a before/after comparison shows existing screens' numbers unchanged. Test the **upgrade path** from the previous schema state with realistic messy data, not only an empty database.
5. `npx tsc --noEmit` exits 0 with no output.
6. `npm run lint` exits 0 with no errors.
7. `npm run build` succeeds.
8. Pure logic (CSV builders, calculations, formatters) has automated unit tests. If the repo has no test runner, add the smallest reasonable one and say so.
9. You drove the feature in the running app (`npm run dev`) as at least an Admin and a Viewer and report what you saw. If you cannot run a browser, say so and give Dev an exact manual script instead.
10. The report (section 6) is written.

---

## 6. How to report at the end of each feature

Then stop. Format:

1. **What changed in the app**: what the user will now see or be able to do, screen by screen. Plain language.
2. **Why**: one short paragraph tying it to the spec.
3. **How to test it manually**: numbered steps Dev can follow in the browser, with expected results, including a Viewer and a failure case.
4. **Verification evidence**: the output of each check in section 5, and anything you could not verify.
5. **Risks, differences and decisions**: anything that behaves differently from before, any spec ambiguity you resolved and how, and anything Dev must do (for example apply a migration to production and in which order).
6. **Commit(s)** on the feature branch, and the migration file names.
7. The line: **"Waiting for 'proceed' before starting Feature N: <name>."**

---

## 7. Feature queue (work strictly in this order)

### Feature 0: Verify the baseline
Confirm section 3 matches the repo (including whether step 4 remarks is merged; if not, review and apply it from the patch Dev provides, or tell Dev). Run `supabase db reset`, both SQL test files, `tsc`, `lint`, `build`. Fix nothing beyond what is broken; report the state. Save the spec to `docs/accounting-spec.md` if missing.

### Feature 1: Remarks in every export
Dev asked for remarks to appear in all report extracts. Findings from reading the code:
- **Accounting export** (`src/utils/accounting-export.ts`, `accounting-export-data.ts`, `src/app/api/accounting-export/route.ts`): the `COLUMNS` string in `accounting-export-data.ts` does not select `remarks`; `ExportDocument` and `ExportLine` have no remarks field. Two formats exist: `generic` and `xero_bills`. For `generic`, add a "Remarks" column **at the end** so existing positional mappings do not shift. For `xero_bills`, which follows a fixed import template, **look up the current Xero bill import template before adding anything**; if there is no documented column that suits remarks (for example Reference), do not add an unrecognised column that could make the import fail. Tell Dev what you decided and why. Use the existing `csvText` helper (it neutralises spreadsheet formula injection).
- **Export Report** (`src/components/reports/ReportsExportButton.tsx`): rows come from `getReportExportRows` in `src/app/actions/aggregates.ts`, which calls the `report_rows` RPC that returns whole `documents` rows, so `remarks` already arrives. Add a Remarks column to the CSV and PDF (PDF: keep the table readable, for example a wrapped column). The CSV builder currently wraps cells in quotes **without escaping quote characters or formula-start characters**, so a remark containing `"` or starting with `=` would corrupt the row or run as a formula. Route text cells through a shared safe helper (same behaviour for normal values).
- **Donor & Audit Memo** (`src/app/actions/memo.ts`, `src/utils/fund-memo.ts`, `src/utils/fund-memo-pdf.ts`, `src/components/reports/DonorMemoClient.tsx`): the documents `select` list in `memo.ts` does not include `remarks`, and `MemoDocInput` has no field for it. Add it to the transaction listing in the memo and its PDF.
- Acceptance: remarks with commas, quotes, newlines, a leading `=`, `+`, `-`, `@`, and non-English text come out correctly in every format; a document with no remarks gives an empty cell; the AI-error `notes` text never appears; unit tests cover the CSV builders; existing columns and totals are unchanged.

### Feature 2: Plan flags (finishes Phase 1)
Spec section 9. A single server-side helper that answers "may this organisation use feature X?" (income and donation tracking, funds/accounts/invoices new use, assets and opening position, financial statements and AGM pack, period lock/reconciliation/audit log, Donor & Audit Memo), built on the existing plan logic in `src/utils/plan.ts`, honouring the decisions in section 2 (`past_due` keeps access; downgrade only on cancellation; nothing is ever deleted on downgrade, paid features become read-only and exports of existing data keep working). Enforce in server actions **and** in database policies for the tables each feature owns (use a `SECURITY DEFINER` function the policies can call). Do not hide-button only. Tests: free, paid, `past_due`, cancelled, and a different organisation.

### Feature 3: Phase 2, money in and donations
Spec sections 3.3, 3.7, 5.2, 5.3, 6.1 (cash basis), 7, and the Phase 2 line in section 11. Includes: income categories seeded per organisation type (seed lists in spec section 7; existing organisations keep their categories); donation vs other income choice (a filter on category `nature`); the manual money-in and money-out write path for `transactions` (write policies for Admin/Editor, validation that account, funds, categories and payee all belong to the same organisation and that category kind matches); donor receipts using the atomic receipt number sequence (never reuse or skip a number under concurrent requests); archive-instead-of-delete for categories; dashboard "money in / money out this month" from transaction dates; Income & Expenditure statement on a cash basis. **Before writing code for this feature, present a short design for how the ledger and reports will read both documents and transactions (the mirror makes documents a temporary source of truth) and wait for Dev's approval of that design.** This is the biggest architectural decision in the project.

### Feature 4: Phase 3, invoices
Spec sections 3.8, 5.4, rule R1, R2, R3, and the Receipts & Payments report. Convert unpaid bills to open payable invoices as described in spec section 10 step 5, with the "date estimated" rule and an acceptance check that total expenses by category and fund are identical before and after. Derived statuses (paid, part-paid, overdue) are never stored. Overpayment blocked. Printable PDF for receivable invoices. Ageing.

### Feature 5: Phase 4, balance sheet
Spec sections 3.6, 5.6, rules R4 to R6, reports 6.2, 6.4 and 6.5: assets and liabilities, opening position wizard, straight-line depreciation computed by the report engine (not stored), disposal action (add the "Gain/loss on disposal" system category here), Statement of Financial Position, Statement of Changes in Funds, schedules. The R5 balance check must hold at every month-end of the demo dataset.

### Feature 6: Phase 5, assurance
Spec sections 3.9, 6.7 and 8: period lock (server and database), reconciliations, audit log for transactions and invoices, integrity-check panel with blocking rules, PDF and Excel export with letterhead, signatory block and a DRAFT watermark until checks pass, AGM pack. Build the demo-nonprofit automated test from the spec's last paragraph (two restricted funds, a grant, a part-paid payable invoice, a receivable invoice, an asset purchase with depreciation, a loan, a refund, a fund transfer) with statements worked out by hand.

### Feature 7: Phase 6, polish
Gating previews for free plans, onboarding, and updating the pricing page, landing copy and nonprofit page so every claim matches what each plan actually includes.

---

## 8. Starting message

Begin with **Feature 0 only**. When it is done, send the section 6 report and wait for Dev to say "proceed".
