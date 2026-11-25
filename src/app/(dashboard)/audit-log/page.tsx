import type { Metadata } from "next"
import Link from "next/link"
import { getAuditActors, getChanges } from "@/app/actions/assurance"
import { AUDIT_KINDS, type AuditKind } from "@/utils/audit-changes"
import { isIsoDay } from "@/utils/lock"
import { ChangeList } from "@/components/audit/ChangeList"

export const metadata: Metadata = { title: "Audit log" }

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

function one(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v
}

// One audit log (simplification step 5): every change to money in and out, bills and invoices, assets,
// transfers, reconciliations, the lock and opening balances, and uploaded documents (approved, paid,
// deleted), newest first in one timeline. Open to every plan, as before.
export default async function AuditLogPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const page = Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1)
    // The old "Documents" tab (?view=documents) is now the "Uploaded documents" record type
    const kindParam = one(params.kind) ?? (one(params.view) === "documents" ? "documents" : undefined)
    const kind = AUDIT_KINDS.some((k) => k.value === kindParam) ? (kindParam as AuditKind) : null
    const from = isIsoDay(one(params.from)) ? (one(params.from) as string) : ""
    const to = isIsoDay(one(params.to)) ? (one(params.to) as string) : ""
    const userParam = (one(params.user) ?? "").trim()

    const [actors, { rows, total }] = await Promise.all([
        getAuditActors(),
        getChanges({ kinds: kind ? [kind] : [], from, to, page, limit: PAGE_SIZE, actor: userParam || null }),
    ])
    const user = userParam === "System" || actors.includes(userParam.toLowerCase()) ? userParam : ""
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const filtered = !!(kind || from || to || user)

    const link = (overrides: Record<string, string | number | null>) => {
        const q = new URLSearchParams()
        const merged: Record<string, string | number | null> = { kind, user: user || null, from: from || null, to: to || null, page, ...overrides }
        for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && !(k === "page" && v === 1)) q.set(k, String(v))
        const s = q.toString()
        return s ? `/audit-log?${s}` : "/audit-log"
    }
    const field = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

    return (
        <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit log</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Who changed what, and when: money in and out, bills and invoices, assets, reconciliations, the lock and uploaded
                documents, newest first. Entries are recorded automatically and cannot be edited or removed.
            </p>

            <form method="get" action="/audit-log" className="mt-4 flex flex-wrap items-end gap-3" data-testid="audit-filters">
                <label className="text-xs text-slate-500">Record type<br />
                    <select name="kind" defaultValue={kind ?? ""} className={field} aria-label="Record type">
                        <option value="">Everything</option>
                        {AUDIT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                </label>
                <label className="text-xs text-slate-500">User<br />
                    <select name="user" defaultValue={user} className={field} aria-label="User">
                        <option value="">Everyone</option>
                        {actors.map((a) => <option key={a} value={a}>{a}</option>)}
                        <option value="System">System (automatic)</option>
                    </select>
                </label>
                <label className="text-xs text-slate-500">From<br /><input type="date" name="from" defaultValue={from} className={field} aria-label="From" /></label>
                <label className="text-xs text-slate-500">To<br /><input type="date" name="to" defaultValue={to} className={field} aria-label="To" /></label>
                <button type="submit" className="h-9 px-4 rounded-md bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700">Show</button>
                {filtered && <Link href="/audit-log" className="h-9 inline-flex items-center text-sm text-slate-500 hover:underline">Clear</Link>}
            </form>

            <div className="mt-4" data-testid="audit-timeline">
                <ChangeList rows={rows} empty={filtered
                    ? "No changes match these filters."
                    : "Nothing recorded yet. Changes to money in and out, bills and invoices, assets, reconciliations, the lock and uploaded documents will appear here."} />
            </div>

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
