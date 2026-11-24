"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { checkWriteAccess, getOrganizationCurrency, getOrganizationId, updateDocument } from "./document-utils"
import { featureAllowed, planGateMessage } from "@/utils/plan"
import {
    documentCandidate, entryCandidate, suggestMatches, type MatchCandidate, type MatchDocument, type MatchEntry,
} from "@/utils/bank-matching"
import type {
    ActionResult, BankStatement, BankStatementListItem, BankTransactionView, MatchTarget, StatementDetail,
} from "@/utils/bank-statement-types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APPROVED = ["awaiting_payment", "paid"]
const PAGE = 1000
const STATEMENT_COLUMNS =
    "id, file_name, status, error_message, warning, bank_name, account_last4, currency, period_start, period_end, opening_balance, closing_balance, transaction_count, duplicate_count, created_at, account_id"
const DOC_COLUMNS =
    "id, vendor_name, invoice_number, reference_number, status, amount, original_currency, original_amount, document_date, due_date, paid_date"
const TX_COLUMNS = "id, tx_type, tx_date, total, payee_name, reference, is_refund, account_id, to_account_id, document_id"

type Supabase = Awaited<ReturnType<typeof createClient>>
interface Access { supabase: Supabase; organizationId: string; userId: string }

// A bank_transactions row as selected in getStatementDetail
interface LineRow {
    id: string
    txn_date: string
    description: string
    amount: number | string
    balance: number | string | null
    match_status: BankTransactionView["status"]
    matched_document_id: string | null
    matched_transaction_id: string | null
    ignore_reason: string | null
}

// A transactions row as offered for matching
interface TxRow {
    id: string
    tx_type: "money_in" | "money_out" | "account_transfer"
    tx_date: string
    total: number | string
    payee_name: string | null
    reference: string | null
    is_refund: boolean
    account_id: string
    to_account_id: string | null
    document_id: string | null
}

// One row of the bank_statement_stats() database function
interface StatementStats {
    statement_id: string
    line_count?: number
    matched?: number
    needs_attention?: number
}

