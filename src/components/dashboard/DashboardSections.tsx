import Link from "next/link"
import type { ReactNode } from "react"
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronRight, Clock, FileText, HandCoins, Landmark, Loader2, Receipt, Scale, TrendingUp, type LucideIcon } from "lucide-react"
import { attentionItems, dayLabel, fundDotClass, monthLabel, previousMonth, type AttentionItem, type DashboardOverview, type FundLine, type RecentEntry } from "@/utils/dashboard"
import { DashboardActions } from "./DashboardUpload"

// The dashboard's read-only sections (dashboard redesign and polish). Server components: plain HTML, no
// browser code, except the shared action buttons in the empty Recent activity card. Every figure comes
// from dashboard_overview; nothing is added up here. Colours use the brand tokens in globals.css.

const money = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (symbol: string, n: number) => `${n < 0 ? "-" : ""}${symbol}${money(n)}`

const panel = "rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm"

// ---------------------------------------------------------------- KPI cards

type Tone = "brand" | "teal" | "amber" | "green"
const CHIP: Record<Tone, string> = {
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    teal: "bg-brand-teal-50 text-brand-teal-700 dark:bg-brand-teal-950/60 dark:text-brand-teal-300",
    amber: "bg-brand-amber-50 text-brand-amber-700 dark:bg-brand-amber-950/60 dark:text-brand-amber-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
}

function Kpi({ label, icon: Icon, tone, href, value, valueClass, sub, testId, lead }: {
    label: string
    icon: LucideIcon
    tone: Tone
    href: string
    value: ReactNode
    valueClass?: string
    sub: ReactNode
    testId: string
    // The lead card (Cash in bank): soft indigo background, slightly larger number
    lead?: boolean
}) {
    const frame = lead
        ? "rounded-xl border border-brand-200 dark:border-brand-800 shadow-sm bg-linear-to-br from-brand-50 via-white to-white dark:from-brand-950/70 dark:via-slate-800 dark:to-slate-800"
        : panel
    return (
        <div className={`${frame} flex flex-col p-4 sm:p-5`} data-testid={testId}>
            <div className="flex items-center gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CHIP[tone]}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-300 whitespace-nowrap">{label}</span>
            </div>
            <Link href={href} className={`mt-3 font-bold tabular-nums leading-tight hover:underline truncate ${lead ? "text-[1.75rem]" : "text-2xl"} ${valueClass ?? "text-slate-900 dark:text-white"}`} data-testid={`${testId}-value`}>
                {value}
            </Link>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{sub}</p>
        </div>
    )
}

export function KpiRow({ o, symbol }: { o: DashboardOverview; symbol: string }) {
    const net = o.month.moneyIn - o.month.moneyOut
    const monthHref = `/transactions?from=${o.month.from}&to=${o.month.to}`
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpi-row">
            {/* Before the opening position is set, the balance starts at zero; the Getting started card or the
                opening-position banner says what to do, so the card does not repeat it */}
            <Kpi lead testId="cash-in-bank" label="Cash in bank" icon={Landmark} tone="brand"
                href={o.cash.setUp ? "/reports/financial-position" : "/settings/opening-position"}
                value={signed(symbol, o.cash.setUp ? o.cash.balance : 0)}
                valueClass={o.cash.setUp && o.cash.balance < 0 ? "text-red-600 dark:text-red-400" : undefined}
                sub={!o.cash.setUp
                    ? "Starts from your opening position"
                    : o.cash.lastReconciled ? `As at ${dayLabel(o.today)} · reconciled to ${monthLabel(o.cash.lastReconciled)}` : `As at ${dayLabel(o.today)}`} />
            <Kpi testId="net-this-month" label="Net this month" icon={TrendingUp} tone="teal" href={monthHref}
                value={`${net > 0 ? "+" : ""}${signed(symbol, net)}`}
                valueClass={net > 0 ? "text-brand-teal-700 dark:text-brand-teal-300" : net < 0 ? "text-red-600 dark:text-red-400" : undefined}
                sub={`In ${symbol}${money(o.month.moneyIn)} · Out ${symbol}${money(o.month.moneyOut)}`} />
            <Kpi testId="bills-to-pay" label="Bills to pay" icon={Receipt} tone="amber" href="/invoices?status=unpaid"
                value={`${symbol}${money(o.payable.total)}`}
                sub={o.payable.overdueCount > 0
                    ? <span className="text-brand-amber-700 dark:text-brand-amber-300">{o.payable.overdueCount} overdue · {symbol}{money(o.payable.overdueTotal)}</span>
                    : o.payable.count === 0 ? "Nothing to pay" : "Nothing overdue"} />
            <Kpi testId="pending-income" label="Pending income" icon={HandCoins} tone="green" href="/invoices?tab=receivable&status=unpaid"
                value={`${symbol}${money(o.receivable.total)}`}
                sub={o.receivable.count === 0 ? "No open invoices" : `${o.receivable.count} open ${o.receivable.count === 1 ? "invoice" : "invoices"}`} />
        </div>
    )
}

// ---------------------------------------------------------------- Needs attention

const ATTENTION_ICON: Record<string, LucideIcon> = {
    bills_overdue: Clock, invoices_overdue: Clock, review: FileText, unreconciled: Scale, receipts_missing: FileText, extracting: Loader2,
}
const TONE: Record<AttentionItem["tone"], string> = {
    danger: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    warning: "bg-brand-amber-50 text-brand-amber-800 dark:bg-brand-amber-950/40 dark:text-brand-amber-300",
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
}

