import type { SplitRow } from "@/utils/row-types"
// Pure logic for the Donor & Audit Memo. No database or UI code here, so it is easy to test.
//
// Rules (also printed on the memo under "Basis of preparation"):
//  - The memo reads the ledger through the database function fund_memo_lines, which returns the rows
//    behind one fund's column of the Income & Expenditure statement (rule R1): money in and money out
//    with a category, by transaction date; bills and invoices by invoice date, never counted again when
//    paid; depreciation and disposal results of the fund's assets. So the memo's income and expenditure
//    always equal that fund's column of the Income & Expenditure statement for the same period.
//  - A bill is split into paid and unpaid using the payments dated on or before the end of the period.
//  - Fixed assets bought from the fund are listed separately and are not in the totals (rule R6).
//  - Uploads still waiting for review are not in the ledger yet; they are only counted in a note.

export interface MemoFundInput {
    id: string
    name: string
    code?: string | null
    donor_name?: string | null
    grant_reference?: string | null
    purpose?: string | null
    award_amount?: number | string | null
    period_start?: string | null
    period_end?: string | null
}

// One row from the database function fund_memo_lines
export interface MemoLedgerRow {
    row_kind: "transaction" | "invoice" | "depreciation" | "disposal" | "asset_purchase"
    row_id: string
    line_no: number | null
    row_date: string
    kind: "income" | "expense" | null
    category_id: string | null
    category_name: string | null
    description: string | null
    amount: number | string
    payee: string | null
    reference: string | null
    // What a person wrote about the entry. Never documents.notes, which holds AI error messages.
    remarks: string | null
    tx_type: string | null
    is_refund: boolean | null
    document_id: string | null
    attachment_url: string | null
    document_file: string | null
    invoice_total: number | string | null
    invoice_paid: number | string | null
    item_id: string | null
    item_name: string | null
}

// Foreign-currency details of the upload an entry came from, keyed by document id
export interface MemoForeignInput {
    original_currency?: string | null
    original_amount?: number | string | null
    exchange_rate?: number | string | null
    exchange_rate_source?: string | null
}

// Uploads that are not in the ledger yet (still being read, waiting for review, possible duplicates).
// Only counted in a note, never in a figure.
export interface MemoPendingDocInput {
    id: string
    document_date: string | null
    amount: number | string | null
    status: string | null
    splits: unknown
    fund_id: string | null
}

export type MemoAttachment = { kind: "transaction" | "invoice" | "document"; id: string }

export interface MemoTransaction {
    txnNo: string
    rowId: string
    source: "transaction" | "invoice" | "depreciation" | "disposal"
    kind: "income" | "expense"
    date: string
    payee: string
    reference: string
    category: string
    statusLabel: string
    // Signed as in the Income & Expenditure statement: a refund received is a negative expense
    amount: number
    // How much of the amount is paid (or received) and unpaid (or still owed); non-cash rows are neither
    paid: number
    unpaid: number
    nonCash: number
    hasReceipt: boolean
    attachment: MemoAttachment | null
    // Money that moved or was billed, so a receipt and a reference are expected (not depreciation)
    needsEvidence: boolean
    remarks: string // "" when there are none
    // Original currency details, when the entry came from an upload in another currency
    foreign: { currency: string; originalAmount: number; rate: number; source: "ecb" | "manual" | null } | null
}

export interface MemoCategoryRow {
    name: string
    paid: number
    unpaid: number
    nonCash: number
    total: number
    percent: number
}

export interface MemoAssetPurchase {
    date: string
    item: string
    payee: string
    reference: string
    amount: number
    remarks: string
    attachment: MemoAttachment | null
}

export interface MemoException {
    code: string
    message: string
    txnNos: string[]
}

export interface FundMemoData {
    memoRef: string
    generatedAt: string
    generatedBy: string
    organization: { name: string; registrationId: string | null }
    currency: string
    fund: {
        name: string
        code: string | null
        donorName: string | null
        grantReference: string | null
        purpose: string | null
        awardAmount: number | null
        grantStart: string | null
        grantEnd: string | null
    }
    period: { start: string; end: string }
    totals: {
        income: number
        incomeReceived: number
        incomeOwed: number
        expenditure: number
        expenditurePaid: number
        expenditureUnpaid: number
        expenditureNonCash: number
        net: number
        transactionCount: number
        cumulativeExpenditure: number
        remaining: number | null
        percentOfAwardUsed: number | null
        assetsBought: number
    }
    incomeByCategory: MemoCategoryRow[]
    byCategory: MemoCategoryRow[]
    transactions: MemoTransaction[]
    assetsBought: MemoAssetPurchase[]
    exceptions: MemoException[]
    excluded: { pendingReviewCount: number; pendingReviewAmount: number; duplicateCount: number }
}

