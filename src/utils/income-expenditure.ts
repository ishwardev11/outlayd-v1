// Statement of Income and Expenditure (Profit and Loss for small businesses), spec 6.1.
// Pure helpers: the period maths, the filters from the URL, the statement layout and the CSV.
// The figures come from the database function income_expenditure (rule R1: invoices by issue date,
// other entries by payment date, payments of invoices not counted twice;
// already signed by the spec's sign rule), so nothing here decides what counts as income or expense.
import { CSV_BOM, csvRow, csvText } from "./csv"
import { EXPENSE_GROUPS_BUSINESS, EXPENSE_GROUPS_NONPROFIT, INCOME_NATURES, natureLabel } from "./category-options"

export interface IERow {
    kind: "income" | "expense"
    nature: string | null
    group_name: string | null
    category_id: string
    category_name: string
    category_sort: number | null
    fund_id: string
    fund_name: string
    amount: number
}

export type IEPeriod = "current" | "previous" | "custom"
export type IELayout = "total" | "by_fund"

export interface IEFilters {
    period: IEPeriod
    from: string
    to: string
    fund: string
    compare: boolean
    layout: IELayout
}

// ------------------------------------------------------------------ dates

const pad = (n: number) => String(n).padStart(2, "0")
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function validDate(s: string): boolean {
    if (!ISO_DATE_RE.test(s)) return false
    const [y, m, d] = s.split("-").map(Number)
    return y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m)
}

// The financial year containing `today` (offset -1 = the one before). startMonth is 1-12.
export function financialYear(startMonth: number, today: string, offset = 0): { from: string; to: string } {
    const sm = Math.min(Math.max(Math.trunc(startMonth) || 1, 1), 12)
    const [y, m] = today.split("-").map(Number)
    const startYear = (m >= sm ? y : y - 1) + offset
    const endMonth = sm === 1 ? 12 : sm - 1
    const endYear = sm === 1 ? startYear : startYear + 1
    return { from: `${startYear}-${pad(sm)}-01`, to: `${endYear}-${pad(endMonth)}-${pad(lastDay(endYear, endMonth))}` }
}

// The same date some years earlier or later. A month-end stays a month-end (29 Feb <-> 28 Feb).
export function shiftYear(date: string, years: number): string {
    const [y, m, d] = date.split("-").map(Number)
    const ny = y + years
    const day = d === lastDay(y, m) ? lastDay(ny, m) : Math.min(d, lastDay(ny, m))
    return `${ny}-${pad(m)}-${pad(day)}`
}

export function longDate(date: string): string {
    const [y, m, d] = date.split("-").map(Number)
    return `${d} ${MONTHS[m - 1]} ${y}`
}

// "For the year ended 31 December 2026" when the dates are exactly one financial year,
// otherwise "For the period 1 March 2026 to 31 August 2026"
export function periodHeading(from: string, to: string, startMonth: number): string {
    const fy = financialYear(startMonth, from)
    return fy.from === from && fy.to === to ? `For the year ended ${longDate(to)}` : `For the period ${longDate(from)} to ${longDate(to)}`
}

// Short column heading: "2026" for a calendar year, "2025/26" for a split financial year, else the dates
export function columnLabel(from: string, to: string, startMonth: number): string {
    const fy = financialYear(startMonth, from)
    if (fy.from === from && fy.to === to) {
        const a = from.slice(0, 4), b = to.slice(0, 4)
        return a === b ? a : `${a}/${b.slice(2)}`
    }
    // e.g. "1 Jan to 22 Nov 2026" for a year to date
    const short = (d: string, withYear: boolean) => {
        const [y, m, day] = d.split("-").map(Number)
        return `${day} ${MONTHS[m - 1].slice(0, 3)}${withYear ? ` ${y}` : ""}`
    }
    return `${short(from, from.slice(0, 4) !== to.slice(0, 4))} to ${short(to, true)}`
}

// A period that runs past today stops at today, so nothing that has not happened yet (such as next
// month's depreciation) is counted. A period wholly in the future is left as it is.
export function clampToToday(from: string, to: string, today: string): string {
    return to > today && from <= today ? today : to
}

// ------------------------------------------------------------------ filters

type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

