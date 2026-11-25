"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getOrganizationTimezone } from "./document-utils"
import { todayInTimezone } from "@/utils/dates"
import type { OnboardingProgress } from "@/utils/getting-started"
import { parseDashboardOverview, type DashboardOverview } from "@/utils/dashboard"

// "Today" and "this month" follow the organisation's own timezone (Settings > Organization).

/*
 * Totals, filtering and paging are done in Postgres (see
 * supabase/migrations/20261116120000_dashboard_reports_ledger_aggregates.sql). The browser only ever receives
 * the numbers it displays or one page of rows, however many documents the organisation has.
 */

async function requireOrg() {
    const orgId = await getOrganizationId()
    if (!orgId) throw new Error("No active organization")
    return orgId
}

// ---------------------------------------------------------------- Dashboard

/**
 * Everything the dashboard shows, in one database call (dashboard_overview): cash in bank, money in and
 * out this month, open bills and invoices, what needs attention, the last 30 days of cash flow, recent
 * entries and fund balances. "Today" is the organisation's own date (Settings > Organization timezone).
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
    const supabase = await createClient()
    const orgId = await requireOrg()
    const today = todayInTimezone(await getOrganizationTimezone())
    const { data, error } = await supabase.rpc("dashboard_overview", { p_org: orgId, p_today: today, p_days: 30 })
    if (error) {
        console.error("Error loading the dashboard:", error)
        throw new Error("Failed to load dashboard")
    }
    return parseDashboardOverview(data, today)
}

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
