"use server"

// Money in, money out and the cash book (Phase 2, stage 3b).
// Design: cash figures are read from transactions only. Money in is written straight into
// transactions (through the save_money_in database function); money out is saved as a paid document
// with no file, and the existing database mirror turns it into a transaction. Each action returns
// { success, error } instead of throwing, so the person sees the real reason.
import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { checkWriteAccess, getOrganizationCurrency, getOrganizationId, updateDocument } from "./document-utils"
import { getPlanState, requireFeature } from "@/utils/plan"
import { errorMessage } from "@/utils/row-types"
import { linesTotal, parseMoneyInInput, parseMoneyOutInput } from "@/utils/transaction-input"
import {
    CASH_BOOK_PAGE_SIZE, buildCashBookCsv, type CashBookFilters, type CashBookLine, type CashBookRow,
} from "@/utils/cash-book"

type Supabase = Awaited<ReturnType<typeof createClient>>
type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

const BUCKET = "receipts"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_FILE_BYTES = 10 * 1024 * 1024
const EXPORT_MAX_ROWS = 10000

// The database raises readable messages ("Only Admins and Editors can record money in"); show those
function dbMessage(error: { message?: string } | null | undefined, fallback: string): string {
    const m = (error?.message ?? "").trim()
    if (!m || /row-level security|permission denied|violates|syntax/i.test(m)) return fallback
    return m
}

function revalidateMoney() {
    revalidatePath("/inbox")
    revalidatePath("/transactions")
    revalidatePath("/dashboard")
    revalidatePath("/contacts")
}

// ------------------------------------------------------------------ options for the forms

export interface EntryOptions {
    paid: boolean
    funds: { id: string; name: string; is_default: boolean; archived: boolean }[]
    categories: { id: string; name: string; kind: "income" | "expense"; nature: string | null; archived: boolean }[]
    accounts: { id: string; name: string; is_default: boolean; archived: boolean }[]
    payees: { id: string; name: string; payee_type: string; is_system: boolean; archived: boolean }[]
}

export async function getEntryOptions(): Promise<EntryOptions> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    const empty: EntryOptions = { paid: false, funds: [], categories: [], accounts: [], payees: [] }
    if (!organizationId) return empty

    const [plan, funds, categories, accounts, payees] = await Promise.all([
        getPlanState(supabase, organizationId),
        supabase.from("funds").select("id, name, is_default, archived_at, is_archived").eq("organization_id", organizationId).order("name"),
        supabase.from("categories").select("id, name, kind, nature, archived_at, is_system, sort_order")
            .eq("organization_id", organizationId).eq("is_system", false).order("sort_order").order("name"),
        supabase.from("accounts").select("id, name, is_default, archived_at").eq("organization_id", organizationId).order("name"),
        supabase.from("vendors").select("id, name, payee_type, is_system, archived_at").eq("organization_id", organizationId).order("name"),
    ])
    type Row = Record<string, unknown>
    return {
        paid: plan.paid,
        funds: ((funds.data ?? []) as Row[]).map((f) => ({ id: String(f.id), name: String(f.name), is_default: f.is_default === true, archived: !!f.archived_at || f.is_archived === true })),
        categories: ((categories.data ?? []) as Row[]).map((c) => ({ id: String(c.id), name: String(c.name), kind: c.kind === "income" ? "income" : "expense", nature: (c.nature as string | null) ?? null, archived: !!c.archived_at })),
        accounts: ((accounts.data ?? []) as Row[]).map((a) => ({ id: String(a.id), name: String(a.name), is_default: a.is_default === true, archived: !!a.archived_at })),
        payees: ((payees.data ?? []) as Row[]).map((p) => ({ id: String(p.id), name: String(p.name), payee_type: String(p.payee_type ?? "vendor"), is_system: p.is_system === true, archived: !!p.archived_at })),
    }
}

// ------------------------------------------------------------------ cash book

interface TxRow {
    id: string
    tx_type: CashBookRow["type"]
    tx_date: string
    date_estimated: boolean
    total: number | string
    payee_name: string | null
    reference: string | null
    remarks: string | null
    source: CashBookRow["source"]
    document_id: string | null
    is_refund: boolean
    attachment_url: string | null
    account_id: string
    from_fund_id: string | null
    to_fund_id: string | null
}

