// Statement of Financial Position (spec 6.2) and Statement of Changes in Funds (6.4): pure layout and
// CSV. The figures come from the database functions balance_sheet and changes_in_funds (migration
// 20261126100000_balance_sheet.sql); nothing here decides what a balance is.
import { CSV_BOM, csvRow, csvText } from "./csv"

export type BSSection =
    | "fixed_assets" | "other_non_current_assets" | "cash" | "receivables" | "other_current_assets"
    | "payables" | "current_liabilities" | "non_current_liabilities" | "funds"

export interface BSRow { section: BSSection; ref_id: string | null; label: string; amount: number }
export interface FundInfo { id: string; name: string; fund_type: string; is_default: boolean }

export interface BSLine { key: string; section: BSSection; refId: string | null; label: string; values: Record<string, number> }
export interface BSGroup { title: string; lines: BSLine[]; total: Record<string, number> }
export interface BSStatement {
    columns: { key: string; label: string }[]
    nonCurrentAssets: BSGroup
    currentAssets: BSGroup
    totalAssets: Record<string, number>
    currentLiabilities: BSGroup
    nonCurrentLiabilities: BSGroup
    totalLiabilities: Record<string, number>
    netAssets: Record<string, number>
    restrictedFunds: BSGroup
    unrestrictedFunds: BSGroup
    totalFunds: Record<string, number>
    // R5: net assets - funds, per column (should always be 0)
    difference: Record<string, number>
    balanced: boolean
}

const c = (n: number) => Math.round(n * 100)

function group(title: string, sections: BSSection[], cols: { key: string; rows: BSRow[] }[], filter?: (r: BSRow) => boolean): BSGroup {
    const map = new Map<string, BSLine>()
    for (const col of cols) {
        for (const r of col.rows) {
            if (!sections.includes(r.section) || (filter && !filter(r))) continue
            const key = `${r.section}:${r.ref_id ?? r.label}`
            if (!map.has(key)) map.set(key, { key, section: r.section, refId: r.ref_id, label: r.label, values: Object.fromEntries(cols.map((x) => [x.key, 0])) })
            map.get(key)!.values[col.key] = (c(map.get(key)!.values[col.key]) + c(r.amount)) / 100
        }
    }
    const order = (l: BSLine) => sections.indexOf(l.section)
    const lines = [...map.values()]
        .filter((l) => Object.values(l.values).some((v) => c(v) !== 0))
        .sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label))
    const total = Object.fromEntries(cols.map((x) => [x.key, lines.reduce((s, l) => s + c(l.values[x.key]), 0) / 100]))
    return { title, lines, total }
}

const add = (keys: string[], ...rs: Record<string, number>[]) =>
    Object.fromEntries(keys.map((k) => [k, rs.reduce((s, r) => s + c(r[k] ?? 0), 0) / 100]))
