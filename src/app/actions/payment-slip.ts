"use server"

// Payment slip -> match to invoice -> record payment (invoices and AI plan, step 7). The AI reads the
// slip; this suggests the open invoices it could be paying. Nothing is recorded here: the person picks
// the invoice and confirms the payment in Record payment, with the slip attached as its receipt.
// Admins and Editors on a paid plan, within the monthly AI limit (src/lib/ai). Only the slip is sent
// to the AI, and it is told not to return account numbers.
import { SchemaType, type GenerationConfig } from "@google/generative-ai"
import { createClient } from "@/utils/supabase/server"
import { checkWriteAccess, getOrganizationCurrency, getOrganizationId } from "./document-utils"
import { aiConfigured, generateFromDocument } from "@/lib/ai/gemini"
import { AiUserError, runAiAssist } from "@/lib/ai/usage"
import { normaliseSlip, rankSlipMatches, slipDirection, type OpenInvoice, type PaymentSlip, type RawSlip, type SlipMatch } from "@/utils/slip-matching"

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_FILE_BYTES = 10 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PROMPT = `You are reading a payment slip: a bank transfer confirmation, DuitNow/IBG/FPX receipt, cheque deposit slip or similar.

Return:
- amount: the amount transferred, as a plain number (no symbols or thousands separators).
- currency: the 3-letter ISO code. "RM" means MYR.
- date: the date of the transfer as YYYY-MM-DD, or null if it is not printed. Never guess.
- payer_name: the name of the person or business the money came FROM.
- recipient_name: the name of the person or business the money went TO (the beneficiary).
- bank_reference: the bank's transaction or reference number.
- recipient_reference: the reference or remarks the payer typed (for example "INV-0042 hall rental").
- invoice_number: an invoice number mentioned anywhere on the slip, exactly as written, or null.

Rules:
- NEVER return bank account numbers or card numbers, in any field.
- If you cannot read a value, return null. Never make one up.`

const schema: GenerationConfig["responseSchema"] = {
    type: SchemaType.OBJECT,
    properties: {
        amount: { type: SchemaType.NUMBER, nullable: true },
        currency: { type: SchemaType.STRING, nullable: true },
        date: { type: SchemaType.STRING, nullable: true },
        payer_name: { type: SchemaType.STRING, nullable: true },
        recipient_name: { type: SchemaType.STRING, nullable: true },
        bank_reference: { type: SchemaType.STRING, nullable: true },
        recipient_reference: { type: SchemaType.STRING, nullable: true },
        invoice_number: { type: SchemaType.STRING, nullable: true },
    },
    required: ["amount"],
}

export interface SlipCandidate {
    id: string
    invoice_no: string | null
    payee_name: string
    balance: number
    issue_date: string
    due_date: string | null
}

export interface SlipReading {
    slip: PaymentSlip
    direction: "receivable" | "payable"
    // The slip is in another currency: its amount is not used and must be entered by hand
    currencyMismatch: boolean
    // Suggested invoices, best first, with why
    matches: (SlipMatch & SlipCandidate)[]
    // Every open invoice on that side, for picking one by hand when no suggestion fits
    open: SlipCandidate[]
}

type Result = { success: true; data: SlipReading } | { success: false; error: string }

