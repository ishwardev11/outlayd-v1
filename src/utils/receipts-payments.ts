// Receipts and Payments (spec 6.3, rule R2): opening cash, money received by category, money paid by
// category, closing cash. Cash only: every figure comes from transactions by payment date (database
// function receipts_payments); a payment of an invoice is shown under the invoice's own categories.
// The grouping is the same as the Income & Expenditure statement's, so the two read alike.
import { CSV_BOM, csvRow, csvText } from "./csv"
import { buildStatement, type IEColumn, type IEGroup, type IERow } from "./income-expenditure"

// kind "item": cash for an asset or liability (a purchase, a loan received, a repayment, sale proceeds).
// For those rows category_id / category_name are the item, and group_name says what the movement was.
export interface RPRow extends Omit<IERow, "kind"> {
    section: "receipts" | "payments"
    kind: IERow["kind"] | "item"
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
    const notItem = (rows: RPRow[]) => rows.filter((r) => r.kind !== "item") as unknown as IERow[]
    const part = (section: RPRow["section"]) => buildStatement({
        orgType: input.orgType,
        current: notItem(input.current.filter((r) => r.section === section)),
        prior: input.prior ? notItem(input.prior.filter((r) => r.section === section)) : null,
        layout: "total",
        labels: input.labels,
    })
    const rec = part("receipts")
    const pay = part("payments")
    const columns = rec.columns
    const keys = columns.map((c) => c.key)

    // Cash for assets and liabilities, one group per kind of movement, one line per item
    const itemGroups = (section: RPRow["section"]): IEGroup[] => {
        const groups = new Map<string, Map<string, { name: string; cents: Record<string, number> }>>()
        const add = (rows: RPRow[] | null, key: string) => {
            for (const r of rows ?? []) {
                if (r.kind !== "item" || r.section !== section || !keys.includes(key)) continue
                const label = r.group_name ?? "Assets and liabilities"
                if (!groups.has(label)) groups.set(label, new Map())
                const lines = groups.get(label)!
                if (!lines.has(r.category_id)) lines.set(r.category_id, { name: r.category_name, cents: Object.fromEntries(keys.map((k) => [k, 0])) })
                lines.get(r.category_id)!.cents[key] += cents(r.amount)
            }
        }
        add(input.current, "current")
        add(input.prior, "prior")
        return [...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([label, lines]) => {
            const list = [...lines].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, l]) => ({
                categoryId: id, name: l.name, values: Object.fromEntries(keys.map((k) => [k, l.cents[k] / 100])),
            }))
            const total = Object.fromEntries(keys.map((k) => [k, list.reduce((s, l) => s + cents(l.values[k]), 0) / 100]))
            return { label, lines: list, total }
        })
    }

    // Receipts: income by type, refunds received (money in against expense categories), then loans and
    // other asset money in. Payments: expenditure by group, income paid back, then purchases and repayments.
    const receipts = [...rec.income, ...mergeGroups("Refunds and recoveries", rec.expense, keys), ...itemGroups("receipts")]
    const payments = [...pay.expense, ...mergeGroups("Income returned", pay.income, keys), ...itemGroups("payments")]
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
