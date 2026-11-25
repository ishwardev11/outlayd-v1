// The dashboard's figures (dashboard redesign). Every sum and count is worked out in the database by
// dashboard_overview (supabase/migrations/20261211100000_dashboard_overview.sql); this file only checks
// the shape of what comes back and decides what to show. Pure, so it is tested (dashboard.test.ts).

type JsonObject = Record<string, unknown>

const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}
const obj = (v: unknown): JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {})
const arr = (v: unknown): JsonObject[] => (Array.isArray(v) ? (v as JsonObject[]) : [])
const dateOrNull = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export interface OpenInvoices {
    count: number
    total: number
    overdueCount: number
    overdueTotal: number
}

export interface CashFlowDay {
    date: string
    moneyIn: number
    moneyOut: number
}

export interface RecentEntry {
    id: string
    date: string
    type: "money_in" | "money_out"
    total: number
    payee: string
    // "Fund · Category", or "Split" when the entry is spread over several funds or categories
    allocation: string
}

export interface FundLine {
    id: string
    name: string
    restricted: boolean
    isDefault: boolean
    // Null until the opening position is complete
    balance: number | null
    budget: number | null
    spent: number
}

export interface DashboardOverview {
    today: string
    openingComplete: boolean
    startDate: string | null
    cash: { setUp: boolean; balance: number; lastReconciled: string | null }
    month: { moneyIn: number; moneyOut: number; from: string; to: string }
    payable: OpenInvoices
    receivable: OpenInvoices & { receiptsMissing: number }
    inbox: { toReview: number; extracting: number; failed: number }
    unreconciled: { count: number; first: string | null }
    cashFlow: CashFlowDay[]
    recent: RecentEntry[]
    funds: FundLine[]
}

function openInvoices(v: unknown): OpenInvoices {
    const o = obj(v)
    return { count: num(o.count), total: num(o.total), overdueCount: num(o.overdue_count), overdueTotal: num(o.overdue_total) }
}

export function parseDashboardOverview(raw: unknown, today: string): DashboardOverview {
    const r = obj(raw)
    const cash = obj(r.cash)
    const month = obj(r.month)
    const inbox = obj(r.inbox)
    const unrec = obj(r.unreconciled)
    return {
        today: dateOrNull(r.today) ?? today,
        openingComplete: r.opening_complete === true,
        startDate: dateOrNull(r.start_date),
        cash: { setUp: cash.set_up === true, balance: num(cash.balance), lastReconciled: dateOrNull(cash.last_reconciled) },
        month: {
            moneyIn: num(month.money_in),
            moneyOut: num(month.money_out),
            from: dateOrNull(month.from) ?? `${today.slice(0, 7)}-01`,
            to: dateOrNull(month.to) ?? today,
        },
        payable: openInvoices(r.payable),
        receivable: { ...openInvoices(r.receivable), receiptsMissing: num(obj(r.receivable).receipts_missing) },
        inbox: { toReview: num(inbox.to_review), extracting: num(inbox.extracting), failed: num(inbox.failed) },
        unreconciled: { count: num(unrec.count), first: dateOrNull(unrec.first) },
        cashFlow: arr(r.cash_flow).map((p) => ({ date: String(p.date), moneyIn: num(p.money_in), moneyOut: num(p.money_out) })),
        recent: arr(r.recent).map((e) => {
            const fund = typeof e.fund === "string" ? e.fund : ""
            const category = typeof e.category === "string" ? e.category : ""
            const split = num(e.lines) > 1 && (!fund || !category)
            return {
                id: String(e.id),
                date: String(e.date),
                type: e.type === "money_in" ? "money_in" : "money_out",
                total: num(e.total),
                payee: typeof e.payee === "string" && e.payee.trim() ? e.payee : "No payee",
                allocation: split ? "Split" : [fund, category].filter(Boolean).join(" · "),
            }
        }),
        funds: arr(r.funds).map((f) => ({
            id: String(f.id),
            name: String(f.name ?? ""),
            restricted: f.restricted === true,
            isDefault: f.is_default === true,
            balance: f.balance === null || f.balance === undefined ? null : num(f.balance),
            budget: f.budget === null || f.budget === undefined ? null : num(f.budget),
            spent: num(f.spent),
        })),
    }
}

/** An organisation "uses funds" once it has more than the default fund, or has given a fund a budget. */
export function usesFunds(funds: FundLine[]): boolean {
    return funds.length > 1 || funds.some((f) => f.budget !== null && f.budget > 0)
}

export interface AttentionItem {
    key: string
    label: string
    count: number
    href: string
    tone: "neutral" | "warning" | "danger"
}