async function queryCashBook(supabase: Supabase, organizationId: string, filters: CashBookFilters, from: number, to: number) {
    const lineFilter = !!(filters.fund || filters.category)
    // When filtering by fund or category, keep only entries with at least one matching line
    const select = "id, tx_type, tx_date, date_estimated, total, payee_name, reference, remarks, source, document_id, is_refund, attachment_url, account_id, from_fund_id, to_fund_id, created_at"
        + (lineFilter ? ", matching:transaction_lines!inner(id)" : "")
    let q = supabase.from("transactions").select(select, { count: "exact" }).eq("organization_id", organizationId)
    if (filters.fund) q = q.eq("matching.fund_id", filters.fund)
    if (filters.category) q = q.eq("matching.category_id", filters.category)
    if (filters.type !== "all") q = q.eq("tx_type", filters.type)
    if (filters.from) q = q.gte("tx_date", filters.from)
    if (filters.to) q = q.lte("tx_date", filters.to)
    if (filters.payee) q = q.eq("payee_id", filters.payee)
    if (filters.account) q = q.eq("account_id", filters.account)
    if (filters.check) {
        // Only the entries the integrity check found (Reports, Fix)
        const { data: ids } = await supabase.rpc("integrity_check_records", { p_org: organizationId, p_from: filters.from || null, p_to: filters.to || null, p_code: filters.check })
        const list = ((ids ?? []) as { record_id: string }[]).map((r) => r.record_id)
        q = q.in("id", list.length ? list : ["00000000-0000-0000-0000-000000000000"])
    }
    if (filters.q) {
        const like = `%${filters.q.replace(/[\\%_,()]/g, (c) => "\\" + c)}%`
        q = q.or(`payee_name.ilike.${like},remarks.ilike.${like},reference.ilike.${like}`)
    }
    return q.order("tx_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to)
}

async function toRows(supabase: Supabase, organizationId: string, txs: TxRow[], account: string): Promise<CashBookRow[]> {
    if (txs.length === 0) return []
    const ids = txs.map((t) => t.id)
    const [lines, funds, categories, accounts, balances] = await Promise.all([
        supabase.from("transaction_lines").select("transaction_id, line_no, amount, fund_id, category_id, invoice_id, item_id").in("transaction_id", ids).order("line_no"),
        supabase.from("funds").select("id, name").eq("organization_id", organizationId),
        supabase.from("categories").select("id, name, kind, nature").eq("organization_id", organizationId),
        supabase.from("accounts").select("id, name").eq("organization_id", organizationId),
        account ? supabase.rpc("account_running_balance", { p_account: account, p_ids: ids }) : Promise.resolve({ data: [] as unknown[] }),
    ])
    const { data: receiptRows } = await supabase.from("donation_receipts").select("id, transaction_id, receipt_no, voided_at, seq").in("transaction_id", ids).order("seq", { ascending: false })
    const donationCats = new Set(((categories.data ?? []) as { id: string; kind: string; nature: string | null }[]).filter((c) => c.kind === "income" && c.nature === "donation").map((c) => c.id))
    // Per entry: the receipt in force, otherwise the newest voided one
    const receiptOf = new Map<string, { id: string; number: string; voided: boolean }>()
    for (const r of (receiptRows ?? []) as { id: string; transaction_id: string; receipt_no: string; voided_at: string | null }[]) {
        const current = receiptOf.get(r.transaction_id)
        if (!current || (current.voided && !r.voided_at)) receiptOf.set(r.transaction_id, { id: r.id, number: r.receipt_no, voided: !!r.voided_at })
    }
    const names = (rows: unknown) => new Map(((rows ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))
    const fundNames = names(funds.data), catNames = names(categories.data), accountNames = names(accounts.data)
    const balanceOf = new Map(((balances.data ?? []) as { transaction_id: string; balance: number | string }[]).map((b) => [b.transaction_id, Number(b.balance)]))
    // The invoice each entry pays, if any
    const invoiceOfTx = new Map<string, string>()
    for (const l of (lines.data ?? []) as { transaction_id: string; invoice_id: string | null }[]) {
        if (l.invoice_id && !invoiceOfTx.has(l.transaction_id)) invoiceOfTx.set(l.transaction_id, l.invoice_id)
    }
    const invoiceIds = [...new Set(invoiceOfTx.values())]
    const { data: invoiceRows } = invoiceIds.length
        ? await supabase.from("invoices").select("id, direction, invoice_no").in("id", invoiceIds)
        : { data: [] as { id: string; direction: string; invoice_no: string | null }[] }
    const invoiceInfo = new Map(((invoiceRows ?? []) as { id: string; direction: string; invoice_no: string | null }[]).map((i) => [i.id, {
        id: i.id,
        direction: (i.direction === "receivable" ? "receivable" : "payable") as "payable" | "receivable",
        label: `${i.direction === "receivable" ? "Invoice" : "Bill"}${i.invoice_no ? ` ${i.invoice_no}` : ""}`,
    }]))
    // The asset or liability each entry is for, if any
    const itemIds = [...new Set(((lines.data ?? []) as { item_id: string | null }[]).map((l) => l.item_id).filter((x): x is string => !!x))]
    const { data: itemRows } = itemIds.length
        ? await supabase.from("items").select("id, name, kind").in("id", itemIds)
        : { data: [] as { id: string; name: string; kind: string }[] }
    const itemInfo = new Map(((itemRows ?? []) as { id: string; name: string; kind: "fixed_asset" | "other_asset" | "liability" }[]).map((i) => [i.id, i]))
    const itemOfTx = new Map<string, { id: string; name: string; kind: "fixed_asset" | "other_asset" | "liability" }>()
    const linesOf = new Map<string, CashBookLine[]>()
    for (const l of (lines.data ?? []) as { transaction_id: string; amount: number | string; fund_id: string; category_id: string | null; item_id: string | null }[]) {
        const list = linesOf.get(l.transaction_id) ?? []
        const item = l.item_id ? itemInfo.get(l.item_id) : undefined
        if (item) itemOfTx.set(l.transaction_id, item)
        list.push({
            amount: Number(l.amount), fundId: l.fund_id, fundName: fundNames.get(l.fund_id) ?? "Unknown fund",
            categoryId: l.category_id, categoryName: item ? item.name : (l.category_id && catNames.get(l.category_id)) || "Uncategorised",
        })
        linesOf.set(l.transaction_id, list)
    }
    return txs.map((t) => ({
        id: t.id,
        date: t.tx_date,
        dateEstimated: t.date_estimated,
        type: t.tx_type,
        total: Number(t.total),
        payee: t.payee_name ?? "",
        reference: t.reference ?? "",
        remarks: t.remarks ?? "",
        source: t.source,
        documentId: t.document_id,
        isRefund: t.is_refund,
        hasAttachment: !!t.attachment_url,
        accountId: t.account_id,
        accountName: accountNames.get(t.account_id) ?? "",
        lines: linesOf.get(t.id) ?? [],
        balance: account ? balanceOf.get(t.id) ?? null : null,
        donation: t.tx_type === "money_in" && t.source === "manual" && !t.is_refund && (linesOf.get(t.id) ?? []).some((l) => !!l.categoryId && donationCats.has(l.categoryId)),
        receipt: receiptOf.get(t.id) ?? null,
        invoice: invoiceOfTx.has(t.id) ? invoiceInfo.get(invoiceOfTx.get(t.id)!) ?? null : null,
        item: itemOfTx.get(t.id) ?? null,
        transfer: t.tx_type === "fund_transfer"
            ? { from: fundNames.get(t.from_fund_id ?? "") ?? "", to: fundNames.get(t.to_fund_id ?? "") ?? "" }
            : null,
    }))
}

export async function getCashBook(filters: CashBookFilters): Promise<{ rows: CashBookRow[]; total: number; page: number; pageSize: number }> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { rows: [], total: 0, page: 1, pageSize: CASH_BOOK_PAGE_SIZE }

    let page = Math.max(1, filters.page)
    let res = await queryCashBook(supabase, organizationId, filters, (page - 1) * CASH_BOOK_PAGE_SIZE, page * CASH_BOOK_PAGE_SIZE - 1)
    if (res.error?.code === "PGRST103" && page > 1) {
        page = 1
        res = await queryCashBook(supabase, organizationId, filters, 0, CASH_BOOK_PAGE_SIZE - 1)
    }
    if (res.error) {
        console.error("getCashBook failed:", res.error)
        throw new Error("Failed to load the cash book")
    }
    const rows = await toRows(supabase, organizationId, (res.data ?? []) as unknown as TxRow[], filters.account)
    return { rows, total: res.count ?? rows.length, page, pageSize: CASH_BOOK_PAGE_SIZE }
}

// Every entry behind the current filters (up to 10,000), as a CSV
export async function exportCashBookCsv(filters: CashBookFilters): Promise<ActionResult<{ csv: string; truncated: boolean }>> {
    try {
        const supabase = await createClient()
        const organizationId = await getOrganizationId()
        if (!organizationId) return { success: false, error: "No active organization" }
        const all: TxRow[] = []
        let truncated = false
        for (let from = 0; from < EXPORT_MAX_ROWS; from += 1000) {
            const res = await queryCashBook(supabase, organizationId, filters, from, from + 999)
            if (res.error) throw res.error
            const chunk = (res.data ?? []) as unknown as TxRow[]
            all.push(...chunk)
            if (chunk.length < 1000) break
            if (from + 1000 >= EXPORT_MAX_ROWS) truncated = true
        }
        const rows: CashBookRow[] = []
        for (let i = 0; i < all.length; i += 200) rows.push(...(await toRows(supabase, organizationId, all.slice(i, i + 200), filters.account)))
        return { success: true, data: { csv: buildCashBookCsv(rows, await getOrganizationCurrency()), truncated } }
    } catch (e) {
        console.error("exportCashBookCsv failed:", e)
        return { success: false, error: "Could not export the cash book. Please try again." }
    }
}

// ------------------------------------------------------------------ money in

function checkFile(file: File | null): string | null {
    if (!file) return null
    if (!ALLOWED_MIMES.includes(file.type)) return "Attach an image (JPG, PNG, WEBP) or a PDF"
    if (file.size > MAX_FILE_BYTES) return "The attachment is too large. The limit is 10 MB."
    return null
}

async function uploadAttachment(organizationId: string, txId: string, file: File): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/^[./\\]+/, "").slice(-80)
    const path = `${organizationId}/transactions/${txId}-${Date.now()}-${safeName}`
    const { error } = await createAdminClient().storage.from(BUCKET).upload(path, file, { contentType: file.type })
    if (error) throw new Error(`Could not upload the attachment: ${error.message}`)
    return path
}