// formData: "file" (the slip), optional "invoice_id" (opened from that invoice: no matching), optional
// "tab" ("receivable" or "payable": used when the slip does not say who received the money)
export async function readPaymentSlip(formData: FormData): Promise<Result> {
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can record payments." }
    }
    const f = formData.get("file")
    const file = f instanceof File && f.size > 0 ? f : null
    if (!file) return { success: false, error: "Choose the payment slip (an image or a PDF)." }
    if (!ALLOWED_MIMES.includes(file.type)) return { success: false, error: "Upload an image (JPG, PNG, WEBP) or a PDF." }
    if (file.size > MAX_FILE_BYTES) return { success: false, error: "The file is too large. The limit is 10 MB." }
    if (!aiConfigured()) return { success: false, error: "AI reading is not set up yet. Please record the payment by hand." }
    const invoiceId = String(formData.get("invoice_id") ?? "")
    if (invoiceId && !UUID_RE.test(invoiceId)) return { success: false, error: "That invoice was not found" }
    const tab = formData.get("tab") === "payable" ? "payable" : formData.get("tab") === "receivable" ? "receivable" : null

    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const [{ data: org }, baseCurrency] = await Promise.all([
        supabase.from("organizations").select("name, legal_name").eq("id", organizationId).maybeSingle(),
        getOrganizationCurrency(),
    ])
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64")

    const read = await runAiAssist(organizationId, "payment_slip", async () => {
        const result = await generateFromDocument({
            prompt: PROMPT,
            file: { data: base64, mimeType: file.type },
            schema,
            temperature: 0,
            timeoutMs: 30_000,
            retries: 1,
            retryDelayMs: () => 1000,
        })
        let raw: RawSlip
        try {
            raw = JSON.parse(result.response.text()) as RawSlip
        } catch {
            throw new AiUserError("The AI could not read this slip. Try a clearer image, or record the payment by hand.")
        }
        const slip = normaliseSlip(raw, baseCurrency)
        if (slip.amount === null && !slip.date && !slip.payerName && !slip.recipientName) {
            throw new AiUserError("Nothing could be read from this slip. Try a clearer image, or record the payment by hand.")
        }
        return slip
    })
    if (!read.ok) return { success: false, error: read.error }
    const slip = read.value
    const currencyMismatch = slip.currency !== baseCurrency.toUpperCase()

    const columns = "id, direction, invoice_no, payee_name, total, paid, balance, issue_date, due_date, status"
    // Opened from one invoice: no matching, just its side of the books
    if (invoiceId) {
        const { data: inv } = await supabase.from("invoice_summary").select(columns).eq("id", invoiceId).eq("organization_id", organizationId).maybeSingle()
        if (!inv) return { success: false, error: "That invoice was not found" }
        return { success: true, data: { slip, direction: inv.direction === "payable" ? "payable" : "receivable", currencyMismatch, matches: [], open: [] } }
    }

    const orgNames = [org?.name as string | null, org?.legal_name as string | null]
    const direction = slipDirection(slip, orgNames) ?? tab ?? "receivable"
    const { data: rows, error } = await supabase.from("invoice_summary").select(columns)
        .eq("organization_id", organizationId).eq("direction", direction).eq("status", "open").gt("balance", 0)
        .order("issue_date", { ascending: false }).limit(500)
    if (error) {
        console.error("readPaymentSlip: loading open invoices failed:", error.message)
        return { success: false, error: "The open invoices could not be loaded. Please try again." }
    }
    const open: (OpenInvoice & SlipCandidate)[] = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id), invoice_no: (r.invoice_no as string | null) ?? null, payee_name: String(r.payee_name ?? ""),
        total: Number(r.total), paid: Number(r.paid), balance: Number(r.balance),
        issue_date: String(r.issue_date), due_date: (r.due_date as string | null) ?? null,
    }))
    // Money in: the payer is the customer. Money out: the recipient is the supplier.
    const counterparty = direction === "receivable" ? slip.payerName : slip.recipientName
    const forScoring = currencyMismatch ? { ...slip, amount: null } : slip
    const byId = new Map(open.map((o) => [o.id, o]))
    const matches = rankSlipMatches(forScoring, open, counterparty).map((m) => {
        const o = byId.get(m.invoiceId)!
        return { ...m, id: o.id, invoice_no: o.invoice_no, payee_name: o.payee_name, balance: o.balance, issue_date: o.issue_date, due_date: o.due_date }
    })
    const pick = (o: SlipCandidate): SlipCandidate => ({ id: o.id, invoice_no: o.invoice_no, payee_name: o.payee_name, balance: o.balance, issue_date: o.issue_date, due_date: o.due_date })
    return { success: true, data: { slip, direction, currencyMismatch, matches, open: open.slice(0, 200).map(pick) } }
}
