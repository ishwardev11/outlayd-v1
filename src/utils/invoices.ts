// Invoices (spec 3.8 and 5.4): pure helpers for the Invoices page. The database decides everything
// that matters (balances, statuses, overpayment); these only read filters, check form input before it
// is sent, label statuses, add up the ageing summary and build the CSV.
import { CSV_BOM, csvNumber, csvRow, csvText } from "./csv"
import { parseAmount } from "./transaction-input"

export type InvoiceDirection = "payable" | "receivable"
export type DerivedStatus = "draft" | "open" | "part_paid" | "overdue" | "paid" | "void"
export type AgeingBucket = "current" | "1_30" | "31_60" | "61_plus"

export interface InvoiceRow {
    id: string
    direction: InvoiceDirection
    invoice_no: string | null
    payee_id: string | null
    payee_name: string
    issue_date: string
    due_date: string | null
    reference: string | null
    remarks: string | null
    total: number
    paid: number
    balance: number
    status: "draft" | "open" | "void"
    derived_status: DerivedStatus
    days_overdue: number
    ageing_bucket: AgeingBucket | null
    is_opening_balance: boolean
    source: "manual" | "document"
    document_id: string | null
    has_attachment: boolean
    void_reason: string | null
    // Invoices you issued: payments with no receipt attached (always 0 for bills)
    receipts_missing: number
}

export interface InvoiceFilters {
    tab: InvoiceDirection
    // "unpaid": everything still to pay or collect (open, part-paid or overdue), the old "Awaiting payment"
    // "receipt_missing": invoices you issued with a payment that has no receipt (Receivable tab only)
    status: "all" | "unpaid" | "receipt_missing" | DerivedStatus
    q: string
    page: number
    open: string
    // From a statement line: invoice dates, and invoices with a line in this category / fund
    from: string
    to: string
    category: string
    fund: string
}

export const INVOICE_PAGE_SIZE = 50
export const INVOICE_MAX_LINES = 100

export const STATUS_OPTIONS: { value: InvoiceFilters["status"]; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "unpaid", label: "Still to pay" },
    { value: "draft", label: "Draft" },
    { value: "open", label: "Open" },
    { value: "part_paid", label: "Part-paid" },
    { value: "overdue", label: "Overdue" },
    { value: "paid", label: "Paid" },
    { value: "void", label: "Void" },
    { value: "receipt_missing", label: "Receipt missing" },
]

// The status choices for a tab: "Receipt missing" only applies to invoices you issue
export function statusOptionsFor(tab: InvoiceDirection): typeof STATUS_OPTIONS {
    return tab === "receivable" ? STATUS_OPTIONS : STATUS_OPTIONS.filter((o) => o.value !== "receipt_missing")
}

// Paid in full, but a payment still has no receipt: not closed yet
export function isPaidReceiptMissing(r: Pick<InvoiceRow, "direction" | "derived_status" | "receipts_missing">): boolean {
    return r.direction === "receivable" && r.derived_status === "paid" && r.receipts_missing > 0
}

