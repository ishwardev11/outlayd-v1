"use server"

// Invoices (Phase 3, stage 4b). Everything is written through the database functions from migration
// 20261125100000_invoices.sql (save_invoice, record_invoice_payment, void_invoice, delete_invoice,
// delete_invoice_payment), which check the role, the organisation and the plan themselves. Reading is
// open to everyone in the organisation (row-level security), including free and downgraded plans.
// Each action returns { success, error } instead of throwing, so the person sees the real reason.
import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { checkWriteAccess, getOrganizationCurrency, getOrganizationId } from "./document-utils"
import { errorMessage } from "@/utils/row-types"
import { loadLetterhead } from "@/utils/letterhead-server"
import type { InvoicePrintOrg, InvoicePrintRecord } from "@/utils/invoice-document"
import {
    INVOICE_PAGE_SIZE, ageingSummary, buildInvoicesCsv, parseInvoiceInput, parsePaymentInput,
    type AgeingBucket, type InvoiceFilters, type InvoiceRow,
} from "@/utils/invoices"

type Supabase = Awaited<ReturnType<typeof createClient>>
type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

const BUCKET = "receipts"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_FILE_BYTES = 10 * 1024 * 1024
const EXPORT_MAX_ROWS = 10000
// "Still to pay" (the old Ledger's "Awaiting payment"): open, part-paid or overdue
const UNPAID_STATUSES = ["open", "part_paid", "overdue"]
const SUMMARY_COLUMNS = "id, direction, invoice_no, payee_id, payee_name, issue_date, due_date, reference, remarks, total, paid, balance, status, derived_status, days_overdue, ageing_bucket, is_opening_balance, source, document_id, attachment_url, void_reason"

// The database raises readable messages ("This payment is more than the balance..."); show those
function dbMessage(error: { message?: string } | null | undefined, fallback: string): string {
    const m = (error?.message ?? "").trim()
    if (!m || /row-level security|permission denied|violates|syntax|duplicate key|function .* does not exist/i.test(m)) return fallback
    return m
}

function revalidateInvoices() {
    revalidatePath("/invoices")
    revalidatePath("/inbox")
    revalidatePath("/transactions")
    revalidatePath("/dashboard")
    revalidatePath("/reports")
}

function toRow(r: Record<string, unknown>): InvoiceRow {
    return {
        id: String(r.id),
        direction: r.direction === "receivable" ? "receivable" : "payable",
        invoice_no: (r.invoice_no as string | null) ?? null,
        payee_id: (r.payee_id as string | null) ?? null,
        payee_name: String(r.payee_name ?? ""),
        issue_date: String(r.issue_date),
        due_date: (r.due_date as string | null) ?? null,
        reference: (r.reference as string | null) ?? null,
        remarks: (r.remarks as string | null) ?? null,
        total: Number(r.total),
        paid: Number(r.paid),
        balance: Number(r.balance),
        status: r.status as InvoiceRow["status"],
        derived_status: r.derived_status as InvoiceRow["derived_status"],
        days_overdue: Number(r.days_overdue ?? 0),
        ageing_bucket: (r.ageing_bucket as AgeingBucket | null) ?? null,
        is_opening_balance: r.is_opening_balance === true,
        source: r.source === "document" ? "document" : "manual",
        document_id: (r.document_id as string | null) ?? null,
        has_attachment: !!r.attachment_url,
        void_reason: (r.void_reason as string | null) ?? null,
    }
}

// Invoices with at least one line in the category / fund (from a statement line), or null for no line filter
async function invoicesWithLines(supabase: Supabase, organizationId: string, f: InvoiceFilters): Promise<string[] | null> {
    if (!f.category && !f.fund) return null
    let q = supabase.from("invoice_lines").select("invoice_id").eq("organization_id", organizationId)
    if (f.category) q = q.eq("category_id", f.category)
    if (f.fund) q = q.eq("fund_id", f.fund)
    const { data, error } = await q.limit(EXPORT_MAX_ROWS)
    if (error) throw error
    return [...new Set(((data ?? []) as { invoice_id: string }[]).map((l) => l.invoice_id))]
}

