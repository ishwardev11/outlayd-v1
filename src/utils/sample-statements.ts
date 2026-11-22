// Sample statements for the Free plan (spec 9: "sample preview"). A made-up society, built with the same
// statement builders as real statements, so a free organisation sees exactly what it would get. Nothing
// here reads any data. The figures agree with each other: income less expenditure moves the funds, the
// funds equal net assets, and cash moves by receipts less payments (checked by unit tests).
import { buildStatement, type IERow } from "./income-expenditure"
import { buildFinancialPosition, buildChangesInFunds, type BSRow, type CIFRow, type FundInfo } from "./financial-position"
import { buildReceiptsPayments, type RPRow } from "./receipts-payments"
import {
    printChangesInFunds, printFinancialPosition, printIncomeExpenditure, printReceiptsPayments, printSchedules, type StatementPrint,
} from "./statement-print"

export type SampleKind = "income_expenditure" | "receipts_payments" | "financial_position" | "changes_in_funds" | "schedules"

export const SAMPLE_ORG = "Persatuan Contoh (sample society)"
const FUNDS: FundInfo[] = [
    { id: "gen", name: "General Fund", fund_type: "unrestricted", is_default: true },
    { id: "bld", name: "Building Fund", fund_type: "restricted", is_default: false },
    { id: "edu", name: "Education Fund", fund_type: "restricted", is_default: false },
]
const fundName = (id: string) => FUNDS.find((f) => f.id === id)!.name

// [kind, nature, group, category, fund, amount 2025, amount 2024]
const LINES: [IERow["kind"], string | null, string | null, string, string, number, number][] = [
    ["income", "donation", null, "General donations", "gen", 18500, 16200],
    ["income", "donation", null, "Building appeal", "bld", 12000, 0],
    ["income", "grant", null, "State education grant", "edu", 8000, 8000],
    ["income", "membership", null, "Membership fees", "gen", 3600, 3400],
    ["income", "programme_income", null, "Class fees", "gen", 4200, 3900],
    ["expense", null, "Programme", "Tuition classes", "edu", 6500, 6000],
    ["expense", null, "Programme", "Tuition classes", "gen", 3300, 3100],
    ["expense", null, "Programme", "Community events", "gen", 4600, 3800],
    ["expense", null, "Staff", "Part-time coordinator", "gen", 12000, 11400],
    ["expense", null, "Administration", "Rent", "gen", 7200, 7200],
    ["expense", null, "Administration", "Utilities", "gen", 1850, 1720],
    ["expense", null, "Administration", "Printing", "gen", 640, 580],
    ["expense", null, "System", "Depreciation", "bld", 2400, 0],
]

function ieRows(year: 0 | 1, business: boolean): IERow[] {
    return LINES.filter((l) => (year === 0 ? l[5] : l[6]) !== 0).map(([kind, nature, group, cat, fund, a, b]) => ({
        kind,
        nature: business ? null : nature,
        // A business groups income as Revenue and its spending as operating expenses
        group_name: business ? (kind === "income" ? "Revenue" : group === "System" ? "System" : group === "Programme" ? "Cost of sales" : "Operating expenses") : group,
        category_id: cat, category_name: cat, category_sort: 0, fund_id: fund, fund_name: fundName(fund),
        amount: year === 0 ? a : b,
    }))
}

const HEADING = "For the year ended 31 December 2025"
const LABELS = { current: "2025", prior: "2024" }

export function sampleIncomeExpenditure(business: boolean): StatementPrint {
    const s = buildStatement({ orgType: business ? "small_business" : "nonprofit", current: ieRows(0, business), prior: ieRows(1, business), layout: "total", labels: LABELS })
    return printIncomeExpenditure(s, { heading: HEADING, fundName: null, currency: "MYR", from: "2025-01-01", to: "2025-12-31" })
}

export function sampleReceiptsPayments(business: boolean): StatementPrint {
    // Cash basis: 300 of class fees still owed to us, 850 of utilities not yet paid, depreciation is not cash,
    // and the hall renovation was paid for in cash
    const rows: RPRow[] = ieRows(0, business)
        .filter((r) => r.category_name !== "Depreciation")
        .map((r) => ({
            ...r,
            section: r.kind === "income" ? "receipts" : "payments",
            amount: r.category_name === "Class fees" ? r.amount - 300 : r.category_name === "Utilities" ? r.amount - 850 : r.amount,
        }))
    rows.push({ section: "payments", kind: "item", nature: null, group_name: "Purchase of fixed assets", category_id: "hall", category_name: "Hall renovation",
        category_sort: 0, fund_id: "bld", fund_name: "Building Fund", amount: 24000 })
    const s = buildReceiptsPayments({ orgType: business ? "small_business" : "nonprofit", current: rows, prior: null, labels: LABELS,
        cash: { current: { opening: 23100, closing: 9860 }, prior: null } })
    return printReceiptsPayments(s, { heading: HEADING, fundName: null, currency: "MYR", from: "2025-01-01", to: "2025-12-31" })
}