// The status as shown to people (badge and CSV)
export function displayStatusLabel(r: Pick<InvoiceRow, "direction" | "derived_status" | "receipts_missing">): string {
    return isPaidReceiptMissing(r) ? "Paid · receipt missing" : statusLabel(r.derived_status)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

// Reads the Invoices page filters from the URL. Anything unexpected is dropped, never guessed.
export function parseInvoiceFilters(sp: SearchParams): InvoiceFilters {
    const tab: InvoiceDirection = first(sp.tab) === "receivable" ? "receivable" : "payable"
    const status = first(sp.status)
    const page = Number.parseInt(first(sp.page), 10)
    const id = (v: string) => (UUID_RE.test(v) ? v : "")
    const date = (v: string) => (realDate(v) ?? "")
    return {
        tab,
        status: statusOptionsFor(tab).some((o) => o.value === status) ? (status as InvoiceFilters["status"]) : "all",
        q: first(sp.q).trim().slice(0, 60),
        page: Number.isFinite(page) && page > 0 ? page : 1,
        open: id(first(sp.open)),
        from: date(first(sp.from)),
        to: date(first(sp.to)),
        category: id(first(sp.category)),
        fund: id(first(sp.fund)),
    }
}

export function statusLabel(s: DerivedStatus): string {
    return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
}

export const AGEING_LABELS: Record<AgeingBucket, string> = {
    current: "Not yet due",
    "1_30": "1-30 days overdue",
    "31_60": "31-60 days overdue",
    "61_plus": "61+ days overdue",
}

// Outstanding balances by age, added up in whole cents so the total never drifts
export function ageingSummary(items: { balance: number; ageing_bucket: AgeingBucket | null }[]): Record<AgeingBucket | "total", number> {
    const cents: Record<AgeingBucket | "total", number> = { current: 0, "1_30": 0, "31_60": 0, "61_plus": 0, total: 0 }
    for (const i of items) {
        if (!i.ageing_bucket) continue
        const c = Math.round(Number(i.balance) * 100)
        cents[i.ageing_bucket] += c
        cents.total += c
    }
    return Object.fromEntries(Object.entries(cents).map(([k, v]) => [k, v / 100])) as Record<AgeingBucket | "total", number>
}

// ------------------------------------------------------------------ form input

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface InvoiceLineInput { description: string | null; amount: number; fund_id: string | null; category_id: string }
export interface InvoiceInput {
    id: string | null
    direction: InvoiceDirection
    status: "draft" | "open"
    payee_id: string
    invoice_no: string | null
    issue_date: string
    due_date: string | null
    reference: string | null
    remarks: string | null
    is_opening_balance: boolean
    lines: InvoiceLineInput[]
}
export interface PaymentInput {
    invoice_id: string
    amount: number
    tx_date: string
    account_id: string | null
    reference: string | null
    remarks: string | null
}

function realDate(v: unknown): string | null {
    if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return null
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}
// undefined = present but invalid
function optionalUuid(v: unknown): string | null | undefined {
    if (v === null || v === undefined || v === "") return null
    return typeof v === "string" && UUID_RE.test(v) ? v : undefined
}
function text(v: unknown, max: number): string | null | undefined {
    if (v === null || v === undefined) return null
    if (typeof v !== "string") return undefined
    const t = v.trim()
    if (t.length > max) return undefined
    return t || null
}

export function parseInvoiceInput(raw: unknown): Result<InvoiceInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = optionalUuid(r.id)
    if (id === undefined) return { ok: false, error: "That invoice could not be found" }
    if (r.direction !== "payable" && r.direction !== "receivable") return { ok: false, error: "Choose a bill or an invoice you issue" }
    const status = r.status === "draft" ? "draft" : r.status === undefined || r.status === "open" ? "open" : null
    if (!status) return { ok: false, error: "An invoice is saved as a draft or as open" }
    const payee_id = optionalUuid(r.payee_id)
    if (!payee_id) return { ok: false, error: r.direction === "payable" ? "Choose the supplier" : "Choose who the invoice is for" }
    const invoice_no = text(r.invoice_no, 100)
    if (invoice_no === undefined) return { ok: false, error: "The invoice number can be at most 100 characters" }
    const issue_date = realDate(r.issue_date)
    if (!issue_date) return { ok: false, error: "Enter the invoice date" }
    const due_date = r.due_date ? realDate(r.due_date) : null
    if (r.due_date && !due_date) return { ok: false, error: "Enter a valid due date" }
    if (due_date && due_date < issue_date) return { ok: false, error: "The due date cannot be before the invoice date" }
    const reference = text(r.reference, 100)
    if (reference === undefined) return { ok: false, error: "The reference can be at most 100 characters" }
    const remarks = text(r.remarks, 500)
    if (remarks === undefined) return { ok: false, error: "Remarks can be at most 500 characters" }
    if (!Array.isArray(r.lines) || r.lines.length === 0) return { ok: false, error: "Add at least one line" }
    if (r.lines.length > INVOICE_MAX_LINES) return { ok: false, error: `An invoice can have at most ${INVOICE_MAX_LINES} lines` }
    const lines: InvoiceLineInput[] = []
    for (const raw of r.lines as Record<string, unknown>[]) {
        const amount = parseAmount(raw?.amount)
        if (amount === null) return { ok: false, error: "Each line needs an amount above zero with at most two decimals" }
        const category_id = optionalUuid(raw?.category_id)
        if (!category_id) return { ok: false, error: "Choose a category for every line" }
        const fund_id = optionalUuid(raw?.fund_id)
        if (fund_id === undefined) return { ok: false, error: "Choose a valid fund" }
        const description = text(raw?.description, 300)
        if (description === undefined) return { ok: false, error: "A line description can be at most 300 characters" }
        lines.push({ description, amount, fund_id, category_id })
    }
    return {
        ok: true,
        value: {
            id, direction: r.direction, status, payee_id,
            invoice_no: r.direction === "payable" ? invoice_no : null,
            issue_date, due_date, reference, remarks, is_opening_balance: r.is_opening_balance === true, lines,
        },
    }
}

export function parsePaymentInput(raw: unknown): Result<PaymentInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const invoice_id = optionalUuid(r.invoice_id)
    if (!invoice_id) return { ok: false, error: "That invoice could not be found" }
    const amount = parseAmount(r.amount)
    if (amount === null) return { ok: false, error: "Enter an amount above zero with at most two decimals" }
    const tx_date = realDate(r.tx_date)
    if (!tx_date) return { ok: false, error: "Enter the payment date" }
    const account_id = optionalUuid(r.account_id)
    if (account_id === undefined) return { ok: false, error: "Choose a valid account" }
    const reference = text(r.reference, 100)
    if (reference === undefined) return { ok: false, error: "The reference can be at most 100 characters" }
    const remarks = text(r.remarks, 500)
    if (remarks === undefined) return { ok: false, error: "Remarks can be at most 500 characters" }
    return { ok: true, value: { invoice_id, amount, tx_date, account_id, reference, remarks } }
}

// ------------------------------------------------------------------ CSV

export function buildInvoicesCsv(rows: InvoiceRow[], currency: string): string {
    const header = ["Number", "Type", "Payee", "Invoice date", "Due date", `Total (${currency})`, `Paid (${currency})`,
        `Balance (${currency})`, "Status", "Receipts missing", "Days overdue", "Opening balance", "Source", "Reference", "Remarks"]
    const lines = [csvRow(header.map(csvText))]
    for (const r of rows) {
        lines.push(csvRow([
            csvText(r.invoice_no), csvText(r.direction === "payable" ? "Bill" : "Invoice issued"), csvText(r.payee_name),
            csvText(r.issue_date), csvText(r.due_date), r.total.toFixed(2), r.paid.toFixed(2),
            r.balance.toFixed(2), csvText(displayStatusLabel(r)), csvNumber(r.receipts_missing || ""), csvNumber(r.days_overdue || ""),
            csvText(r.is_opening_balance ? "Yes" : ""), csvText(r.source === "document" ? "Uploaded bill" : "Entered"),
            csvText(r.reference), csvText(r.remarks),
        ]))
    }
    return CSV_BOM + lines.join("\r\n") + "\r\n"
}
