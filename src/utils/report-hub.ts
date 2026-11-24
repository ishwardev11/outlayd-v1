// The Reports page: a grid of report cards, each with one plain line saying what it is for and who
// usually needs it. Pure function only, so the labels and plan badges are easy to test.
//
// Plan rules are not decided here: the page asks the database (featureAllowed) and passes the answers
// in. A locked card still links to its page, which shows the same sample preview or upgrade screen as
// before; the badge only says so in advance.

export type ReportLock = "sample" | "upgrade" | null

export interface ReportCard {
    key: string
    title: string
    description: string
    href: string
    lock: ReportLock
    // Extra links shown on the card (the year-end steps)
    links?: { label: string; href: string }[]
}

export interface ReportSection {
    key: "statements" | "memo" | "exports" | "year_end"
    title: string
    cards: ReportCard[]
}

export interface ReportAccess {
    // "read" access to each paid report (paid plans, and organisations that have been on one)
    statements: boolean
    donorMemo: boolean
    accountingExport: boolean
}

export function reportSections(orgType: string | null | undefined, access: ReportAccess): ReportSection[] {
    const business = orgType === "small_business"
    // Statements on the free plan open a sample preview; the memo and the export open an upgrade screen
    const statementLock: ReportLock = access.statements ? null : "sample"

    return [
        {
            key: "statements",
            title: "Financial statements",
            cards: [
                {
                    key: "income_expenditure",
                    title: business ? "Profit & Loss" : "Income & Expenditure",
                    description: business
                        ? "Revenue and costs for the period, and your profit or loss. Usually needed by your accountant and for tax."
                        : "Income and spending for the period, by category and fund. Usually needed for the AGM and the annual return.",
                    href: "/reports/income-expenditure",
                    lock: statementLock,
                },
                {
                    key: "financial_position",
                    title: "Financial Position",
                    description: business
                        ? "What the business owns and owes on a date. Usually needed by your accountant, bank or investors."
                        : "What you own and owe on a date, and what each fund holds. Usually needed by auditors and the AGM.",
                    href: "/reports/financial-position",
                    lock: statementLock,
                },
                {
                    key: "receipts_payments",
                    title: "Receipts & Payments",
                    description: business
                        ? "Cash received and paid, from opening to closing cash. Useful for checking cash flow against the bank."
                        : "Cash received and paid, from opening to closing cash. Many small societies submit this one.",
                    href: "/reports/receipts-payments",
                    lock: statementLock,
                },
                {
                    key: "changes_in_funds",
                    title: "Changes in Funds",
                    description: business
                        ? "How each fund moved: opening balance, income, spending, transfers and closing balance. Useful for tracking projects."
                        : "How each fund moved: opening, income, spending, transfers and closing. Usually needed by donors and auditors.",
                    href: "/reports/changes-in-funds",
                    lock: statementLock,
                },
                {
                    key: "schedules",
                    title: "Schedules",
                    description: "Fixed assets, money owed by age, and donations by fund. Usually attached to the statements for your auditor.",
                    href: "/reports/schedules",
                    lock: statementLock,
                },
            ],
        },
        {
            key: "memo",
            title: "For donors and auditors",
            cards: [
                {
                    key: "donor_memo",
                    title: "Donor & Audit Memo",
                    description: "One fund's income and spending, with checks and a sign-off PDF. Usually needed by a donor, grant-giver or auditor.",
                    href: "/reports/donor-memo",
                    lock: access.donorMemo ? null : "upgrade",
                },
            ],
        },
        {
            key: "exports",
            title: "Exports",
            cards: [
                {
                    key: "accounting_export",
                    title: "Accounting export",
                    description: "Your cash book as a CSV that accounting software can import. Usually needed by your accountant.",
                    href: "/reports/accounting-export",
                    lock: access.accountingExport ? null : "upgrade",
                },
                {
                    key: "cash_book_csv",
                    title: "Cash book CSV",
                    description: "Every payment in and out, with your own filters. Open the cash book and choose Export CSV. Handy for your own checks.",
                    href: "/ledger?view=cash",
                    lock: null,
                },
            ],
        },
        {
            key: "year_end",
            title: "Year end",
            cards: [
                {
                    key: "year_end",
                    title: "Year end",
                    description: "The steps to close a financial year: opening position, reconcile your accounts, lock the books. Usually done by the treasurer.",
                    href: "/reconciliations",
                    lock: null,
                    links: [
                        { label: "Opening position", href: "/settings/opening-position" },
                        { label: "Reconcile accounts", href: "/reconciliations" },
                        { label: "Lock the books", href: "/settings?tab=year-end" },
                        { label: "Audit log", href: "/audit-log" },
                    ],
                },
            ],
        },
    ]
}