const bs = (current: boolean): BSRow[] => current
    ? [
        { section: "fixed_assets", ref_id: "hall", label: "Hall renovation", amount: 21600 },
        { section: "cash", ref_id: "main", label: "Main account", amount: 9360 },
        { section: "cash", ref_id: "box", label: "Cash box", amount: 500 },
        { section: "receivables", ref_id: null, label: "Owed to you", amount: 1200 },
        { section: "other_current_assets", ref_id: "dep", label: "Hall rental deposit", amount: 1500 },
        { section: "payables", ref_id: null, label: "Bills to pay", amount: 850 },
        { section: "funds", ref_id: "gen", label: "General Fund", amount: 18710 },
        { section: "funds", ref_id: "bld", label: "Building Fund", amount: 11600 },
        { section: "funds", ref_id: "edu", label: "Education Fund", amount: 3000 },
    ]
    : [
        { section: "cash", ref_id: "main", label: "Main account", amount: 22700 },
        { section: "cash", ref_id: "box", label: "Cash box", amount: 400 },
        { section: "receivables", ref_id: null, label: "Owed to you", amount: 900 },
        { section: "other_current_assets", ref_id: "dep", label: "Hall rental deposit", amount: 1500 },
        { section: "funds", ref_id: "gen", label: "General Fund", amount: 24000 },
        { section: "funds", ref_id: "edu", label: "Education Fund", amount: 1500 },
    ]

export function sampleFinancialPosition(): StatementPrint {
    const s = buildFinancialPosition({ current: bs(true), prior: bs(false), labels: { current: "31 December 2025", prior: "31 December 2024" }, funds: FUNDS })
    return printFinancialPosition(s, { heading: "As at 31 December 2025", currency: "MYR", asAt: "2025-12-31" })
}

export const SAMPLE_FUND_ROWS: CIFRow[] = [
    { fund_id: "gen", fund_name: "General Fund", fund_type: "unrestricted", is_default: true, archived: false,
        opening: 24000, income: 26300, expense: 29590, transfers_in: 0, transfers_out: 2000, closing: 18710 },
    { fund_id: "bld", fund_name: "Building Fund", fund_type: "restricted", is_default: false, archived: false,
        opening: 0, income: 12000, expense: 2400, transfers_in: 2000, transfers_out: 0, closing: 11600 },
    { fund_id: "edu", fund_name: "Education Fund", fund_type: "restricted", is_default: false, archived: false,
        opening: 1500, income: 8000, expense: 6500, transfers_in: 0, transfers_out: 0, closing: 3000 },
]

export function sampleChangesInFunds(): StatementPrint {
    return printChangesInFunds(buildChangesInFunds(SAMPLE_FUND_ROWS), { heading: HEADING, currency: "MYR", from: "2025-01-01", to: "2025-12-31" })
}

export function sampleSchedules(): StatementPrint {
    return printSchedules({
        fixedAssets: [{ name: "Hall renovation", fund: "Building Fund", cost_open: 0, additions: 24000, disposals_cost: 0, cost_close: 24000,
            dep_open: 0, dep_charge: 2400, dep_disposals: 0, dep_close: 2400, nbv_close: 21600 }],
        ageing: [
            { direction: "receivable", bucket: "current", amount: 700 }, { direction: "receivable", bucket: "1_30", amount: 500 },
            { direction: "payable", bucket: "current", amount: 850 },
        ],
        byFund: [
            { name: "Building Fund", donation: 12000, grant: 0 },
            { name: "Education Fund", donation: 0, grant: 8000 },
            { name: "General Fund", donation: 18500, grant: 0 },
        ],
        donors: null,
    }, { heading: HEADING, currency: "MYR", from: "2025-01-01", to: "2025-12-31" })
}

export function sampleStatement(kind: SampleKind, business: boolean): StatementPrint {
    switch (kind) {
        case "income_expenditure": return sampleIncomeExpenditure(business)
        case "receipts_payments": return sampleReceiptsPayments(business)
        case "financial_position": return sampleFinancialPosition()
        case "changes_in_funds": return sampleChangesInFunds()
        case "schedules": return sampleSchedules()
    }
}
