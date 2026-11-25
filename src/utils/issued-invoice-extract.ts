// Reading an invoice the organisation ISSUED (invoices and AI plan, step 6). The AI returns raw JSON;
// these pure helpers turn it into a draft for the New invoice form: real dates only (never guessed),
// payment terms worked into a due date, the customer (never the issuer), line items that add up to
// the total, and the same objective checks as receipt reading. Nothing here saves anything.
import { assessExtraction, type ExtractionFlag } from "./extraction-checks"

export interface RawIssuedInvoice {
    issuer_name?: string | null
    customer?: { name?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null
    invoice_number?: string | null
    issue_date?: string | null
    due_date?: string | null
    payment_terms?: string | null
    reference?: string | null
    currency?: string | null
    line_items?: { description?: string | null; quantity?: number | string | null; unit_price?: number | string | null; amount?: number | string | null }[] | null
    subtotal?: number | string | null
    tax_amount?: number | string | null
    total_amount?: number | string | null
    deposit_paid?: { amount?: number | string | null; date?: string | null } | null
}

export interface IssuedInvoiceLine { description: string; amount: number }

export interface IssuedInvoiceDraft {
    customer: { name: string | null; email: string | null; phone: string | null; address: string | null }
    // The customer looks like the organisation itself: probably a bill it received, not one it issued
    customerIsOwnOrg: boolean
    invoiceNumber: string | null
    issueDate: string | null
    dueDate: string | null
    // How the due date was found: printed on the document, worked out from the terms, or not at all
    dueDateFrom: "document" | "terms" | null
    paymentTerms: string | null
    reference: string | null
    currency: string
    lines: IssuedInvoiceLine[]
    subtotal: number | null
    tax: number | null
    total: number | null
    deposit: { amount: number; date: string | null } | null
    score: number
    flags: ExtractionFlag[]
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isoDateOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null
    const v = value.trim().slice(0, 10)
    if (!ISO_DATE_RE.test(v)) return null
    const d = new Date(`${v}T00:00:00Z`)
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

function money(v: unknown): number | null {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : NaN
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function clean(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null
    const t = v.replace(/\s+/g, " ").trim()
    return t && t.toLowerCase() !== "null" ? t.slice(0, max) : null
}

function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

// "Net 30", "30 days", "Payment within 14 days", "Due in 7 days" -> 30, 30, 14, 7.
// "Due on receipt", "COD", "Immediate", "Cash" -> 0. Anything else -> null (never guessed).
export function termsToDays(terms: string | null | undefined): number | null {
    if (!terms) return null
    const t = terms.toLowerCase()
    if (/\b(due on receipt|upon receipt|on receipt|immediate(ly)?|c\.?o\.?d\.?|cash on delivery|payable now)\b/.test(t)) return 0
    const m = t.match(/\bnet\s*(\d{1,3})\b/) ?? t.match(/\b(\d{1,3})\s*(?:calendar\s*)?days?\b/)
    if (!m) return null
    const n = Number(m[1])
    return n >= 0 && n <= 365 ? n : null
}

// Company names compared without case, punctuation or the usual company endings
export function normaliseName(name: string | null | undefined): string {
    return (name ?? "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\b(sdn|bhd|berhad|plt|pte|ltd|limited|llp|inc|co|company|the|persatuan|pertubuhan)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
    const x = normaliseName(a), y = normaliseName(b)
    if (!x || !y) return false
    if (x === y) return true
    // "Hangover Club" vs "The Hangover Club Kuala Lumpur": one contains the other, if long enough
    const [short, long] = x.length <= y.length ? [x, y] : [y, x]
    return short.length >= 6 && (` ${long} `).includes(` ${short} `)
}

export function normaliseIssuedInvoice(raw: RawIssuedInvoice, ctx: { orgNames: (string | null | undefined)[]; baseCurrency: string; now?: Date }): IssuedInvoiceDraft {
    const customerName = clean(raw.customer?.name, 255)
    const customerIsOwnOrg = !!customerName && ctx.orgNames.some((n) => sameName(customerName, n))

    const issueDate = isoDateOrNull(raw.issue_date)
    const printedDue = isoDateOrNull(raw.due_date)
    const paymentTerms = clean(raw.payment_terms, 100)
    const termDays = termsToDays(paymentTerms)
    let dueDate: string | null = null
    let dueDateFrom: IssuedInvoiceDraft["dueDateFrom"] = null
    if (printedDue && (!issueDate || printedDue >= issueDate)) { dueDate = printedDue; dueDateFrom = "document" }
    else if (issueDate && termDays !== null) { dueDate = addDays(issueDate, termDays); dueDateFrom = "terms" }

    const rawCurrency = String(raw.currency ?? "").trim().toUpperCase()
    const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : ctx.baseCurrency.toUpperCase()

    const subtotal = money(raw.subtotal)
    const tax = money(raw.tax_amount)
    const total = money(raw.total_amount)
    const lines: IssuedInvoiceLine[] = (raw.line_items ?? [])
        .map((l) => ({ description: clean(l?.description, 300) ?? "", amount: money(l?.amount) ?? 0 }))
        .filter((l) => l.amount > 0)
        .slice(0, 100)

    const depAmount = money(raw.deposit_paid?.amount)
    const deposit = depAmount !== null && depAmount > 0 && (total === null || depAmount <= total)
        ? { amount: depAmount, date: isoDateOrNull(raw.deposit_paid?.date) }
        : null

    const invoiceNumber = clean(raw.invoice_number, 100)?.replace(/^[#:\s]+/, "") || null
    const assessment = assessExtraction({
        vendorName: customerName, total, subtotal, tax, issueDate, documentType: "invoice", invoiceNumber,
        lineItems: lines, currency, baseCurrency: ctx.baseCurrency, now: ctx.now,
    })
    // The shared checks speak of a vendor; on an invoice you issued that is the customer
    const flags = assessment.flags.map((f) => f.code === "VENDOR_MISSING" ? { ...f, message: "No customer name was found. Choose who the invoice is for." } : f)
    if (customerIsOwnOrg) flags.unshift({ code: "CUSTOMER_IS_ORG", message: "This looks like a bill you received. Upload it in the Inbox instead." })

    return {
        customer: {
            name: customerIsOwnOrg ? null : customerName,
            email: clean(raw.customer?.email, 255),
            phone: clean(raw.customer?.phone, 50),
            address: clean(raw.customer?.address, 500),
        },
        customerIsOwnOrg,
        invoiceNumber,
        issueDate,
        dueDate,
        dueDateFrom,
        paymentTerms,
        reference: clean(raw.reference, 100),
        currency,
        lines,
        subtotal,
        tax,
        total,
        deposit,
        score: customerIsOwnOrg ? Math.min(assessment.score, 50) : assessment.score,
        flags,
    }
}

// The lines the form starts with: the printed lines, plus a tax line when the lines add up to the
// subtotal and tax is shown separately, so they add up to the total. A single line for the total when
// none could be read.
export function formLinesFor(d: Pick<IssuedInvoiceDraft, "lines" | "tax" | "total">): IssuedInvoiceLine[] {
    const cents = (n: number) => Math.round(n * 100)
    const lines = d.lines.map((l) => ({ ...l }))
    if (lines.length === 0) return d.total && d.total > 0 ? [{ description: "", amount: d.total }] : []
    const sum = lines.reduce((s, l) => s + cents(l.amount), 0)
    if (d.total !== null && d.tax && d.tax > 0 && sum + cents(d.tax) === cents(d.total)) lines.push({ description: "Tax", amount: d.tax })
    return lines
}

// Before saving an AI-filled invoice: the lines must add up to the total read from the document
export function linesMatchTotal(lineAmounts: number[], total: number | null): boolean {
    if (total === null) return true
    return lineAmounts.reduce((s, a) => s + Math.round(a * 100), 0) === Math.round(total * 100)
}
