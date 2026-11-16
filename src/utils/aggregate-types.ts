/** Shared types and query-string parsing for the dashboard, reports and ledger. */

export const LEDGER_PAGE_SIZE = 25
export const LARGE_TX_PAGE_SIZE = 10
export const LARGE_TX_THRESHOLD = 500

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------- Dashboard ----------
export interface CashFlowPoint {
    date: string
    displayDate: string
    amount: number
}

export interface DashboardSummary {
    awaitingTotal: number
    needsReviewCount: number
    needsReviewTotal: number
    paidThisMonth: number
    cashFlow: CashFlowPoint[]
}

// ---------- Reports ----------
export interface ReportFilters {
    year: string // "all" or a 4-digit year
    month: string // "all" or 1-12
    fund: string // "all" or a fund id
    status: string // "all" or a status
}

export interface ReportSummary {
    total: number
    byFund: { name: string; total: number }[]
    topCategories: { name: string; total: number }[]
    years: number[]
    statuses: string[]
}

export interface LargeTransactions {
    total: number
    rows: any[]
}

export function parseReportFilters(sp: SearchParams, defaultYear: string): ReportFilters {
    const year = first(sp.year)
    const month = first(sp.month)
    const fund = first(sp.fund)
    const status = first(sp.status)
    return {
        year: year === "all" ? "all" : year && /^\d{4}$/.test(year) ? year : defaultYear,
        month: month && /^(?:[1-9]|1[0-2])$/.test(month) ? month : "all",
        fund: fund && UUID_RE.test(fund) ? fund : "all",
        status: status && /^[a-zA-Z_]{1,40}$/.test(status) ? status : "all",
    }
}

export function parsePage(sp: SearchParams): number {
    const n = parseInt(first(sp.page) ?? "1", 10)
    return Number.isFinite(n) && n > 0 ? n : 1
}

// ---------- Ledger ----------
export interface LedgerFilters {
    status: string // "all" | needs_review | awaiting_payment | paid
    fund: string // "all" or a fund id
    range: string // "all" | 7days | 30days | thisMonth
    q: string
    page: number
}

export interface LedgerStatusCounts {
    all: number
    needs_review: number
    awaiting_payment: number
    paid: number
}

export function parseLedgerFilters(sp: SearchParams): LedgerFilters {
    const status = first(sp.status)
    const fund = first(sp.fund)
    const range = first(sp.range)
    const q = (first(sp.q) ?? "").slice(0, 100)
    return {
        status: status && /^[a-zA-Z_]{1,40}$/.test(status) ? status : "all",
        fund: fund && UUID_RE.test(fund) ? fund : "all",
        range: range === "7days" || range === "30days" || range === "thisMonth" ? range : "all",
        q,
        page: parsePage(sp),
    }
}
