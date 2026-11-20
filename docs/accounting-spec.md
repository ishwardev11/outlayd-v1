Outlayd Accounting Upgrade: Full Build Spec  
Prepared November 16, 2026. Covers invoices, income and donations, payee and remarks, expense categories, and AGM-ready financial statements.  
1. Design principles (how we avoid holes)  
The goal is a closed loop: every number in a report comes from something the user entered, and everything the user can enter shows up somewhere. Four rules make that true.  
1.  Nothing a report depends on can be blank. Fund, category, account and payee all have defaults set at the database level, so upgrading or turning on a feature never leaves empty data behind.  
2.  One source of truth. Reports are computed only from transactions, invoices, items and opening balances. No separately stored totals that can drift.  
3.  Nothing in use is deleted. Funds, categories, payees, accounts and items are archived once they have any records. Hard delete only when there is zero usage.  
4.  A report cannot be marked final until the integrity checks pass (section 8).  
This spec describes concepts, not your exact tables. Where something already exists (funds, vendors, categories, documents), extend it instead of creating a second one. Before Outlayd advertises the statements as AGM-ready, ask the client which format their registrar or auditor expects and have an accountant review the layouts.  
2. Vocabulary (also use this as helper text in the UI)  
• Fund: whose money it is and what restriction it carries. Example: General Fund, Building Fund, a specific grant. Helper text: "Which pot of money is this? Most organisations just use General Fund."  
• Category: what the money was for. Example: Rent, Printing, Donations. Helper text: "What kind of income or expense is this?"  
• Payee: who it was paid to or received from (supplier, donor, member, grantor).  
• Account: where the cash sits (bank, cash box, e-wallet).  
• Invoice: a bill owed or issued that is not yet cash.  
• Transaction: an actual movement of cash.  
A RM2,000 contractor payment is Category: Repairs & Maintenance, Fund: Building Fund, Payee: the contractor, Account: Main Bank.  
3. Data model  
3.1 Organisation settings  
• Organisation type: nonprofit or small business. This drives seed categories and report labels ("Statement of Income and Expenditure" vs "Profit and Loss").  
• Legal name, registration number, address, logo.  
• Currency: MYR only in v1, shown on every report.  
• Financial year start month (end date derived).  
• Signatories for report footers: up to three names with titles (for example President, Treasurer, Hon. Secretary).  
• Numbering: invoice prefix and next number, donation receipt prefix and next number.  
• Default account and default fund (system-created, see below).  
3.2 Funds  
• Fields: name, type (unrestricted or restricted), purpose/restriction note, opening balance, archived date, is_default.  
• A "General Fund" (unrestricted, default) is created for every organisation and can never be archived.  
• Archive instead of delete. Archived funds disappear from pickers but stay in reports and on old entries. To archive a fund with a balance, prompt the user to transfer the remainder to another fund (creates a fund transfer).  
• Restricted funds: show a soft warning if spending would take the fund below zero.  
3.3 Categories  
• Fields: name, kind (income or expense), group, nature (income only: donation, grant, membership, fundraising, programme income, other income), sort order, is_system, archived date.  
• Seeded per organisation type (section 7). Users can add, rename, reorder and archive. System categories (Uncategorised, Depreciation, Gain/loss on disposal) cannot be edited or archived.  
• The donation vs income choice in the UI is simply a filter on nature, so the two can never disagree with each other.  
3.4 Payees (extends Vendors)  
• Rename Vendors to Payees in navigation. Existing vendors become type "vendor".  
• Fields: name, type (vendor, donor, member, grantor, customer, staff, other), email, phone, address, registration or tax number (optional), notes, archived date.  
• Built-in payees: "Anonymous donor" and "Cash donations (unnamed)" so donations never require a donor record.  
• Do not store bank account numbers in v1. If the client needs them later, restrict to Admin and exclude from every export.  
3.5 Accounts  
• Fields: name, type (bank, cash, e-wallet), opening balance, opening date, archived date.  
• A default "Main Account" exists for every organisation. Free-plan users never see the picker, but every transaction still has an account, so upgrading leaves no gaps.  
3.6 Assets and liabilities (balance sheet items)  
One generic list that covers everything on the balance sheet that is not cash, receivables or payables.  
• Fields: name, kind (fixed asset, other asset, liability), classification (current or non-current), fund, opening balance.  
• Fixed assets also have: purchase date, cost, residual value, useful life (months), straight-line method, disposal date and proceeds.  
• Examples: equipment, deposits, loans, provisions.  
• Depreciation is computed by the report engine per month (full month from month of purchase), not stored, so there is no scheduled job to fail. It appears as an expense under the system "Depreciation" category, charged to the asset's fund, and reduces net book value.  
• Disposal or write-off action: asks for proceeds, creates the receipt transaction if proceeds are above zero, and books any gain or loss to the system "Gain/loss on disposal" category.  
3.7 Transactions (the ledger)  
Header: date (the actual payment or receipt date, which also fixes the missing payment-date problem), type, account, payee, reference (cheque, bank ref or receipt number), remarks (up to 500 characters), attachments (existing private bucket with signed links), created/updated by and timestamps, source (manual, AI extraction, import).  
Types:  
• Money in  
• Money out  
• Account transfer (from account to account, no lines)  
• Fund transfer (from fund to fund, no cash effect)  
Lines (for money in and out): each line has an amount, a fund (required, defaults to General) and exactly one target:  
• a category (income or expense), or  
• an invoice (this transaction is a payment against it), or  
• an asset or liability item (purchase, loan received, repayment, deposit).  
The line amounts must add up to the header total. Splits (one bank receipt covering two funds, one bill covering three categories) are just multiple lines. The UI shows a single line by default with a "Split" button.  
Sign rule: the category's kind decides whether something is income or expense, and the direction decides the sign. So a supplier refund (money in, expense category) reduces expense, and a returned donation (money out, income category) reduces income. No negative amounts are ever entered.  
3.8 Invoices  
• Fields: direction (payable or receivable), number (your own sequence for receivable; the supplier's number for payable), payee (required), issue date, due date, reference/PO, remarks, attachment, lines (description, category, fund, amount), total, status.  
• Stored status is only draft, open or void. Paid, part-paid and overdue are always derived from the linked payments and today's date, never stored.  
• Amount paid is the sum of transaction lines targeting the invoice. Balance is total minus paid. Overpayment is blocked. Deleting a payment recalculates automatically.  
• Void is allowed only when no payments are linked.  
• "Opening balance invoice" flag for invoices dated before the opening date (see rule R3).  
• Receivable invoices get a printable PDF with the organisation letterhead and bank payment details typed into settings text.  
3.9 Period locks, reconciliations, audit log  
• Lock date per organisation. Any create, edit or delete of a transaction or invoice dated on or before the lock date is rejected on the server and by a database policy. Only Owner or Admin can move the lock date, and every change is logged.  
• Reconciliation record per account per month-end: statement closing balance (entered), Outlayd balance (computed), difference, note, who and when. A non-zero difference shows a warning on that period's reports.  
• Audit log for edits and deletes of transactions and invoices: who, when, what changed. Needed so a treasurer can answer an auditor.  
4. Accounting rules (these keep every report consistent)  
• R1, recognition: income and expense in the Income & Expenditure statement come from (a) transaction lines that target a category, dated by transaction date, and (b) invoice lines, dated by issue date. A transaction line that pays an invoice is never counted again, because the invoice already was. This is the rule that prevents double counting.  
• R2, cash: account balance = opening balance + money in − money out ± account transfers. The Receipts & Payments statement uses transactions only. A payment against an invoice is shown under the invoice lines' categories, split proportionally when the payment is partial.  
• R3, opening receivables and payables: entered as invoices flagged as opening balance. They appear in receivables and payables, but are not counted in the current year's income or expenditure, and neither are their later payments.  
• R4, fund balance: opening fund balance + income − expenses ± fund transfers, per fund. Depreciation is charged to the asset's fund.  
• R5, balance check: cash and bank + receivables + other assets + fixed assets at net book value − payables − liabilities must equal the sum of all fund balances at any date. The Opening Position wizard (5.6) makes this true on day one. If the check ever fails, the report shows a red banner and final export is disabled.  
• R6, items: money out to an asset item is a purchase (not an expense). Money in to a liability item is a loan received. Money out to it is a repayment. None of these touch Income & Expenditure.  
• R7, comparatives: prior-year columns use the same date range one year earlier. Prior-year closing balances equal this year's opening balances, enforced by a check.  
• R8, archive: archived items stay in all historic reports and cannot be chosen for new entries.  
5. Screens and behaviour  
5.1 Navigation  
Dashboard, Ledger, Invoices, Payees, Reports, Settings (Organisation, Funds, Categories, Accounts, Assets & Liabilities, Periods).  
5.2 Ledger  
• Columns: Date, Payee, Description, Type, Category (or invoice or item), Fund, Account, Money in, Money out, Reference, Remarks, Attachment indicator, Status (locked, reconciled).  
• Split transactions show one row with an expander. Filters: date range, type, fund, category, payee, account, has attachment, text search over remarks and payee. Export to CSV honours the filters.  
• Running balance column appears when a single account is filtered.  
• Row click opens a detail drawer with all fields, attachments, linked invoice and the audit history.  
5.3 Add or edit transaction  
1.  Pick type: Money in, Money out or Transfer.  
2.  For money in, first choose "Donation" or "Other income". This filters categories by nature.  
3.  Payee: search or create inline. Donations can use Anonymous donor.  
4.  Allocate: category, or "pay an invoice" (lists open invoices for that payee with balance prefilled), or asset/liability item.  
5.  Fund (defaults to General), account (defaults to Main), date, reference, remarks, attachment.  
6.  Split button adds lines. A running "unallocated" amount must reach zero before saving.  
7.  For donations, a "Generate donation receipt" action uses the receipt sequence. Mark the receipt as tax-deductible only if the organisation has enabled that in settings (confirm the legal requirement with the client).  
5.4 Invoices  
• Two tabs, Payable and Receivable, each with a status filter (draft, open, part-paid, paid, overdue, void) and an ageing summary (current, 1–30, 31–60, 61+ days).  
• Create invoice form: payee, dates, lines with category and fund, attachment. The existing AI extraction fills this from an uploaded bill and the user confirms.  
• "Record payment" button opens the transaction form prefilled with payee, invoice, remaining balance and fund. Part-payments are allowed.  
• Receivable invoices can be downloaded as PDF. Sending by email is out of scope for v1.  
5.5 Payee page  
Totals in and out for a chosen period, outstanding invoice balance, full list of transactions and invoices, notes. Donor payees show total donated by fund and a list of receipts issued.  
5.6 Opening Position wizard (required before statements work)  
Shown once to paid organisations, and anytime from Settings. Steps:  
1.  Choose the tracking start date (usually the start of a financial year).  
2.  Enter an opening balance for each account.  
3.  Enter opening receivables and payables as flagged opening invoices.  
4.  Enter opening fixed assets (cost, accumulated depreciation to date, life) and other assets and liabilities.  
5.  Enter opening balances for each restricted fund. The General Fund's opening balance is calculated as the balancing figure (total net assets minus restricted funds) and shown to the user, so the balance sheet balances by construction.  
Until this is complete, the Statement of Financial Position shows a "Complete your opening position" prompt instead of wrong numbers.  
5.7 Dashboard  
• Money in and money out this month, based on transaction (payment) dates.  
• Fund balances.  
• Overdue payable and receivable invoices.  
• Unreconciled accounts.  
• Number of uncategorised entries, with a link.  
6. Reports page (repurposed)  
A report picker with common controls: period (current FY, previous FY, custom, with AGM presets), fund filter (all or one), comparative column on or off. Every line drills down to the ledger or invoices filtered to the records behind it.  
6.1 Statement of Income and Expenditure (Profit and Loss for small businesses)  
• Income grouped by nature, then category, then total income.  
• Expenditure grouped by Programme, Staff, Administration, Fundraising and Depreciation, then total.  
• Surplus or (deficit) for the year.  
• Columns: current year and prior year. A "by fund" layout puts each fund in its own column plus a total, which is the standard nonprofit presentation.  
6.2 Statement of Financial Position (balance sheet)  
• Non-current assets: fixed assets at cost less accumulated depreciation.  
• Current assets: cash and bank per account, receivables, other current assets.  
• Current liabilities: payables and others. Non-current liabilities: loans and others.  
• Net assets, then funds per fund (accumulated), with a total that equals net assets.  
6.3 Receipts and Payments  
Opening cash, receipts by category, payments by category, closing cash. It must agree to the account balances and reconciliations. Many small societies submit this version.  
6.4 Statement of Changes in Funds  
Per fund: opening balance, income, expenditure, transfers in and out, closing balance.  
6.5 Schedules and notes  
• Fixed asset schedule (cost, depreciation, net book value).  
• Receivables and payables ageing.  
• Donations and grants by fund.  
• Optional donor list (off by default, for privacy).  
6.6 Existing Donor & Audit Memo  
Stays as is and is linked from the reports page. Update it to read from the new transactions and funds.  
6.7 Export  
• PDF with letterhead, statement title, "for the year ended" date, amounts in RM, negatives in brackets, page numbers, signatory block, and a configurable statement line (for example "Prepared from Outlayd records, unaudited").  
• Excel and CSV for each report.  
• An AGM pack: one PDF bundling 6.1 to 6.4 and the schedules with a cover page.  
• Reports carry a "DRAFT" watermark until the integrity checks (section 8) pass.  
7. Seed categories  
Nonprofit: expense groups  
• Programme costs: programme and activity costs, event and venue, materials and supplies, aid and grants disbursed, volunteer expenses, training and workshops.  
• Staff costs: salaries and allowances, EPF/SOCSO/EIS, honorarium, staff welfare.  
• Administration: rent, utilities, phone and internet, printing and stationery, postage, insurance, professional fees (audit, legal, accounting), bank charges, licences and subscriptions, software, repairs and maintenance, transport and travel.  
• Fundraising: fundraising event costs, marketing, payment platform fees.  
• System: Depreciation, Gain/loss on disposal, Uncategorised.  
• Other: miscellaneous.  
Nonprofit: income (nature in brackets)  
• General donations (donation), restricted donations (donation).  
• Government grants, corporate grants, foundation grants (grant).  
• Entrance fees, annual subscriptions (membership).  
• Event and ticket income, merchandise sales, sponsorships (fundraising).  
• Programme and course fees, rental income (programme income).  
• Bank interest, miscellaneous income (other income).  
• Uncategorised (system).  
Small business  
Revenue (sales, service income, other income), cost of sales (materials, direct labour, subcontractors), operating expenses (salaries, rent, utilities, marketing, software, professional fees, insurance, travel, bank charges, repairs), plus the same system categories.  
8. Integrity checks (the "ready to submit" checklist)  
Shown as a panel on the Reports page. A report is marked Final only when all pass; warnings are listed but do not block.  
• No transactions or invoices in the period are Uncategorised. (Block)  
• Every transaction line has a fund and the line totals equal the header. (Block)  
• Opening position is complete. (Block for balance sheet)  
• The balance check in R5 holds at the period end. (Block)  
• Prior-year closing equals this year's opening. (Block)  
• No invoice is overpaid and no payment is linked to a void invoice. (Block)  
• Every account has a reconciliation for the period end, with any difference explained. (Warning)  
• Restricted funds have no negative balance. (Warning)  
• Period is locked after final export. (Prompt)  
9. Plans, permissions and marketing  
Feature  
Free  
Paid  
Expense ledger, receipts, vendors/payees, remarks, expense categories  
Yes  
Yes  
Basic expense summary  
Yes  
Yes  
Income and donation tracking, donor receipts  
Preview only  
Yes  
Funds, accounts, invoices  
Existing data read-only, new use locked  
Yes  
Assets and liabilities, opening position  
No  
Yes  
Financial statements, AGM pack, schedules  
Sample preview  
Yes  
Period lock, reconciliation, audit log  
No  
Yes  
Donor & Audit Memo  
No  
Yes  
• Enforce every gate on the server and in database policies, not only by hiding buttons.  
• Because accounts and funds always exist as defaults, upgrading just unlocks screens. No data conversion on upgrade.  
• If funds are already usable on the free plan today, keep existing fund data visible and read-only instead of removing it.  
• On downgrade or cancellation, nothing is deleted. Paid features become read-only and exports of existing data keep working. Access during a past_due payment stays unchanged, matching your billing decision.  
• Roles: Owner and Admin can change settings, opening position, locks and unlock; Editors create and edit transactions and invoices; Viewers read and view reports only.  
• Update the pricing page, landing copy and nonprofit page so every claim matches what each plan actually includes.  
10. Migration of existing data  
Run in this order, in a single tested migration:  
1.  Fix documents pointing at deleted funds by assigning them to the General Fund (this pairs with your fund-archiving fix).  
2.  Create the default fund and Main Account for every organisation and make fund, category and account non-null.  
3.  Map existing categories to expense categories (use seed names where they match, otherwise group under Other). Add the system Uncategorised category and move anything without a category into it.  
4.  Convert vendors to payees of type vendor.  
5.  Convert existing records: paid receipts and expenses become standalone money-out transactions; unpaid bills become open payable invoices; bills marked paid become an invoice plus a linked payment. Where no payment date exists, use the invoice date and flag it "date estimated". Switch "Paid this month" and similar dashboard figures to transaction dates.  
6.  Run the integrity checks per organisation and store the results so affected users see them.  
7.  Show the Opening Position wizard to paid organisations.  
Acceptance for the migration: for every organisation, total expenses by category and fund before and after are identical.  
11. Build order and dependencies  
Each phase leaves the app fully working. Nothing in a later phase is needed to make an earlier phase show correct data.  
• Phase 0: finish the pending review fixes (fund archiving, payment date, invites).  
• Phase 1, foundation: organisation settings, defaults for funds, accounts and categories, payee upgrade, transaction header and lines refactor, remarks and payee columns in the ledger, migration, plan flags. Done when existing data displays with unchanged totals.  
• Phase 2, income: money-in flow with donation vs other income, income categories, donor receipts, dashboard updates, Income & Expenditure report on a cash basis.  
• Phase 3, invoices: payable and receivable invoices, payments against them, ageing, apply rule R1 to the Income & Expenditure report, Receipts & Payments report.  
• Phase 4, balance sheet: opening position wizard, assets and liabilities, depreciation, Statement of Financial Position, Statement of Changes in Funds, schedules.  
• Phase 5, assurance: period lock, reconciliation, audit log, integrity checks, PDF and Excel export, AGM pack.  
• Phase 6, polish: gating previews, onboarding, marketing pages.  
Test dataset: create a demo nonprofit with two restricted funds, one grant, a part-paid payable invoice, a receivable invoice, one asset purchase with depreciation, a loan, a refund and a fund transfer. Work out the expected statements by hand and make them an automated test. The balance check R5 must pass at every month-end.