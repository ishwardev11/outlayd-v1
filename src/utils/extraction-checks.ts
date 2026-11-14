// Objective checks on what the AI extracted from a document.
//
// This is NOT the AI's own confidence (the model does not report one). The score starts at 100
// and drops for each problem found, so it answers "does this extraction look consistent?".
// Every problem is also returned as a readable flag so a reviewer knows what to look at.

export interface ExtractionFlag {
    code: string
    message: string
}

export interface ExtractionAssessment {
    score: number
    flags: ExtractionFlag[]
}

export interface ExtractionCheckInput {
    vendorName: string | null
    total: number | null
    subtotal?: number | null
    tax?: number | null
    discount?: number | null
    issueDate: string | null
    documentType: "receipt" | "invoice"
    invoiceNumber: string | null
    lineItems: Array<{ amount?: number | null }>
    currency?: string | null
    baseCurrency: string
    now?: Date
}

// 90 or above means no significant problems were found
export const CHECKS_PASS_THRESHOLD = 90

const PENALTY = {
    TOTAL_MISSING: 40,
    VENDOR_MISSING: 20,
    DATE_MISSING: 15,
    DATE_INVALID: 15,
    DATE_FUTURE: 10,
    TOTALS_MISMATCH: 20,
    CURRENCY_DIFFERS: 15,
    LINE_ITEMS_MISMATCH: 10,
    INVOICE_NUMBER_MISSING: 5,
    NO_LINE_ITEMS: 5,
} as const

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)
// Receipts are often rounded to the nearest 5 sen, so allow a few sen or 1% of the total
const tolerance = (total: number, pct: number) => Math.max(0.06, Math.abs(total) * pct)

function validIsoDate(value: string): boolean {
    if (!ISO_DATE_RE.test(value)) return false
    const [y, m, d] = value.split("-").map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function assessExtraction(input: ExtractionCheckInput): ExtractionAssessment {
    const flags: ExtractionFlag[] = []
    let penalty = 0
    const add = (code: keyof typeof PENALTY, message: string) => {
        flags.push({ code, message })
        penalty += PENALTY[code]
    }

    const total = isNum(input.total) ? input.total : null
    const subtotal = isNum(input.subtotal) ? input.subtotal : null
    const tax = isNum(input.tax) ? input.tax : 0
    const discount = isNum(input.discount) ? input.discount : 0

    if (total === null || total <= 0) {
        add("TOTAL_MISSING", "No total amount was found. Enter the total from the document.")
    }

    if (!input.vendorName || !input.vendorName.trim()) {
        add("VENDOR_MISSING", "The vendor name could not be read.")
    }

    if (!input.issueDate) {
        add("DATE_MISSING", "No document date was found. The date decides which reporting period this belongs to.")
    } else if (!validIsoDate(input.issueDate)) {
        add("DATE_INVALID", "The document date could not be understood. Check it against the original.")
    } else {
        const now = input.now ?? new Date()
        const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
        if (input.issueDate > tomorrow.toISOString().slice(0, 10)) {
            add("DATE_FUTURE", "The document date is in the future. Check the day, month and year.")
        }
    }

    if (input.documentType === "invoice" && !(input.invoiceNumber && input.invoiceNumber.trim())) {
        add("INVOICE_NUMBER_MISSING", "No invoice number was found.")
    }

    // Do the subtotal, tax and discount add up to the total? Also accept prices that already include tax.
    if (total !== null && total > 0 && subtotal !== null && subtotal > 0) {
        const tol = tolerance(total, 0.01)
        const withTax = Math.abs(subtotal + tax - discount - total) <= tol
        const taxIncluded = Math.abs(subtotal - discount - total) <= tol
        if (!withTax && !taxIncluded) {
            add("TOTALS_MISMATCH", "The subtotal, tax and total do not add up. Check for a service charge, discount or misread figure.")
        }
    }

    // Do the line items add up to one of the document's own totals?
    const lineAmounts = input.lineItems.map((l) => l.amount).filter(isNum)
    if (lineAmounts.length === 0) {
        add("NO_LINE_ITEMS", "No line items were found.")
    } else if (total !== null && total > 0) {
        const sum = lineAmounts.reduce((a, b) => a + b, 0)
        const tol = tolerance(total, 0.02)
        const candidates = [total, total - tax, subtotal, subtotal !== null ? subtotal + tax : null].filter(isNum)
        if (!candidates.some((c) => Math.abs(sum - c) <= tol)) {
            add("LINE_ITEMS_MISMATCH", "The line items do not add up to the document total. Some lines may be missing or misread.")
        }
    }

    const currency = (input.currency || "").trim().toUpperCase()
    const base = input.baseCurrency.trim().toUpperCase()
    if (currency && /^[A-Z]{3}$/.test(currency) && currency !== base) {
        add("CURRENCY_DIFFERS", `This document is in ${currency} but your base currency is ${base}. The amount is not converted, so check it before approving.`)
    }

    return { score: Math.max(0, Math.min(100, 100 - penalty)), flags }
}
