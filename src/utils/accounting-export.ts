import { CSV_BOM, csvRow, csvText } from "@/utils/csv"
import { sourceLabel, typeLabel, type CashBookRow } from "@/utils/cash-book"
// Turns the cash book (money in and money out, read from transactions) into rows an accounting
// package can import: one row per transaction line, dated by the date the money moved.
// Pure functions only (no database or request code), so they are easy to test.
//
// The export covers the same entries as the cash book totals: money in and money out of every kind
// (payments of bills and invoices, refunds, asset and loan cash). Fund transfers and transfers between
// your own accounts move no money in or out, so they are left out, as in the cash book totals.

// Only the generic CSV. A Xero bills layout existed but was removed on purpose (its template has no
// remarks column); it is in the git history (commit e3cb9b8) if it is ever wanted back.
export type ExportFormat = "generic"

export const EXPORT_FORMATS: ExportFormat[] = ["generic"]

export interface ExportParams {
    format: ExportFormat
    from: string
    to: string
}

// One money in or money out entry, with its lines
export interface ExportEntry {
    id: string
    tx_type: "money_in" | "money_out"
    tx_date: string
    payee_name: string | null
    reference: string | null
    // What a person wrote about the entry. Never documents.notes, which holds AI error messages.
    remarks: string | null
    source: CashBookRow["source"]
    document_id: string | null
    is_refund: boolean
    account_id: string
    lines: {
        line_no: number
        amount: number | string
        fund_id: string
        category_id: string | null
        invoice_id: string | null
        item_id: string | null
    }[]
}

export interface ExportLookups {
    funds: Map<string, { name: string }>
    categories: Map<string, { name: string; account_code: string | null }>
    accounts: Map<string, { name: string }>
    invoices: Map<string, { invoice_no: string | null; due_date: string | null; direction: "payable" | "receivable" }>
    items: Map<string, { name: string; kind: "fixed_asset" | "other_asset" | "liability" }>
    // Original-currency details of the upload an entry came from
    documents: Map<string, { original_currency: string | null; original_amount: number | string | null; exchange_rate: number | string | null }>
}

