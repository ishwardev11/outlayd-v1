"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Ban, Download, Loader2, Paperclip, Pencil, Trash2, Wallet } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCurrency } from "@/components/CurrencyProvider"
import { deleteInvoice, deleteInvoicePayment, getInvoiceForPdf, recordInvoicePayment, voidInvoice, type InvoiceDetail } from "@/app/actions/invoices"
import { buildInvoiceContent } from "@/utils/invoice-document"
import { buildInvoicePdf } from "@/utils/invoice-pdf"
import type { EntryOptions } from "@/app/actions/transactions"
import { statusLabel } from "@/utils/invoices"
import { StatusBadge } from "./StatusBadge"
import { LockedNotice, useLock } from "@/components/LockProvider"
import { RecordHistory } from "@/components/audit/RecordHistory"
import { useRole } from "@/components/RoleProvider"
import { markUploadedBillPaid } from "@/app/actions/ledger"
import { DocumentOpener } from "@/components/ledger/DocumentOpener"

const selectClass = "h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

function todayLocal(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// One invoice: its lines and payments, and what can be done with it. canWrite: Admin or Editor on a paid plan.
export function InvoiceDetailDialog({ detail, options, canWrite, onClose, onEdit, onChanged }: {
    detail: InvoiceDetail
    options: EntryOptions
    canWrite: boolean
    onClose: () => void
    onEdit: () => void
    onChanged: () => void
}) {
    const router = useRouter()
    const { symbol } = useCurrency()
    const inv = detail.invoice
    const payable = inv.direction === "payable"
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const { isViewer } = useRole()
    const [mode, setMode] = useState<"view" | "pay" | "void" | "markPaid">("view")
    const [paidOn, setPaidOn] = useState(todayLocal())
    const [busy, setBusy] = useState(false)
    const [pay, setPay] = useState({ amount: inv.balance.toFixed(2), date: todayLocal(), account: options.accounts.find((a) => a.is_default)?.id ?? "", reference: "", remarks: "" })
    const [reason, setReason] = useState("")

    const lock = useLock()
    // An invoice dated in a locked period cannot change; it can still be paid after the lock date
    const locked = lock.isLocked(inv.issue_date)
    const fromBill = inv.source === "document"
    const canPay = canWrite && inv.status === "open" && inv.balance > 0
    const canEdit = canWrite && !fromBill && inv.status !== "void" && !locked
    const canVoid = canWrite && !fromBill && inv.status !== "void" && inv.paid === 0 && !locked
    const canDelete = canWrite && !fromBill && inv.status === "draft" && !inv.invoice_no && !locked
    const payDateLocked = lock.isLocked(pay.date)
    // A bill from an upload is paid through its document, on every plan (Admin or Editor). Paid plans can
    // also record part-payments with "Record payment".
    const canMarkPaid = fromBill && !isViewer && payable && inv.status === "open" && inv.balance > 0 && detail.document?.status === "awaiting_payment"
    const paidOnLocked = lock.isLocked(paidOn)
    const accountChoices = options.accounts.filter((a) => !a.archived)

    const run = async (fn: () => Promise<{ success: boolean; error?: string }>, done: string) => {
        setBusy(true)
        try {
            const res = await fn()
            if (!res.success) return toast.error(res.error ?? "Something went wrong")
            toast.success(done)
            setMode("view")
            onChanged()
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const title = `${payable ? "Bill" : "Invoice"}${inv.invoice_no ? ` ${inv.invoice_no}` : ""}`

    // Invoices you issue can be downloaded as a PDF (everyone who can see them, any plan)
    const downloadPdf = async () => {
        setBusy(true)
        try {
            const res = await getInvoiceForPdf(inv.id)
            if (!res.success || !res.data) return toast.error(res.success ? "That invoice was not found" : res.error)
            const name = (inv.invoice_no ?? "draft").replace(/[^A-Za-z0-9-]/g, "_")
            buildInvoicePdf(buildInvoiceContent(res.data.invoice, res.data.org)).save(`invoice-${name}.pdf`)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">{title} <StatusBadge status={inv.derived_status} /></DialogTitle>
                    <DialogDescription>
                        {payable ? "From" : "To"} {inv.payee_name} · dated {inv.issue_date}{inv.due_date ? ` · due ${inv.due_date}` : ""}
                        {inv.days_overdue > 0 ? ` · ${inv.days_overdue} days overdue` : ""}
                    </DialogDescription>
                </DialogHeader>

                {fromBill && (
                    <p className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 text-sm text-slate-600 dark:text-slate-300">
                        From an uploaded bill. Change the amounts, supplier or dates on the document; marking it paid records the payment here.{" "}
                        {detail.document && <DocumentOpener documentId={detail.document.id} label="Open the bill" className="text-indigo-600 hover:underline" />}
                    </p>
                )}
                {locked && canWrite && (
                    <LockedNotice text={`This ${payable ? "bill" : "invoice"} is in a locked period, so it cannot be changed or voided.${canPay ? " You can still record a payment dated after the lock." : ""} ${lock.message}`} />
                )}
                {inv.is_opening_balance && (
                    <p className="text-xs text-slate-500">Opening balance: owed from before you started using Outlayd. Not counted in income or expenditure.</p>
                )}
                {inv.status === "void" && (
                    <p className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-800 dark:text-red-300">
                        This invoice is void{inv.void_reason ? `: ${inv.void_reason}` : ""}. It stays on record and is not counted anywhere.
                    </p>
                )}

                <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Total</p><p className="font-semibold tabular-nums">{money(inv.total)}</p></div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Paid</p><p className="font-semibold tabular-nums">{money(inv.paid)}</p></div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Balance</p><p className="font-semibold tabular-nums" data-testid="invoice-balance">{money(inv.balance)}</p></div>
                </div>

                <div>
                    <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Lines</h3>
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Description</th><th className="py-1">Category</th><th className="py-1">Fund</th><th className="py-1 text-right">Amount</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {detail.lines.map((l, i) => (
                                <tr key={i}><td className="py-1.5">{l.description || "—"}</td><td className="py-1.5">{l.category_name}</td><td className="py-1.5">{l.fund_name}</td><td className="py-1.5 text-right tabular-nums">{money(l.amount)}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div>
                    <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Payments</h3>
                    {detail.payments.length === 0 ? (
                        <p className="text-sm text-slate-500">No payments yet.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {detail.payments.map((p) => (
                                    <tr key={p.transaction_id}>
                                        <td className="py-1.5">{p.date}</td>
                                        <td className="py-1.5">{p.reference ?? ""}{p.from_bill ? <span className="ml-1 text-xs text-slate-500">(bill marked paid)</span> : null}</td>
                                        <td className="py-1.5 text-right tabular-nums">{money(p.amount)}</td>
                                        <td className="py-1.5 text-right w-24">
                                            {canWrite && !p.from_bill && !lock.isLocked(p.date) && (
                                                <button type="button" className="text-xs text-red-600 hover:underline" disabled={busy}
                                                    onClick={() => { if (window.confirm("Delete this payment? The balance reopens.")) run(() => deleteInvoicePayment(p.transaction_id), "Payment deleted") }}>
                                                    Delete
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {inv.remarks && <p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-medium">Remarks:</span> {inv.remarks}</p>}
                {inv.has_attachment && (
                    <a href={`/api/files/invoice/${inv.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"><Paperclip className="h-3.5 w-3.5" />View attachment</a>
                )}

                {!fromBill && <RecordHistory recordId={inv.id} />}

                {mode === "pay" && (
                    <div className="space-y-3 rounded-lg border border-indigo-200 dark:border-indigo-900 p-4">
                        <h3 className="text-sm font-semibold">{payable ? "Record a payment of this bill" : "Record money received for this invoice"}</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label htmlFor="pay-amount">Amount ({symbol})</Label>
                                <Input id="pay-amount" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label htmlFor="pay-date">{payable ? "Date paid" : "Date received"}</Label>
                                <Input id="pay-date" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
                            {accountChoices.length > 1 && (
                                <div className="space-y-1.5"><Label htmlFor="pay-account">Account</Label>
                                    <select id="pay-account" className={selectClass} value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}>
                                        {accountChoices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select></div>
                            )}
                            <div className="space-y-1.5"><Label htmlFor="pay-ref">Reference (cheque or bank ref.)</Label>
                                <Input id="pay-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} maxLength={100} /></div>
                        </div>
                        <Textarea aria-label="Payment remarks" placeholder="Remarks (optional)" value={pay.remarks} onChange={(e) => setPay({ ...pay, remarks: e.target.value })} maxLength={500} rows={2} />
                        <p className="text-xs text-slate-500">Part-payments are fine. The payment is shared across the invoice&apos;s funds and categories in proportion.</p>
                        {payDateLocked && <LockedNotice text={`That date is in a locked period. ${lock.message}`} />}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setMode("view")} disabled={busy}>Cancel</Button>
                            <Button disabled={busy || payDateLocked} className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={() => run(() => recordInvoicePayment({ invoice_id: inv.id, amount: pay.amount, tx_date: pay.date, account_id: pay.account || null, reference: pay.reference, remarks: pay.remarks }), "Payment recorded")}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save payment
                            </Button>
                        </div>
                    </div>
                )}

                {mode === "markPaid" && (
                    <div className="space-y-3 rounded-lg border border-indigo-200 dark:border-indigo-900 p-4" data-testid="mark-paid-form">
                        <h3 className="text-sm font-semibold">Mark this bill as paid</h3>
                        <div className="space-y-1.5 max-w-xs"><Label htmlFor="paid-on">Date paid</Label>
                            <Input id="paid-on" type="date" value={paidOn} max={todayLocal()} onChange={(e) => setPaidOn(e.target.value)} /></div>
                        <p className="text-xs text-slate-500">
                            Records the {inv.paid > 0 ? `remaining ${money(inv.balance)}` : `full ${money(inv.total)}`} as paid from your main account on that day,
                            and the payment appears in Transactions.
                        </p>
                        {paidOnLocked && <LockedNotice text={`That date is in a locked period. ${lock.message}`} />}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setMode("view")} disabled={busy}>Cancel</Button>
                            <Button disabled={busy || paidOnLocked || !paidOn} className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={() => detail.document && run(() => markUploadedBillPaid(detail.document!.id, paidOn), "Bill marked as paid. The payment is in Transactions.")}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Mark as paid
                            </Button>
                        </div>
                    </div>
                )}

                {mode === "void" && (
                    <div className="space-y-3 rounded-lg border border-red-200 dark:border-red-900 p-4">
                        <p className="text-sm">The invoice stays on record marked void{inv.invoice_no ? ` and its number ${inv.invoice_no} is never reused` : ""}. It is no longer counted anywhere.</p>
                        <Textarea aria-label="Reason for voiding" placeholder="Reason, e.g. entered twice" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setMode("view")} disabled={busy}>Cancel</Button>
                            <Button disabled={busy || !reason.trim()} className="bg-red-600 hover:bg-red-700 text-white" onClick={() => run(() => voidInvoice(inv.id, reason), "Invoice voided")}>
                                Void invoice
                            </Button>
                        </div>
                    </div>
                )}

                {mode === "view" && (
                    <div className="flex flex-wrap justify-between gap-2 pt-2">
                        <div className="flex flex-wrap gap-2">
                            {canVoid && <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setMode("void")}><Ban className="h-4 w-4 mr-1" />Void</Button>}
                            {canDelete && (
                                <Button variant="ghost" className="text-red-600 hover:text-red-700" disabled={busy}
                                    onClick={() => { if (window.confirm("Delete this draft? This cannot be undone.")) run(async () => { const r = await deleteInvoice(inv.id); if (r.success) onClose(); return r }, "Draft deleted") }}>
                                    <Trash2 className="h-4 w-4 mr-1" />Delete draft
                                </Button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {!payable && <Button variant="outline" onClick={downloadPdf} disabled={busy}><Download className="h-4 w-4 mr-1" />Download PDF</Button>}
                            {canEdit && <Button variant="outline" onClick={onEdit}><Pencil className="h-4 w-4 mr-1" />Edit</Button>}
                            {canMarkPaid && (
                                <Button variant={canPay ? "outline" : "default"} className={canPay ? "" : "bg-indigo-600 hover:bg-indigo-700 text-white"} onClick={() => setMode("markPaid")} data-testid="mark-paid">
                                    <Wallet className="h-4 w-4 mr-1" />Mark as paid
                                </Button>
                            )}
                            {canPay && (
                                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setMode("pay")}>
                                    <Wallet className="h-4 w-4 mr-1" />Record payment
                                </Button>
                            )}
                            {!canPay && !canMarkPaid && inv.status === "open" && inv.balance > 0 && !canWrite && (
                                <span className="self-center text-xs text-slate-500" title={statusLabel(inv.derived_status)}>Only Admins and Editors on a paid plan can record payments.</span>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
