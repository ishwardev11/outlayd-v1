"use server"

// Financial statements (spec section 6): the Statement of Income and Expenditure (rule R1 since
// stage 4a: invoices by issue date, other entries by payment date) and Receipts and Payments
// (cash only, stage 4d). Read gate "financial_statements": paid plans, and organisations that have been on one
// (they keep access to statements of their existing records). Row-level security limits every query
// to the caller's own organisation.
import { createClient } from "@/utils/supabase/server"
import { getOrganizationCurrency, getOrganizationId, getOrganizationTimezone } from "./document-utils"
import { featureAllowed } from "@/utils/plan"
import { todayInTimezone } from "@/utils/dates"
import { parseIEFilters, shiftYear, type IEFilters, type IERow } from "@/utils/income-expenditure"
import type { CashPosition, RPRow } from "@/utils/receipts-payments"

type SearchParams = Record<string, string | string[] | undefined>

export interface IEPageData {
    locked: boolean
    orgName: string
    orgType: string
    fiscalYearStart: number
    currency: string
    today: string
    filters: IEFilters
    funds: { id: string; name: string; archived: boolean }[]
    current: IERow[]
    prior: IERow[] | null
    priorRange: { from: string; to: string } | null
}

async function fetchRows(supabase: Awaited<ReturnType<typeof createClient>>, org: string, from: string, to: string, fund: string): Promise<IERow[]> {
    const { data, error } = await supabase.rpc("income_expenditure", { p_org: org, p_from: from, p_to: to, p_fund: fund || null })
    if (error) {
        console.error("income_expenditure failed:", error)
        throw new Error("Could not load the statement. Please try again.")
    }
    return ((data ?? []) as IERow[]).map((r) => ({ ...r, amount: Number(r.amount) }))
}

export async function getIncomeExpenditurePage(sp: SearchParams): Promise<IEPageData | null> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return null

    const [{ data: org }, timezone, currency, allowed] = await Promise.all([
        supabase.from("organizations").select("name, org_type, fiscal_year_start").eq("id", organizationId).maybeSingle(),
        getOrganizationTimezone(),
        getOrganizationCurrency(),
        featureAllowed(supabase, organizationId, "financial_statements", "read"),
    ])
    if (!org) return null
    const fiscalYearStart = Number(org.fiscal_year_start) || 1
    const today = todayInTimezone(timezone)
    const filters = parseIEFilters(sp, fiscalYearStart, today)
    const base = {
        orgName: String(org.name ?? ""),
        orgType: String(org.org_type ?? "nonprofit"),
        fiscalYearStart,
        currency,
        today,
        filters,
    }
    if (!allowed) return { ...base, locked: true, funds: [], current: [], prior: null, priorRange: null }

    const { data: funds } = await supabase.from("funds").select("id, name, archived_at, is_archived").order("name")
    const fundList = (funds ?? []).map((f) => ({ id: String(f.id), name: String(f.name), archived: !!f.archived_at || f.is_archived === true }))
    // A fund id from the URL that is not one of ours is dropped (the database would return nothing anyway)
    if (filters.fund && !fundList.some((f) => f.id === filters.fund)) filters.fund = ""

    const wantPrior = filters.compare && filters.layout === "total"
    const priorRange = wantPrior ? { from: shiftYear(filters.from, -1), to: shiftYear(filters.to, -1) } : null
    const [current, prior] = await Promise.all([
        fetchRows(supabase, organizationId, filters.from, filters.to, filters.fund),
        priorRange ? fetchRows(supabase, organizationId, priorRange.from, priorRange.to, filters.fund) : Promise.resolve(null),
    ])
    return { ...base, locked: false, funds: fundList, current, prior, priorRange }
}

// ------------------------------------------------------------------ Receipts and Payments (6.3)

