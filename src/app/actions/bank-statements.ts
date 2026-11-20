"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { checkWriteAccess, getOrganizationCurrency, getOrganizationId, updateDocument } from "./document-utils"
import { organizationIsPro } from "@/utils/plan"
import { suggestMatches, type MatchDocument } from "@/utils/bank-matching"
import type {
    ActionResult, BankStatement, BankStatementListItem, BankTransactionView, DocSummary, StatementDetail,
} from "@/utils/bank-statement-types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APPROVED = ["awaiting_payment", "paid"]
const PAGE = 1000
const STATEMENT_COLUMNS =
    "id, file_name, status, error_message, warning, bank_name, account_last4, currency, period_start, period_end, opening_balance, closing_balance, transaction_count, duplicate_count, created_at"
const DOC_COLUMNS =
    "id, vendor_name, invoice_number, reference_number, status, amount, original_currency, original_amount, document_date, due_date, paid_date"

type Supabase = Awaited<ReturnType<typeof createClient>>
interface Access { supabase: Supabase; organizationId: string; userId: string }

// A bank_transactions row as selected in getStatementDetail
interface TxnRow {
    id: string
    txn_date: string
    description: string
    amount: number | string
    balance: number | string | null
    match_status: BankTransactionView["status"]
    matched_document_id: string | null
    ignore_reason: string | null
}

// One row of the bank_statement_stats() database function
interface StatementStats {
    statement_id: string
    money_out?: number
    matched?: number
    needs_attention?: number
}

// Every action checks the plan on the server, so a free organisation cannot call them directly.
async function access(write: boolean): Promise<Access | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "You are signed out. Please sign in again." }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { error: "No active organization." }
    if (!(await organizationIsPro(supabase, organizationId))) {
        return { error: "Bank statement import is available on the Growth and Nonprofit plans." }
    }
    if (write) {
        try {
            await checkWriteAccess()
        } catch {
            return { error: "You do not have permission to change bank statements." }
        }
    }
    return { supabase, organizationId, userId: user.id }
}

const toCents = (v: unknown): number => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function summarise(d: MatchDocument): DocSummary {
    return {
        id: d.id,
        vendor: (d.vendor_name ?? "").trim() || "Unknown vendor",
        invoiceNumber: d.invoice_number ?? d.reference_number ?? null,
        cents: toCents(d.amount),
        date: d.document_date ?? null,
        status: d.status ?? null,
    }
}

// A statement still "reading" after this long has died (the job has a 52s deadline)
async function sweepStale(supabase: Supabase, organizationId: string) {
    const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    await supabase
        .from("bank_statements")
        .update({ status: "failed", error_message: "Reading this statement took too long. Delete it and upload it again, or try a shorter period." })
        .eq("organization_id", organizationId)
        .eq("status", "extracting")
        .lt("extraction_started_at", staleBefore)
}

// ------------------------------------------------------------------ reading

export async function getBankStatementProcessingCount(): Promise<number> {
    const a = await access(false)
    if ("error" in a) return 0
    await sweepStale(a.supabase, a.organizationId)
    const { count } = await a.supabase
        .from("bank_statements")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", a.organizationId)
        .eq("status", "extracting")
    return count ?? 0
}

export async function getBankStatements(): Promise<BankStatementListItem[]> {
    const a = await access(false)
    if ("error" in a) return []
    await sweepStale(a.supabase, a.organizationId)

    const [{ data: statements, error }, { data: stats }] = await Promise.all([
        a.supabase.from("bank_statements").select(STATEMENT_COLUMNS).eq("organization_id", a.organizationId).order("created_at", { ascending: false }).limit(100),
        a.supabase.rpc("bank_statement_stats", { p_org: a.organizationId }),
    ])
    if (error) {
        console.error("Supabase Error (getBankStatements):", error)
        return []
    }
    const byId = new Map<string, StatementStats>(((stats ?? []) as StatementStats[]).map((s) => [s.statement_id, s]))
    return ((statements ?? []) as BankStatement[]).map((s) => ({
        ...s,
        money_out: byId.get(s.id)?.money_out ?? 0,
        matched: byId.get(s.id)?.matched ?? 0,
        needs_attention: byId.get(s.id)?.needs_attention ?? 0,
    }))
}

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, maxRows: number): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; from < maxRows; from += PAGE) {
        const { data, error } = await fetchPage(from, from + PAGE - 1)
        if (error) throw error
        out.push(...(data ?? []))
        if (!data || data.length < PAGE) break
    }
    return out
}

