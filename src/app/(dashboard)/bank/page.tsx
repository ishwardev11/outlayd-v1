import Link from "next/link"
import { Landmark, FileText } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { getCurrentUserRole, getOrganizationId } from "@/app/actions/document-utils"
import { getBankStatements } from "@/app/actions/bank-statements"
import { getReconciliationPage } from "@/app/actions/assurance"
import { getPlanState } from "@/utils/plan"
import { ReadOnlyPlanBanner } from "@/components/ui/ReadOnlyPlanBanner"
import { FeatureLocked } from "@/components/ui/FeatureLocked"
import { BankStatementUpload } from "@/components/bank/BankStatementUpload"
import { StatementsPoller } from "@/components/bank/StatementsPoller"
import { DeleteStatementButton } from "@/components/bank/DeleteStatementButton"
import { ReconciliationsClient } from "@/components/reconciliations/ReconciliationsClient"

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// One Bank page (simplification step 3): imported statements and their matching, and the month-end
// reconciliation of each account. Same plan and role rules as the two pages it replaces.
export default async function BankPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const sp = await searchParams
    const tab = first(sp.tab) === "reconciliation" ? "reconciliation" : "statements"

    const tabLink = (key: typeof tab, href: string, label: string) => (
        <Link
            href={href}
            aria-current={tab === key ? "page" : undefined}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${tab === key
                ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-cyan-400 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"}`}
        >
            {label}
        </Link>
    )

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bank</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Match your bank statements to what you recorded, then check each account at month-end.
                </p>
            </div>
            <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800 pb-2" aria-label="Bank">
                {tabLink("statements", "/bank", "Statements")}
                {tabLink("reconciliation", "/bank?tab=reconciliation", "Month-end reconciliation")}
            </nav>
            {tab === "reconciliation" ? <ReconciliationTab month={first(sp.month) ?? null} /> : <StatementsTab />}
        </div>
    )
}

// Everyone in the organisation can see reconciliations; recording needs Admin or Editor on a paid plan,
// checked again in the database
async function ReconciliationTab({ month }: { month: string | null }) {
    const data = await getReconciliationPage(month)
    return data ? <ReconciliationsClient data={data} /> : <p className="text-slate-500">No active organisation.</p>
}

async function StatementsTab() {
    // Paid plans use bank statements. A downgraded organisation keeps read-only access to the
    // statements it already has; with none, it sees the same locked screen as a free organisation.
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    const plan = await getPlanState(supabase, organizationId)
    const statements = plan.paid || plan.hasBeenPaid ? await getBankStatements() : []
    if (!organizationId || (!plan.paid && statements.length === 0)) {
        return (
            <FeatureLocked
                title="Bank statements"
                tagline="See which payments have paperwork, and which invoices are really paid."
                heading="Bank Statement Import is a Growth feature"
                features={[
                    "Upload a bank statement PDF and have its transactions read for you",
                    "Each line is matched to an invoice, receipt or cash book entry, and you confirm it",
                    "Lines with nothing behind them are flagged, and can be recorded as money in or out in one step",
                ]}
                context="bank_statements"
                icon={<Landmark className="h-4 w-4" />}
            />
        )
    }

    const role = await getCurrentUserRole()
    const canEdit = (role === "Admin" || role === "Editor") && plan.paid
    const reading = statements.some((s) => s.status === "extracting")
    const { data: accounts } = canEdit
        ? await supabase.from("accounts").select("id, name, is_default").eq("organization_id", organizationId).is("archived_at", null).order("name")
        : { data: [] as { id: string; name: string; is_default: boolean }[] }

    return (
        <div className="space-y-6">
            <StatementsPoller active={reading} />
            {!plan.paid && <ReadOnlyPlanBanner feature="Bank statements" />}
            {canEdit && <BankStatementUpload accounts={(accounts ?? []) as { id: string; name: string; is_default: boolean }[]} />}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-3 font-medium">Statement</th>
                            <th className="px-4 py-3 font-medium">Account</th>
                            <th className="px-4 py-3 font-medium">Period</th>
                            <th className="px-4 py-3 font-medium text-right">Lines</th>
                            <th className="px-4 py-3 font-medium text-right">Matched</th>
                            <th className="px-4 py-3 font-medium text-right">Need attention</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {statements.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                                    No statements yet. Upload a PDF to get started.
                                </td>
                            </tr>
                        )}
                        {statements.map((s) => (
                            <tr key={s.id}>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                                        {s.bank_name || s.file_name || "Bank statement"}
                                        {s.account_last4 && <span className="text-slate-500 dark:text-slate-400 font-normal">•••• {s.account_last4}</span>}
                                    </div>
                                    {s.status === "extracting" && <div className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">Reading the statement… this takes under a minute.</div>}
                                    {s.status === "failed" && <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">{s.error_message || "This statement could not be read."}</div>}
                                    {s.status === "ready" && s.warning && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">Check this statement: it may be incomplete.</div>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{s.account_name ?? "—"}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                    {s.period_start && s.period_end ? `${s.period_start} to ${s.period_end}` : "—"}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">{s.status === "ready" ? s.line_count : "—"}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{s.status === "ready" ? s.matched : "—"}</td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {s.status === "ready" ? (
                                        <span className={s.needs_attention > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>{s.needs_attention}</span>
                                    ) : "—"}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    {s.status === "ready" && (
                                        <Link href={`/bank/${s.id}`} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Open</Link>
                                    )}
                                    {s.status === "failed" && canEdit && <DeleteStatementButton id={s.id} />}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
