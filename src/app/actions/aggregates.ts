"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getOrganizationTimezone } from "./document-utils"
import { addDaysIso, formatShortDate, monthBounds, todayInTimezone } from "@/utils/dates"
import {
    LARGE_TX_PAGE_SIZE,
    LARGE_TX_THRESHOLD,
    LEDGER_PAGE_SIZE,
    type DashboardSummary,
    type LargeTransactions,
    type LedgerFilters,
    type LedgerStatusCounts,
    type ReportFilters,
    type ReportSummary,
} from "@/utils/aggregate-types"
import type { DocumentRow, IdName } from "@/utils/row-types"
import type { OnboardingProgress } from "@/utils/getting-started"
import { billsToPay, type BillAgeing, type BillsToPay } from "@/utils/dashboard"

// A JSON object returned by a database function; every field is checked before use
type JsonObject = Record<string, unknown>

// "Today" and "this month" follow the organisation's own timezone (Settings > Organization).

/*
 * Totals, filtering and paging are done in Postgres (see
 * supabase/migrations/20261116120000_dashboard_reports_ledger_aggregates.sql). The browser only ever receives
 * the numbers it displays or one page of rows, however many documents the organisation has.
 */

const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

async function requireOrg() {
    const orgId = await getOrganizationId()
    if (!orgId) throw new Error("No active organization")
    return orgId
}

// ---------------------------------------------------------------- Dashboard

export async function getDashboardSummary(): Promise<DashboardSummary> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const tz = await getOrganizationTimezone()

    const { data, error } = await supabase.rpc("dashboard_summary", {
        p_org: orgId,
        p_today: todayInTimezone(tz),
        p_tz: tz,
    })
    if (error) {
        console.error("Error loading dashboard summary:", error)
        throw new Error("Failed to load dashboard")
    }

    const raw = (data ?? {}) as JsonObject
    return {
        awaitingTotal: num(raw.awaiting_total),
        needsReviewCount: num(raw.needs_review_count),
        needsReviewTotal: num(raw.needs_review_total),
        paidThisMonth: num(raw.paid_this_month),
        cashFlow: ((raw.cash_flow ?? []) as JsonObject[]).map((p) => ({
            date: String(p.date),
            displayDate: formatShortDate(String(p.date)),
            amount: num(p.amount),
        })),
    }
}

/**
 * Money in and money out this month, by payment date, read from transactions only (the cash book).
 * Paid documents are already in there through the mirror, so nothing is counted twice.
 */
export async function getCashThisMonth(): Promise<{ moneyIn: number; moneyOut: number; from: string; to: string }> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const today = todayInTimezone(await getOrganizationTimezone())
    const { data, error } = await supabase.rpc("dashboard_cash_month", { p_org: orgId, p_today: today })
    if (error) {
        console.error("Error loading money in and out this month:", error)
        throw new Error("Failed to load dashboard")
    }
    const raw = (data ?? {}) as JsonObject
    const { start, end } = monthBounds(today)
    return { moneyIn: num(raw.money_in), moneyOut: num(raw.money_out), from: start, to: end }
}

/**
 * The dashboard's "Bills to pay" card (simplification step 7): the open bills and what is still owed
 * on them, the same rows and total as "Total you owe" on Bills & Invoices, with the overdue part.
 */
export async function getBillsToPay(): Promise<BillsToPay> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const { data, error } = await supabase.from("invoice_summary").select("balance, ageing_bucket")
        .eq("organization_id", orgId).eq("direction", "payable").not("ageing_bucket", "is", null).limit(10000)
    if (error) {
        console.error("Error loading bills to pay:", error)
        return billsToPay([])
    }
    return billsToPay((data ?? []) as { balance: number | string; ageing_bucket: BillAgeing | null }[])
}

/**
 * Overdue bills you owe and invoices owed to you (spec 5.5): open, past their due date, not fully
 * paid. Worked out by the database view invoice_summary from today's date, never stored.
 */