// Reads the filters from the URL. Anything unexpected falls back to the current financial year.
export function parseIEFilters(sp: SearchParams, startMonth: number, today: string): IEFilters {
    const p = first(sp.period)
    let period: IEPeriod = p === "previous" || p === "custom" ? p : "current"
    let range = financialYear(startMonth, today, period === "previous" ? -1 : 0)
    if (period === "custom") {
        const from = first(sp.from), to = first(sp.to)
        // A custom period must be real dates, in order, and at most five years long
        if (validDate(from) && validDate(to) && from <= to && to <= shiftYear(from, 5)) range = { from, to }
        else period = "current"
    }
    const fund = first(sp.fund)
    return {
        period,
        from: range.from,
        to: range.to,
        fund: UUID_RE.test(fund) ? fund : "",
        compare: first(sp.compare) !== "0",
        layout: first(sp.layout) === "by_fund" ? "by_fund" : "total",
    }
}

// ------------------------------------------------------------------ the statement

export interface IEColumn { key: string; label: string; fundId?: string }
export interface IELine { categoryId: string; name: string; values: Record<string, number> }
export interface IEGroup { label: string; lines: IELine[]; total: Record<string, number> }
export interface IEStatement {
    title: string
    surplusLabel: string
    columns: IEColumn[]
    income: IEGroup[]
    expense: IEGroup[]
    totalIncome: Record<string, number>
    totalExpense: Record<string, number>
    surplus: Record<string, number>
    empty: boolean
}

const OTHER_INCOME = "Other income"
const OTHER_EXPENSES = "Other expenses"
const DEPRECIATION = "Depreciation"

function incomeGroup(r: IERow, business: boolean): string {
    if (business) return r.group_name && r.group_name !== "System" ? r.group_name : OTHER_INCOME
    return r.nature ? natureLabel(r.nature) : OTHER_INCOME
}

function expenseGroup(r: IERow, groups: readonly string[]): string {
    if (r.group_name === "System" && r.category_name === DEPRECIATION) return DEPRECIATION
    return r.group_name && groups.includes(r.group_name) ? r.group_name : OTHER_EXPENSES
}

function groupOrder(kind: "income" | "expense", business: boolean, groups: readonly string[]): string[] {
    if (kind === "expense") return [...groups, DEPRECIATION, OTHER_EXPENSES]
    if (business) return ["Revenue", OTHER_INCOME]
    return [...INCOME_NATURES.map((n) => n.label), OTHER_INCOME].filter((v, i, a) => a.indexOf(v) === i)
}

const toCents = (n: number) => Math.round(Number(n) * 100)
const fromCents = (c: number) => c / 100