async function removeFile(path: string | null) {
    if (!path || path.includes("..")) return
    const { error } = await createAdminClient().storage.from(BUCKET).remove([path])
    if (error) console.error("Could not remove an attachment:", error)
}

// formData: "payload" (JSON of the money-in form), optional "file", optional "removeAttachment" = "1"
export async function saveMoneyIn(formData: FormData): Promise<ActionResult<{ id: string }>> {
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can record money in." }
    }
    try {
        const supabase = await createClient()
        const organizationId = await getOrganizationId()
        if (!organizationId) return { success: false, error: "No active organization" }
        await requireFeature(supabase, organizationId, "income", "use")

        let raw: unknown
        try {
            raw = JSON.parse(String(formData.get("payload") ?? ""))
        } catch {
            return { success: false, error: "The form could not be read. Please try again." }
        }
        const parsed = parseMoneyInInput(raw)
        if (!parsed.ok) return { success: false, error: parsed.error }
        const f = formData.get("file")
        const file = f instanceof File && f.size > 0 ? f : null
        const fileProblem = checkFile(file)
        if (fileProblem) return { success: false, error: fileProblem }

        const { data: id, error } = await supabase.rpc("save_money_in", { payload: parsed.value })
        if (error || typeof id !== "string") return { success: false, error: dbMessage(error, "Could not save this entry. Please try again.") }

        // Attachment: add, replace or remove
        const { data: current } = await supabase.from("transactions").select("attachment_url").eq("id", id).maybeSingle()
        const oldPath = (current?.attachment_url as string | null) ?? null
        if (file) {
            const path = await uploadAttachment(organizationId, id, file)
            const { error: upError } = await supabase.from("transactions").update({ attachment_url: path }).eq("id", id)
            if (upError) {
                await removeFile(path)
                return { success: false, error: "The entry was saved, but the attachment could not be added." }
            }
            if (oldPath) await removeFile(oldPath)
        } else if (formData.get("removeAttachment") === "1" && oldPath) {
            const { error: rmError } = await supabase.from("transactions").update({ attachment_url: null }).eq("id", id)
            if (!rmError) await removeFile(oldPath)
        }

        revalidateMoney()
        return { success: true, data: { id } }
    } catch (e) {
        console.error("saveMoneyIn failed:", e)
        return { success: false, error: errorMessage(e) || "Could not save this entry. Please try again." }
    }
}

