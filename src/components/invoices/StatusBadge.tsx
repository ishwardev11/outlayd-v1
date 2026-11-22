import { statusLabel, type DerivedStatus } from "@/utils/invoices"

const STYLES: Record<DerivedStatus, string> = {
    draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    open: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    part_paid: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    overdue: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    void: "bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400",
}

// Paid, part-paid and overdue are worked out from the payments and today's date, never stored
export function StatusBadge({ status }: { status: DerivedStatus }) {
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>{statusLabel(status)}</span>
}
