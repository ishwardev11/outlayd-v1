# Simplification baseline (Step 0)

Recorded 24 Nov 2026 on commit `b79a1c3`, local database only. Later steps compare against these
figures. Currency MYR.

## The data

- **Harapan Demo Society** (paid: status `pro`, tier `nonprofit`): the demo society from spec section 11,
  loaded by `scripts/load-demo-society.sql`, the same steps as `supabase/tests/demo_society.test.sql`
  but kept instead of rolled back. Users: `demo-admin@example.com` (Admin), `demo-editor@example.com` (Editor),
  `demo-viewer@example.com` (Viewer).
- **Free Test Club** (free plan): one approved unpaid bill (Hall Supplies, HS-11, 320.00, due 30 Nov 2026)
  and one paid receipt (Kedai Runcit, 85.50, 5 Nov 2026). Users: `free-admin@example.com` (Admin),
  `free-viewer@example.com` (Viewer).

### Recreating the demo data

1. `npx supabase db reset` (local; the CLI is also linked to the live project, so never add `--linked`).
2. Create the five users through the local auth API (one password of your choice, local only):

   ```powershell
   $st = npx supabase status -o json | ConvertFrom-Json
   $pw = Read-Host "Local test password"
   foreach ($u in "demo-admin","demo-editor","demo-viewer","free-admin","free-viewer") {
     Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:54321/auth/v1/admin/users" `
       -Headers @{ apikey = $st.SERVICE_ROLE_KEY; Authorization = "Bearer $($st.SERVICE_ROLE_KEY)" } `
       -ContentType "application/json" -Body (@{ email = "$u@example.com"; password = $pw; email_confirm = $true } | ConvertTo-Json)
   }
   ```
3. `Get-Content scripts\load-demo-society.sql -Raw | docker exec -i supabase_db_Outlayd_Proper psql -U postgres -d postgres -v ON_ERROR_STOP=1`

### Running the app against the local database

`.env.local` points at the **live** Supabase project and a **live** Stripe key. To run the app locally,
override them in the shell before `npm run dev` (process variables win over `.env.local`):

```powershell
$st = npx supabase status -o json | ConvertFrom-Json
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $st.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $st.SERVICE_ROLE_KEY
$env:STRIPE_SECRET_KEY = "sk_test_dummy_local"; $env:STRIPE_WEBHOOK_SECRET = "whsec_dummy"
$env:RESEND_API_KEY = "re_dummy"; $env:GEMINI_API_KEY = "dummy"; $env:NEXT_PUBLIC_APP_URL = "http://localhost:3100"
npx next dev -p 3100
```

## Two kinds of figures

The statements cap the end date at **today**, so on-screen figures move as months pass (the van's
depreciation is 750 a month). Two sets are recorded:

- **A. Fixed (database, full year 1 Jan to 31 Dec 2026):** do not depend on today's date. Use these to compare.
- **B. On screen (24 Nov 2026, period shown as 1 Jan to 24 Nov 2026):** what the app showed. Compare on
  the same date, or explain the depreciation difference.

## A. Fixed figures, full year 2026 (database functions)

| Measure | Building | Education | General | Total |
|---|---|---|---|---|
| Income (`income_expenditure`) | 0.00 | 12,000.00 | 5,500.00 | 17,500.00 |
| Expenditure | 8,250.00 | 1,750.00 | 3,000.00 | 13,000.00 |
| Opening (`changes_in_funds`) | 0.00 | 5,000.00 | 18,050.00 | 23,050.00 |
| Transfers in / out | 10,000.00 / 0 | 0 / 0 | 0 / 10,000.00 | net 0 |
| Closing | 1,750.00 | 15,250.00 | 10,550.00 | 27,550.00 |

- Balance sheet at 31 Dec 2026: cash 24,000.00; fixed assets 27,750.00; other current assets 2,000.00;
  receivables 0.00; payables 1,200.00; non-current liabilities 25,000.00; funds 27,550.00.
  `balance_check`: net assets 27,550.00 = funds 27,550.00, difference 0.00.