const toCents = (n: number) => Math.round(n * 100)
const fromCents = (c: number) => c / 100
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/

function normaliseDate(value: string | null | undefined): string | null {
    if (!value || typeof value !== "string") return null
    const head = value.trim().slice(0, 10)
    return ISO_DATE_RE.test(head) ? head : null
}

function toNumber(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : 0
}

const centsOf = (value: unknown) => toCents(toNumber(value))

function foreignDetails(f: MemoForeignInput | undefined): MemoTransaction["foreign"] {
    if (!f) return null
    const currency = typeof f.original_currency === "string" ? f.original_currency.trim().toUpperCase() : ""
    const rate = Number(f.exchange_rate)
    const original = Number(f.original_amount)
    if (!currency || !(rate > 0) || !Number.isFinite(original)) return null
    const source = f.exchange_rate_source === "ecb" || f.exchange_rate_source === "manual" ? f.exchange_rate_source : null
    return { currency, originalAmount: original, rate, source }
}

function listRefs(refs: string[], max = 8): string {
    if (refs.length <= max) return refs.join(", ")
    return `${refs.slice(0, max).join(", ")} and ${refs.length - max} more`
}

// The file to open for a row: its own attachment first, otherwise the upload it came from
function attachmentOf(row: MemoLedgerRow): MemoAttachment | null {
    if (row.attachment_url && (row.row_kind === "transaction" || row.row_kind === "asset_purchase")) return { kind: "transaction", id: row.row_id }
    if (row.attachment_url && row.row_kind === "invoice") return { kind: "invoice", id: row.row_id }
    if (row.document_file && row.document_id) return { kind: "document", id: row.document_id }
    return null
}

const fmt = (cents: number) => fromCents(cents).toFixed(2)

// Paid and unpaid parts of one invoice line, in cents. The invoice's payments are shared across its
// lines in proportion to their amounts (spec R2), so a part-paid bill shows the same share on each line.
function invoiceSplit(row: MemoLedgerRow, amountC: number): { paidC: number; unpaidC: number } {
    const totalC = centsOf(row.invoice_total)
    const invoicePaidC = Math.min(Math.max(centsOf(row.invoice_paid), 0), totalC)
    if (totalC <= 0 || invoicePaidC === 0) return { paidC: 0, unpaidC: amountC }
    if (invoicePaidC >= totalC) return { paidC: amountC, unpaidC: 0 }
    const paidC = Math.round((amountC * invoicePaidC) / totalC)
    return { paidC, unpaidC: amountC - paidC }
}

function statusLabel(row: MemoLedgerRow, paidC: number, unpaidC: number, currency: string): string {
    switch (row.row_kind) {
        case "depreciation":
        case "disposal":
            return "Non-cash"
        case "invoice": {
            const receivable = row.tx_type === "money_in"
            if (unpaidC === 0) return receivable ? "Received" : "Paid"
            if (paidC === 0) return receivable ? "Owed to you" : "Unpaid"
            return `${receivable ? "Part-received" : "Part-paid"} (${currency} ${fmt(centsOf(row.invoice_paid))} ${receivable ? "received" : "paid"})`
        }
        default:
            if (row.tx_type === "money_in") return row.kind === "expense" ? "Refund received" : "Received"
            return row.kind === "income" ? "Refunded" : "Paid"
    }
}

// Which part of a pending upload belongs to this fund? Uses its splits when it has any.
function pendingCentsForFund(doc: MemoPendingDocInput, fundId: string): number | null {
    const splits = Array.isArray(doc.splits) ? (doc.splits as (SplitRow | null)[]) : []
    if (splits.length > 0) {
        const mine = splits.filter((s): s is SplitRow => !!s && s.fund_id === fundId)
        return mine.length ? mine.reduce((sum, s) => sum + centsOf(s.amount), 0) : null
    }
    return doc.fund_id === fundId ? centsOf(doc.amount) : null
}

