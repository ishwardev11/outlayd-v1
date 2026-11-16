"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId } from "./document-utils"
import { addDaysIso, formatShortDate, monthBounds, todayIso } from "@/utils/dates"
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

// Dates are handled in UTC for now, exactly as before. Fixing the Malaysia day-shift is a separate change.
const TIMEZONE = "UTC"

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
    const tz = TIMEZONE

    const { data, error } = await supabase.rpc("dashboard_summary", {
        p_org: orgId,
        p_today: todayIso(),
        p_tz: tz,
    })
    if (error) {
        console.error("Error loading dashboard summary:", error)
        throw new Error("Failed to load dashboard")
    }

    const raw: any = data ?? {}
    return {
        awaitingTotal: num(raw.awaiting_total),
        needsReviewCount: num(raw.needs_review_count),
        needsReviewTotal: num(raw.needs_review_total),
        paidThisMonth: num(raw.paid_this_month),
        cashFlow: ((raw.cash_flow ?? []) as any[]).map((p) => ({
            date: String(p.date),
            displayDate: formatShortDate(String(p.date)),
            amount: num(p.amount),
        })),
    }
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
    const tz = TIMEZONE

    const { data, error } = await supabase.rpc("report_summary", reportArgs(filters, orgId, tz))
    if (error) {
        console.error("Error loading report summary:", error)
        throw new Error("Failed to load report")
    }

    const raw: any = data ?? {}
    return {
        total: num(raw.total),
        byFund: ((raw.by_fund ?? []) as any[]).map((f) => ({ name: String(f.name), total: num(f.total) })),
        topCategories: ((raw.top_categories ?? []) as any[]).map((c) => ({ name: String(c.name), total: num(c.total) })),
        years: ((raw.years ?? []) as any[]).map(num),
        statuses: ((raw.statuses ?? []) as any[]).map(String),
    }
}

export async function getLargeTransactions(filters: ReportFilters, page: number): Promise<LargeTransactions> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const tz = TIMEZONE

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

    const raw: any = data ?? {}
    return { total: num(raw.total), rows: (raw.rows ?? []) as any[] }
}

const EXPORT_PAGE = 1000 // PostgREST returns at most 1000 rows per request by default
const EXPORT_MAX_ROWS = 20000

/** Every row behind the current report filters, fetched in chunks, for PDF/CSV export. */
export async function getReportExportRows(filters: ReportFilters) {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const tz = TIMEZONE
    const args = reportArgs(filters, orgId, tz)

    const [fundsRes, catsRes] = await Promise.all([
        supabase.from("funds").select("id, name").eq("organization_id", orgId),
        supabase.from("categories").select("id, name").eq("organization_id", orgId),
    ])
    const fundNames = new Map<string, string>((fundsRes.data ?? []).map((f: any) => [f.id, f.name]))
    const catNames = new Map<string, string>((catsRes.data ?? []).map((c: any) => [c.id, c.name]))

    const rows: any[] = []
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
        const chunk = (data ?? []) as any[]
        rows.push(...chunk)
        if (chunk.length < EXPORT_PAGE) break
        if (from + EXPORT_PAGE >= EXPORT_MAX_ROWS) truncated = true
    }

    return {
        truncated,
        rows: rows.map((d) => ({
            ...d,
            funds: d.fund_id && fundNames.has(d.fund_id) ? { name: fundNames.get(d.fund_id) } : null,
            categories: d.category_id && catNames.has(d.category_id) ? { name: catNames.get(d.category_id) } : null,
        })),
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
    const raw: any = data ?? {}
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
    const tz = TIMEZONE
    const today = todayIso()

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
    const fundNames = new Map<string, string>((fundsRes.data ?? []).map((f: any) => [f.id, f.name]))
    const catNames = new Map<string, string>((catsRes.data ?? []).map((c: any) => [c.id, c.name]))

    const documents = ((res.data ?? []) as any[]).map((d) => ({
        ...d,
        funds: d.fund_id && fundNames.has(d.fund_id) ? { id: d.fund_id, name: fundNames.get(d.fund_id) } : null,
        categories: d.category_id && catNames.has(d.category_id) ? { id: d.category_id, name: catNames.get(d.category_id) } : null,
    }))

    return { documents, total: res.count ?? documents.length, page, pageSize: LEDGER_PAGE_SIZE }
}