// Every action checks the plan on the server, so a free organisation cannot call them directly.
// Reading is open to every plan (a downgraded organisation keeps read-only access to its own
// statements); importing, matching and deleting need a paid plan.
async function access(write: boolean): Promise<Access | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "You are signed out. Please sign in again." }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { error: "No active organization." }
    const level = write ? "use" : "read"
    if (!(await featureAllowed(supabase, organizationId, "bank_statements", level))) {
        return { error: planGateMessage("bank_statements", level) }
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

const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

function docTarget(d: MatchDocument): MatchTarget {
    return {
        kind: "document",
        id: d.id,
        payee: (d.vendor_name ?? "").trim() || "Unknown vendor",
        reference: d.invoice_number ?? d.reference_number ?? null,
        cents: toCents(d.amount),
        date: d.document_date ?? null,
        label: d.status === "paid" ? "Paid document" : "Bill awaiting payment",
        unpaid: d.status === "awaiting_payment",
    }
}

// Direction of an entry as seen from the statement's account
function entryDirection(t: TxRow, accountId: string | null): "in" | "out" {
    if (t.tx_type === "money_in") return "in"
    if (t.tx_type === "money_out") return "out"
    return accountId !== null && t.to_account_id === accountId ? "in" : "out"
}

function txTarget(t: TxRow, accountId: string | null, accountNames: Map<string, string>): MatchTarget {
    const dir = entryDirection(t, accountId)
    let label: string
    if (t.tx_type === "account_transfer") {
        label = dir === "in"
            ? `Transfer from ${accountNames.get(t.account_id) ?? "another account"}`
            : `Transfer to ${accountNames.get(t.to_account_id ?? "") ?? "another account"}`
    } else if (t.tx_type === "money_in") {
        label = t.is_refund || t.document_id ? "Refund received" : "Money in"
    } else {
        label = "Money out"
    }
    return {
        kind: "transaction",
        id: t.id,
        payee: (t.payee_name ?? "").trim() || (t.tx_type === "account_transfer" ? "Transfer" : "No payee"),
        reference: t.reference,
        cents: toCents(t.total),
        date: t.tx_date,
        label,
        unpaid: false,
    }
}

function toEntry(t: TxRow, accountId: string | null): MatchEntry {
    return { id: t.id, direction: entryDirection(t, accountId), payee: t.payee_name, reference: t.reference, cents: toCents(t.total), date: t.tx_date }
}

// Money in, money out and transfers between accounts of the organisation (filtered further by entryEligible)
function entryQuery(supabase: Supabase, organizationId: string) {
    return supabase.from("transactions").select(TX_COLUMNS)
        .eq("organization_id", organizationId)
        .in("tx_type", ["money_in", "money_out", "account_transfer"])
}

// Entries that may be matched to a line of this account: they move money in the account. Entries that
// came from an upload are matched through their document instead, except money in (refunds and credit
// notes), since documents are only matched to money going out.
function entryEligible(t: TxRow, accountId: string | null): boolean {
    if (t.document_id && t.tx_type !== "money_in") return false
    if (accountId === null) return true
    return t.account_id === accountId || (t.tx_type === "account_transfer" && t.to_account_id === accountId)
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

// Everything already matched on any statement: documents, entries, and the documents of matched entries
// (an entry from an upload is the same payment as the upload)
async function takenTargets(supabase: Supabase, organizationId: string): Promise<{ docs: Set<string>; txs: Set<string> }> {
    const rows = await pageAll<{ matched_document_id: string | null; matched_transaction_id: string | null }>(
        (from, to) => supabase.from("bank_transactions").select("matched_document_id, matched_transaction_id")
            .eq("organization_id", organizationId).eq("match_status", "matched")
            .order("id", { ascending: true }).range(from, to),
        20000
    )
    const docs = new Set(rows.map((r) => r.matched_document_id).filter((x): x is string => !!x))
    const txs = new Set(rows.map((r) => r.matched_transaction_id).filter((x): x is string => !!x))
    const txIds = [...txs]
    for (let i = 0; i < txIds.length; i += 200) {
        const { data } = await supabase.from("transactions").select("document_id").eq("organization_id", organizationId)
            .in("id", txIds.slice(i, i + 200)).not("document_id", "is", null)
        for (const r of (data ?? []) as { document_id: string }[]) docs.add(r.document_id)
    }
    return { docs, txs }
}

// The organisation's main account (the one the mirror records paid uploads in)
function isMainAccount(accounts: { id: string; is_default: boolean }[], accountId: string | null): boolean {
    return accountId !== null && accounts.some((a) => a.id === accountId && a.is_default)
}

async function accountList(supabase: Supabase, organizationId: string) {
    const { data } = await supabase.from("accounts").select("id, name, is_default").eq("organization_id", organizationId)
    return (data ?? []) as { id: string; name: string; is_default: boolean }[]
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

    const [{ data: statements, error }, { data: stats }, accounts] = await Promise.all([
        a.supabase.from("bank_statements").select(STATEMENT_COLUMNS).eq("organization_id", a.organizationId).order("created_at", { ascending: false }).limit(100),
        a.supabase.rpc("bank_statement_stats", { p_org: a.organizationId }),
        accountList(a.supabase, a.organizationId),
    ])
    if (error) {
        console.error("Supabase Error (getBankStatements):", error)
        return []
    }
    const byId = new Map<string, StatementStats>(((stats ?? []) as StatementStats[]).map((s) => [s.statement_id, s]))
    const names = new Map(accounts.map((x) => [x.id, x.name]))
    return ((statements ?? []) as BankStatement[]).map((s) => ({
        ...s,
        account_name: s.account_id ? names.get(s.account_id) ?? null : null,
        line_count: byId.get(s.id)?.line_count ?? 0,
        matched: byId.get(s.id)?.matched ?? 0,
        needs_attention: byId.get(s.id)?.needs_attention ?? 0,
    }))
}

export async function getStatementDetail(statementId: string): Promise<StatementDetail | null> {
    if (!UUID_RE.test(statementId)) return null
    const a = await access(false)
    if ("error" in a) return null
    const { supabase, organizationId } = a

    const { data: statementRow } = await supabase.from("bank_statements").select(STATEMENT_COLUMNS).eq("id", statementId).eq("organization_id", organizationId).maybeSingle()
    if (!statementRow) return null
    const statement = statementRow as unknown as BankStatement
    const [baseCurrency, accounts] = await Promise.all([getOrganizationCurrency(), accountList(supabase, organizationId)])
    const accountNames = new Map(accounts.map((x) => [x.id, x.name]))
    const accountId = statement.account_id
    const mainAccount = isMainAccount(accounts, accountId)

    const lines = await pageAll<LineRow>(
        (from, to) => supabase.from("bank_transactions")
            .select("id, txn_date, description, amount, balance, match_status, matched_document_id, matched_transaction_id, ignore_reason")
            .eq("statement_id", statementId).eq("organization_id", organizationId)
            .order("txn_date", { ascending: true }).order("id", { ascending: true }).range(from, to),
        5000
    )
    const taken = await takenTargets(supabase, organizationId)

    // Candidates dated shortly before or after the statement period
    const dates = lines.map((t) => t.txn_date).sort()
    const start = statement.period_start ?? dates[0]
    const end = statement.period_end ?? dates[dates.length - 1]
    const opts = { baseCurrency, statementCurrency: statement.currency }
    let docs: MatchDocument[] = []
    let entries: TxRow[] = []
    if (start && end) {
        // Uploads are recorded in the main account, so only its statements are matched to them
        if (mainAccount) {
            docs = (await pageAll<MatchDocument>(
                (from, to) => supabase.from("documents").select(DOC_COLUMNS)
                    .eq("organization_id", organizationId).in("status", APPROVED)
                    .gte("document_date", shiftDay(start, -120)).lte("document_date", shiftDay(end, 14))
                    .order("document_date", { ascending: true }).order("id", { ascending: true }).range(from, to),
                5000
            )).filter((d) => !taken.docs.has(d.id))
        }
        entries = (await pageAll<TxRow>(
            (from, to) => entryQuery(supabase, organizationId)
                .gte("tx_date", shiftDay(start, -14)).lte("tx_date", shiftDay(end, 14))
                .order("tx_date", { ascending: true }).order("id", { ascending: true }).range(from, to),
            10000
        )).filter((t) => entryEligible(t, accountId) && !taken.txs.has(t.id) && !(t.document_id && taken.docs.has(t.document_id)))
    }

    const candidates: MatchCandidate[] = [
        ...docs.map((d) => documentCandidate(d, opts)),
        ...entries.map((t) => entryCandidate(toEntry(t, accountId), opts)),
    ]
    const targetById = new Map<string, MatchTarget>([
        ...docs.map((d) => [`document:${d.id}`, docTarget(d)] as const),
        ...entries.map((t) => [`transaction:${t.id}`, txTarget(t, accountId, accountNames)] as const),
    ])
    const unmatched = lines.filter((t) => t.match_status === "unmatched")
    const suggestions = suggestMatches(
        unmatched.map((t) => ({ id: t.id, date: t.txn_date, description: t.description, cents: toCents(t.amount) })),
        candidates
    )

    // Details of what is already matched
    const matchedDocIds = [...new Set(lines.map((t) => t.matched_document_id).filter((x): x is string => !!x))]
    const matchedTxIds = [...new Set(lines.map((t) => t.matched_transaction_id).filter((x): x is string => !!x))]
    const matchedTargets = new Map<string, MatchTarget>()
    for (let i = 0; i < matchedDocIds.length; i += 200) {
        const { data } = await supabase.from("documents").select(DOC_COLUMNS).eq("organization_id", organizationId).in("id", matchedDocIds.slice(i, i + 200))
        for (const d of (data ?? []) as MatchDocument[]) matchedTargets.set(`document:${d.id}`, docTarget(d))
    }
    for (let i = 0; i < matchedTxIds.length; i += 200) {
        const { data } = await supabase.from("transactions").select(TX_COLUMNS).eq("organization_id", organizationId).in("id", matchedTxIds.slice(i, i + 200))
        for (const t of (data ?? []) as TxRow[]) matchedTargets.set(`transaction:${t.id}`, txTarget(t, accountId, accountNames))
    }

    const transactions: BankTransactionView[] = lines.map((t) => {
        const result = suggestions.get(t.id)
        const sug = result?.suggestion
        const matchedKey = t.matched_document_id ? `document:${t.matched_document_id}` : t.matched_transaction_id ? `transaction:${t.matched_transaction_id}` : null
        const suggested = sug ? targetById.get(sug.documentId) : undefined
        return {
            id: t.id,
            date: t.txn_date,
            description: t.description,
            cents: toCents(t.amount),
            balanceCents: t.balance === null ? null : toCents(t.balance),
            status: t.match_status,
            ignoreReason: t.ignore_reason ?? null,
            matched: t.match_status === "matched" && matchedKey ? matchedTargets.get(matchedKey) ?? null : null,
            suggestion: sug && suggested
                ? { target: suggested, score: sug.score, strong: sug.strong, reasons: sug.reasons, alternatives: result?.alternatives ?? 0 }
                : null,
        }
    })
    return {
        statement,
        accountName: accountId ? accountNames.get(accountId) ?? null : null,
        isMainAccount: mainAccount,
        baseCurrency,
        transactions,
    }
}

// Documents and entries the person can pick by hand when no suggestion fits. With no search words it
// lists those with exactly the line's amount.
export async function searchMatchTargets(query: string, lineId: string): Promise<MatchTarget[]> {
    if (!UUID_RE.test(lineId ?? "")) return []
    const a = await access(false)
    if ("error" in a) return []
    const { supabase, organizationId } = a

    const { data: line } = await supabase.from("bank_transactions").select("amount, statement_id").eq("id", lineId).eq("organization_id", organizationId).maybeSingle()
    if (!line) return []
    const { data: statement } = await supabase.from("bank_statements").select("account_id").eq("id", line.statement_id).eq("organization_id", organizationId).maybeSingle()
    const accountId = (statement?.account_id as string | null) ?? null
    const accounts = await accountList(supabase, organizationId)
    const accountNames = new Map(accounts.map((x) => [x.id, x.name]))
    const out = Number(line.amount) < 0
    const amount = Math.abs(Number(line.amount))
    const term = String(query ?? "").trim().slice(0, 60)
    const like = term ? `%${term.replace(/[\\%_,()]/g, (c) => "\\" + c)}%` : ""
    const taken = await takenTargets(supabase, organizationId)

    // Documents: money going out, on a statement of the main account only
    let docs: MatchDocument[] = []
    if (out && isMainAccount(accounts, accountId)) {
        let q = supabase.from("documents").select(DOC_COLUMNS).eq("organization_id", organizationId).in("status", APPROVED)
        q = term ? q.or(`vendor_name.ilike.${like},invoice_number.ilike.${like}`) : q.eq("amount", amount)
        const { data } = await q.order("document_date", { ascending: false }).limit(40)
        docs = ((data ?? []) as MatchDocument[]).filter((d) => !taken.docs.has(d.id))
    }

    let eq = entryQuery(supabase, organizationId)
    eq = term ? eq.or(`payee_name.ilike.${like},reference.ilike.${like}`) : eq.eq("total", amount)
    const { data: txData } = await eq.order("tx_date", { ascending: false }).limit(200)
    const entries = ((txData ?? []) as TxRow[])
        .filter((t) => entryEligible(t, accountId) && entryDirection(t, accountId) === (out ? "out" : "in"))
        .filter((t) => !taken.txs.has(t.id) && !(t.document_id && taken.docs.has(t.document_id)))

    return [...docs.map(docTarget), ...entries.map((t) => txTarget(t, accountId, accountNames))].slice(0, 20)
}

// ------------------------------------------------------------------ changing

// The database refuses impossible matches with a readable message (wrong direction, other account,
// already matched); show that, never a raw database error
function matchError(error: { code?: string; message?: string }): string {
    if (error.code === "23505") return "That is already matched to another bank line."
    if (error.code === "P0001" && error.message) return error.message
    console.error("bank match failed:", error)
    return "Could not save the match. Please try again."
}

export type MatchKind = "document" | "transaction"

async function applyMatch(a: Access, lineId: string, kind: MatchKind, targetId: string, markPaid: boolean): Promise<ActionResult> {
    const { supabase, organizationId, userId } = a
    if (!UUID_RE.test(lineId) || !UUID_RE.test(targetId) || (kind !== "document" && kind !== "transaction")) return { ok: false, error: "Invalid request." }

    const { data: line } = await supabase.from("bank_transactions").select("id, txn_date, amount, match_status").eq("id", lineId).eq("organization_id", organizationId).maybeSingle()
    if (!line) return { ok: false, error: "That bank line was not found." }
    if (line.match_status !== "unmatched") return { ok: false, error: "That bank line has already been handled." }

    let doc: { id: string; status: string } | null = null
    if (kind === "document") {
        if (Number(line.amount) >= 0) return { ok: false, error: "Only payments going out can be matched to an invoice or receipt." }
        const { data } = await supabase.from("documents").select("id, status").eq("id", targetId).eq("organization_id", organizationId).maybeSingle()
        if (!data) return { ok: false, error: "That document was not found." }
        if (!APPROVED.includes(data.status)) return { ok: false, error: "Approve the document before matching it to a payment." }
        doc = data as { id: string; status: string }
    } else {
        const { data } = await supabase.from("transactions").select("id").eq("id", targetId).eq("organization_id", organizationId).maybeSingle()
        if (!data) return { ok: false, error: "That entry was not found." }
    }

    // Claim the line first. Unique indexes and the database check stop anything being matched twice.
    const { data: claimed, error: claimError } = await supabase
        .from("bank_transactions")
        .update({
            match_status: "matched",
            matched_document_id: kind === "document" ? targetId : null,
            matched_transaction_id: kind === "transaction" ? targetId : null,
            matched_by: userId, matched_at: new Date().toISOString(), ignore_reason: null,
        })
        .eq("id", lineId).eq("organization_id", organizationId).eq("match_status", "unmatched")
        .select("id")
    if (claimError) return { ok: false, error: matchError(claimError) }
    if (!claimed || claimed.length === 0) return { ok: false, error: "That bank line has already been handled." }

    if (doc && markPaid && doc.status === "awaiting_payment") {
        const release = () => supabase.from("bank_transactions")
            .update({ match_status: "unmatched", matched_document_id: null, matched_by: null, matched_at: null })
            .eq("id", lineId).eq("organization_id", organizationId)

        // Goes through the normal path, so the audit log records who marked it paid
        const res = await updateDocument(doc.id, { status: "paid" })
        if (!res?.success) {
            await release()
            return { ok: false, error: (res && "error" in res ? res.error : "") || "Could not mark the document as paid." }
        }
        // The payment date is the day the money left the bank, not today
        const { error: dateError } = await supabase.from("documents").update({ paid_date: line.txn_date }).eq("id", doc.id).eq("organization_id", organizationId)
        if (dateError) console.error("applyMatch: could not set paid_date:", dateError)
    }
    return { ok: true }
}

function revalidateBank() {
    revalidatePath("/bank", "layout")
    revalidatePath("/ledger")
}

export async function confirmBankMatch(lineId: string, kind: MatchKind, targetId: string, markPaid: boolean): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    const result = await applyMatch(a, lineId, kind, targetId, markPaid)
    revalidateBank()
    return result
}

// For "confirm all strong matches". A small batch per call keeps each call well inside the time limit.
export async function confirmBankMatchesBulk(
    pairs: { lineId: string; kind: MatchKind; targetId: string }[]
): Promise<{ done: number; failed: { lineId: string; error: string }[] }> {
    const a = await access(true)
    if ("error" in a) return { done: 0, failed: (Array.isArray(pairs) ? pairs : []).map((p) => ({ lineId: p.lineId, error: a.error })) }
    const batch = (Array.isArray(pairs) ? pairs : []).slice(0, 10)
    let done = 0
    const failed: { lineId: string; error: string }[] = []
    for (const p of batch) {
        const r = await applyMatch(a, p.lineId, p.kind, p.targetId, true)
        if (r.ok) done++
        else failed.push({ lineId: p.lineId, error: r.error })
    }
    revalidateBank()
    return { done, failed }
}

export async function unmatchBankTransaction(lineId: string): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    if (!UUID_RE.test(lineId)) return { ok: false, error: "Invalid request." }
    const { data, error } = await a.supabase
        .from("bank_transactions")
        .update({ match_status: "unmatched", matched_document_id: null, matched_transaction_id: null, matched_by: null, matched_at: null })
        .eq("id", lineId).eq("organization_id", a.organizationId).eq("match_status", "matched")
        .select("id")
    if (error) {
        console.error("unmatchBankTransaction failed:", error)
        return { ok: false, error: "Could not remove the match. Please try again." }
    }
    if (!data || data.length === 0) return { ok: false, error: "That bank line is not matched." }
    revalidateBank()
    return { ok: true }
}