/** The "Needs attention" list: only rows with something to do, most urgent first. */
export function attentionItems(o: DashboardOverview, opts: { canReconcile: boolean }): AttentionItem[] {
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
    const items: AttentionItem[] = [
        { key: "bills_overdue", count: o.payable.overdueCount, label: plural(o.payable.overdueCount, "Overdue bill", "Overdue bills"), href: "/invoices?status=overdue", tone: "danger" },
        { key: "invoices_overdue", count: o.receivable.overdueCount, label: plural(o.receivable.overdueCount, "Invoice overdue from a customer", "Invoices overdue from customers"), href: "/invoices?tab=receivable&status=overdue", tone: "danger" },
        { key: "review", count: o.inbox.toReview, label: plural(o.inbox.toReview, "Document to review", "Documents to review"), href: "/inbox", tone: "warning" },
        { key: "unreconciled", count: opts.canReconcile ? o.unreconciled.count : 0, label: plural(o.unreconciled.count, "Month not yet reconciled", "Months not yet reconciled"), href: o.unreconciled.first ? `/bank?tab=reconciliation&month=${o.unreconciled.first}` : "/bank?tab=reconciliation", tone: "warning" },
        { key: "receipts_missing", count: o.receivable.receiptsMissing, label: plural(o.receivable.receiptsMissing, "Invoice payment without a receipt", "Invoice payments without a receipt"), href: "/invoices?tab=receivable&status=receipt_missing", tone: "warning" },
        { key: "extracting", count: o.inbox.extracting + o.inbox.failed, label: o.inbox.failed > 0 && o.inbox.extracting === 0 ? plural(o.inbox.failed, "Document could not be read", "Documents could not be read") : o.inbox.failed > 0 ? "Documents being read or failed" : plural(o.inbox.extracting, "Document still being read", "Documents still being read"), href: o.inbox.failed > 0 ? "/inbox?status=needs_review" : "/inbox?status=extracting", tone: o.inbox.failed > 0 ? "danger" : "neutral" },
    ]
    return items.filter((i) => i.count > 0)
}

/** "Oct 2026" for a YYYY-MM-DD date (never shifted by the viewer's timezone). */
export function monthLabel(iso: string): string {
    const [y, m] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
}

/** "25 Nov" for a YYYY-MM-DD date. */
export function dayLabel(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
}

// ---------------------------------------------------------------- Dashboard mode (new vs working)

export type DashboardMode = "new" | "working"

// Tweak the "new" rule here only. An organisation is new while it has done fewer than NEW_MODE_STEPS
// setup steps AND nothing has been paid in or out in the last 30 days. Hiding the Getting started card
// (browser-only, see GettingStartedCard) also switches to working mode.
export const NEW_MODE_STEPS = 3

export function dashboardMode(stepsDone: number, cashFlow: CashFlowDay[]): DashboardMode {
    const recentActivity = cashFlow.some((d) => d.moneyIn > 0 || d.moneyOut > 0)
    return stepsDone < NEW_MODE_STEPS && !recentActivity ? "new" : "working"
}

/** "Good morning" / "Good afternoon" / "Good evening" for the hour (0-23) in the organisation's timezone. */
export function greeting(hour: number): string {
    if (hour >= 5 && hour < 12) return "Good morning"
    if (hour >= 12 && hour < 18) return "Good afternoon"
    return "Good evening"
}

/** The current hour (0-23) in a timezone. */
export function hourInTimezone(timeZone: string, now: Date = new Date()): number {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now))
    return Number.isFinite(h) ? h % 24 : now.getUTCHours()
}

/** "November 2026" for a YYYY-MM-DD date. */
export function monthYearLabel(iso: string): string {
    const [y, m] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
}

/** "October" for the month before the given YYYY-MM-DD date, and its last day. */
export function previousMonth(iso: string): { name: string; end: string } {
    const [y, m] = iso.split("-").map(Number)
    const end = new Date(Date.UTC(y, m - 1, 0))
    return { name: end.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }), end: end.toISOString().slice(0, 10) }
}

// Fund dots: a stable colour per fund, picked from its id, so it never changes when funds are added,
// archived or re-ordered. Brand-friendly tints (classes, so they follow the theme tokens).
export const FUND_DOT_CLASSES = [
    "bg-brand-500", "bg-brand-teal-500", "bg-brand-amber-500", "bg-sky-500",
    "bg-cyan-600", "bg-violet-500", "bg-emerald-500", "bg-slate-400",
] as const

export function fundDotClass(id: string): string {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return FUND_DOT_CLASSES[h % FUND_DOT_CLASSES.length]
}