export interface RPPageData extends Omit<IEPageData, "current" | "prior"> {
    current: RPRow[]
    prior: RPRow[] | null
    // Cash at the start and end of each period, all accounts. Not shown for a single fund: cash is
    // held in accounts, not per fund, until fund balances arrive with the balance sheet.
    cash: { current: CashPosition; prior: CashPosition | null } | null
}

async function fetchRP(supabase: Awaited<ReturnType<typeof createClient>>, org: string, from: string, to: string, fund: string): Promise<RPRow[]> {
    const { data, error } = await supabase.rpc("receipts_payments", { p_org: org, p_from: from, p_to: to, p_fund: fund || null })
    if (error) {
        console.error("receipts_payments failed:", error)
        throw new Error("Could not load the statement. Please try again.")
    }
    return ((data ?? []) as RPRow[]).map((r) => ({ ...r, amount: Number(r.amount) }))
}

async function fetchCash(supabase: Awaited<ReturnType<typeof createClient>>, org: string, from: string, to: string): Promise<CashPosition> {
    const { data, error } = await supabase.rpc("cash_position", { p_org: org, p_from: from, p_to: to })
    if (error) {
        console.error("cash_position failed:", error)
        throw new Error("Could not load the statement. Please try again.")
    }
    const row = (Array.isArray(data) ? data[0] : data) as { opening: number | string; closing: number | string } | null
    return { opening: Number(row?.opening ?? 0), closing: Number(row?.closing ?? 0) }
}

export async function getReceiptsPaymentsPage(sp: SearchParams): Promise<RPPageData | null> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return null

    const [{ data: org }, timezone, currency, allowed] = await Promise.all([
        supabase.from("organizations").select("name, org_type, fiscal_year_start, tracking_start_date").eq("id", organizationId).maybeSingle(),
        getOrganizationTimezone(),
        getOrganizationCurrency(),
        featureAllowed(supabase, organizationId, "financial_statements", "read"),
    ])
    if (!org) return null
    const fiscalYearStart = Number(org.fiscal_year_start) || 1
    const today = todayInTimezone(timezone)
    // Opening and closing cash are only known from the tracking start date (the opening position)
    const startDate = (org.tracking_start_date as string | null) ?? ""
    const cashKnown = (from: string) => !startDate || from >= startDate
    // One column per fund is not offered here; the fund filter shows one fund at a time
    const filters: IEFilters = { ...parseIEFilters(sp, fiscalYearStart, today), layout: "total" }
    const base = { orgName: String(org.name ?? ""), orgType: String(org.org_type ?? "nonprofit"), fiscalYearStart, currency, today, filters }
    if (!allowed) return { ...base, locked: true, funds: [], current: [], prior: null, priorRange: null, cash: null }

    const { data: funds } = await supabase.from("funds").select("id, name, archived_at, is_archived").order("name")
    const fundList = (funds ?? []).map((f) => ({ id: String(f.id), name: String(f.name), archived: !!f.archived_at || f.is_archived === true }))
    if (filters.fund && !fundList.some((f) => f.id === filters.fund)) filters.fund = ""

    const priorRange = filters.compare ? { from: shiftYear(filters.from, -1), to: shiftYear(filters.to, -1) } : null
    const [current, prior, cashNow, cashPrior] = await Promise.all([
        fetchRP(supabase, organizationId, filters.from, filters.to, filters.fund),
        priorRange ? fetchRP(supabase, organizationId, priorRange.from, priorRange.to, filters.fund) : Promise.resolve(null),
        filters.fund || !cashKnown(filters.from) ? Promise.resolve(null) : fetchCash(supabase, organizationId, filters.from, filters.to),
        !filters.fund && priorRange && cashKnown(priorRange.from) ? fetchCash(supabase, organizationId, priorRange.from, priorRange.to) : Promise.resolve(null),
    ])
    return {
        ...base, locked: false, funds: fundList, current, prior, priorRange,
        cash: cashNow ? { current: cashNow, prior: cashPrior } : null,
    }
}