export async function getOverdueInvoices(): Promise<Record<"payable" | "receivable", { count: number; total: number }>> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const out = { payable: { count: 0, total: 0 }, receivable: { count: 0, total: 0 } }
    const { data, error } = await supabase.from("invoice_summary").select("direction, balance")
        .eq("organization_id", orgId).eq("derived_status", "overdue").limit(10000)
    if (error) {
        console.error("Error loading overdue invoices:", error)
        return out
    }
    const cents = { payable: 0, receivable: 0 }
    for (const r of (data ?? []) as { direction: "payable" | "receivable"; balance: number | string }[]) {
        const d = r.direction === "receivable" ? "receivable" : "payable"
        out[d].count++
        cents[d] += Math.round(num(r.balance) * 100)
    }
    out.payable.total = cents.payable / 100
    out.receivable.total = cents.receivable / 100
    return out
}

/**
 * Each fund's balance today (spec 5.7), from the opening position onwards (rule R4). Null until the
 * opening position is complete, because the balances would be wrong before it.
 */
// What the organisation has done so far, for the "Getting started" card. Counts only (head requests),
// read through the user's own session.
export async function getOnboardingProgress(): Promise<OnboardingProgress> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0
    const head = { count: "exact" as const, head: true }
    const [documents, approvedDocuments, members, moneyIn, reconciliations, { data: org }] = await Promise.all([
        count(supabase.from("documents").select("id", head).eq("organization_id", orgId)),
        count(supabase.from("documents").select("id", head).eq("organization_id", orgId).in("status", ["awaiting_payment", "paid"])),
        count(supabase.from("user_roles").select("id", head).eq("organization_id", orgId)),
        count(supabase.from("transactions").select("id", head).eq("organization_id", orgId).eq("tx_type", "money_in").eq("source", "manual")),
        count(supabase.from("reconciliations").select("id", head).eq("organization_id", orgId)),
        supabase.from("organizations").select("opening_position_completed_at").eq("id", orgId).maybeSingle(),
    ])
    return { documents, approvedDocuments, members, moneyIn, reconciliations, openingComplete: !!org?.opening_position_completed_at }
}

export async function getFundBalances(): Promise<{ id: string; name: string; restricted: boolean; isDefault: boolean; balance: number }[] | null> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const { data: org } = await supabase.from("organizations").select("tracking_start_date, opening_position_completed_at").eq("id", orgId).maybeSingle()
    if (!org?.opening_position_completed_at || !org.tracking_start_date) return null
    const today = todayInTimezone(await getOrganizationTimezone())
    const { data, error } = await supabase.rpc("changes_in_funds", { p_org: orgId, p_from: org.tracking_start_date, p_to: today })
    if (error) {
        console.error("Error loading fund balances:", error)
        return null
    }
    return ((data ?? []) as { fund_id: string; fund_name: string; fund_type: string; is_default: boolean; archived: boolean; closing: number | string }[])
        .filter((f) => !f.archived || Math.abs(num(f.closing)) >= 0.005)
        .map((f) => ({ id: f.fund_id, name: f.fund_name, restricted: f.fund_type === "restricted", isDefault: f.is_default, balance: num(f.closing) }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.restricted) - Number(a.restricted) || a.name.localeCompare(b.name))
}

/** The 10 newest documents that still need a human (needs review or awaiting payment). */
export async function getActionQueue() {
    const supabase = await createClient()
    const orgId = await requireOrg()

    const { data, error } = await supabase
        .from("documents")
        .select("*, funds ( name ), categories ( name )")
        .eq("organization_id", orgId)
        .in("status", ["needs_review", "awaiting_payment"])
        .order("created_at", { ascending: false })
        .limit(10)

    if (error) {
        console.error("Error loading action queue:", error)
        throw new Error("Failed to load action queue")
    }
    return data ?? []
}

/** The 3 most recently touched documents for the activity feed. */
export async function getRecentDocuments() {
    const supabase = await createClient()
    const orgId = await requireOrg()

    const query = (orderBy: string) =>
        supabase
            .from("documents")
            .select("*")
            .eq("organization_id", orgId)
            .order(orderBy, { ascending: false, nullsFirst: false })
            .limit(3)

    // Prefer "last updated"; fall back to creation time if the table has no updated_at column.
    const first = await query("updated_at")
    if (!first.error) return first.data ?? []

    const second = await query("created_at")
    if (second.error) {
        console.error("Error loading recent documents:", second.error)
        throw new Error("Failed to load recent activity")
    }
    return second.data ?? []
}

