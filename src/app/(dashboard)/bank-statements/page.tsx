import Link from "next/link"
import { Landmark, FileText } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { getCurrentUserRole, getOrganizationId } from "@/app/actions/document-utils"
import { getBankStatements } from "@/app/actions/bank-statements"
import { organizationIsPro } from "@/utils/plan"
import { FeatureLocked } from "@/components/ui/FeatureLocked"
import { BankStatementUpload } from "@/components/bank/BankStatementUpload"
import { StatementsPoller } from "@/components/bank/StatementsPoller"
import { DeleteStatementButton } from "@/components/bank/DeleteStatementButton"

export const dynamic = "force-dynamic"

export default async function BankStatementsPage() {
    // Paid plans only (same rule as Procurement and the Donor & Audit Memo)
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId || !(await organizationIsPro(supabase, organizationId))) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
                <FeatureLocked
                    title="Bank statements"
                    tagline="See which payments have paperwork, and which invoices are really paid."
                    heading="Bank Statement Import is a Growth feature"
                    features={[
                        "Upload a bank statement PDF and have its transactions read for you",
                        "Each payment is matched to an approved invoice or receipt, and you confirm it",
                        "Payments with no paperwork are flagged, and matched invoices can be marked paid on the real payment date",
                    ]}
                    context="bank_statements"
                    icon={<Landmark className="h-4 w-4" />}
                />
            </div>
        )
    }

    const [statements, role] = await Promise.all([getBankStatements(), getCurrentUserRole()])
    const canEdit = role === "Admin" || role === "Editor"
    const reading = statements.some((s) => s.status === "extracting")

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
            <StatementsPoller active={reading} />
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bank statements</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Match what left your bank account to the invoices and receipts you have approved.
                </p>
            </div>

            {canEdit && <BankStatementUpload />}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-3 font-medium">Statement</th>
                            <th className="px-4 py-3 font-medium">Period</th>
                            <th className="px-4 py-3 font-medium text-right">Payments out</th>
                            <th className="px-4 py-3 font-medium text-right">Matched</th>
                            <th className="px-4 py-3 font-medium text-right">Need attention</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {statements.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
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
                                <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                    {s.period_start && s.period_end ? `${s.period_start} to ${s.period_end}` : "—"}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">{s.status === "ready" ? s.money_out : "—"}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{s.status === "ready" ? s.matched : "—"}</td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {s.status === "ready" ? (
                                        <span className={s.needs_attention > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>{s.needs_attention}</span>
                                    ) : "—"}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    {s.status === "ready" && (
                                        <Link href={`/bank-statements/${s.id}`} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Open</Link>
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
