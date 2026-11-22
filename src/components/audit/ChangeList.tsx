import type { HistoryRow } from "@/app/actions/assurance"

// The change history as a list: what record, what happened, the values that changed, who and when.
// Used by the Audit log page and the History panels (no client code, so it renders anywhere).
export function ChangeList({ rows, empty, compact = false }: { rows: HistoryRow[]; empty: string; compact?: boolean }) {
    if (rows.length === 0) {
        return <p className={`text-sm text-slate-500 dark:text-slate-400 ${compact ? "" : "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-10 text-center"}`}>{empty}</p>
    }
    return (
        <ul className={`divide-y divide-slate-100 dark:divide-slate-800 ${compact ? "" : "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}>
            {rows.map((r, i) => (
                <li key={i} className={compact ? "py-2" : "px-4 py-3"}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <div className="text-sm">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{r.action}</span>
                            {!compact && <span className="text-slate-700 dark:text-slate-300"> · {r.record}</span>}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.when} · {r.who}</div>
                    </div>
                    {r.details.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                            {r.details.map((d, j) => <li key={j} className="break-words">{d}</li>)}
                        </ul>
                    )}
                    {r.reason && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Reason: {r.reason}</p>}
                </li>
            ))}
        </ul>
    )
}