- Receipts & Payments 2026: receipts 48,950.00; payments 45,250.00; cash 20,300.00 to 24,000.00.
- Ledger: 11 transactions with lines, plus 1 fund transfer = 12 cash book rows.
- Open invoices: 1 payable, balance 1,200.00 (CJ-310, 2,000.00 less 800.00 paid). No open receivables.
- Documents: 1 `awaiting_payment` invoice 2,000.00 (CJ-310); 1 `paid` receipt 3,000.00 (Landlord).

## B. On-screen figures, 24 Nov 2026 (Admin, demo society)

### Dashboard
- Getting started: 5 of 6 done (Reconcile a month-end outstanding).
- Overdue strip: 1 bill to pay, RM1,200.00.
- Awaiting payment: **RM2,000.00** (sums approved unpaid documents, so the full 2,000, not the 1,200 still owed).
- Needs review: 0. Money out this month: RM0.00. Money in this month: RM0.00.
- 14-day money out: RM0.00. Action queue: 1 (Cetak Jaya RM2,000.00, Awaiting payment).
- Fund balances (today): General RM10,550.00; Building RM2,500.00; Education RM15,250.00.
- Recent activity: "Cetak Jaya was approved and is awaiting payment"; "Landlord was marked as paid".

### Income & Expenditure (1 Jan to 24 Nov 2026, one column per fund)
| | Building | Education | General | Total |
|---|---|---|---|---|
| General donations | | | 4,000.00 | 4,000.00 |
| Government grants | | 12,000.00 | | 12,000.00 |
| Rental income | | | 1,500.00 | 1,500.00 |
| **Total income** | - | 12,000.00 | 5,500.00 | **17,500.00** |
| Printing | | 1,750.00 | | 1,750.00 |
| Rent | | | 3,000.00 | 3,000.00 |
| Depreciation | 7,500.00 | | | 7,500.00 |
| **Total expenditure** | 7,500.00 | 1,750.00 | 3,000.00 | **12,250.00** |
| **Surplus / (deficit)** | (7,500.00) | 10,250.00 | 2,500.00 | **5,250.00** |

Comparative column (1 Jan to 24 Nov 2025): programme and course fees 1,200.00, surplus 1,200.00.

### Statement of Financial Position (as at 24 Nov 2026)
Van 28,500.00; Main Bank 23,700.00; Petty Cash 300.00; Hall rental deposit 2,000.00; total assets 54,500.00.
Bills owed 1,200.00; Bank Islam loan 25,000.00; total liabilities 26,200.00. **Net assets 28,300.00.**
Funds: Building 2,500.00; Education 15,250.00; General 10,550.00; **total 28,300.00**.

### Receipts & Payments (1 Jan to 24 Nov 2026)
Opening cash 20,300.00. Receipts 48,950.00 (donations 4,000; grants 12,000; course fees 1,200; rental
1,500; refund 250; loan 30,000). Payments 45,250.00 (printing 800; rent 3,000; utilities 450; loan
repayment 5,000; van 36,000). Closing cash **24,000.00**.

### Changes in Funds (1 Jan to 24 Nov 2026)
| Fund | Opening | Income | Expenditure | In | Out | Closing |
|---|---|---|---|---|---|---|
| Building | - | - | 7,500.00 | 10,000.00 | - | 2,500.00 |
| Education | 5,000.00 | 12,000.00 | 1,750.00 | - | - | 15,250.00 |
| General | 18,050.00 | 5,500.00 | 3,000.00 | - | 10,000.00 | 10,550.00 |
| **Total** | 23,050.00 | 17,500.00 | 12,250.00 | 10,000.00 | 10,000.00 | **28,300.00** |

