// Receipts and Payments (spec 6.3, rule R2): opening cash, money received by category, money paid by
// category, closing cash. Cash only: every figure comes from transactions by payment date (database
// function receipts_payments); a payment of an invoice is shown under the invoice's own categories.
// The grouping is the same as the Income & Expenditure statement's, so the two read alike.
import { CSV_BOM, csvRow, csvText } from "./csv"
import { buildStatement, type IEColumn, type IEGroup, type IERow } from "./income-expenditure"

export interface RPRow extends IERow {
    section: "receipts" | "payments"
}

export interface CashPosition { opening: number; closing: number }

export interface RPStatement {
    title: string
    columns: IEColumn[]
    receipts: IEGroup[]
    payments: IEGroup[]
    totalReceipts: Record<string, number>
    totalPayments: Record<string, number>
    net: Record<string, number>
    opening: Record<string, number> | null
    closing: Record<string, number> | null
    // opening + receipts - payments = closing, for every column (null when cash is not shown)
    balanced: boolean | null
    empty: boolean
}

const cents = (n: number) => Math.round(n * 100)

// One group made of every line in the given groups (used for refunds received and income returned)
function mergeGroups(label: string, groups: IEGroup[], keys: string[]): IEGroup[] {
    const lines = groups.flatMap((g) => g.lines)
    if (lines.length === 0) return []
    const total = Object.fromEntries(keys.map((k) => [k, lines.reduce((s, l) => s + cents(l.values[k] ?? 0), 0) / 100]))
    return [{ label, lines, total }]
}

export function buildReceiptsPayments(input: {
    orgType: string | null | undefined
    current: RPRow[]
    prior: RPRow[] | null
    labels: { current: string; prior: string }
    cash: { current: CashPosition; prior: CashPosition | null } | null
}): RPStatement {
    const part = (section: RPRow["section"]) => buildStatement({
        orgType: input.orgType,
        current: input.current.filter((r) => r.section === section),
        prior: input.prior ? input.prior.filter((r) => r.section === section) : null,
        layout: "total",
        labels: input.labels,
    })
    const rec = part("receipts")
    const pay = part("payments")
    const columns = rec.columns
    const keys = columns.map((c) => c.key)

    // Receipts: income by type, then refunds received (money in against expense categories).
    // Payments: expenditure by group, then income paid back (money out against income categories).
    const receipts = [...rec.income, ...mergeGroups("Refunds and recoveries", rec.expense, keys)]
    const payments = [...pay.expense, ...mergeGroups("Income returned", pay.income, keys)]
    const sum = (gs: IEGroup[]) => Object.fromEntries(keys.map((k) => [k, gs.reduce((s, g) => s + cents(g.total[k] ?? 0), 0) / 100]))
    const totalReceipts = sum(receipts)
    const totalPayments = sum(payments)
    const net = Object.fromEntries(keys.map((k) => [k, (cents(totalReceipts[k]) - cents(totalPayments[k])) / 100]))

    let opening: Record<string, number> | null = null
    let closing: Record<string, number> | null = null
    let balanced: boolean | null = null
    if (input.cash) {
        opening = { current: input.cash.current.opening }
        closing = { current: input.cash.current.closing }
        if (keys.includes("prior") && input.cash.prior) {
            opening.prior = input.cash.prior.opening
            closing.prior = input.cash.prior.closing
        }
        balanced = keys.every((k) => opening![k] === undefined || cents(opening![k]) + cents(net[k]) === cents(closing![k]))
    }
    return {
        title: "Receipts and Payments",
        columns, receipts, payments, totalReceipts, totalPayments, net, opening, closing, balanced,
        empty: receipts.length === 0 && payments.length === 0,
    }
}

export function buildReceiptsPaymentsCsv(s: RPStatement, meta: { orgName: string; heading: string; fundName: string | null; currency: string }): string {
    const num = (n: number | undefined) => (n === undefined ? "" : Math.abs(n) < 0.005 ? "0.00" : n.toFixed(2))
    const row = (label: string, values?: Record<string, number> | null) =>
        csvRow([csvText(label), ...s.columns.map((c) => (values ? num(values[c.key]) : ""))])
    const lines: string[] = [
        csvRow([csvText(meta.orgName)]),
        csvRow([csvText(s.title)]),
        csvRow([csvText(meta.heading)]),
        csvRow([csvText(meta.fundName ? `Fund: ${meta.fundName}` : "All funds")]),
        csvRow([csvText(`Cash received and paid, by payment date. Amounts in ${meta.currency}.`)]),
        "",
        csvRow([csvText("Line"), ...s.columns.map((c) => csvText(c.label))]),
    ]
    if (s.opening) lines.push(row("Opening cash and bank", s.opening))
    const section = (title: string, gs: IEGroup[], total: Record<string, number>, totalLabel: string) => {
        lines.push(row(title))
        for (const g of gs) {
            lines.push(row(g.label))
            for (const l of g.lines) lines.push(row(`  ${l.name}`, l.values))
            lines.push(row(`Total ${g.label.toLowerCase()}`, g.total))
        }
        lines.push(row(totalLabel, total))
    }
    section("RECEIPTS", s.receipts, s.totalReceipts, "Total receipts")
    section("PAYMENTS", s.payments, s.totalPayments, "Total payments")
    lines.push(row("Receipts less payments", s.net))
    if (s.closing) lines.push(row("Closing cash and bank", s.closing))
    return CSV_BOM + lines.join("\r\n") + "\r\n"
}
