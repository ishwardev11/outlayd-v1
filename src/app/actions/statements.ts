"use server"

// Financial statements (spec section 6): Income and Expenditure (rule R1: invoices by issue date,
// other entries by payment date), Receipts and Payments (cash only), the Statement of Financial
// Position, the Statement of Changes in Funds and the schedules. Read gate "financial_statements":
// paid plans, and organisations that have been on one (they keep access to statements of their
// existing records). Row-level security limits every query to the caller's own organisation.
// A period that runs past today stops at today, so nothing that has not happened yet is counted.
import { createClient } from "@/utils/supabase/server"
import { getOrganizationCurrency, getOrganizationId, getOrganizationTimezone } from "./document-utils"
import { featureAllowed } from "@/utils/plan"
import { todayInTimezone } from "@/utils/dates"
import { clampToToday, parseIEFilters, shiftYear, type IEFilters, type IERow } from "@/utils/income-expenditure"
import type { CashPosition, RPRow } from "@/utils/receipts-payments"
import type { BSRow, CIFRow, FundInfo } from "@/utils/financial-position"
import type { AgeingBucket } from "@/utils/invoices"

type SearchParams = Record<string, string | string[] | undefined>
type Supabase = Awaited<ReturnType<typeof createClient>>

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

interface Context {
    supabase: Supabase
    organizationId: string
    allowed: boolean
    base: { orgName: string; orgType: string; fiscalYearStart: number; currency: string; today: string; filters: IEFilters }
    startDate: string | null
    completedAt: string | null
    fundList: (FundInfo & { archived: boolean })[]
}

// The organisation, the plan answer, the filters from the URL (clamped to today) and the funds
async function loadContext(sp: SearchParams, totalOnly: boolean): Promise<Context | null> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const [{ data: org }, timezone, currency, allowed] = await Promise.all([
        supabase.from("organizations").select("name, org_type, fiscal_year_start, tracking_start_date, opening_position_completed_at").eq("id", organizationId).maybeSingle(),
        getOrganizationTimezone(),
        getOrganizationCurrency(),
        featureAllowed(supabase, organizationId, "financial_statements", "read"),
    ])
    if (!org) return null
    const fiscalYearStart = Number(org.fiscal_year_start) || 1
    const today = todayInTimezone(timezone)
    const parsed = parseIEFilters(sp, fiscalYearStart, today)
    const filters: IEFilters = { ...parsed, to: clampToToday(parsed.from, parsed.to, today), layout: totalOnly ? "total" : parsed.layout }
    let fundList: Context["fundList"] = []
    if (allowed) {
        const { data: funds } = await supabase.from("funds").select("id, name, fund_type, is_default, archived_at, is_archived").order("name")
        fundList = (funds ?? []).map((f) => ({
            id: String(f.id), name: String(f.name), fund_type: String(f.fund_type), is_default: f.is_default === true,
            archived: !!f.archived_at || f.is_archived === true,
        }))
        // A fund id from the URL that is not one of ours is dropped (the database would return nothing anyway)
        if (filters.fund && !fundList.some((f) => f.id === filters.fund)) filters.fund = ""
    }
    return {
        supabase, organizationId, allowed, fundList,
        base: { orgName: String(org.name ?? ""), orgType: String(org.org_type ?? "nonprofit"), fiscalYearStart, currency, today, filters },
        startDate: (org.tracking_start_date as string | null) ?? null,
        completedAt: (org.opening_position_completed_at as string | null) ?? null,
    }
}

const fundsForControls = (c: Context) => c.fundList.map((f) => ({ id: f.id, name: f.name, archived: f.archived }))

async function rpc<T>(supabase: Supabase, fn: string, args: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) {
        console.error(`${fn} failed:`, error)
        throw new Error("Could not load the statement. Please try again.")
    }
    return (Array.isArray(data) ? data : data ? [data] : []) as T[]
}

const num = <T extends { amount: unknown }>(rows: T[]) => rows.map((r) => ({ ...r, amount: Number(r.amount) }))

// ------------------------------------------------------------------ Income and Expenditure (6.1)

export async function getIncomeExpenditurePage(sp: SearchParams): Promise<IEPageData | null> {
    const c = await loadContext(sp, false)
    if (!c) return null
    if (!c.allowed) return { ...c.base, locked: true, funds: [], current: [], prior: null, priorRange: null }
    const { filters } = c.base
    const wantPrior = filters.compare && filters.layout === "total"
    const priorRange = wantPrior ? { from: shiftYear(filters.from, -1), to: shiftYear(filters.to, -1) } : null
    const args = (from: string, to: string) => ({ p_org: c.organizationId, p_from: from, p_to: to, p_fund: filters.fund || null })
    const [current, prior] = await Promise.all([
        rpc<IERow>(c.supabase, "income_expenditure", args(filters.from, filters.to)).then(num),
        priorRange ? rpc<IERow>(c.supabase, "income_expenditure", args(priorRange.from, priorRange.to)).then(num) : Promise.resolve(null),
    ])
    return { ...c.base, locked: false, funds: fundsForControls(c), current, prior, priorRange }
}