function listQuery(supabase: Supabase, organizationId: string, f: InvoiceFilters, onlyIds: string[] | null) {
    let q = supabase.from("invoice_summary").select(SUMMARY_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId).eq("direction", f.tab)
    if (onlyIds) q = q.in("id", onlyIds.length ? onlyIds : ["00000000-0000-0000-0000-000000000000"])
    if (f.from) q = q.gte("issue_date", f.from)
    if (f.to) q = q.lte("issue_date", f.to)
    if (f.status === "unpaid") q = q.in("derived_status", UNPAID_STATUSES)
    else if (f.status !== "all") q = q.eq("derived_status", f.status)
    if (f.q) {
        const like = `%${f.q.replace(/[\\%_,()]/g, (c) => "\\" + c)}%`
        q = q.or(`payee_name.ilike.${like},invoice_no.ilike.${like},reference.ilike.${like}`)
    }
    return q.order("issue_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
}

export interface InvoicesPage {
    rows: InvoiceRow[]
    total: number
    page: number
    pageSize: number
    ageing: Record<AgeingBucket | "total", number>
}

export async function getInvoicesPage(f: InvoiceFilters): Promise<InvoicesPage> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    const empty: InvoicesPage = { rows: [], total: 0, page: 1, pageSize: INVOICE_PAGE_SIZE, ageing: ageingSummary([]) }
    if (!organizationId) return empty

    const onlyIds = await invoicesWithLines(supabase, organizationId, f)
    let page = Math.max(1, f.page)
    let res = await listQuery(supabase, organizationId, f, onlyIds).range((page - 1) * INVOICE_PAGE_SIZE, page * INVOICE_PAGE_SIZE - 1)
    if (res.error?.code === "PGRST103" && page > 1) {
        page = 1
        res = await listQuery(supabase, organizationId, f, onlyIds).range(0, INVOICE_PAGE_SIZE - 1)
    }
    if (res.error) {
        console.error("getInvoicesPage failed:", res.error)
        throw new Error("Failed to load invoices")
    }
    // Ageing covers everything still owed on this tab, whatever the other filters are
    const { data: owed, error: ageError } = await supabase.from("invoice_summary").select("balance, ageing_bucket")
        .eq("organization_id", organizationId).eq("direction", f.tab).not("ageing_bucket", "is", null).limit(EXPORT_MAX_ROWS)
    if (ageError) console.error("Ageing summary failed:", ageError)
    return {
        rows: ((res.data ?? []) as Record<string, unknown>[]).map(toRow),
        total: res.count ?? 0,
        page,
        pageSize: INVOICE_PAGE_SIZE,
        ageing: ageingSummary(((owed ?? []) as { balance: number; ageing_bucket: AgeingBucket | null }[]).map((o) => ({ balance: Number(o.balance), ageing_bucket: o.ageing_bucket }))),
    }
}

