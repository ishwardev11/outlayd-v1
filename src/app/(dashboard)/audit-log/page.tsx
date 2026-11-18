import Link from "next/link"
import { getAuditLog } from "@/app/actions/audit"
import { getOrganizationCurrency, getOrganizationTimezone } from "@/app/actions/document-utils"
import { getCurrencyDetails } from "@/utils/currency"
import { auditActionLabel, auditActorLabel } from "@/utils/audit"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

export default async function AuditLogPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const rawPage = Array.isArray(params.page) ? params.page[0] : params.page
    const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1)

    const [{ entries, total }, currency, timeZone] = await Promise.all([
        getAuditLog(page, PAGE_SIZE),
        getOrganizationCurrency(),
        getOrganizationTimezone(),
    ])
    const symbol = getCurrencyDetails(currency).symbol
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    const formatWhen = (iso: string) =>
        new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso))
    const formatAmount = (n: number | string | null | undefined) =>
        n === null || n === undefined || n === ""
            ? "—"
            : `${symbol}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    return (
        <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit log</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Who approved, paid and deleted documents, and when. Entries are recorded automatically and cannot be edited or removed.
            </p>

            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-3 font-medium">When</th>
                            <th className="px-4 py-3 font-medium">Who</th>
                            <th className="px-4 py-3 font-medium">Action</th>
                            <th className="px-4 py-3 font-medium">Document</th>
                            <th className="px-4 py-3 font-medium text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {entries.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                                    Nothing recorded yet. Approvals, payments and deletions will appear here.
                                </td>
                            </tr>
                        )}
                        {entries.map((e) => (
                            <tr key={e.id}>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatWhen(e.created_at)}</td>
                                <td className="px-4 py-3">
                                    <div className="font-medium text-slate-900 dark:text-slate-100">{auditActorLabel(e)}</div>
                                    {e.actor_role && <div className="text-xs text-slate-500 dark:text-slate-400">{e.actor_role}</div>}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{auditActionLabel(e.action)}</td>
                                <td className="px-4 py-3">
                                    <div className="text-slate-900 dark:text-slate-100">{e.details?.vendor_name || "Unknown vendor"}</div>
                                    {e.details?.invoice_number && (
                                        <div className="text-xs text-slate-500 dark:text-slate-400">{e.details.invoice_number}</div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatAmount(e.details?.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        {page > 1 && (
                            <Link href={`/audit-log?page=${page - 1}`} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                                Newer
                            </Link>
                        )}
                        {page < totalPages && (
                            <Link href={`/audit-log?page=${page + 1}`} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                                Older
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