// ------------------------------------------------------------------ Receipts and Payments (6.3)

export interface RPPageData extends Omit<IEPageData, "current" | "prior"> {
    current: RPRow[]
    prior: RPRow[] | null
    // Cash at the start and end of each period, all accounts. Not shown for a single fund (cash is held
    // in accounts, not per fund), nor for a period before the tracking start date.
    cash: { current: CashPosition; prior: CashPosition | null } | null
}

export async function getReceiptsPaymentsPage(sp: SearchParams): Promise<RPPageData | null> {
    const c = await loadContext(sp, true)
    if (!c) return null
    if (!c.allowed) return { ...c.base, locked: true, funds: [], current: [], prior: null, priorRange: null, cash: null }
    const { filters } = c.base
    const cashKnown = (from: string) => !c.startDate || from >= c.startDate
    const priorRange = filters.compare ? { from: shiftYear(filters.from, -1), to: shiftYear(filters.to, -1) } : null
    const args = (from: string, to: string) => ({ p_org: c.organizationId, p_from: from, p_to: to, p_fund: filters.fund || null })
    const cash = async (from: string, to: string): Promise<CashPosition> => {
        const [row] = await rpc<{ opening: number | string; closing: number | string }>(c.supabase, "cash_position", { p_org: c.organizationId, p_from: from, p_to: to })
        return { opening: Number(row?.opening ?? 0), closing: Number(row?.closing ?? 0) }
    }
    const [current, prior, cashNow, cashPrior] = await Promise.all([
        rpc<RPRow>(c.supabase, "receipts_payments", args(filters.from, filters.to)).then(num),
        priorRange ? rpc<RPRow>(c.supabase, "receipts_payments", args(priorRange.from, priorRange.to)).then(num) : Promise.resolve(null),
        filters.fund || !cashKnown(filters.from) ? Promise.resolve(null) : cash(filters.from, filters.to),
        !filters.fund && priorRange && cashKnown(priorRange.from) ? cash(priorRange.from, priorRange.to) : Promise.resolve(null),
    ])
    return { ...c.base, locked: false, funds: fundsForControls(c), current, prior, priorRange, cash: cashNow ? { current: cashNow, prior: cashPrior } : null }
}

// ------------------------------------------------------------------ Statement of Financial Position (6.2)

export interface FPPageData {
    locked: boolean
    // false until the opening position is complete: the page asks for it instead of showing numbers
    ready: boolean
    orgName: string
    orgType: string
    fiscalYearStart: number
    currency: string
    today: string
    filters: IEFilters
    funds: FundInfo[]
    startDate: string | null
    asAt: string
    priorAsAt: string | null
    current: BSRow[]
    prior: BSRow[] | null
}

