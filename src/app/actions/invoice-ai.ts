"use server"

// Reading an invoice the organisation issued, to fill in the New invoice form (invoices and AI plan,
// step 6). Admins and Editors on a paid plan, within the monthly AI limit (src/lib/ai). Nothing is
// saved here: the person checks the form and presses Save. Only the uploaded file is sent to the AI.
import { SchemaType, type GenerationConfig } from "@google/generative-ai"
import { createClient } from "@/utils/supabase/server"
import { checkWriteAccess, getOrganizationCurrency, getOrganizationId } from "./document-utils"
import { aiConfigured, generateFromDocument } from "@/lib/ai/gemini"
import { AiUserError, runAiAssist } from "@/lib/ai/usage"
import { convertAmount, fetchExchangeRate } from "@/utils/fx"
import { formLinesFor, normaliseIssuedInvoice, sameName, type IssuedInvoiceDraft, type IssuedInvoiceLine, type RawIssuedInvoice } from "@/utils/issued-invoice-extract"

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_FILE_BYTES = 10 * 1024 * 1024

const PROMPT = `You are reading an invoice that the ORGANISATION USING THIS SOFTWARE ISSUED to one of its customers.
The organisation is the issuer (the seller, shown in the letterhead or "From"). Your job is to find the CUSTOMER it billed.

Rules:
- customer: the party under "Bill to", "Billed to", "Customer", "Sold to", "Invoice to" or "Client". NEVER the issuer in the letterhead.
- issuer_name: the name of the business that issued the invoice (letterhead / "From"), only so it can be told apart from the customer.
- invoice_number: the invoice number exactly as printed, without a leading "#" or colon.
- issue_date and due_date as YYYY-MM-DD. If a date is not printed, return null. Never guess a date.
- payment_terms: the terms exactly as printed (for example "Net 30", "Due on receipt"), or null.
- reference: a PO number or customer reference, or null.
- currency: the 3-letter ISO code (for example MYR, USD, SGD). "RM" means MYR.
- line_items: every billed line, with its description and line amount. Amounts are plain numbers (no symbols or thousands separators).
- subtotal, tax_amount (SST, GST, VAT or service tax), total_amount: as printed.
- deposit_paid: only if the invoice states that a deposit or advance has ALREADY been paid, its amount and date; otherwise null.
- If you cannot read a value, return null. Never make one up.`

const schema: GenerationConfig["responseSchema"] = {
    type: SchemaType.OBJECT,
    properties: {
        issuer_name: { type: SchemaType.STRING, nullable: true },
        customer: {
            type: SchemaType.OBJECT,
            nullable: true,
            properties: {
                name: { type: SchemaType.STRING, nullable: true },
                email: { type: SchemaType.STRING, nullable: true },
                phone: { type: SchemaType.STRING, nullable: true },
                address: { type: SchemaType.STRING, nullable: true },
            },
        },
        invoice_number: { type: SchemaType.STRING, nullable: true },
        issue_date: { type: SchemaType.STRING, nullable: true },
        due_date: { type: SchemaType.STRING, nullable: true },
        payment_terms: { type: SchemaType.STRING, nullable: true },
        reference: { type: SchemaType.STRING, nullable: true },
        currency: { type: SchemaType.STRING, nullable: true },
        line_items: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    description: { type: SchemaType.STRING, nullable: true },
                    quantity: { type: SchemaType.NUMBER, nullable: true },
                    unit_price: { type: SchemaType.NUMBER, nullable: true },
                    amount: { type: SchemaType.NUMBER, nullable: true },
                },
            },
        },
        subtotal: { type: SchemaType.NUMBER, nullable: true },
        tax_amount: { type: SchemaType.NUMBER, nullable: true },
        total_amount: { type: SchemaType.NUMBER, nullable: true },
        deposit_paid: {
            type: SchemaType.OBJECT,
            nullable: true,
            properties: { amount: { type: SchemaType.NUMBER, nullable: true }, date: { type: SchemaType.STRING, nullable: true } },
        },
    },
    required: ["customer", "total_amount", "line_items"],
}

export interface IssuedInvoiceFill {
    draft: IssuedInvoiceDraft
    // Lines for the form, in the organisation's base currency, adding up to `total`
    lines: IssuedInvoiceLine[]
    total: number | null
    deposit: { amount: number; date: string | null } | null
    // An existing customer with this name, or the name to create a new one with
    payeeId: string | null
    newPayeeName: string | null
    // From this customer's earlier invoices: the category and fund used most
    suggestedCategoryId: string | null
    suggestedFundId: string | null
    // The printed number is already used by another invoice you issued
    duplicateNumber: boolean
    // Foreign currency: converted at the ECB rate for the invoice date, or no rate was found
    conversion: { from: string; rate: number; rateDate: string } | null
    rateMissing: boolean
    // What the AI read, stored with the invoice for the change history
    extracted: Record<string, unknown>
}

type Result = { success: true; data: IssuedInvoiceFill } | { success: false; error: string }