export async function setBankTransactionIgnored(lineId: string, ignored: boolean, reason?: string): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    if (!UUID_RE.test(lineId)) return { ok: false, error: "Invalid request." }
    const from = ignored ? "unmatched" : "ignored"
    const { data, error } = await a.supabase
        .from("bank_transactions")
        .update({ match_status: ignored ? "ignored" : "unmatched", ignore_reason: ignored ? (String(reason ?? "").trim().slice(0, 200) || null) : null })
        .eq("id", lineId).eq("organization_id", a.organizationId).eq("match_status", from)
        .select("id")
    if (error) {
        console.error("setBankTransactionIgnored failed:", error)
        return { ok: false, error: "Could not update the bank line. Please try again." }
    }
    if (!data || data.length === 0) return { ok: false, error: "That bank line has already been handled." }
    revalidateBank()
    return { ok: true }
}

// Which account the statement belongs to (Admin or Editor, paid plan). Lines already matched keep
// their matches; the database refuses an account from another organisation.
export async function setStatementAccount(statementId: string, accountId: string): Promise<ActionResult> {
    const a = await access(true)
    if ("error" in a) return { ok: false, error: a.error }
    if (!UUID_RE.test(statementId) || !UUID_RE.test(accountId)) return { ok: false, error: "Invalid request." }
    const { count } = await a.supabase.from("bank_transactions").select("id", { count: "exact", head: true })
        .eq("statement_id", statementId).eq("organization_id", a.organizationId).eq("match_status", "matched")
    if ((count ?? 0) > 0) return { ok: false, error: "Remove the matches on this statement before changing its account." }
    const { data, error } = await a.supabase.from("bank_statements").update({ account_id: accountId })
        .eq("id", statementId).eq("organization_id", a.organizationId).select("id")
    if (error) {
        if (error.code === "P0001" && error.message) return { ok: false, error: error.message }
        console.error("setStatementAccount failed:", error)
        return { ok: false, error: "Could not change the account. Please try again." }
    }
    if (!data || data.length === 0) return { ok: false, error: "Statement not found." }
    revalidateBank()
    return { ok: true }
}

// Removes the statement and its lines. Documents and entries that were matched stay as they are.
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
    revalidateBank()
    return { ok: true }
}