export interface ExportLine {
    transactionId: string
    documentId: string
    lineNumber: number
    date: string
    dueDate: string
    paidDate: string
    type: string
    status: string
    documentNumber: string
    reference: string
    vendor: string
    description: string
    category: string
    accountCode: string
    fund: string
    cents: number
    direction: "in" | "out"
    account: string
    source: string
    originalCurrency: string
    originalCents: number | null
    exchangeRate: string
    remarks: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(s: string): boolean {
    if (!ISO_DATE.test(s)) return false
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Reads and checks the query string. Anything unexpected is rejected, never guessed. The old document
// options (scope, dateField) no longer apply and are ignored, so saved links keep working.
export function parseExportParams(q: URLSearchParams): { ok: true; value: ExportParams } | { ok: false; error: string } {
    const format = q.get("format") ?? "generic"
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) return { ok: false, error: "Unknown export format" }

    const from = q.get("from") ?? ""
    const to = q.get("to") ?? ""
    if (!isRealDate(from) || !isRealDate(to)) return { ok: false, error: "Choose a valid start and end date" }
    if (from > to) return { ok: false, error: "The start date must be on or before the end date" }

    return { ok: true, value: { format: format as ExportFormat, from, to } }
}

// ------------------------------------------------------------------ CSV helpers

// csvText lives in utils/csv so every export shares it; re-exported for existing imports
export { csvText }

export function csvMoney(cents: number | null): string {
    if (cents === null) return ""
    const sign = cents < 0 ? "-" : ""
    const abs = Math.abs(cents)
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

function toCents(value: unknown): number {
    const n = Number(value)
    return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// ------------------------------------------------------------------ Lines

// One line per transaction line (a split entry has one line per fund and category)
export function buildLines(entry: ExportEntry, lookups: ExportLookups): ExportLine[] {
    const lines = [...entry.lines].sort((a, b) => a.line_no - b.line_no)
    const out = entry.tx_type === "money_out"
    const vendor = (entry.payee_name ?? "").trim() || "Unknown payee"
    const reference = (entry.reference ?? "").trim()
    const remarks = (entry.remarks ?? "").trim()

    // The bill or invoice and the asset or liability the entry is for (same labels as the cash book)
    const invoiceId = lines.find((l) => l.invoice_id)?.invoice_id ?? null
    const invoice = invoiceId ? lookups.invoices.get(invoiceId) : undefined
    const itemId = lines.find((l) => l.item_id)?.item_id ?? null
    const item = itemId ? lookups.items.get(itemId) : undefined
    const type = typeLabel({
        type: entry.tx_type,
        isRefund: entry.is_refund,
        source: entry.source,
        invoice: invoiceId ? { id: invoiceId, direction: invoice?.direction ?? (out ? "payable" : "receivable"), label: "" } : null,
        item: item && itemId ? { id: itemId, name: item.name, kind: item.kind } : null,
    })

    // Original currency of the upload, shared across the lines so they add back up to its total
    const doc = entry.document_id ? lookups.documents.get(entry.document_id) : undefined
    const foreign = !!doc?.original_currency && doc.original_amount !== null && doc.original_amount !== undefined
    const originalTotal = foreign ? toCents(doc!.original_amount) : null
    const entryCents = lines.reduce((sum, l) => sum + toCents(l.amount), 0)
    let originalUsed = 0

    return lines.map((l, i): ExportLine => {
        const category = l.category_id ? lookups.categories.get(l.category_id) : undefined
        const lineItem = l.item_id ? lookups.items.get(l.item_id) : undefined
        const lineInvoice = l.invoice_id ? lookups.invoices.get(l.invoice_id) : undefined
        const cents = toCents(l.amount)
        const documentNumber = (lineInvoice?.invoice_no ?? "").trim()

        let originalCents: number | null = null
        if (originalTotal !== null) {
            const isLast = i === lines.length - 1
            originalCents = isLast
                ? originalTotal - originalUsed
                : entryCents !== 0 ? Math.round((originalTotal * cents) / entryCents) : 0
            originalUsed += originalCents
        }

        return {
            transactionId: entry.id,
            documentId: entry.document_id ?? "",
            lineNumber: i + 1,
            date: entry.tx_date,
            dueDate: lineInvoice?.due_date ?? "",
            paidDate: entry.tx_date,
            type,
            status: out ? "Paid" : "Received",
            documentNumber,
            reference,
            vendor,
            description: [vendor, documentNumber || reference].filter(Boolean).join(" - "),
            category: category?.name ?? lineItem?.name ?? "Uncategorised",
            accountCode: category?.account_code?.trim() ?? "",
            fund: lookups.funds.get(l.fund_id)?.name ?? "Unassigned",
            cents,
            direction: out ? "out" : "in",
            account: lookups.accounts.get(entry.account_id)?.name ?? "",
            source: sourceLabel(entry.source),
            originalCurrency: foreign ? String(doc!.original_currency) : "",
            originalCents,
            exchangeRate: foreign && doc!.exchange_rate != null ? String(Number(doc!.exchange_rate)) : "",
            remarks,
        }
    })
}

export interface ExportSummary {
    entries: number
    lines: number
    moneyInCents: number
    moneyOutCents: number
    // Lines with a category but no accounting code (asset and loan lines have no category)
    linesWithoutAccountCode: number
    categoriesWithoutAccountCode: string[]
}

export function buildExport(entries: ExportEntry[], lookups: ExportLookups): { lines: ExportLine[]; summary: ExportSummary } {
    const lines: ExportLine[] = []
    for (const e of entries) lines.push(...buildLines(e, lookups))
    const missing = new Set<string>()
    let linesWithoutAccountCode = 0
    entries.forEach((e) => e.lines.forEach((l) => {
        if (!l.category_id) return
        const c = lookups.categories.get(l.category_id)
        if (!c?.account_code?.trim()) {
            linesWithoutAccountCode++
            missing.add(c?.name ?? "Uncategorised")
        }
    }))
    return {
        lines,
        summary: {
            entries: entries.length,
            lines: lines.length,
            moneyInCents: lines.filter((l) => l.direction === "in").reduce((sum, l) => sum + l.cents, 0),
            moneyOutCents: lines.filter((l) => l.direction === "out").reduce((sum, l) => sum + l.cents, 0),
            linesWithoutAccountCode,
            categoriesWithoutAccountCode: [...missing].sort(),
        },
    }
}

// ------------------------------------------------------------------ Files

export function toGenericCsv(lines: ExportLine[], baseCurrency: string): string {
    const header = [
        "Date", "Due date", "Paid date", "Type", "Status", "Document no.", "Reference", "Vendor", "Description",
        "Category", "Account code", `Fund`, `Amount (${baseCurrency})`, "Original currency", "Original amount",
        "Exchange rate", "Line", "Document ID",
        "Remarks",
        // Added last so existing column positions (and any import mappings built on them) stay the same
        `Money in (${baseCurrency})`, `Money out (${baseCurrency})`, "Account", "Source", "Transaction ID",
    ]
    const body = lines.map((l) => csvRow([
        l.date, l.dueDate, l.paidDate, csvText(l.type), l.status, csvText(l.documentNumber), csvText(l.reference), csvText(l.vendor),
        csvText(l.description), csvText(l.category), csvText(l.accountCode), csvText(l.fund), csvMoney(l.cents),
        l.originalCurrency, csvMoney(l.originalCents), l.exchangeRate, String(l.lineNumber), l.documentId,
        csvText(l.remarks),
        l.direction === "in" ? csvMoney(l.cents) : "", l.direction === "out" ? csvMoney(l.cents) : "",
        csvText(l.account), l.source, l.transactionId,
    ]))
    return CSV_BOM + [csvRow(header), ...body].join("\r\n") + "\r\n"
}