export async function getStatementDetail(statementId: string): Promise<StatementDetail | null> {
    if (!UUID_RE.test(statementId)) return null
    const a = await access(false)
    if ("error" in a) return null
    const { supabase, organizationId } = a

    const { data: statement } = await supabase.from("bank_statements").select(STATEMENT_COLUMNS).eq("id", statementId).eq("organization_id", organizationId).maybeSingle()
    if (!statement) return null
    const baseCurrency = await getOrganizationCurrency()

    const txns = await pageAll<TxnRow>(
        (from, to) => supabase.from("bank_transactions")
            .select("id, txn_date, description, amount, balance, match_status, matched_document_id, ignore_reason")
            .eq("statement_id", statementId).eq("organization_id", organizationId)
            .order("txn_date", { ascending: true }).order("id", { ascending: true }).range(from, to),
        5000
    )

    // Documents already matched to a payment (on any statement) are not offered again
    const matchedIds = new Set<string>(
        (await pageAll<{ matched_document_id: string }>(
            (from, to) => supabase.from("bank_transactions").select("matched_document_id")
                .eq("organization_id", organizationId).eq("match_status", "matched").not("matched_document_id", "is", null)
                .order("id", { ascending: true }).range(from, to),
            20000
        )).map((r) => r.matched_document_id)
    )

    // Approved documents dated shortly before or after the statement period
    const dates = txns.map((t) => t.txn_date as string).sort()
    const start = (statement as BankStatement).period_start ?? dates[0]
    const end = (statement as BankStatement).period_end ?? dates[dates.length - 1]
    let candidates: MatchDocument[] = []
    if (start && end) {
        const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
        candidates = (await pageAll<MatchDocument>(
            (from, to) => supabase.from("documents").select(DOC_COLUMNS)
                .eq("organization_id", organizationId).in("status", APPROVED)
                .gte("document_date", shift(start, -120)).lte("document_date", shift(end, 14))
                .order("document_date", { ascending: true }).order("id", { ascending: true }).range(from, to),
            5000
        )).filter((d) => !matchedIds.has(d.id))
    }

    const unmatchedOut = txns.filter((t) => t.match_status === "unmatched" && Number(t.amount) < 0)
    const suggestions = suggestMatches(
        unmatchedOut.map((t) => ({ id: t.id, date: t.txn_date, description: t.description, cents: toCents(t.amount) })),
        candidates,
        { baseCurrency, statementCurrency: (statement as BankStatement).currency }
    )
    const docById = new Map<string, MatchDocument>(candidates.map((d) => [d.id, d]))

    // Details of documents that are already matched
    const matchedDocIds = [...new Set(txns.filter((t) => t.matched_document_id).map((t) => t.matched_document_id as string))]
    const matchedDocs = new Map<string, MatchDocument>()
    for (let i = 0; i < matchedDocIds.length; i += 200) {
        const { data } = await supabase.from("documents").select(DOC_COLUMNS).eq("organization_id", organizationId).in("id", matchedDocIds.slice(i, i + 200))
        for (const d of (data ?? []) as MatchDocument[]) matchedDocs.set(d.id, d)
    }

    const transactions: BankTransactionView[] = txns.map((t) => {
        const result = suggestions.get(t.id)
        const sug = result?.suggestion
        const matched = t.matched_document_id ? matchedDocs.get(t.matched_document_id) : undefined
        const suggested = sug ? docById.get(sug.documentId) : undefined
        return {
            id: t.id,
            date: t.txn_date,
            description: t.description,
            cents: toCents(t.amount),
            balanceCents: t.balance === null ? null : toCents(t.balance),
            status: t.match_status,
            ignoreReason: t.ignore_reason ?? null,
            matchedDoc: matched ? summarise(matched) : null,
            suggestion: sug && suggested
                ? { doc: summarise(suggested), score: sug.score, strong: sug.strong, reasons: sug.reasons, alternatives: result?.alternatives ?? 0 }
                : null,
        }
    })
    return { statement: statement as unknown as BankStatement, baseCurrency, transactions }
}