const sub = (keys: string[], a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(keys.map((k) => [k, (c(a[k] ?? 0) - c(b[k] ?? 0)) / 100]))

export function buildFinancialPosition(input: {
    current: BSRow[]
    prior: BSRow[] | null
    labels: { current: string; prior: string }
    funds: FundInfo[]
}): BSStatement {
    const cols = [{ key: "current", rows: input.current }, ...(input.prior ? [{ key: "prior", rows: input.prior }] : [])]
    const keys = cols.map((x) => x.key)
    const columns = [{ key: "current", label: input.labels.current }, ...(input.prior ? [{ key: "prior", label: input.labels.prior }] : [])]
    const restricted = new Set(input.funds.filter((f) => f.fund_type === "restricted").map((f) => f.id))

    const nonCurrentAssets = group("Non-current assets", ["fixed_assets", "other_non_current_assets"], cols)
    const currentAssets = group("Current assets", ["cash", "receivables", "other_current_assets"], cols)
    const currentLiabilities = group("Current liabilities", ["payables", "current_liabilities"], cols)
    const nonCurrentLiabilities = group("Non-current liabilities", ["non_current_liabilities"], cols)
    const restrictedFunds = group("Restricted funds", ["funds"], cols, (r) => !!r.ref_id && restricted.has(r.ref_id))
    const unrestrictedFunds = group("Unrestricted funds", ["funds"], cols, (r) => !r.ref_id || !restricted.has(r.ref_id))

    const totalAssets = add(keys, nonCurrentAssets.total, currentAssets.total)
    const totalLiabilities = add(keys, currentLiabilities.total, nonCurrentLiabilities.total)
    const netAssets = sub(keys, totalAssets, totalLiabilities)
    const totalFunds = add(keys, restrictedFunds.total, unrestrictedFunds.total)
    const difference = sub(keys, netAssets, totalFunds)
    return {
        columns, nonCurrentAssets, currentAssets, totalAssets, currentLiabilities, nonCurrentLiabilities, totalLiabilities,
        netAssets, restrictedFunds, unrestrictedFunds, totalFunds, difference,
        balanced: keys.every((k) => c(difference[k]) === 0),
    }
}

export function buildFinancialPositionCsv(s: BSStatement, meta: { orgName: string; heading: string; currency: string }): string {
    const num = (n: number | undefined) => (n === undefined ? "" : (Math.abs(n) < 0.005 ? 0 : n).toFixed(2))
    const row = (label: string, values?: Record<string, number>) => csvRow([csvText(label), ...s.columns.map((col) => (values ? num(values[col.key]) : ""))])
    const lines = [
        csvRow([csvText(meta.orgName)]), csvRow([csvText("Statement of Financial Position")]), csvRow([csvText(meta.heading)]),
        csvRow([csvText(`Amounts in ${meta.currency}.`)]), "",
        csvRow([csvText("Line"), ...s.columns.map((col) => csvText(col.label))]),
    ]
    const grp = (g: BSGroup) => {
        lines.push(row(g.title))
        for (const l of g.lines) lines.push(row(`  ${l.label}`, l.values))
        lines.push(row(`Total ${g.title.toLowerCase()}`, g.total))
    }
    grp(s.nonCurrentAssets); grp(s.currentAssets); lines.push(row("Total assets", s.totalAssets))
    grp(s.currentLiabilities); grp(s.nonCurrentLiabilities); lines.push(row("Total liabilities", s.totalLiabilities))
    lines.push(row("Net assets", s.netAssets))
    grp(s.restrictedFunds); grp(s.unrestrictedFunds); lines.push(row("Total funds", s.totalFunds))
    return CSV_BOM + lines.join("\r\n") + "\r\n"
}

// ------------------------------------------------------------------ Statement of Changes in Funds

export interface CIFRow {
    fund_id: string; fund_name: string; fund_type: string; is_default: boolean; archived: boolean
    opening: number; income: number; expense: number; transfers_in: number; transfers_out: number; closing: number
}
export interface CIFGroup { title: string; rows: CIFRow[]; total: Omit<CIFRow, "fund_id" | "fund_name" | "fund_type" | "is_default" | "archived"> }
export interface CIFStatement { groups: CIFGroup[]; total: CIFGroup["total"]; transfersBalance: boolean }

const FIELDS = ["opening", "income", "expense", "transfers_in", "transfers_out", "closing"] as const

function sumRows(rows: CIFRow[]): CIFGroup["total"] {
    return Object.fromEntries(FIELDS.map((f) => [f, rows.reduce((s, r) => s + c(r[f]), 0) / 100])) as CIFGroup["total"]
}

// Restricted funds first, then unrestricted (General Fund first). A fund with nothing in the period
// and no balance is left out. Transfers in must equal transfers out across all funds.
export function buildChangesInFunds(rows: CIFRow[]): CIFStatement {
    const shown = rows.filter((r) => FIELDS.some((f) => c(r[f]) !== 0) || (r.is_default))
    const restricted = shown.filter((r) => r.fund_type === "restricted").sort((a, b) => a.fund_name.localeCompare(b.fund_name))
    const unrestricted = shown.filter((r) => r.fund_type !== "restricted")
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.fund_name.localeCompare(b.fund_name))
    const groups = [
        { title: "Restricted funds", rows: restricted, total: sumRows(restricted) },
        { title: "Unrestricted funds", rows: unrestricted, total: sumRows(unrestricted) },
    ].filter((g) => g.rows.length > 0)
    const total = sumRows(shown)
    return { groups, total, transfersBalance: c(total.transfers_in) === c(total.transfers_out) }
}

export function buildChangesInFundsCsv(s: CIFStatement, meta: { orgName: string; heading: string; currency: string }): string {
    const n = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2)
    const row = (label: string, r: CIFGroup["total"]) => csvRow([csvText(label), ...FIELDS.map((f) => n(r[f]))])
    const lines = [
        csvRow([csvText(meta.orgName)]), csvRow([csvText("Statement of Changes in Funds")]), csvRow([csvText(meta.heading)]),
        csvRow([csvText(`Amounts in ${meta.currency}.`)]), "",
        csvRow(["Fund", "Opening balance", "Income", "Expenditure", "Transfers in", "Transfers out", "Closing balance"].map(csvText)),
    ]
    for (const g of s.groups) {
        lines.push(csvRow([csvText(g.title)]))
        for (const r of g.rows) lines.push(row(`  ${r.fund_name}`, r))
        lines.push(row(`Total ${g.title.toLowerCase()}`, g.total))
    }
    lines.push(row("Total funds", s.total))
    return CSV_BOM + lines.join("\r\n") + "\r\n"
}
