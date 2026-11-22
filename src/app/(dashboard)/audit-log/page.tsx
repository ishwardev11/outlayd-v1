import type { ReactNode } from "react"
import Link from "next/link"
import { getAuditLog } from "@/app/actions/audit"
import { getChanges } from "@/app/actions/assurance"
import { getOrganizationCurrency, getOrganizationTimezone } from "@/app/actions/document-utils"
import { getCurrencyDetails } from "@/utils/currency"
import { auditActionLabel, auditActorLabel } from "@/utils/audit"
import { AUDIT_KINDS, type AuditKind } from "@/utils/audit-changes"
import { isIsoDay } from "@/utils/lock"
import { ChangeList } from "@/components/audit/ChangeList"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

function one(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v
}

export default async function AuditLogPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const view = one(params.view) === "documents" ? "documents" : "records"
    const page = Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1)
    const kindParam = one(params.kind)
    const kind = AUDIT_KINDS.some((k) => k.value === kindParam) ? (kindParam as AuditKind) : null
    const from = isIsoDay(one(params.from)) ? (one(params.from) as string) : ""
    const to = isIsoDay(one(params.to)) ? (one(params.to) as string) : ""

    const link = (overrides: Record<string, string | number | null>) => {
        const q = new URLSearchParams()
        const merged: Record<string, string | number | null> = { view, kind, from: from || null, to: to || null, page, ...overrides }
        for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && !(k === "page" && v === 1) && !(k === "view" && v === "records")) q.set(k, String(v))
        const s = q.toString()
        return s ? `/audit-log?${s}` : "/audit-log"
    }

    const tab = (id: "records" | "documents", label: string) => (
        <Link href={id === "records" ? "/audit-log" : "/audit-log?view=documents"}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${view === id ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
            {label}
        </Link>
    )

    let body: ReactNode
    let totalPages = 1
    if (view === "records") {
        const { rows, total } = await getChanges({ kinds: kind ? [kind] : [], from, to, page, limit: PAGE_SIZE })
        totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
        const field = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"
        body = (
            <>
                <form method="get" action="/audit-log" className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="text-xs text-slate-500">Record type<br />
                        <select name="kind" defaultValue={kind ?? ""} className={field} aria-label="Record type">
                            <option value="">Everything</option>
                            {AUDIT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </select>
                    </label>
                    <label className="text-xs text-slate-500">From<br /><input type="date" name="from" defaultValue={from} className={field} aria-label="From" /></label>
                    <label className="text-xs text-slate-500">To<br /><input type="date" name="to" defaultValue={to} className={field} aria-label="To" /></label>
                    <button type="submit" className="h-9 px-4 rounded-md bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700">Show</button>
                    {(kind || from || to) && <Link href="/audit-log" className="h-9 inline-flex items-center text-sm text-slate-500 hover:underline">Clear</Link>}
                </form>
                <div className="mt-4">
                    <ChangeList rows={rows} empty={kind || from || to ? "No changes match these filters." : "Nothing recorded yet. Changes to money in and out, invoices, assets, reconciliations and the lock will appear here."} />
                </div>
            </>
        )
    } else {
        const [{ entries, total }, currency, timeZone] = await Promise.all([
            getAuditLog(page, PAGE_SIZE),
            getOrganizationCurrency(),
            getOrganizationTimezone(),
        ])
        totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
        const symbol = getCurrencyDetails(currency).symbol
        const formatWhen = (iso: string) =>
            new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso))
        const formatAmount = (n: number | string | null | undefined) =>
            n === null || n === undefined || n === ""
                ? "—"
                : `${symbol}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        body = (
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
        )
    }

    return (
        <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit log</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Who changed what, and when. Entries are recorded automatically and cannot be edited or removed.
            </p>
            <div className="mt-4 flex gap-2">
                {tab("records", "Money & records")}
                {tab("documents", "Documents")}
            </div>

            {body}

            {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        {page > 1 && (
                            <Link href={link({ page: page - 1 })} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                                Newer
                            </Link>
                        )}
                        {page < totalPages && (
                            <Link href={link({ page: page + 1 })} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                                Older
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