// Builds the statement. Amounts are added up in whole cents, so totals never drift.
//   layout "total":   one column for the period, plus last year's when `prior` is given
//   layout "by_fund": one column per fund (with any figures) plus a total
export function buildStatement(input: {
    orgType: string | null | undefined
    current: IERow[]
    prior: IERow[] | null
    layout: IELayout
    labels: { current: string; prior: string }
}): IEStatement {
    const business = input.orgType === "small_business"
    const groups = business ? EXPENSE_GROUPS_BUSINESS : EXPENSE_GROUPS_NONPROFIT

    let columns: IEColumn[]
    const tagged: { row: IERow; keys: string[] }[] = []
    if (input.layout === "by_fund") {
        const funds = new Map<string, string>()
        for (const r of input.current) if (toCents(r.amount) !== 0) funds.set(r.fund_id, r.fund_name)
        columns = [...funds].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ key: `fund:${id}`, label: name, fundId: id }))
        columns.push({ key: "total", label: "Total" })
        for (const r of input.current) tagged.push({ row: r, keys: [`fund:${r.fund_id}`, "total"] })
    } else {
        columns = [{ key: "current", label: input.labels.current }]
        for (const r of input.current) tagged.push({ row: r, keys: ["current"] })
        if (input.prior) {
            columns.push({ key: "prior", label: input.labels.prior })
            for (const r of input.prior) tagged.push({ row: r, keys: ["prior"] })
        }
    }
    const zero = () => Object.fromEntries(columns.map((c) => [c.key, 0])) as Record<string, number>

    const build = (kind: "income" | "expense"): IEGroup[] => {
        const byGroup = new Map<string, Map<string, { name: string; sort: number; cents: Record<string, number> }>>()
        for (const { row, keys } of tagged) {
            if (row.kind !== kind) continue
            const g = kind === "income" ? incomeGroup(row, business) : expenseGroup(row, groups)
            if (!byGroup.has(g)) byGroup.set(g, new Map())
            const lines = byGroup.get(g)!
            if (!lines.has(row.category_id)) lines.set(row.category_id, { name: row.category_name, sort: row.category_sort ?? 0, cents: zero() })
            const line = lines.get(row.category_id)!
            for (const k of keys) line.cents[k] += toCents(row.amount)
        }
        const order = groupOrder(kind, business, groups)
        const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length - 1)
        return [...byGroup]
            .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
            .map(([label, lines]) => {
                const kept = [...lines]
                    .filter(([, l]) => Object.values(l.cents).some((c) => c !== 0))
                    .sort((a, b) => a[1].sort - b[1].sort || a[1].name.localeCompare(b[1].name))
                const total = zero()
                for (const [, l] of kept) for (const k in total) total[k] += l.cents[k]
                return {
                    label,
                    lines: kept.map(([id, l]) => ({ categoryId: id, name: l.name, values: mapValues(l.cents, fromCents) })),
                    total: mapValues(total, fromCents),
                }
            })
            .filter((g) => g.lines.length > 0)
    }

    const income = build("income")
    const expense = build("expense")
    const sum = (gs: IEGroup[]) => {
        const t = zero()
        for (const g of gs) for (const k in t) t[k] += toCents(g.total[k])
        return t
    }
    const ti = sum(income), te = sum(expense)
    const surplus = zero()
    for (const k in surplus) surplus[k] = ti[k] - te[k]

    return {
        title: business ? "Profit and Loss" : "Statement of Income and Expenditure",
        surplusLabel: business ? "Net profit / (loss)" : "Surplus / (deficit)",
        columns,
        income,
        expense,
        totalIncome: mapValues(ti, fromCents),
        totalExpense: mapValues(te, fromCents),
        surplus: mapValues(surplus, fromCents),
        empty: income.length === 0 && expense.length === 0,
    }
}

function mapValues(o: Record<string, number>, f: (n: number) => number): Record<string, number> {
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]))
}

// Accounting format: thousands separators, negatives in brackets, zero as a dash
export function formatAmount(n: number): string {
    if (Math.abs(n) < 0.005) return "-"
    const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? `(${s})` : s
}

// ------------------------------------------------------------------ CSV

export function buildStatementCsv(s: IEStatement, meta: { orgName: string; heading: string; fundName: string | null; currency: string }): string {
    const num = (n: number) => (Math.abs(n) < 0.005 ? "0.00" : n.toFixed(2))
    const row = (label: string, values?: Record<string, number>) =>
        csvRow([csvText(label), ...s.columns.map((c) => (values ? num(values[c.key] ?? 0) : ""))])
    const lines: string[] = [
        csvRow([csvText(meta.orgName)]),
        csvRow([csvText(s.title)]),
        csvRow([csvText(meta.heading)]),
        csvRow([csvText(meta.fundName ? `Fund: ${meta.fundName}` : "All funds")]),
        csvRow([csvText(`Bills and invoices by invoice date; other entries by payment date. Amounts in ${meta.currency}.`)]),
        "",
        csvRow([csvText("Line"), ...s.columns.map((c) => csvText(c.label))]),
    ]
    const section = (title: string, gs: IEGroup[], total: Record<string, number>, totalLabel: string) => {
        lines.push(row(title))
        for (const g of gs) {
            lines.push(row(g.label))
            for (const l of g.lines) lines.push(row(`  ${l.name}`, l.values))
            lines.push(row(`Total ${g.label.toLowerCase()}`, g.total))
        }
        lines.push(row(totalLabel, total))
    }
    section("INCOME", s.income, s.totalIncome, "Total income")
    section("EXPENDITURE", s.expense, s.totalExpense, "Total expenditure")
    lines.push(row(s.surplusLabel, s.surplus))
    return CSV_BOM + lines.join("\r\n") + "\r\n"
}