### Schedules (1 Jan to 24 Nov 2026)
- Fixed assets: Van, additions 36,000.00, charge 7,500.00, book value 28,500.00.
- Money owed by age: you owe 1,200.00 in 61+ days overdue; owed to you nil.
- Donations and grants by fund: Education grants 12,000.00; General donations 4,000.00.

### Cash book (Ledger, Cash book tab, no filters)
12 rows. **Money in RM48,950.00; money out RM45,250.00.** Includes the fund transfer row
("Fund transfer", General Fund to Building Fund, no amount in either column).

### Reports overview (`/reports`, default filters; documents only)
- Processed volume RM5,000.00.
- Spend by fund: General RM3,000.00; Education RM2,000.00.
- Top categories: Rent RM3,000.00; Printing RM2,000.00.
- Significant outflows (>RM500): Cetak Jaya 2026-03-10 RM2,000.00; Landlord 2026-05-02 RM3,000.00.

### Accounting export (`/api/accounting-export`, format `generic`, 1 Jan to 31 Dec 2026, by document date)
- Scope "paid": **1 row, 3,000.00** (Landlord).
- Scope "approved": **2 rows, 5,000.00** (CJ-310 2,000.00 "Awaiting payment"; Landlord 3,000.00).
- Only format available: `generic` (19 columns: Date … Document ID, Remarks). The Xero bills format was
  removed earlier (see the comment in `src/utils/accounting-export.ts`, commit 8457913).

### Donor & Audit Memo (1 Jan to 31 Dec 2026; documents only)
| Fund | Total | Paid | Committed (unpaid) | Transactions | Checks flagged |
|---|---|---|---|---|---|
| Education | 2,000.00 | 0.00 | 2,000.00 | 1 (CJ-310) | no receipt file |
| General | 3,000.00 | 3,000.00 | 0.00 | 1 (Landlord) | no receipt file; no invoice/ref no. |
| Building | 0.00 | 0.00 | 0.00 | 0 | none |

Compared with the ledger, the memo misses the Education grant (12,000), the 800 paid on CJ-310 (shown
as all unpaid), the 250 printing refund, General's donation and rental income, and the van depreciation.
Step 1 is expected to change these.

## After Step 1 (Donor Memo and Accounting export read the ledger)

These replace the Accounting export and Donor Memo figures above for every later step. Nothing else changed.

### Accounting export (`generic`, 1 Jan to 31 Dec 2026, dated by the day the money moved)
- **11 rows (11 entries), money in 48,950.00, money out 45,250.00**, equal to the cash book.
- 24 columns: the first 19 as before, then Money in, Money out, Account, Source, Transaction ID.
- 8 of 11 lines have a category with no account code (the demo has none set); the 3 others are loan and asset lines.

### Donor & Audit Memo (1 Jan to 31 Dec 2026)
| Fund | Income | Expenditure | Net | Detail |
|---|---|---|---|---|
| Education | 12,000.00 | 1,750.00 | 10,250.00 | grant 12,000; CJ-310 2,000 part-paid (800 paid, 1,200 unpaid); refund CN-15 -250 |
| General | 5,500.00 | 3,000.00 | 2,500.00 | donation 4,000; rental invoice INV-2 1,500 (received); rent 3,000 |
| Building | 0.00 | 8,250.00 | (8,250.00) | depreciation 11 x 750 (non-cash); van 36,000 listed under "Assets bought" |

Each fund equals its column of Income & Expenditure "by fund" for the same period.

## Free Test Club (free plan, Admin, 24 Nov 2026)
- Dashboard: Awaiting payment RM320.00; Needs review 0; Money out this month RM85.50; no Money in card,
  no fund balances, no getting-started panel. Action queue: Hall Supplies RM320.00.
- Invoices: Bills to pay, HS-11 Hall Supplies RM320.00 Open, "Uploaded bill"; total you owe RM320.00.
  "New bill" shows the upgrade prompt ("Creating invoices is part of the Growth and Nonprofit plans").
- Donor Memo: locked, upgrade panel.