// ------------------------------------------------------------------ Reports

function reportArgs(filters: ReportFilters, orgId: string, tz: string) {
    return {
        p_org: orgId,
        p_year: filters.year === "all" ? null : parseInt(filters.year, 10),
        p_month: filters.month === "all" ? null : parseInt(filters.month, 10),
        p_fund: filters.fund === "all" ? null : filters.fund,
        p_status: filters.status === "all" ? null : filters.status,
        p_tz: tz,
    }
}

export async function getReportSummary(filters: ReportFilters): Promise<ReportSummary> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const tz = await getOrganizationTimezone()

    const { data, error } = await supabase.rpc("report_summary", reportArgs(filters, orgId, tz))
    if (error) {
        console.error("Error loading report summary:", error)
        throw new Error("Failed to load report")
    }

    const raw = (data ?? {}) as JsonObject
    return {
        total: num(raw.total),
        byFund: ((raw.by_fund ?? []) as JsonObject[]).map((f) => ({ name: String(f.name), total: num(f.total) })),
        topCategories: ((raw.top_categories ?? []) as JsonObject[]).map((c) => ({ name: String(c.name), total: num(c.total) })),
        years: ((raw.years ?? []) as unknown[]).map(num),
        statuses: ((raw.statuses ?? []) as unknown[]).map(String),
    }
}

export async function getLargeTransactions(filters: ReportFilters, page: number): Promise<LargeTransactions> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const tz = await getOrganizationTimezone()

    const { data, error } = await supabase.rpc("report_large_transactions", {
        ...reportArgs(filters, orgId, tz),
        p_min: LARGE_TX_THRESHOLD,
        p_limit: LARGE_TX_PAGE_SIZE,
        p_offset: (Math.max(1, page) - 1) * LARGE_TX_PAGE_SIZE,
    })
    if (error) {
        console.error("Error loading large transactions:", error)
        throw new Error("Failed to load transactions")
    }

    const raw = (data ?? {}) as JsonObject
    return { total: num(raw.total), rows: (raw.rows ?? []) as DocumentRow[] }
}

const EXPORT_PAGE = 1000 // PostgREST returns at most 1000 rows per request by default
const EXPORT_MAX_ROWS = 20000

/** Every row behind the current report filters, fetched in chunks, for PDF/CSV export. */
export async function getReportExportRows(filters: ReportFilters) {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const tz = await getOrganizationTimezone()
    const args = reportArgs(filters, orgId, tz)

    const [fundsRes, catsRes] = await Promise.all([
        supabase.from("funds").select("id, name").eq("organization_id", orgId),
        supabase.from("categories").select("id, name").eq("organization_id", orgId),
    ])
    const fundNames = new Map<string, string>(((fundsRes.data ?? []) as IdName[]).map((f) => [f.id, f.name]))
    const catNames = new Map<string, string>(((catsRes.data ?? []) as IdName[]).map((c) => [c.id, c.name]))

    const rows: DocumentRow[] = []
    let truncated = false
    for (let from = 0; from < EXPORT_MAX_ROWS; from += EXPORT_PAGE) {
        const { data, error } = await supabase
            .rpc("report_rows", args)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + EXPORT_PAGE - 1)
        if (error) {
            console.error("Error exporting report rows:", error)
            throw new Error("Failed to export report")
        }
        const chunk = (data ?? []) as DocumentRow[]
        rows.push(...chunk)
        if (chunk.length < EXPORT_PAGE) break
        if (from + EXPORT_PAGE >= EXPORT_MAX_ROWS) truncated = true
    }

    return {
        truncated,
        rows: rows.map((d) => {
            const fundName = d.fund_id ? fundNames.get(d.fund_id) : undefined
            const catName = d.category_id ? catNames.get(d.category_id) : undefined
            return {
                ...d,
                funds: fundName !== undefined ? { name: fundName } : null,
                categories: catName !== undefined ? { name: catName } : null,
            }
        }),
    }
}

// ------------------------------------------------------------------- Ledger