export async function deleteMoneyIn(id: string): Promise<ActionResult> {
    if (!UUID_RE.test(id ?? "")) return { success: false, error: "That entry was not found" }
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can delete entries." }
    }
    try {
        const supabase = await createClient()
        const { data: current } = await supabase.from("transactions").select("attachment_url").eq("id", id).maybeSingle()
        const { error } = await supabase.rpc("delete_money_in", { p_id: id })
        if (error) return { success: false, error: dbMessage(error, "Could not delete this entry.") }
        await removeFile((current?.attachment_url as string | null) ?? null)
        revalidateMoney()
        return { success: true }
    } catch (e) {
        console.error("deleteMoneyIn failed:", e)
        return { success: false, error: "Could not delete this entry. Please try again." }
    }
}

// Loads one manual money-in entry for the edit form
export async function getMoneyIn(id: string) {
    if (!UUID_RE.test(id ?? "")) return null
    const supabase = await createClient()
    const { data } = await supabase
        .from("transactions")
        .select("id, tx_date, account_id, payee_id, payee_name, reference, remarks, is_refund, attachment_url, source, tx_type, transaction_lines(line_no, amount, fund_id, category_id)")
        .eq("id", id)
        .maybeSingle()
    if (!data || data.source !== "manual" || data.tx_type !== "money_in") return null
    const { count } = await supabase.from("donation_receipts").select("id", { count: "exact", head: true }).eq("transaction_id", id).is("voided_at", null)
    const lines = ((data.transaction_lines ?? []) as { line_no: number; amount: number | string; fund_id: string; category_id: string }[])
        .sort((a, b) => a.line_no - b.line_no)
        .map((l) => ({ amount: Number(l.amount), fund_id: l.fund_id, category_id: l.category_id }))
    return {
        id: data.id as string,
        tx_date: data.tx_date as string,
        account_id: data.account_id as string,
        payee_id: (data.payee_id as string | null) ?? null,
        payee_name: (data.payee_name as string | null) ?? "",
        reference: (data.reference as string | null) ?? "",
        remarks: (data.remarks as string | null) ?? "",
        is_refund: data.is_refund === true,
        has_attachment: !!data.attachment_url,
        has_receipt: (count ?? 0) > 0,
        lines,
    }
}