export async function extractIssuedInvoice(formData: FormData): Promise<Result> {
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can create invoices." }
    }
    const f = formData.get("file")
    const file = f instanceof File && f.size > 0 ? f : null
    if (!file) return { success: false, error: "Choose the invoice to read (an image or a PDF)." }
    if (!ALLOWED_MIMES.includes(file.type)) return { success: false, error: "Upload an image (JPG, PNG, WEBP) or a PDF." }
    if (file.size > MAX_FILE_BYTES) return { success: false, error: "The file is too large. The limit is 10 MB." }
    if (!aiConfigured()) return { success: false, error: "AI reading is not set up yet. Please enter the invoice by hand." }

    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const [{ data: org }, baseCurrency] = await Promise.all([
        supabase.from("organizations").select("name, legal_name").eq("id", organizationId).maybeSingle(),
        getOrganizationCurrency(),
    ])
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64")

    const read = await runAiAssist(organizationId, "issued_invoice", async () => {
        const result = await generateFromDocument({
            prompt: PROMPT,
            file: { data: base64, mimeType: file.type },
            schema,
            temperature: 0.1,
            timeoutMs: 30_000,
            retries: 1,
            retryDelayMs: () => 1000,
        })
        let raw: RawIssuedInvoice
        try {
            raw = JSON.parse(result.response.text()) as RawIssuedInvoice
        } catch {
            throw new AiUserError("The AI could not read this invoice. Try a clearer image or a PDF, or enter it by hand.")
        }
        const draft = normaliseIssuedInvoice(raw, { orgNames: [org?.name as string | null, org?.legal_name as string | null], baseCurrency })
        if (draft.total === null && draft.lines.length === 0 && !draft.customer.name && !draft.customerIsOwnOrg) {
            throw new AiUserError("Nothing could be read from this file. Try a clearer image or a PDF, or enter the invoice by hand.")
        }
        return draft
    })
    if (!read.ok) return { success: false, error: read.error }
    const draft = read.value

    // Foreign currency: the same rule as uploaded receipts (ECB rate for the invoice date). Without a
    // rate the amounts are left for the person to enter in the base currency.
    const isForeign = draft.currency !== baseCurrency.toUpperCase()
    const fx = isForeign ? await fetchExchangeRate(draft.currency, baseCurrency, draft.issueDate) : null
    const rateMissing = isForeign && !fx
    const toBase = (n: number) => (fx ? convertAmount(n, fx.rate) : n)
    let lines = rateMissing ? [] : formLinesFor(draft).map((l) => ({ ...l, amount: toBase(l.amount) }))
    const total = rateMissing || draft.total === null ? null : toBase(draft.total)
    // Converting each line can leave a cent between the lines and the total: put it on the largest line
    if (fx && total !== null && lines.length > 0) {
        const diff = Math.round(total * 100) - lines.reduce((s, l) => s + Math.round(l.amount * 100), 0)
        if (diff !== 0 && Math.abs(diff) <= lines.length) {
            const i = lines.reduce((m, l, k) => (l.amount > lines[m].amount ? k : m), 0)
            lines = lines.map((l, k) => (k === i ? { ...l, amount: Math.round(l.amount * 100 + diff) / 100 } : l))
        }
    }
    if (lines.length === 0 && total !== null) lines = [{ description: "", amount: total }]
    const deposit = draft.deposit && !rateMissing ? { amount: toBase(draft.deposit.amount), date: draft.deposit.date } : null

    // The customer: an existing contact with the same name, or a new one to create
    let payeeId: string | null = null
    let newPayeeName: string | null = null
    if (draft.customer.name) {
        const { data: payees } = await supabase.from("vendors").select("id, name, archived_at, is_system").eq("organization_id", organizationId).limit(5000)
        const rows = ((payees ?? []) as { id: string; name: string; archived_at: string | null; is_system: boolean | null }[]).filter((p) => !p.is_system)
        const exact = rows.find((p) => p.name.trim().toLowerCase() === draft.customer.name!.toLowerCase())
        const close = exact ?? rows.find((p) => !p.archived_at && sameName(p.name, draft.customer.name))
        if (close && !close.archived_at) payeeId = close.id
        else newPayeeName = draft.customer.name
    }

    // Category and fund: what this customer's earlier invoices used most
    let suggestedCategoryId: string | null = null
    let suggestedFundId: string | null = null
    if (payeeId) {
        const { data: past } = await supabase.from("invoice_lines").select("category_id, fund_id, invoices!inner(payee_id, direction, status)")
            .eq("organization_id", organizationId).eq("invoices.payee_id", payeeId).eq("invoices.direction", "receivable").neq("invoices.status", "void").limit(500)
        const count = (key: "category_id" | "fund_id") => {
            const m = new Map<string, number>()
            for (const r of (past ?? []) as { category_id: string; fund_id: string }[]) m.set(r[key], (m.get(r[key]) ?? 0) + 1)
            return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        }
        suggestedCategoryId = count("category_id")
        suggestedFundId = count("fund_id")
    }

    let duplicateNumber = false
    if (draft.invoiceNumber) {
        const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId).eq("direction", "receivable").ilike("invoice_no", draft.invoiceNumber.replace(/[\\%_]/g, (c) => "\\" + c))
        duplicateNumber = (count ?? 0) > 0
    }

    const extracted: Record<string, unknown> = {
        file_name: file.name.slice(0, 200),
        read_at: new Date().toISOString(),
        customer: draft.customer,
        customer_is_org: draft.customerIsOwnOrg,
        invoice_number: draft.invoiceNumber,
        issue_date: draft.issueDate,
        due_date: draft.dueDate,
        due_date_from: draft.dueDateFrom,
        payment_terms: draft.paymentTerms,
        reference: draft.reference,
        currency: draft.currency,
        lines: draft.lines,
        subtotal: draft.subtotal,
        tax: draft.tax,
        total: draft.total,
        deposit: draft.deposit,
        exchange_rate: fx ? { rate: fx.rate, rate_date: fx.rateDate, source: "ecb" } : null,
        score: draft.score,
        flags: draft.flags,
    }

    return {
        success: true,
        data: {
            draft, lines, total, deposit, payeeId, newPayeeName, suggestedCategoryId, suggestedFundId, duplicateNumber,
            conversion: fx ? { from: draft.currency, rate: fx.rate, rateDate: fx.rateDate } : null, rateMissing, extracted,
        },
    }
}