// Documents the person can pick by hand when no suggestion fits.
export async function searchMatchableDocuments(query: string, transactionId?: string): Promise<DocSummary[]> {
    const a = await access(false)
    if ("error" in a) return []
    const { supabase, organizationId } = a

    let q = supabase.from("documents").select(DOC_COLUMNS).eq("organization_id", organizationId).in("status", APPROVED)
    const term = String(query ?? "").trim().slice(0, 60)
    if (term) {
        const like = `%${term.replace(/[\\%_,()]/g, (c) => "\\" + c)}%`
        q = q.or(`vendor_name.ilike.${like},invoice_number.ilike.${like}`)
    } else if (transactionId && UUID_RE.test(transactionId)) {
        const { data: txn } = await supabase.from("bank_transactions").select("amount").eq("id", transactionId).eq("organization_id", organizationId).maybeSingle()
        if (!txn) return []
        q = q.eq("amount", Math.abs(Number(txn.amount)))
    } else {
        return []
    }
    const { data } = await q.order("document_date", { ascending: false }).limit(40)
    const docs = (data ?? []) as MatchDocument[]
    if (docs.length === 0) return []

    const { data: taken } = await supabase.from("bank_transactions").select("matched_document_id")
        .eq("organization_id", organizationId).eq("match_status", "matched").in("matched_document_id", docs.map((d) => d.id))
    const takenIds = new Set(((taken ?? []) as { matched_document_id: string | null }[]).map((r) => r.matched_document_id))
    return docs.filter((d) => !takenIds.has(d.id)).slice(0, 15).map(summarise)
}

// ------------------------------------------------------------------ changing

async function applyMatch(a: Access, transactionId: string, documentId: string, markPaid: boolean): Promise<ActionResult> {
    const { supabase, organizationId, userId } = a
    if (!UUID_RE.test(transactionId) || !UUID_RE.test(documentId)) return { ok: false, error: "Invalid request." }

    const { data: txn } = await supabase.from("bank_transactions").select("id, txn_date, amount, match_status").eq("id", transactionId).eq("organization_id", organizationId).maybeSingle()
    if (!txn) return { ok: false, error: "That payment was not found." }
    if (txn.match_status !== "unmatched") return { ok: false, error: "That payment has already been handled." }
    if (Number(txn.amount) >= 0) return { ok: false, error: "Only payments going out can be matched to an invoice or receipt." }

    const { data: doc } = await supabase.from("documents").select("id, status").eq("id", documentId).eq("organization_id", organizationId).maybeSingle()
    if (!doc) return { ok: false, error: "That document was not found." }
    if (!APPROVED.includes(doc.status)) return { ok: false, error: "Approve the document before matching it to a payment." }

    // Claim the payment first. The unique index stops one document being matched twice.
    const { data: claimed, error: claimError } = await supabase
        .from("bank_transactions")
        .update({ match_status: "matched", matched_document_id: documentId, matched_by: userId, matched_at: new Date().toISOString(), ignore_reason: null })
        .eq("id", transactionId).eq("organization_id", organizationId).eq("match_status", "unmatched")
        .select("id")
    if (claimError) {
        if (claimError.code === "23505") return { ok: false, error: "That document is already matched to another payment." }
        console.error("applyMatch claim failed:", claimError)
        return { ok: false, error: "Could not save the match. Please try again." }
    }
    if (!claimed || claimed.length === 0) return { ok: false, error: "That payment has already been handled." }

    if (markPaid && doc.status === "awaiting_payment") {
        const release = () => supabase.from("bank_transactions")
            .update({ match_status: "unmatched", matched_document_id: null, matched_by: null, matched_at: null })
            .eq("id", transactionId).eq("organization_id", organizationId)

        // Goes through the normal path, so the audit log records who marked it paid
        const res = await updateDocument(documentId, { status: "paid" })
        if (!res?.success) {
            await release()
            return { ok: false, error: (res && "error" in res ? res.error : "") || "Could not mark the document as paid." }
        }
        // The payment date is the day the money left the bank, not today
        const { error: dateError } = await supabase.from("documents").update({ paid_date: txn.txn_date }).eq("id", documentId).eq("organization_id", organizationId)
        if (dateError) console.error("applyMatch: could not set paid_date:", dateError)
    }
    return { ok: true }
}

