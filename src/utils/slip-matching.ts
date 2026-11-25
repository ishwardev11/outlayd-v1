// Payment slips (invoices and AI plan, step 7): what the AI read from a bank transfer slip, and which
// open invoices it could be paying. Pure, so it is tested. The scoring follows the bank statement
// matcher (src/utils/bank-matching.ts): the same name comparison and reference check, with the
// amount allowed to be a deposit or part-payment as well as the full balance. Nothing is recorded
// here: a person picks the invoice and confirms the payment.
import { mentionsNumber, vendorSimilarity } from "./bank-matching"
import { isoDateOrNull, sameName } from "./issued-invoice-extract"

export interface RawSlip {
    amount?: number | string | null
    currency?: string | null
    date?: string | null
    payer_name?: string | null
    recipient_name?: string | null
    bank_reference?: string | null
    recipient_reference?: string | null
    invoice_number?: string | null
}

export interface PaymentSlip {
    amount: number | null
    currency: string
    date: string | null
    payerName: string | null
    recipientName: string | null
    reference: string | null
    // Free text the payer typed (recipient reference / remarks), where invoice numbers often appear
    note: string | null
    invoiceNumber: string | null
}

function clean(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null
    const t = v.replace(/\s+/g, " ").trim()
    return t && t.toLowerCase() !== "null" ? t.slice(0, max) : null
}

export function normaliseSlip(raw: RawSlip, baseCurrency: string): PaymentSlip {
    const n = typeof raw.amount === "number" ? raw.amount : typeof raw.amount === "string" ? Number(raw.amount.replace(/[^0-9.-]/g, "")) : NaN
    const cur = String(raw.currency ?? "").trim().toUpperCase()
    return {
        amount: Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null,
        currency: /^[A-Z]{3}$/.test(cur) ? cur : baseCurrency.toUpperCase(),
        date: isoDateOrNull(raw.date),
        payerName: clean(raw.payer_name, 255),
        recipientName: clean(raw.recipient_name, 255),
        reference: clean(raw.bank_reference, 100),
        note: clean(raw.recipient_reference, 200),
        invoiceNumber: clean(raw.invoice_number, 100)?.replace(/^[#:\s]+/, "") || null,
    }
}

// Money in (someone paid an invoice you issued) or money out (you paid a bill), from who received it.
// Null when the slip does not say clearly; the caller then uses the tab the person is on.
export function slipDirection(slip: PaymentSlip, orgNames: (string | null | undefined)[]): "receivable" | "payable" | null {
    const toUs = orgNames.some((n) => sameName(slip.recipientName, n))
    const fromUs = orgNames.some((n) => sameName(slip.payerName, n))
    if (toUs && !fromUs) return "receivable"
    if (fromUs && !toUs) return "payable"
    return null
}

export interface OpenInvoice {
    id: string
    invoice_no: string | null
    payee_name: string
    total: number
    paid: number
    balance: number
    issue_date: string
    due_date: string | null
}

export interface SlipMatch {
    invoiceId: string
    score: number
    reasons: string[]
    // The slip pays the whole balance (otherwise a deposit or part-payment)
    full: boolean
}

const cents = (n: number) => Math.round(n * 100)
function day(iso: string | null | undefined): number | null {
    if (!iso) return null
    const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
    return Number.isNaN(t) ? null : Math.round(t / 86_400_000)
}
const sameNumber = (a: string | null, b: string | null) =>
    !!a && !!b && a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "") && a.replace(/[^a-z0-9]/gi, "").length > 0

// Scores one open invoice against the slip. Null when it cannot be this one (more than is owed, or
// nothing at all points to it).
export function scoreSlip(slip: PaymentSlip, inv: OpenInvoice, counterparty: string | null): SlipMatch | null {
    if (inv.balance <= 0) return null
    const reasons: string[] = []
    let score = 0

    const text = [slip.reference, slip.note, slip.invoiceNumber].filter(Boolean).join(" ")
    const numberHit = sameNumber(slip.invoiceNumber, inv.invoice_no) || (!!inv.invoice_no && mentionsNumber(text, inv.invoice_no))
    if (numberHit) { score += 50; reasons.push(`Invoice number ${inv.invoice_no} is on the slip`) }

    let full = false
    if (slip.amount !== null) {
        const a = cents(slip.amount), bal = cents(inv.balance)
        if (a > bal) return null     // more than is owed: a payment can never be recorded for it
        if (a === bal) { score += 30; full = true; reasons.push("Amount equals the balance") }
        else { score += 12; reasons.push(inv.paid > 0 ? "Could be a further part-payment" : "Could be a deposit or part-payment") }
    }

    const sim = vendorSimilarity(inv.payee_name, counterparty ?? "")
    if (sim >= 0.99) { score += 20; reasons.push("Name matches") }
    else if (sim >= 0.5) { score += 10; reasons.push("Name partly matches") }

    const t = day(slip.date), issued = day(inv.issue_date), due = day(inv.due_date) ?? issued
    if (t !== null && issued !== null && due !== null && t >= issued - 3 && t <= due + 60) { score += 5; reasons.push("Date fits the invoice") }

    // Only the amount fitting, with nothing else pointing to this invoice, is not worth suggesting
    if (!numberHit && sim < 0.5 && !full) return null
    return { invoiceId: inv.id, score, reasons, full }
}

// The open invoices this slip could pay, best first (at most `limit`). Two invoices with the same
// amount are both offered, the one whose name and date fit better first.
export function rankSlipMatches(slip: PaymentSlip, invoices: OpenInvoice[], counterparty: string | null, limit = 5): SlipMatch[] {
    const t = day(slip.date)
    const closeness = (inv: OpenInvoice) => {
        const d = day(inv.due_date) ?? day(inv.issue_date)
        return t === null || d === null ? Number.MAX_SAFE_INTEGER : Math.abs(t - d)
    }
    const byId = new Map(invoices.map((i) => [i.id, i]))
    return invoices
        .map((inv) => scoreSlip(slip, inv, counterparty))
        .filter((m): m is SlipMatch => m !== null)
        .sort((a, b) => b.score - a.score || closeness(byId.get(a.invoiceId)!) - closeness(byId.get(b.invoiceId)!) || a.invoiceId.localeCompare(b.invoiceId))
        .slice(0, limit)
}
