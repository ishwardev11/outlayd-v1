// What a financial statement prints (spec 6.6 / 8): the rows of each statement turned into one shared
// table layout, so every statement PDF looks alike and the layout data can be tested without a PDF
// library. The figures come from the same statement builders the screens use; nothing is worked out
// again here.
import type { IEGroup, IEStatement } from "./income-expenditure"
import type { BSGroup, BSStatement, CIFStatement } from "./financial-position"
import type { RPStatement } from "./receipts-payments"
import { AGEING_LABELS, type AgeingBucket } from "./invoices"

// section: capitals heading; group: a group heading; line: one indented figure line;
// subtotal: "Total ..." of a group; total: a statement total; grand: the bottom line (double rule)
export type PrintRowStyle = "section" | "group" | "line" | "subtotal" | "total" | "grand" | "note"
// A number prints as an amount (negatives in brackets); a string prints as it is; null prints nothing
export type PrintCell = number | string | null
export interface PrintRow { label: string; cells: PrintCell[]; style: PrintRowStyle }
export interface PrintTable { title?: string; columns: string[]; rows: PrintRow[] }

export interface StatementPrint {
    title: string
    heading: string // the period, e.g. "For the year ended 31 December 2026"
    subheading: string | null // e.g. "All funds"
    currency: string
    tables: PrintTable[]
    notes: string[]
    landscape: boolean
    fileName: string
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const cells = (columns: { key: string }[], values: Record<string, number> | null | undefined): PrintCell[] =>
    columns.map((c) => (values ? values[c.key] ?? 0 : null))
const blank = (columns: { key: string }[]): PrintCell[] => columns.map(() => null)

function ieGroups(rows: PrintRow[], columns: { key: string }[], groups: IEGroup[]) {
    for (const g of groups) {
        rows.push({ label: g.label, cells: blank(columns), style: "group" })
        for (const l of g.lines) rows.push({ label: l.name, cells: cells(columns, l.values), style: "line" })
        rows.push({ label: `Total ${g.label.toLowerCase()}`, cells: cells(columns, g.total), style: "subtotal" })
    }
}

// ------------------------------------------------------------------ Income and Expenditure

export function printIncomeExpenditure(s: IEStatement, meta: { heading: string; fundName: string | null; currency: string; from: string; to: string }): StatementPrint {
    const rows: PrintRow[] = []
    rows.push({ label: "Income", cells: blank(s.columns), style: "section" })
    ieGroups(rows, s.columns, s.income)
    rows.push({ label: "Total income", cells: cells(s.columns, s.totalIncome), style: "total" })
    rows.push({ label: "Expenditure", cells: blank(s.columns), style: "section" })
    ieGroups(rows, s.columns, s.expense)
    rows.push({ label: "Total expenditure", cells: cells(s.columns, s.totalExpense), style: "total" })
    rows.push({ label: s.surplusLabel, cells: cells(s.columns, s.surplus), style: "grand" })
    return {
        title: s.title, heading: meta.heading, subheading: meta.fundName ? `Fund: ${meta.fundName}` : "All funds", currency: meta.currency,
        tables: [{ columns: s.columns.map((c) => c.label), rows }],
        notes: ["Bills and invoices count on their invoice date, whether paid yet or not; everything else counts on the date the money moved."],
        landscape: s.columns.length > 4,
        fileName: `${slug(s.title)}-${meta.from}-to-${meta.to}.pdf`,
    }
}

// ------------------------------------------------------------------ Receipts and Payments

export function printReceiptsPayments(s: RPStatement, meta: { heading: string; fundName: string | null; currency: string; from: string; to: string }): StatementPrint {
    const rows: PrintRow[] = []
    if (s.opening) rows.push({ label: "Opening cash and bank", cells: cells(s.columns, s.opening), style: "total" })
    rows.push({ label: "Receipts", cells: blank(s.columns), style: "section" })
    ieGroups(rows, s.columns, s.receipts)
    rows.push({ label: "Total receipts", cells: cells(s.columns, s.totalReceipts), style: "total" })
    rows.push({ label: "Payments", cells: blank(s.columns), style: "section" })
    ieGroups(rows, s.columns, s.payments)
    rows.push({ label: "Total payments", cells: cells(s.columns, s.totalPayments), style: "total" })
    rows.push({ label: "Receipts less payments", cells: cells(s.columns, s.net), style: s.closing ? "total" : "grand" })
    if (s.closing) rows.push({ label: "Closing cash and bank", cells: cells(s.columns, s.closing), style: "grand" })
    return {
        title: s.title, heading: meta.heading, subheading: meta.fundName ? `Fund: ${meta.fundName}` : "All funds", currency: meta.currency,
        tables: [{ columns: s.columns.map((c) => c.label), rows }],
        notes: ["Cash received and paid in the period, by payment date, across all accounts. Unpaid bills and invoices are not included."],
        landscape: false,
        fileName: `receipts-and-payments-${meta.from}-to-${meta.to}.pdf`,
    }
}

// ------------------------------------------------------------------ Financial Position

export function printFinancialPosition(s: BSStatement, meta: { heading: string; currency: string; asAt: string }): StatementPrint {
    const rows: PrintRow[] = []
    const grp = (g: BSGroup) => {
        if (g.lines.length === 0) return
        rows.push({ label: g.title, cells: blank(s.columns), style: "group" })
        for (const l of g.lines) rows.push({ label: l.label, cells: cells(s.columns, l.values), style: "line" })
        rows.push({ label: `Total ${g.title.toLowerCase()}`, cells: cells(s.columns, g.total), style: "subtotal" })
    }
    rows.push({ label: "Assets", cells: blank(s.columns), style: "section" })
    grp(s.nonCurrentAssets); grp(s.currentAssets)
    rows.push({ label: "Total assets", cells: cells(s.columns, s.totalAssets), style: "total" })
    rows.push({ label: "Liabilities", cells: blank(s.columns), style: "section" })
    grp(s.currentLiabilities); grp(s.nonCurrentLiabilities)
    if (s.currentLiabilities.lines.length + s.nonCurrentLiabilities.lines.length === 0) rows.push({ label: "None", cells: blank(s.columns), style: "note" })
    rows.push({ label: "Total liabilities", cells: cells(s.columns, s.totalLiabilities), style: "total" })
    rows.push({ label: "Net assets", cells: cells(s.columns, s.netAssets), style: "grand" })
    rows.push({ label: "Funds", cells: blank(s.columns), style: "section" })
    grp(s.restrictedFunds); grp(s.unrestrictedFunds)
    rows.push({ label: "Total funds", cells: cells(s.columns, s.totalFunds), style: "grand" })
    return {
        title: "Statement of Financial Position", heading: meta.heading, subheading: null, currency: meta.currency,
        tables: [{ columns: s.columns.map((c) => c.label), rows }],
        notes: ["Fixed assets at cost less depreciation. Net assets equal the total of the funds."],
        landscape: false,
        fileName: `statement-of-financial-position-${meta.asAt}.pdf`,
    }
}

// ------------------------------------------------------------------ Changes in Funds

const CIF_FIELDS = ["opening", "income", "expense", "transfers_in", "transfers_out", "closing"] as const

export function printChangesInFunds(s: CIFStatement, meta: { heading: string; currency: string; from: string; to: string }): StatementPrint {
    const rows: PrintRow[] = []
    const row = (label: string, r: Record<(typeof CIF_FIELDS)[number], number>, style: PrintRowStyle): PrintRow =>
        ({ label, cells: CIF_FIELDS.map((f) => r[f]), style })
    for (const g of s.groups) {
        rows.push({ label: g.title, cells: CIF_FIELDS.map(() => null), style: "group" })
        for (const r of g.rows) rows.push(row(r.fund_name, r, "line"))
        rows.push(row(`Total ${g.title.toLowerCase()}`, g.total, "subtotal"))
    }
    rows.push(row("Total funds", s.total, "grand"))
    return {
        title: "Statement of Changes in Funds", heading: meta.heading, subheading: null, currency: meta.currency,
        tables: [{ columns: ["Opening balance", "Income", "Expenditure", "Transfers in", "Transfers out", "Closing balance"], rows }],
        notes: ["Transfers move money between funds without any cash moving. The closing total equals net assets."],
        landscape: true,
        fileName: `statement-of-changes-in-funds-${meta.from}-to-${meta.to}.pdf`,
    }
}

// ------------------------------------------------------------------ Schedules

export interface SchedulesInput {
    fixedAssets: { name: string; fund: string; cost_open: number; additions: number; disposals_cost: number; cost_close: number
        dep_open: number; dep_charge: number; dep_disposals: number; dep_close: number; nbv_close: number }[]
    ageing: { direction: "receivable" | "payable"; bucket: AgeingBucket; amount: number }[]
    byFund: { name: string; donation: number; grant: number }[]
    donors: { name: string; count: number; amount: number }[] | null
}

const AGE_BUCKETS: AgeingBucket[] = ["current", "1_30", "31_60", "61_plus"]
const sumCents = (xs: number[]) => xs.reduce((s, v) => s + Math.round(v * 100), 0) / 100

export function printSchedules(d: SchedulesInput, meta: { heading: string; currency: string; from: string; to: string }): StatementPrint {
    const fa: PrintRow[] = d.fixedAssets.map((r) => ({
        label: `${r.name}${r.fund ? ` (${r.fund})` : ""}`,
        cells: [r.cost_open, r.additions, -r.disposals_cost, r.cost_close, r.dep_open, r.dep_charge, -r.dep_disposals, r.dep_close, r.nbv_close],
        style: "line",
    }))
    if (fa.length === 0) fa.push({ label: "No fixed assets in this period", cells: Array(9).fill(null), style: "note" })
    else {
        const t = (k: keyof SchedulesInput["fixedAssets"][number], sign = 1) => sign * sumCents(d.fixedAssets.map((r) => Number(r[k])))
        fa.push({ label: "Total", cells: [t("cost_open"), t("additions"), t("disposals_cost", -1), t("cost_close"), t("dep_open"), t("dep_charge"), t("dep_disposals", -1), t("dep_close"), t("nbv_close")], style: "grand" })
    }
    const age = (dir: "receivable" | "payable") => AGE_BUCKETS.map((b) => d.ageing.find((a) => a.direction === dir && a.bucket === b)?.amount ?? 0)
    const funds: PrintRow[] = d.byFund.map((r) => ({ label: r.name, cells: [r.donation, r.grant], style: "line" }))
    if (funds.length === 0) funds.push({ label: "None in this period", cells: [null, null], style: "note" })
    else funds.push({ label: "Total", cells: [sumCents(d.byFund.map((r) => r.donation)), sumCents(d.byFund.map((r) => r.grant))], style: "grand" })
    const tables: PrintTable[] = [
        { title: "Fixed assets", columns: ["Cost b/f", "Additions", "Disposals", "Cost c/f", "Depr. b/f", "Charge", "On disposals", "Depr. c/f", "Book value c/f"], rows: fa },
        { title: "Money owed by age (today)", columns: AGE_BUCKETS.map((b) => AGEING_LABELS[b]), rows: [
            { label: "Owed to you", cells: age("receivable"), style: "line" },
            { label: "You owe", cells: age("payable"), style: "line" },
        ] },
        { title: "Donations and grants by fund", columns: ["Donations", "Grants"], rows: funds },
    ]
    if (d.donors) {
        const donors: PrintRow[] = d.donors.map((x) => ({ label: x.name, cells: [String(x.count), x.amount], style: "line" }))
        if (donors.length === 0) donors.push({ label: "No donations in this period", cells: [null, null], style: "note" })
        tables.push({ title: "Donors", columns: ["Donations", "Amount"], rows: donors })
    }
    return {
        title: "Schedules", heading: meta.heading, subheading: null, currency: meta.currency, tables,
        notes: [], landscape: true, fileName: `schedules-${meta.from}-to-${meta.to}.pdf`,
    }
}

// ------------------------------------------------------------------ amounts

// Accounting format: thousands separators, negatives in brackets, zero as a dash
export function printAmount(cell: PrintCell): string {
    if (cell === null) return ""
    if (typeof cell === "string") return cell
    if (Math.abs(cell) < 0.005) return "-"
    const s = Math.abs(cell).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return cell < 0 ? `(${s})` : s
}