export function NeedsAttention({ o, canReconcile }: { o: DashboardOverview; canReconcile: boolean }) {
    const items = attentionItems(o, { canReconcile })
    // Last month's reconciliation, from figures already loaded (no extra query)
    const last = previousMonth(o.today)
    const reconStatus = canReconcile && o.cash.setUp && o.startDate && o.startDate <= last.end
        ? (o.cash.lastReconciled && o.cash.lastReconciled >= last.end ? `${last.name} reconciled ✓` : `${last.name} not reconciled`)
        : null
    return (
        <section className={`${panel} flex h-full flex-col p-5`} data-testid="needs-attention" aria-labelledby="needs-attention-title">
            <h2 id="needs-attention-title" className="text-base font-semibold text-slate-900 dark:text-white">Needs attention</h2>
            {items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center" data-testid="all-caught-up">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal-50 dark:bg-brand-teal-950/60">
                        <CheckCircle2 className="h-7 w-7 text-brand-teal-600 dark:text-brand-teal-300" aria-hidden />
                    </span>
                    <p className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">All caught up</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">0 to review · 0 overdue bills · 0 overdue invoices</p>
                    {reconStatus && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="recon-status">{reconStatus}</p>}
                </div>
            ) : (
                <>
                    {/* Unreconciled months are already a row here, so the status line only shows when all is clear */}
                    <ul className="mt-2 -mx-2">
                        {items.map((i) => {
                            const Icon = ATTENTION_ICON[i.key] ?? AlertTriangle
                            return (
                                <li key={i.key} data-attention={i.key}>
                                    <Link href={i.href} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                                        <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{i.label}</span>
                                        <span className={`min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${TONE[i.tone]}`}>{i.count}</span>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" aria-hidden />
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
        </section>
    )
}

// ---------------------------------------------------------------- Fund balances

export function FundBalances({ funds, symbol }: { funds: FundLine[]; symbol: string }) {
    const overspent = funds.some((f) => f.restricted && f.balance !== null && f.balance < 0)
    return (
        <section className={`${panel} flex h-full flex-col p-5`} data-testid="fund-balances" aria-labelledby="fund-balances-title">
            <div className="flex items-center justify-between gap-3">
                <h2 id="fund-balances-title" className="text-base font-semibold text-slate-900 dark:text-white">Fund balances</h2>
                <Link href="/reports/changes-in-funds" className="text-sm text-brand-700 dark:text-brand-300 hover:underline">Details</Link>
            </div>
            <ul className="mt-3 space-y-3.5">
                {funds.map((f) => {
                    // Until the opening position is complete there is no balance yet: show zero
                    const balance = f.balance ?? 0
                    const pct = f.budget && f.budget > 0 ? Math.min(100, (f.spent / f.budget) * 100) : null
                    const over = f.budget !== null && f.budget > 0 && f.spent > f.budget
                    return (
                        <li key={f.id} data-fund={f.name}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200">
                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${fundDotClass(f.id)}`} aria-hidden />
                                    <span className="truncate">{f.name}</span>
                                    {f.restricted && <span className="text-xs text-slate-400">restricted</span>}
                                </span>
                                <span className={`shrink-0 font-semibold tabular-nums ${balance < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                                    {signed(symbol, balance)}
                                </span>
                            </div>
                            {pct !== null && (
                                <div className="mt-1.5 pl-4.5">
                                    <div className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                        <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <p className={`mt-1 text-xs tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                                        {symbol}{money(f.spent)} of {symbol}{money(f.budget ?? 0)} budget used
                                    </p>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
            {/* Spec 3.2: a soft warning when a restricted fund has spent more than it holds */}
            {overspent && (
                <p className="mt-3 text-xs text-red-600 dark:text-red-400" data-testid="restricted-overspent">
                    A restricted fund is below zero: more has been spent from it than it received. Consider a transfer from an unrestricted fund.
                </p>
            )}
        </section>
    )
}

// ---------------------------------------------------------------- Recent activity

export function RecentActivity({ entries, symbol, canRecordIncome }: { entries: RecentEntry[]; symbol: string; canRecordIncome: boolean }) {
    return (
        <section className={`${panel} flex h-full flex-col p-5`} data-testid="recent-activity" aria-labelledby="recent-activity-title">
            <div className="flex items-center justify-between gap-3">
                <h2 id="recent-activity-title" className="text-base font-semibold text-slate-900 dark:text-white">Recent activity</h2>
                <Link href="/transactions" className="text-sm text-brand-700 dark:text-brand-300 hover:underline">View ledger</Link>
            </div>
            {entries.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center" data-testid="recent-empty">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Nothing recorded yet</p>
                    <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">Your latest payments and money received will appear here once you add them.</p>
                    <div className="mt-4">
                        <DashboardActions canRecordIncome={canRecordIncome} place="empty" />
                    </div>
                </div>
            ) : (
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
                    {entries.map((e) => {
                        const isIn = e.type === "money_in"
                        const Icon = isIn ? ArrowDownLeft : ArrowUpRight
                        return (
                            <li key={e.id} className="flex items-center gap-3 py-2.5">
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isIn ? "bg-brand-teal-50 text-brand-teal-700 dark:bg-brand-teal-950/40 dark:text-brand-teal-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}>
                                    <Icon className="h-4 w-4" aria-label={isIn ? "Money in" : "Money out"} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.payee}</p>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{dayLabel(e.date)}{e.allocation ? ` · ${e.allocation}` : ""}</p>
                                </div>
                                <span className={`shrink-0 text-sm font-semibold tabular-nums ${isIn ? "text-brand-teal-700 dark:text-brand-teal-300" : "text-slate-900 dark:text-white"}`}>
                                    {isIn ? "+" : "-"}{symbol}{money(e.total)}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}
