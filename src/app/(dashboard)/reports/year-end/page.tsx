import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, AlertTriangle, ScrollText } from "lucide-react"
import { getYearEndHub } from "@/app/actions/assurance"
import { ReadyToSubmit } from "@/components/reports/StatementAssurance"
import { LockBooks } from "@/components/year-end/LockBooks"
import { formatDay } from "@/utils/lock"
import { STEP_STATUS_LABELS, type StepStatus } from "@/utils/year-end"

export const metadata: Metadata = { title: "Year end" }

export const dynamic = "force-dynamic"

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function StatusBadge({ status }: { status: StepStatus }) {
    const style = status === "done"
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : status === "attention"
            ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    const Icon = status === "done" ? CheckCircle2 : status === "attention" ? AlertTriangle : CircleDashed
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`} data-testid="step-status">
            <Icon className="h-3.5 w-3.5" />{STEP_STATUS_LABELS[status]}
        </span>
    )
}

function Step({ n, title, status, children, testId }: { n: number; title: string; status: StepStatus | null; children: ReactNode; testId: string }) {
    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5" data-testid={testId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-900 dark:text-white">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{n}</span>
                    {title}
                </h2>
                {status && <StatusBadge status={status} />}
            </div>
            <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">{children}</div>
        </section>
    )
}

const button = "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"

// The Year end hub (simplification step 5): the steps to close a financial year, in order, each with its
// status for the chosen year and the place to do it. The rules stay where they were: the opening position
// is edited on its own page, reconciliations on the Bank page, and only Admins on a paid plan can lock.
export default async function YearEndPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const sp = await searchParams
    const hub = await getYearEndHub(first(sp.year) ?? null)
    if (!hub) return <div className="p-8 text-slate-500">No active organisation.</div>
    const { year } = hub
    const period = new URLSearchParams({ period: "custom", from: year.from, to: hub.checkTo }).toString()

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Reports</Link>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Year end</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">The steps to close a financial year, in order. Each shows where it stands for the year you choose.</p>
            </div>

            <form method="get" action="/reports/year-end" className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-slate-500">Financial year<br />
                    <select name="year" defaultValue={year.key} aria-label="Financial year"
                        className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white">
                        {hub.years.map((y) => <option key={y.key} value={y.key}>{y.label}{y.ended ? "" : " (in progress)"}</option>)}
                    </select>
                </label>
                <button type="submit" className="h-9 rounded-md border border-slate-300 dark:border-slate-600 px-3 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">Show</button>
                {!year.ended && <p className="text-xs text-slate-500">This year ends on {formatDay(year.to)}, so some steps can only be finished after that.</p>}
            </form>

            <Step n={1} title="Opening position" status={hub.opening.status} testId="step-opening">
                <p>Where things stood on the day you started using Outlayd: bank balances, money owed both ways, assets, loans and restricted funds.</p>
                <p className="text-xs text-slate-500">
                    {hub.opening.status === "done" ? `Completed${hub.opening.startDate ? ` for ${formatDay(hub.opening.startDate)}` : ""}.`
                        : hub.opening.startDate ? `Started for ${formatDay(hub.opening.startDate)}, not finished yet. The statements need it.`
                            : "Not set yet. The statements need it."}
                </p>
                <Link href="/settings/opening-position" className={button}>Open the opening position <ArrowRight className="h-4 w-4" /></Link>
            </Step>

            <Step n={2} title={`Reconcile each account at ${formatDay(hub.reconciliation.monthEnd)}`} status={hub.reconciliation.status} testId="step-reconcile">
                <p>Check each account&apos;s closing balance against its bank statement on the last day of the year.</p>
                {hub.reconciliation.accounts.length > 0 && (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {hub.reconciliation.accounts.map((a) => (
                            <li key={a.account} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span className="font-medium text-slate-900 dark:text-slate-100">{a.account}</span>
                                <span className="flex items-center gap-2 text-xs text-slate-500">{a.detail}<StatusBadge status={a.status} /></span>
                            </li>
                        ))}
                    </ul>
                )}
                {hub.reconciliation.canOpen
                    ? <Link href={`/bank?tab=reconciliation&month=${hub.reconciliation.monthEnd}`} className={button}>Reconcile on the Bank page <ArrowRight className="h-4 w-4" /></Link>
                    : <p className="text-xs text-slate-500">You can reconcile the year end once {formatDay(hub.reconciliation.monthEnd)} has passed.</p>}
            </Step>

            <Step n={3} title="Integrity checks" status={hub.checks.available ? hub.checks.status : null} testId="step-checks">
                <p>Outlayd checks that the books add up for {formatDay(year.from)} to {formatDay(hub.checkTo)}. Blocking checks must pass before the statements are final.</p>
                {hub.checks.available
                    ? <ReadyToSubmit from={year.from} to={hub.checkTo} />
                    : <p className="text-xs text-slate-500">The checks come with the financial statements, part of the Growth and Nonprofit plans. <Link href="/reports/income-expenditure" className="text-indigo-600 hover:underline">See a sample statement</Link>.</p>}
            </Step>

            <Step n={4} title="Lock the books" status={hub.lock.status} testId="step-lock">
                <p className="text-xs text-slate-500">
                    {hub.lock.lockDate ? `Locked up to ${formatDay(hub.lock.lockDate)}.` : "Not locked."} Lock up to {formatDay(year.to)} once the statements for this year are final.
                </p>
                <LockBooks />
            </Step>

            <Step n={5} title="Statements" status={null} testId="step-statements">
                <p>The statements for {formatDay(year.from)} to {formatDay(hub.checkTo)}, ready to download as PDF for your AGM, auditor or annual return.</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                    {[
                        ["/reports/income-expenditure", "Income & Expenditure"],
                        ["/reports/financial-position", "Financial Position"],
                        ["/reports/receipts-payments", "Receipts & Payments"],
                        ["/reports/changes-in-funds", "Changes in Funds"],
                        ["/reports/schedules", "Schedules"],
                    ].map(([href, label]) => (
                        <li key={href}><Link href={`${href}?${period}`} className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{label}<ArrowRight className="h-4 w-4" /></Link></li>
                    ))}
                </ul>
            </Step>

            <Link href="/audit-log" className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm hover:border-indigo-300 dark:hover:border-indigo-800" data-testid="year-end-audit-link">
                <ScrollText className="h-4 w-4 text-indigo-600" />
                <span className="font-medium text-slate-900 dark:text-white">Audit log</span>
                <span className="text-slate-500">Who changed what, and when, for your auditor.</span>
                <ArrowRight className="ml-auto h-4 w-4 text-indigo-600" />
            </Link>
        </div>
    )
}