// The position can be shown from the day before the start date (the opening position) onwards
const known = (date: string, start: string | null) => {
    if (!start) return true
    const dayBefore = new Date(new Date(`${start}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
    return date >= dayBefore
}

export async function getFinancialPositionPage(sp: SearchParams): Promise<FPPageData | null> {
    const c = await loadContext(sp, true)
    if (!c) return null
    const asAt = c.base.filters.to
    const empty = { ...c.base, funds: c.fundList, startDate: c.startDate, asAt, priorAsAt: null, current: [], prior: null }
    if (!c.allowed) return { ...empty, locked: true, ready: false }
    if (!c.completedAt || !known(asAt, c.startDate)) return { ...empty, locked: false, ready: !!c.completedAt }
    const priorAsAt = c.base.filters.compare && known(shiftYear(asAt, -1), c.startDate) ? shiftYear(asAt, -1) : null
    const [current, prior] = await Promise.all([
        rpc<BSRow>(c.supabase, "balance_sheet", { p_org: c.organizationId, p_date: asAt }).then(num),
        priorAsAt ? rpc<BSRow>(c.supabase, "balance_sheet", { p_org: c.organizationId, p_date: priorAsAt }).then(num) : Promise.resolve(null),
    ])
    return { ...empty, locked: false, ready: true, priorAsAt, current, prior }
}

// ------------------------------------------------------------------ Statement of Changes in Funds (6.4)

export interface CIFPageData extends Omit<FPPageData, "current" | "prior" | "asAt" | "priorAsAt"> {
    rows: CIFRow[]
}

export async function getChangesInFundsPage(sp: SearchParams): Promise<CIFPageData | null> {
    const c = await loadContext(sp, true)
    if (!c) return null
    const empty = { ...c.base, funds: c.fundList, startDate: c.startDate, rows: [] }
    if (!c.allowed) return { ...empty, locked: true, ready: false }
    if (!c.completedAt) return { ...empty, locked: false, ready: false }
    const raw = await rpc<CIFRow>(c.supabase, "changes_in_funds", { p_org: c.organizationId, p_from: c.base.filters.from, p_to: c.base.filters.to })
    const rows = raw.map((r) => ({
        ...r, opening: Number(r.opening), income: Number(r.income), expense: Number(r.expense),
        transfers_in: Number(r.transfers_in), transfers_out: Number(r.transfers_out), closing: Number(r.closing),
    }))
    return { ...empty, locked: false, ready: true, rows }
}

// ------------------------------------------------------------------ Schedules (6.5)

export interface FixedAssetScheduleRow {
    item_id: string; name: string; fund_id: string
    cost_open: number; additions: number; disposals_cost: number; cost_close: number
    dep_open: number; dep_charge: number; dep_disposals: number; dep_close: number; nbv_open: number; nbv_close: number
}
export interface SchedulesPageData {
    locked: boolean
    orgName: string
    orgType: string
    fiscalYearStart: number
    currency: string
    today: string
    filters: IEFilters
    funds: { id: string; name: string; archived: boolean; fund_type: string }[]
    fixedAssets: FixedAssetScheduleRow[]
    ageing: { direction: "receivable" | "payable"; bucket: AgeingBucket; amount: number; count: number }[]
    income: IERow[]
    donors: { name: string; amount: number; count: number }[] | null
}

export async function getSchedulesPage(sp: SearchParams): Promise<SchedulesPageData | null> {
    const c = await loadContext(sp, true)
    if (!c) return null
    const { filters } = c.base
    const showDonors = (Array.isArray(sp.donors) ? sp.donors[0] : sp.donors) === "1"
    const base = { ...c.base, funds: c.fundList.map((f) => ({ id: f.id, name: f.name, archived: f.archived, fund_type: f.fund_type })) }
    if (!c.allowed) return { ...base, locked: true, fixedAssets: [], ageing: [], income: [], donors: null }
    const [fixed, owed, income] = await Promise.all([
        rpc<Record<string, unknown>>(c.supabase, "fixed_asset_schedule", { p_org: c.organizationId, p_from: filters.from, p_to: filters.to }),
        c.supabase.from("invoice_summary").select("direction, balance, ageing_bucket").eq("organization_id", c.organizationId).not("ageing_bucket", "is", null).limit(10000),
        rpc<IERow>(c.supabase, "income_expenditure", { p_org: c.organizationId, p_from: filters.from, p_to: filters.to, p_fund: filters.fund || null }).then(num),
    ])
    const ageingMap = new Map<string, { direction: "receivable" | "payable"; bucket: AgeingBucket; cents: number; count: number }>()
    for (const r of (owed.data ?? []) as { direction: "receivable" | "payable"; balance: number; ageing_bucket: AgeingBucket }[]) {
        const key = `${r.direction}:${r.ageing_bucket}`
        const cur = ageingMap.get(key) ?? { direction: r.direction, bucket: r.ageing_bucket, cents: 0, count: 0 }
        cur.cents += Math.round(Number(r.balance) * 100)
        cur.count++
        ageingMap.set(key, cur)
    }
    // Optional donor list (off by default, for privacy): donations received in the period by donor
    let donors: SchedulesPageData["donors"] = null
    if (showDonors) {
        const { data: cats } = await c.supabase.from("categories").select("id").eq("organization_id", c.organizationId).eq("kind", "income").eq("nature", "donation")
        const ids = ((cats ?? []) as { id: string }[]).map((x) => x.id)
        const { data: lines } = ids.length
            ? await c.supabase.from("transaction_lines").select("amount, fund_id, transactions!inner(tx_type, tx_date, payee_name)")
                .eq("organization_id", c.organizationId).in("category_id", ids).is("invoice_id", null)
                .eq("transactions.tx_type", "money_in").gte("transactions.tx_date", filters.from).lte("transactions.tx_date", filters.to).limit(20000)
            : { data: [] }
        const byDonor = new Map<string, { cents: number; count: number }>()
        for (const l of (lines ?? []) as unknown as { amount: number; fund_id: string; transactions: { payee_name: string | null } }[]) {
            if (filters.fund && l.fund_id !== filters.fund) continue
            const name = l.transactions?.payee_name?.trim() || "Anonymous donor"
            const cur = byDonor.get(name) ?? { cents: 0, count: 0 }
            cur.cents += Math.round(Number(l.amount) * 100)
            cur.count++
            byDonor.set(name, cur)
        }
        donors = [...byDonor].map(([name, v]) => ({ name, amount: v.cents / 100, count: v.count })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    }
    const n = (v: unknown) => Number(v ?? 0)
    return {
        ...base, locked: false,
        fixedAssets: fixed.map((r) => ({
            item_id: String(r.item_id), name: String(r.name), fund_id: String(r.fund_id),
            cost_open: n(r.cost_open), additions: n(r.additions), disposals_cost: n(r.disposals_cost), cost_close: n(r.cost_close),
            dep_open: n(r.dep_open), dep_charge: n(r.dep_charge), dep_disposals: n(r.dep_disposals), dep_close: n(r.dep_close),
            nbv_open: n(r.nbv_open), nbv_close: n(r.nbv_close),
        })),
        ageing: [...ageingMap.values()].map((a) => ({ direction: a.direction, bucket: a.bucket, amount: a.cents / 100, count: a.count })),
        income: income.filter((r) => r.kind === "income" && (r.nature === "donation" || r.nature === "grant")),
        donors,
    }
}