// ------------------------------------------------------------------ money out

// Saves an expense without a receipt as a paid document (no file). The database mirror creates its
// money-out transaction, and every existing report, fund total, memo and export includes it.
export async function recordMoneyOut(raw: unknown): Promise<ActionResult<{ documentId: string }>> {
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can record money out." }
    }
    const parsed = parseMoneyOutInput(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const input = parsed.value

    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }

    try {
        // Lines without a fund go to the General Fund
        const { data: def } = await supabase.from("funds").select("id").eq("organization_id", organizationId).eq("is_default", true).maybeSingle()
        const lines = input.lines.map((l) => ({ ...l, fund_id: l.fund_id ?? (def?.id as string | undefined) ?? null }))
        if (lines.some((l) => !l.fund_id)) return { success: false, error: "Choose a fund for every line" }

        // Only active expense categories and funds of this organisation can be chosen
        const catIds = [...new Set(lines.map((l) => l.category_id))]
        const fundIds = [...new Set(lines.map((l) => l.fund_id as string))]
        const [cats, funds] = await Promise.all([
            supabase.from("categories").select("id").eq("organization_id", organizationId).eq("kind", "expense").is("archived_at", null).in("id", catIds),
            supabase.from("funds").select("id").eq("organization_id", organizationId).is("archived_at", null).in("id", fundIds),
        ])
        if ((cats.data ?? []).length !== catIds.length) return { success: false, error: "Choose an active expense category for every line" }
        if ((funds.data ?? []).length !== fundIds.length) return { success: false, error: "Choose an active fund for every line" }

        let payeeName = input.payee_name
        if (input.payee_id) {
            const { data: p } = await supabase.from("vendors").select("name").eq("id", input.payee_id).eq("organization_id", organizationId).maybeSingle()
            if (!p) return { success: false, error: "That contact was not found" }
            payeeName = String(p.name)
        }

        const total = linesTotal(lines)
        const { data: doc, error: insertError } = await supabase
            .from("documents")
            .insert({
                organization_id: organizationId,
                status: "needs_review",
                vendor_name: payeeName,
                vendor_id: input.payee_id,
                amount: total,
                document_date: input.tx_date,
                document_type: "receipt",
                extraction_flags: [],
            })
            .select("id")
            .single()
        if (insertError || !doc) {
            console.error("recordMoneyOut insert failed:", insertError)
            return { success: false, error: "Could not save this payment. Please try again." }
        }

        // Approve and pay through the normal path: ownership checks, payment date (a receipt's own
        // date) and the audit log all apply exactly as for an uploaded receipt.
        const result = await updateDocument(doc.id as string, {
            status: "paid",
            splits: lines.map((l) => ({ amount: l.amount, fund_id: l.fund_id, category_id: l.category_id })),
            fund_id: lines[0].fund_id,
            category_id: lines[0].category_id,
            invoice_number: input.reference,
            remarks: input.remarks,
        })
        if (!result?.success) {
            await supabase.from("documents").delete().eq("id", doc.id)
            return { success: false, error: ("error" in result && result.error) || "Could not save this payment." }
        }
        revalidateMoney()
        revalidatePath("/reports")
        return { success: true, data: { documentId: doc.id as string } }
    } catch (e) {
        console.error("recordMoneyOut failed:", e)
        return { success: false, error: "Could not save this payment. Please try again." }
    }
}
