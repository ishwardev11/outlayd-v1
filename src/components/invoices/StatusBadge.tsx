import { displayStatusLabel, isPaidReceiptMissing, type DerivedStatus, type InvoiceDirection } from "@/utils/invoices"

const STYLES: Record<DerivedStatus, string> = {
    draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    open: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    part_paid: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    overdue: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    void: "bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400",
}

// Paid, part-paid and overdue are worked out from the payments and today's date, never stored
// An invoice you issued that is paid but still has a payment without its receipt shows amber
// "Paid · receipt missing": it is not closed until every receipt is attached.
export function StatusBadge({ status, direction = "payable", receiptsMissing = 0 }: { status: DerivedStatus; direction?: InvoiceDirection; receiptsMissing?: number }) {
    const row = { direction, derived_status: status, receipts_missing: receiptsMissing }
    const style = isPaidReceiptMissing(row) ? STYLES.part_paid : STYLES[status]
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`} data-testid="invoice-status">{displayStatusLabel(row)}</span>
}