function categoryRows(rows: MemoTransaction[]): MemoCategoryRow[] {
    const map = new Map<string, { paid: number; unpaid: number; nonCash: number }>()
    let totalC = 0
    for (const r of rows) {
        const c = map.get(r.category) || { paid: 0, unpaid: 0, nonCash: 0 }
        c.paid += toCents(r.paid)
        c.unpaid += toCents(r.unpaid)
        c.nonCash += toCents(r.nonCash)
        map.set(r.category, c)
        totalC += toCents(r.amount)
    }
    return Array.from(map.entries())
        .map(([name, c]) => {
            const t = c.paid + c.unpaid + c.nonCash
            return {
                name,
                paid: fromCents(c.paid),
                unpaid: fromCents(c.unpaid),
                nonCash: fromCents(c.nonCash),
                total: fromCents(t),
                percent: totalC !== 0 ? (t / totalC) * 100 : 0,
            }
        })
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

export function buildFundMemo(input: {
    fund: MemoFundInput
    // fund_memo_lines from the earlier of the grant start and the period start, to the period end
    rows: MemoLedgerRow[]
    foreign?: Record<string, MemoForeignInput>
    pendingDocs?: MemoPendingDocInput[]
    organization: { name: string; registrationId: string | null }
    currency: string
    periodStart: string
    periodEnd: string
    generatedBy: string
    generatedAt?: Date
}): FundMemoData {
    const { fund, rows, organization, currency, periodStart, periodEnd } = input
    const foreign = input.foreign ?? {}
    const generatedAt = input.generatedAt ?? new Date()

    const grantStart = normaliseDate(fund.period_start)
    const grantEnd = normaliseDate(fund.period_end)
    const awardRaw = fund.award_amount === null || fund.award_amount === undefined || fund.award_amount === ""
        ? null
        : toNumber(fund.award_amount)

    let cumulativeExpenseC = 0
    const listed: Array<Omit<MemoTransaction, "txnNo">> = []
    const assets: MemoAssetPurchase[] = []

    for (const row of rows) {
        const date = normaliseDate(row.row_date)
        if (date === null || date > periodEnd) continue
        const inPeriod = date >= periodStart
        const amountC = centsOf(row.amount)

        if (row.row_kind === "asset_purchase") {
            if (inPeriod) {
                assets.push({
                    date, item: row.item_name || "Asset", payee: row.payee || "", reference: (row.reference ?? "").trim(),
                    amount: fromCents(amountC), remarks: (row.remarks ?? "").trim(), attachment: attachmentOf(row),
                })
            }
            continue
        }
        if (row.kind !== "income" && row.kind !== "expense") continue

        if (row.kind === "expense" && (grantStart === null || date >= grantStart)) cumulativeExpenseC += amountC
        if (!inPeriod) continue

        let paidC = 0, unpaidC = 0, nonCashC = 0
        if (row.row_kind === "depreciation" || row.row_kind === "disposal") nonCashC = amountC
        else if (row.row_kind === "invoice") ({ paidC, unpaidC } = invoiceSplit(row, amountC))
        else paidC = amountC

        const attachment = attachmentOf(row)
        const isEntry = row.row_kind === "transaction" || row.row_kind === "invoice"
        const payee = row.row_kind === "depreciation" || row.row_kind === "disposal"
            ? (row.item_name || "Asset")
            : (row.payee || "").trim() || "Unknown payee"
        listed.push({
            rowId: row.row_id,
            source: row.row_kind,
            kind: row.kind,
            date,
            payee,
            reference: (row.reference ?? "").trim(),
            category: row.category_name || "Uncategorised",
            statusLabel: statusLabel(row, paidC, unpaidC, currency),
            amount: fromCents(amountC),
            paid: fromCents(paidC),
            unpaid: fromCents(unpaidC),
            nonCash: fromCents(nonCashC),
            hasReceipt: attachment !== null,
            attachment,
            needsEvidence: isEntry && row.kind === "expense",
            remarks: (row.remarks ?? "").trim(),
            foreign: row.document_id ? foreignDetails(foreign[row.document_id]) : null,
        })
    }

    // Depreciation arrives one row per month: show one row per asset for the period
    const merged: Array<Omit<MemoTransaction, "txnNo">> = []
    const depByItem = new Map<string, Omit<MemoTransaction, "txnNo">>()
    for (const r of listed) {
        if (r.source !== "depreciation") { merged.push(r); continue }
        const existing = depByItem.get(r.rowId)
        if (!existing) {
            const copy = { ...r }
            depByItem.set(r.rowId, copy)
            merged.push(copy)
        } else {
            existing.amount = fromCents(toCents(existing.amount) + toCents(r.amount))
            existing.nonCash = fromCents(toCents(existing.nonCash) + toCents(r.nonCash))
            if (r.date < existing.date) existing.date = r.date
        }
    }
    // Income first, then spending; by date within each
    merged.sort((a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "income" ? -1 : 1)
        || a.date.localeCompare(b.date)
        || a.payee.localeCompare(b.payee))
    const transactions: MemoTransaction[] = merged.map((t, i) => ({ txnNo: `T${String(i + 1).padStart(3, "0")}`, ...t }))
    assets.sort((a, b) => a.date.localeCompare(b.date) || a.item.localeCompare(b.item))

    const incomeRows = transactions.filter((t) => t.kind === "income")
    const expenseRows = transactions.filter((t) => t.kind === "expense")
    const sumC = (list: MemoTransaction[], f: (t: MemoTransaction) => number) => list.reduce((s, t) => s + toCents(f(t)), 0)
    const incomeC = sumC(incomeRows, (t) => t.amount)
    const expenseC = sumC(expenseRows, (t) => t.amount)

    // Exceptions (automated checks for the reviewer to look at before sending). Receipts and references
    // are expected for spending only; donations without a file are normal, depreciation has none.
    const exceptions: MemoException[] = []
    const evidence = transactions.filter((t) => t.needsEvidence)
    const noReceipt = evidence.filter((t) => !t.hasReceipt).map((t) => t.txnNo)
    if (noReceipt.length) {
        exceptions.push({ code: "NO_RECEIPT", message: `${noReceipt.length} spending entr${noReceipt.length === 1 ? "y has" : "ies have"} no receipt or invoice file attached: ${listRefs(noReceipt)}.`, txnNos: noReceipt })
    }
    const noRef = evidence.filter((t) => !t.reference).map((t) => t.txnNo)
    if (noRef.length) {
        exceptions.push({ code: "NO_REFERENCE", message: `${noRef.length} spending entr${noRef.length === 1 ? "y has" : "ies have"} no invoice or reference number: ${listRefs(noRef)}.`, txnNos: noRef })
    }
    if (grantStart || grantEnd) {
        const outside = transactions
            .filter((t) => t.source === "transaction" || t.source === "invoice")
            .filter((t) => (grantStart && t.date < grantStart) || (grantEnd && t.date > grantEnd))
            .map((t) => t.txnNo)
        if (outside.length) {
            exceptions.push({ code: "OUTSIDE_GRANT_PERIOD", message: `${outside.length} entr${outside.length === 1 ? "y is" : "ies are"} dated outside the grant period (${grantStart ?? "open"} to ${grantEnd ?? "open"}): ${listRefs(outside)}.`, txnNos: outside })
        }
    }
    if (awardRaw !== null && fromCents(cumulativeExpenseC) > awardRaw + 0.005) {
        exceptions.push({ code: "OVER_AWARD", message: `Expenditure to the end of this period (${currency} ${fmt(cumulativeExpenseC)}) exceeds the award (${currency} ${awardRaw.toFixed(2)}).`, txnNos: [] })
    }

    // Uploads not in the ledger yet
    let pendingReviewCount = 0, pendingReviewC = 0, duplicateCount = 0
    for (const doc of input.pendingDocs ?? []) {
        const cents = pendingCentsForFund(doc, fund.id)
        if (cents === null) continue
        const date = normaliseDate(doc.document_date)
        const inPeriod = date === null || (date >= periodStart && date <= periodEnd)
        if (!inPeriod) continue
        const status = doc.status ?? ""
        if (status === "DUPLICATE_WARNING") duplicateCount += 1
        else if (status !== "paid" && status !== "awaiting_payment" && status !== "rejected" && status !== "error") {
            pendingReviewCount += 1
            pendingReviewC += cents
        }
    }

    const codeOrSlug = (fund.code || fund.name).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "FUND"
    const memoRef = `FM-${codeOrSlug}-${periodEnd.replace(/-/g, "")}`

    return {
        memoRef,
        generatedAt: generatedAt.toISOString(),
        generatedBy: input.generatedBy,
        organization,
        currency,
        fund: {
            name: fund.name,
            code: fund.code ?? null,
            donorName: fund.donor_name ?? null,
            grantReference: fund.grant_reference ?? null,
            purpose: fund.purpose ?? null,
            awardAmount: awardRaw,
            grantStart,
            grantEnd,
        },
        period: { start: periodStart, end: periodEnd },
        totals: {
            income: fromCents(incomeC),
            incomeReceived: fromCents(sumC(incomeRows, (t) => t.paid)),
            incomeOwed: fromCents(sumC(incomeRows, (t) => t.unpaid)),
            expenditure: fromCents(expenseC),
            expenditurePaid: fromCents(sumC(expenseRows, (t) => t.paid)),
            expenditureUnpaid: fromCents(sumC(expenseRows, (t) => t.unpaid)),
            expenditureNonCash: fromCents(sumC(expenseRows, (t) => t.nonCash)),
            net: fromCents(incomeC - expenseC),
            transactionCount: transactions.length,
            cumulativeExpenditure: fromCents(cumulativeExpenseC),
            remaining: awardRaw === null ? null : fromCents(toCents(awardRaw) - cumulativeExpenseC),
            percentOfAwardUsed: awardRaw && awardRaw > 0 ? (fromCents(cumulativeExpenseC) / awardRaw) * 100 : null,
            assetsBought: fromCents(assets.reduce((s, a) => s + toCents(a.amount), 0)),
        },
        incomeByCategory: categoryRows(incomeRows),
        byCategory: categoryRows(expenseRows),
        transactions,
        assetsBought: assets,
        exceptions,
        excluded: {
            pendingReviewCount,
            pendingReviewAmount: fromCents(pendingReviewC),
            duplicateCount,
        },
    }
}
