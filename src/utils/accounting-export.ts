// Turns approved documents into rows an accounting package can import.
// Pure functions only (no database or request code), so they are easy to test.

export type ExportFormat = "generic" | "xero_bills"
export type ExportScope = "paid" | "approved"
export type ExportDateField = "document_date" | "paid_date"

export const EXPORT_FORMATS: ExportFormat[] = ["generic", "xero_bills"]

export interface ExportParams {
    format: ExportFormat
    from: string
    to: string
    scope: ExportScope
    dateField: ExportDateField
}

export interface ExportDocument {
    id: string
    vendor_name: string | null
    amount: number | string | null
    document_date: string | null
    due_date: string | null
    paid_date: string | null
    document_type: string | null
    status: string | null
    fund_id: string | null
    category_id: string | null
    splits: unknown
    invoice_number: string | null
    reference_number: string | null
    original_currency: string | null
    original_amount: number | string | null
    exchange_rate: number | string | null
}

export interface ExportLine {
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
    originalCurrency: string
    originalCents: number | null
    exchangeRate: string
}

export interface ExportLookups {
    funds: Map<string, { name: string }>
    categories: Map<string, { name: string; account_code: string | null }>
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(s: string): boolean {
    if (!ISO_DATE.test(s)) return false
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Reads and checks the query string. Anything unexpected is rejected, never guessed.
export function parseExportParams(q: URLSearchParams): { ok: true; value: ExportParams } | { ok: false; error: string } {
    const format = q.get("format") ?? "generic"
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) return { ok: false, error: "Unknown export format" }

    const from = q.get("from") ?? ""
    const to = q.get("to") ?? ""
    if (!isRealDate(from) || !isRealDate(to)) return { ok: false, error: "Choose a valid start and end date" }
    if (from > to) return { ok: false, error: "The start date must be on or before the end date" }

    const dateFieldRaw = q.get("dateField") ?? "document_date"
    if (dateFieldRaw !== "document_date" && dateFieldRaw !== "paid_date") return { ok: false, error: "Unknown date filter" }

    const scopeRaw = q.get("scope") ?? "paid"
    if (scopeRaw !== "paid" && scopeRaw !== "approved") return { ok: false, error: "Unknown document selection" }
    // A payment date only exists once a document is paid
    const scope: ExportScope = dateFieldRaw === "paid_date" ? "paid" : scopeRaw

    return { ok: true, value: { format: format as ExportFormat, from, to, scope, dateField: dateFieldRaw } }
}

// ------------------------------------------------------------------ CSV helpers

// A cell that starts with = + - @ is run as a formula by Excel and Google Sheets. A vendor name
// printed on a receipt is untrusted text, so such cells get a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/

export function csvText(value: string | null | undefined): string {
    let s = String(value ?? "").replace(/\r\n|\r/g, "\n")
    if (FORMULA_START.test(s)) s = `'${s}`
    return /[",\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s
}

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

function isoToDmy(iso: string): string {
    if (!ISO_DATE.test(iso)) return ""
    const [y, m, d] = iso.split("-")
    return `${d}/${m}/${y}`
}

// ------------------------------------------------------------------ Lines

// One line per fund/category allocation. A document without splits is one line.
export function buildLines(doc: ExportDocument, lookups: ExportLookups): { lines: ExportLine[]; splitsMismatch: boolean } {
    const docCents = toCents(doc.amount)
    const rawSplits = Array.isArray(doc.splits) ? (doc.splits as any[]) : []
    const parts = rawSplits.length > 0
        ? rawSplits.map((s) => ({ fundId: s?.fund_id ?? null, categoryId: s?.category_id ?? null, cents: toCents(s?.amount) }))
        : [{ fundId: doc.fund_id, categoryId: doc.category_id, cents: docCents }]

    const splitTotal = parts.reduce((sum, p) => sum + p.cents, 0)
    const splitsMismatch = rawSplits.length > 0 && Math.abs(splitTotal - docCents) > 1

    const vendor = (doc.vendor_name ?? "").trim() || "Unknown vendor"
    const documentNumber = (doc.invoice_number ?? "").trim()
    const reference = (doc.reference_number ?? "").trim()
    const foreign = !!doc.original_currency && doc.original_amount !== null && doc.original_amount !== undefined
    const originalTotal = foreign ? toCents(doc.original_amount) : null

    let originalUsed = 0
    const lines = parts.map((p, i): ExportLine => {
        const category = p.categoryId ? lookups.categories.get(p.categoryId) : undefined
        const fund = p.fundId ? lookups.funds.get(p.fundId) : undefined

        // Share of the original-currency amount, so the lines add back up to the original total
        let originalCents: number | null = null
        if (originalTotal !== null) {
            const isLast = i === parts.length - 1
            originalCents = isLast
                ? originalTotal - originalUsed
                : splitTotal !== 0 ? Math.round((originalTotal * p.cents) / splitTotal) : 0
            originalUsed += originalCents
        }

        return {
            documentId: doc.id,
            lineNumber: i + 1,
            date: doc.document_date ?? "",
            dueDate: doc.due_date ?? doc.document_date ?? "",
            paidDate: doc.paid_date ?? "",
            type: doc.document_type === "receipt" ? "Receipt" : "Invoice",
            status: doc.status === "paid" ? "Paid" : "Awaiting payment",
            documentNumber,
            reference,
            vendor,
            description: [vendor, documentNumber || reference].filter(Boolean).join(" - "),
            category: category?.name ?? "Uncategorized",
            accountCode: category?.account_code?.trim() ?? "",
            fund: fund?.name ?? "Unassigned",
            cents: p.cents,
            originalCurrency: foreign ? String(doc.original_currency) : "",
            originalCents,
            exchangeRate: foreign && doc.exchange_rate != null ? String(Number(doc.exchange_rate)) : "",
        }
    })
    return { lines, splitsMismatch }
}

export interface ExportSummary {
    documents: number
    lines: number
    totalCents: number
    linesWithoutAccountCode: number
    categoriesWithoutAccountCode: string[]
    splitMismatchDocuments: number
    linesWithoutDate: number
}

export function buildExport(docs: ExportDocument[], lookups: ExportLookups): { lines: ExportLine[]; summary: ExportSummary } {
    const lines: ExportLine[] = []
    let splitMismatchDocuments = 0
    for (const doc of docs) {
        const built = buildLines(doc, lookups)
        if (built.splitsMismatch) splitMismatchDocuments++
        lines.push(...built.lines)
    }
    const missing = new Set<string>()
    for (const l of lines) if (!l.accountCode) missing.add(l.category)
    return {
        lines,
        summary: {
            documents: docs.length,
            lines: lines.length,
            totalCents: lines.reduce((sum, l) => sum + l.cents, 0),
            linesWithoutAccountCode: lines.filter((l) => !l.accountCode).length,
            categoriesWithoutAccountCode: [...missing].sort(),
            splitMismatchDocuments,
            linesWithoutDate: lines.filter((l) => !l.date).length,
        },
    }
}

// ------------------------------------------------------------------ Files

const BOM = "\uFEFF" // lets Excel open the file as UTF-8, so names like "Café" or Malay/Chinese text survive

function row(cells: string[]): string {
    return cells.join(",")
}

export function toGenericCsv(lines: ExportLine[], baseCurrency: string): string {
    const header = [
        "Date", "Due date", "Paid date", "Type", "Status", "Document no.", "Reference", "Vendor", "Description",
        "Category", "Account code", `Fund`, `Amount (${baseCurrency})`, "Original currency", "Original amount",
        "Exchange rate", "Line", "Document ID",
    ]
    const body = lines.map((l) => row([
        l.date, l.dueDate, l.paidDate, l.type, l.status, csvText(l.documentNumber), csvText(l.reference), csvText(l.vendor),
        csvText(l.description), csvText(l.category), csvText(l.accountCode), csvText(l.fund), csvMoney(l.cents),
        l.originalCurrency, csvMoney(l.originalCents), l.exchangeRate, String(l.lineNumber), l.documentId,
    ]))
    return BOM + [row(header), ...body].join("\r\n") + "\r\n"
}

// Xero's bill import: one row per line, rows with the same InvoiceNumber become one bill.
// AccountCode and TaxType are left as the organisation set them (blank if unset); Xero rejects
// codes that are not in its chart of accounts, so nothing is guessed here.
export function toXeroBillsCsv(lines: ExportLine[]): string {
    // Two documents can share a number (different vendors, or a receipt with no number). Xero would
    // merge them into one bill, so every document gets its own number inside the file.
    const numberOf = new Map<string, string>()
    const used = new Set<string>()
    for (const l of lines) {
        if (numberOf.has(l.documentId)) continue
        const base = l.documentNumber || l.reference || `OUT-${l.documentId.slice(0, 8).toUpperCase()}`
        let candidate = base
        for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}`
        used.add(candidate.toLowerCase())
        numberOf.set(l.documentId, candidate)
    }

    const header = ["ContactName", "InvoiceNumber", "InvoiceDate", "DueDate", "Description", "Quantity", "UnitAmount", "AccountCode", "TaxType", "Currency"]
    const body = lines.map((l) => row([
        csvText(l.vendor),
        csvText(numberOf.get(l.documentId) ?? ""),
        isoToDmy(l.date),
        isoToDmy(l.dueDate),
        csvText(l.fund && l.fund !== "Unassigned" ? `${l.description} [${l.fund}]` : l.description),
        "1",
        csvMoney(l.cents),
        csvText(l.accountCode),
        "",
        "",
    ]))
    return BOM + [row(header), ...body].join("\r\n") + "\r\n"
}