export async function getLedgerStatusCounts(): Promise<LedgerStatusCounts> {
    const supabase = await createClient()
    const orgId = await requireOrg()

    const { data, error } = await supabase.rpc("ledger_status_counts", { p_org: orgId })
    if (error) {
        console.error("Error loading ledger counts:", error)
        throw new Error("Failed to load ledger")
    }
    const raw = (data ?? {}) as JsonObject
    return {
        all: num(raw.all),
        needs_review: num(raw.needs_review),
        awaiting_payment: num(raw.awaiting_payment),
        paid: num(raw.paid),
    }
}

/** One page of the ledger with the filters applied in the database. */
export async function getLedgerPage(filters: LedgerFilters) {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const tz = await getOrganizationTimezone()
    const today = todayInTimezone(tz)

    let from: string | null = null
    let to: string | null = null
    if (filters.range === "7days") from = addDaysIso(today, -7)
    if (filters.range === "30days") from = addDaysIso(today, -30)
    if (filters.range === "thisMonth") {
        const bounds = monthBounds(today)
        from = bounds.start
        to = bounds.end
    }

    const args = {
        p_org: orgId,
        p_status: filters.status === "all" ? null : filters.status,
        p_fund: filters.fund === "all" ? null : filters.fund,
        p_from: from,
        p_to: to,
        // "#123" has always matched invoice number 123, so drop a leading "#"
        p_q: filters.q.replace(/^#/, "").trim() || null,
    }

    const run = (page: number) =>
        supabase
            .rpc("ledger_page", args, { count: "exact" })
            .range((page - 1) * LEDGER_PAGE_SIZE, page * LEDGER_PAGE_SIZE - 1)

    let page = Math.max(1, filters.page)
    let res = await run(page)
    // A page past the end (e.g. after deleting the last row of the last page): fall back to page 1
    if (res.error?.code === "PGRST103" && page > 1) {
        page = 1
        res = await run(page)
    }
    if (res.error) {
        console.error("Error loading ledger page:", res.error)
        throw new Error("Failed to load ledger")
    }

    const [fundsRes, catsRes] = await Promise.all([
        supabase.from("funds").select("id, name").eq("organization_id", orgId),
        supabase.from("categories").select("id, name").eq("organization_id", orgId),
    ])
    const fundNames = new Map<string, string>(((fundsRes.data ?? []) as IdName[]).map((f) => [f.id, f.name]))
    const catNames = new Map<string, string>(((catsRes.data ?? []) as IdName[]).map((c) => [c.id, c.name]))

    const documents = ((res.data ?? []) as DocumentRow[]).map((d) => {
        const fundName = d.fund_id ? fundNames.get(d.fund_id) : undefined
        const catName = d.category_id ? catNames.get(d.category_id) : undefined
        return {
            ...d,
            funds: d.fund_id && fundName !== undefined ? { id: d.fund_id, name: fundName } : null,
            categories: d.category_id && catName !== undefined ? { id: d.category_id, name: catName } : null,
        }
    })

    return { documents, total: res.count ?? documents.length, page, pageSize: LEDGER_PAGE_SIZE }
}

// ---------------------------------------------------------------- Uploads

/** How many documents are still being extracted, so pages know whether to keep refreshing. */
export async function getExtractingCount(): Promise<number> {
    const supabase = await createClient()
    const orgId = await requireOrg()

    // Safety net: an extraction that never finished (function stopped, AI provider outage) must not
    // spin forever. A healthy extraction ends within about a minute (it has a 50s deadline), so after
    // 2 minutes hand the document to a person, with the same flag a failed extraction gets so the
    // Review drawer offers "Try reading again".
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    await supabase
        .from("documents")
        .update({
            status: "needs_review",
            vendor_name: "[Extraction Failed]",
            confidence_score: 0,
            extraction_flags: [{
                code: "EXTRACTION_TIMED_OUT",
                message: "Reading this document took too long. Try reading it again, or enter the details manually.",
            }],
        })
        .eq("organization_id", orgId)
        .eq("status", "extracting")
        .lt("extraction_started_at", staleBefore)

    const { count, error } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "extracting")
    if (error) {
        console.error("Error counting extracting documents:", error)
        return 0
    }
    return count ?? 0
}