export interface InvoiceDetail {
    invoice: InvoiceRow
    lines: { description: string | null; amount: number; fund_id: string; fund_name: string; category_id: string; category_name: string }[]
    payments: { transaction_id: string; date: string; amount: number; reference: string | null; remarks: string | null; from_bill: boolean }[]
    document: { id: string; status: string; vendor_name: string } | null
}

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
    if (!UUID_RE.test(id ?? "")) return null
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const { data: inv } = await supabase.from("invoice_summary").select(SUMMARY_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle()
    if (!inv) return null
    const invoice = toRow(inv as Record<string, unknown>)
    const [lines, pays, doc] = await Promise.all([
        supabase.from("invoice_lines").select("line_no, description, amount, fund_id, category_id, funds(name), categories(name)").eq("invoice_id", id).order("line_no"),
        supabase.from("transaction_lines").select("amount, transaction_id, transactions(tx_date, reference, remarks, document_id)").eq("invoice_id", id),
        invoice.document_id
            ? supabase.from("documents").select("id, status, vendor_name").eq("id", invoice.document_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ])
    type LineRow = { description: string | null; amount: number | string; fund_id: string; category_id: string; funds: { name: string } | null; categories: { name: string } | null }
    type PayRow = { amount: number | string; transaction_id: string; transactions: { tx_date: string; reference: string | null; remarks: string | null; document_id: string | null } | null }
    // One payment can cover several lines of the invoice: show it once, with its total
    const byTx = new Map<string, InvoiceDetail["payments"][number]>()
    for (const p of (pays.data ?? []) as unknown as PayRow[]) {
        const cur = byTx.get(p.transaction_id)
        if (cur) { cur.amount = Math.round((cur.amount + Number(p.amount)) * 100) / 100; continue }
        byTx.set(p.transaction_id, {
            transaction_id: p.transaction_id, date: p.transactions?.tx_date ?? "", amount: Number(p.amount),
            reference: p.transactions?.reference ?? null, remarks: p.transactions?.remarks ?? null, from_bill: !!p.transactions?.document_id,
        })
    }
    return {
        invoice,
        lines: ((lines.data ?? []) as unknown as LineRow[]).map((l) => ({
            description: l.description, amount: Number(l.amount), fund_id: l.fund_id, fund_name: l.funds?.name ?? "",
            category_id: l.category_id, category_name: l.categories?.name ?? "",
        })),
        payments: [...byTx.values()].sort((a, b) => a.date.localeCompare(b.date)),
        document: (doc.data as InvoiceDetail["document"]) ?? null,
    }
}

// Everything the invoice PDF needs (invoices you issued only): the invoice as it stands, who it is
// for, and the organisation's letterhead and payment details. Built into a PDF in the browser.
export async function getInvoiceForPdf(id: string): Promise<ActionResult<{ invoice: InvoicePrintRecord; org: InvoicePrintOrg }>> {
    const detail = await getInvoiceDetail(id)
    if (!detail) return { success: false, error: "That invoice was not found" }
    const inv = detail.invoice
    if (inv.direction !== "receivable") return { success: false, error: "Only invoices you issue can be downloaded as a PDF" }
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const [{ data: o }, { data: payee }, currency] = await Promise.all([
        supabase.from("organizations").select("name, legal_name, address, registration_id, signatories, letterhead_path, payment_details").eq("id", organizationId).maybeSingle(),
        inv.payee_id ? supabase.from("vendors").select("address, email").eq("id", inv.payee_id).maybeSingle() : Promise.resolve({ data: null }),
        getOrganizationCurrency(),
    ])
    if (!o) return { success: false, error: "No active organization" }
    return {
        success: true,
        data: {
            invoice: {
                invoice_no: inv.invoice_no, status: inv.status, derived_status: inv.derived_status, issue_date: inv.issue_date,
                due_date: inv.due_date, reference: inv.reference, remarks: inv.remarks, total: inv.total, paid: inv.paid,
                balance: inv.balance, void_reason: inv.void_reason,
                lines: detail.lines.map((l) => ({ description: l.description, category_name: l.category_name, amount: l.amount })),
                bill_to: {
                    name: inv.payee_name,
                    address: ((payee as { address?: string | null } | null)?.address) ?? null,
                    email: ((payee as { email?: string | null } | null)?.email) ?? null,
                },
            },
            org: {
                name: String(o.name ?? ""),
                legal_name: (o.legal_name as string | null) ?? null,
                address: (o.address as string | null) ?? null,
                registration_id: (o.registration_id as string | null) ?? null,
                signatories: [],
                currency,
                letterheadImage: await loadLetterhead(organizationId, o.letterhead_path as string | null),
                payment_details: (o.payment_details as string | null) ?? null,
            },
        },
    }
}

// ------------------------------------------------------------------ writing

function checkFile(file: File | null): string | null {
    if (!file) return null
    if (!ALLOWED_MIMES.includes(file.type)) return "Attach an image (JPG, PNG, WEBP) or a PDF"
    if (file.size > MAX_FILE_BYTES) return "The attachment is too large. The limit is 10 MB."
    return null
}

async function removeFile(path: string | null) {
    if (!path || path.includes("..")) return
    const { error } = await createAdminClient().storage.from(BUCKET).remove([path])
    if (error) console.error("Could not remove an invoice attachment:", error)
}

// formData: "payload" (JSON of the invoice form), optional "file", optional "removeAttachment" = "1"
export async function saveInvoice(formData: FormData): Promise<ActionResult<{ id: string }>> {
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can change invoices." }
    }
    try {
        let raw: unknown
        try {
            raw = JSON.parse(String(formData.get("payload") ?? ""))
        } catch {
            return { success: false, error: "The form could not be read. Please try again." }
        }
        const parsed = parseInvoiceInput(raw)
        if (!parsed.ok) return { success: false, error: parsed.error }
        const f = formData.get("file")
        const file = f instanceof File && f.size > 0 ? f : null
        const fileProblem = checkFile(file)
        if (fileProblem) return { success: false, error: fileProblem }

        const supabase = await createClient()
        const organizationId = await getOrganizationId()
        if (!organizationId) return { success: false, error: "No active organization" }
        const { data: id, error } = await supabase.rpc("save_invoice", { payload: parsed.value })
        if (error || typeof id !== "string") return { success: false, error: dbMessage(error, "Could not save the invoice. Please try again.") }

        // Attachment: the invoice tables are read-only to users, so the file path is written with the
        // server key, only after the database function above accepted this user and this invoice
        if (file || formData.get("removeAttachment") === "1") {
            const admin = createAdminClient()
            const { data: cur } = await admin.from("invoices").select("attachment_url").eq("id", id).eq("organization_id", organizationId).eq("source", "manual").maybeSingle()
            if (cur) {
                const oldPath = (cur.attachment_url as string | null) ?? null
                if (file) {
                    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/^[./\\]+/, "").slice(-80)
                    const path = `${organizationId}/invoices/${id}-${Date.now()}-${safeName}`
                    const { error: upError } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type })
                    if (upError) return { success: false, error: "The invoice was saved, but the attachment could not be uploaded." }
                    const { error: setError } = await admin.from("invoices").update({ attachment_url: path }).eq("id", id).eq("organization_id", organizationId)
                    if (setError) {
                        await removeFile(path)
                        return { success: false, error: "The invoice was saved, but the attachment could not be added." }
                    }
                    await removeFile(oldPath)
                } else if (oldPath) {
                    await admin.from("invoices").update({ attachment_url: null }).eq("id", id).eq("organization_id", organizationId)
                    await removeFile(oldPath)
                }
            }
        }
        revalidateInvoices()
        return { success: true, data: { id } }
    } catch (e) {
        console.error("saveInvoice failed:", e)
        return { success: false, error: errorMessage(e) || "Could not save the invoice. Please try again." }
    }
}