export async function confirmBankMatch(transactionId: string, documentId: string, markPaid: boolean): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    const result = await applyMatch(a, transactionId, documentId, markPaid)
    revalidatePath("/bank-statements", "layout")
    revalidatePath("/ledger")
    return result
}

// For "confirm all strong matches". A small batch per call keeps each call well inside the time limit.
export async function confirmBankMatchesBulk(
    pairs: { transactionId: string; documentId: string }[]
): Promise<{ done: number; failed: { transactionId: string; error: string }[] }> {
    const a = await access(true)
    if ("error" in a) return { done: 0, failed: pairs.map((p) => ({ transactionId: p.transactionId, error: a.error })) }
    const batch = (Array.isArray(pairs) ? pairs : []).slice(0, 10)
    let done = 0
    const failed: { transactionId: string; error: string }[] = []
    for (const p of batch) {
        const r = await applyMatch(a, p.transactionId, p.documentId, true)
        if (r.ok) done++
        else failed.push({ transactionId: p.transactionId, error: r.error })
    }
    revalidatePath("/bank-statements", "layout")
    revalidatePath("/ledger")
    return { done, failed }
}

export async function unmatchBankTransaction(transactionId: string): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    if (!UUID_RE.test(transactionId)) return { ok: false, error: "Invalid request." }
    const { data, error } = await a.supabase
        .from("bank_transactions")
        .update({ match_status: "unmatched", matched_document_id: null, matched_by: null, matched_at: null })
        .eq("id", transactionId).eq("organization_id", a.organizationId).eq("match_status", "matched")
        .select("id")
    if (error) {
        console.error("unmatchBankTransaction failed:", error)
        return { ok: false, error: "Could not remove the match. Please try again." }
    }
    if (!data || data.length === 0) return { ok: false, error: "That payment is not matched." }
    revalidatePath("/bank-statements", "layout")
    return { ok: true }
}

export async function setBankTransactionIgnored(transactionId: string, ignored: boolean, reason?: string): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    if (!UUID_RE.test(transactionId)) return { ok: false, error: "Invalid request." }
    const from = ignored ? "unmatched" : "ignored"
    const { data, error } = await a.supabase
        .from("bank_transactions")
        .update({ match_status: ignored ? "ignored" : "unmatched", ignore_reason: ignored ? (String(reason ?? "").trim().slice(0, 200) || null) : null })
        .eq("id", transactionId).eq("organization_id", a.organizationId).eq("match_status", from)
        .select("id")
    if (error) {
        console.error("setBankTransactionIgnored failed:", error)
        return { ok: false, error: "Could not update the payment. Please try again." }
    }
    if (!data || data.length === 0) return { ok: false, error: "That payment has already been handled." }
    revalidatePath("/bank-statements", "layout")
    return { ok: true }
}

// Removes the statement and its payments. Documents that were matched stay as they are (still paid).
export async function deleteBankStatement(statementId: string): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    if (!UUID_RE.test(statementId)) return { ok: false, error: "Invalid request." }

    const { data: row } = await a.supabase.from("bank_statements").select("id, file_url").eq("id", statementId).eq("organization_id", a.organizationId).maybeSingle()
    if (!row) return { ok: false, error: "Statement not found." }

    const { error } = await a.supabase.from("bank_statements").delete().eq("id", statementId).eq("organization_id", a.organizationId)
    if (error) {
        console.error("deleteBankStatement failed:", error)
        return { ok: false, error: "Could not delete the statement. Please try again." }
    }
    if (row.file_url && !row.file_url.includes("..")) {
        const { error: removeError } = await createAdminClient().storage.from("receipts").remove([row.file_url])
        if (removeError) console.error("deleteBankStatement: file not removed:", removeError)
    }
    revalidatePath("/bank-statements", "layout")
    return { ok: true }
}