export async function voidInvoice(id: string, reason: string): Promise<ActionResult> {
    if (!UUID_RE.test(id ?? "")) return { success: false, error: "That invoice was not found" }
    const clean = (reason ?? "").trim()
    if (!clean) return { success: false, error: "Give a reason for voiding the invoice" }
    if (clean.length > 500) return { success: false, error: "The reason can be at most 500 characters" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("void_invoice", { p_id: id, p_reason: clean })
    if (error) return { success: false, error: dbMessage(error, "Could not void the invoice. Please try again.") }
    revalidateInvoices()
    return { success: true }
}

export async function deleteInvoice(id: string): Promise<ActionResult> {
    if (!UUID_RE.test(id ?? "")) return { success: false, error: "That invoice was not found" }
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    const { data: cur } = await supabase.from("invoices").select("attachment_url").eq("id", id).eq("organization_id", organizationId ?? "").maybeSingle()
    const { error } = await supabase.rpc("delete_invoice", { p_id: id })
    if (error) return { success: false, error: dbMessage(error, "Could not delete the draft. Please try again.") }
    await removeFile((cur?.attachment_url as string | null) ?? null)
    revalidateInvoices()
    return { success: true }
}

export async function recordInvoicePayment(raw: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = parsePaymentInput(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("record_invoice_payment", { payload: parsed.value })
    if (error || typeof data !== "string") return { success: false, error: dbMessage(error, "Could not record the payment. Please try again.") }
    revalidateInvoices()
    return { success: true, data: { id: data } }
}

export async function deleteInvoicePayment(transactionId: string): Promise<ActionResult> {
    if (!UUID_RE.test(transactionId ?? "")) return { success: false, error: "That payment was not found" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("delete_invoice_payment", { p_tx: transactionId })
    if (error) return { success: false, error: dbMessage(error, "Could not delete the payment. Please try again.") }
    revalidateInvoices()
    return { success: true }
}

// Every invoice behind the current tab, status and search (up to 10,000), as a CSV
export async function exportInvoicesCsv(f: InvoiceFilters): Promise<ActionResult<{ csv: string; truncated: boolean }>> {
    try {
        const supabase = await createClient()
        const organizationId = await getOrganizationId()
        if (!organizationId) return { success: false, error: "No active organization" }
        const all: InvoiceRow[] = []
        let truncated = false
        const onlyIds = await invoicesWithLines(supabase, organizationId, f)
        for (let from = 0; from < EXPORT_MAX_ROWS; from += 1000) {
            const res = await listQuery(supabase, organizationId, f, onlyIds).range(from, from + 999)
            if (res.error) throw res.error
            const chunk = ((res.data ?? []) as Record<string, unknown>[]).map(toRow)
            all.push(...chunk)
            if (chunk.length < 1000) break
            if (from + 1000 >= EXPORT_MAX_ROWS) truncated = true
        }
        return { success: true, data: { csv: buildInvoicesCsv(all, await getOrganizationCurrency()), truncated } }
    } catch (e) {
        console.error("exportInvoicesCsv failed:", e)
        return { success: false, error: "Could not export the invoices. Please try again." }
    }
}
