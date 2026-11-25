"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Paperclip, Plus, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCurrency } from "@/components/CurrencyProvider"
import { saveInvoice, type InvoiceDetail } from "@/app/actions/invoices"
import { createPayee } from "@/app/actions/ledger"
import type { EntryOptions } from "@/app/actions/transactions"
import { linesTotal, parseAmount } from "@/utils/transaction-input"
import { INVOICE_MAX_LINES, type InvoiceDirection } from "@/utils/invoices"
import { errorMessage } from "@/utils/row-types"
import { LockedNotice, useLock } from "@/components/LockProvider"
import { formatDay } from "@/utils/lock"

const selectClass = "h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white disabled:opacity-60"
const NEW_PAYEE = "__new__"

interface Line { key: number; description: string; amount: string; fundId: string; categoryId: string }

function todayLocal(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Create or edit a manual invoice (spec 3.8, 5.4): a bill to pay, or an invoice you issue. The
// database checks everything again; a receivable invoice gets its number when it is first opened.
export function InvoiceDialog({ open, onOpenChange, direction, options, edit, onSaved }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    direction: InvoiceDirection
    options: EntryOptions
    edit?: InvoiceDetail | null
    onSaved?: (id: string) => void
}) {
    const router = useRouter()
    const { symbol } = useCurrency()
    const inv = edit?.invoice
    const payable = direction === "payable"
    const defaultFund = options.funds.find((f) => f.is_default)?.id ?? options.funds.find((f) => !f.archived)?.id ?? ""

    const [payeeId, setPayeeId] = useState(inv?.payee_id ?? "")
    const [newPayee, setNewPayee] = useState("")
    const [invoiceNo, setInvoiceNo] = useState(inv?.invoice_no ?? "")
    const [issueDate, setIssueDate] = useState(inv?.issue_date ?? todayLocal())
    const [dueDate, setDueDate] = useState(inv?.due_date ?? "")
    const [reference, setReference] = useState(inv?.reference ?? "")
    const [remarks, setRemarks] = useState(inv?.remarks ?? "")
    const [opening, setOpening] = useState(inv?.is_opening_balance ?? false)
    const [lines, setLines] = useState<Line[]>(edit && edit.lines.length > 0
        ? edit.lines.map((l, i) => ({ key: i, description: l.description ?? "", amount: String(l.amount), fundId: l.fund_id, categoryId: l.category_id }))
        : [{ key: 0, description: "", amount: "", fundId: defaultFund, categoryId: "" }])
    const [file, setFile] = useState<File | null>(null)
    const [removeAttachment, setRemoveAttachment] = useState(false)
    const [saving, setSaving] = useState(false)
    const lock = useLock()
    const dateLocked = lock.isLocked(issueDate) || lock.isLocked(inv?.issue_date)

    const paid = inv?.paid ?? 0
    const numbered = !payable && !!inv?.invoice_no
    // A bill uses expense categories; an invoice you issue uses income categories. Archived ones only when already chosen.
    const categoryChoices = useMemo(() => {
        const chosen = new Set(lines.map((l) => l.categoryId))
        return options.categories.filter((c) => c.kind === (payable ? "expense" : "income") && (!c.archived || chosen.has(c.id)))
    }, [options.categories, lines, payable])
    const fundChoices = options.funds.filter((f) => !f.archived || lines.some((l) => l.fundId === f.id))
    const payeeChoices = options.payees.filter((p) => (!p.archived || p.id === payeeId) && !p.is_system)
    const total = linesTotal(lines.map((l) => ({ amount: parseAmount(l.amount) ?? 0 })))

    const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    const addLine = () => setLines((ls) => [...ls, { key: Math.max(...ls.map((l) => l.key)) + 1, description: "", amount: "", fundId: defaultFund, categoryId: "" }])
    const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key))

    const submit = async (status: "draft" | "open") => {
        if (lines.some((l) => parseAmount(l.amount) === null)) return toast.error("Enter an amount above zero on every line")
        if (lines.some((l) => !l.categoryId)) return toast.error("Choose a category for every line")
        if (paid > 0 && total < paid) return toast.error(`The total cannot be less than what has been paid (${symbol}${paid.toFixed(2)})`)
        setSaving(true)
        try {
            let chosen = payeeId
            if (chosen === NEW_PAYEE) {
                const name = newPayee.trim()
                if (!name) return toast.error(payable ? "Enter the supplier's name" : "Enter the customer's name")
                const created = await createPayee(name, payable ? "vendor" : "customer")
                chosen = (created as { id: string }).id
            }
            if (!chosen) return toast.error(payable ? "Choose the supplier" : "Choose who the invoice is for")
            const fd = new FormData()
            fd.set("payload", JSON.stringify({
                id: inv?.id ?? null, direction, status, payee_id: chosen, invoice_no: payable ? invoiceNo : null,
                issue_date: issueDate, due_date: dueDate || null, reference, remarks, is_opening_balance: opening,
                lines: lines.map((l) => ({ description: l.description, amount: l.amount, fund_id: l.fundId || null, category_id: l.categoryId })),
            }))
            if (file) fd.set("file", file)
            if (removeAttachment) fd.set("removeAttachment", "1")
            const res = await saveInvoice(fd)
            if (!res.success || !res.data) return toast.error(res.success ? "Could not save the invoice" : res.error)
            toast.success(status === "draft" ? "Draft saved" : inv ? "Invoice updated" : payable ? "Bill saved" : "Invoice saved")
            onOpenChange(false)
            onSaved?.(res.data.id)
            router.refresh()
        } catch (e) {
            toast.error(errorMessage(e) || "Could not save. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    const title = inv ? `Edit ${payable ? "bill" : `invoice${inv.invoice_no ? ` ${inv.invoice_no}` : ""}`}` : payable ? "New bill" : "New invoice"
    // A draft can stay a draft; anything opened, paid or numbered can only be saved as open
    const canDraft = !inv || (inv.status === "draft" && paid === 0 && !numbered)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {payable
                            ? "A bill you owe a supplier and have not paid yet. Bills from uploads are created automatically when you approve them."
                            : "An invoice you send to someone who owes you money. It gets the next invoice number when you save it as open."}
                    </DialogDescription>
                </DialogHeader>

                <fieldset disabled={saving} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="inv-payee">{payable ? "Supplier" : "Bill to"}</Label>
                            <select id="inv-payee" className={selectClass} value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
                                <option value="">Choose…</option>
                                <option value={NEW_PAYEE}>+ New {payable ? "supplier" : "customer"}…</option>
                                {payeeChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {payeeId === NEW_PAYEE && (
                                <Input aria-label="New contact name" placeholder="Name" value={newPayee} onChange={(e) => setNewPayee(e.target.value)} maxLength={255} />
                            )}
                        </div>
                        {payable && (
                            <div className="space-y-1.5">
                                <Label htmlFor="inv-no">Supplier&apos;s invoice number</Label>
                                <Input id="inv-no" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={100} />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="inv-ref">Reference / PO</Label>
                            <Input id="inv-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="inv-issue">Invoice date</Label>
                            <Input id="inv-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="inv-due">Due date (optional)</Label>
                            <Input id="inv-due" type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Lines</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={lines.length >= INVOICE_MAX_LINES}><Plus className="h-3.5 w-3.5 mr-1" />Add line</Button>
                        </div>
                        {lines.map((l) => (
                            <div key={l.key} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_7rem_auto] items-center">
                                <Input aria-label="Line description" placeholder="Description" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} maxLength={300} />
                                <select aria-label="Category" className={selectClass} value={l.categoryId} onChange={(e) => setLine(l.key, { categoryId: e.target.value })}>
                                    <option value="">Category…</option>
                                    {categoryChoices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? " (archived)" : ""}</option>)}
                                </select>
                                <select aria-label="Fund" className={selectClass} value={l.fundId} onChange={(e) => setLine(l.key, { fundId: e.target.value })}>
                                    {fundChoices.map((f) => <option key={f.id} value={f.id}>{f.name}{f.archived ? " (archived)" : ""}</option>)}
                                </select>
                                <Input aria-label="Line amount" inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} />
                                {lines.length > 1
                                    ? <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeLine(l.key)} aria-label="Remove line"><Trash2 className="h-4 w-4" /></Button>
                                    : <span />}
                            </div>
                        ))}
                        <p className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">Total {symbol}{total.toFixed(2)}</p>
                        {paid > 0 && <p className="text-right text-xs text-slate-500">{symbol}{paid.toFixed(2)} has already been paid, so the total cannot go below that.</p>}
                        {categoryChoices.length === 0 && (
                            <p className="text-sm text-amber-700">No {payable ? "expense" : "income"} categories yet. Add them under Settings, Funds &amp; Categories.</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="inv-remarks">Remarks</Label>
                        <Textarea id="inv-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} rows={2} />
                        <p className="text-xs text-slate-500 text-right">{remarks.length}/500</p>
                    </div>

                    <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" className="mt-1" checked={opening} onChange={(e) => setOpening(e.target.checked)} />
                        <span>
                            <span className="font-medium text-slate-900 dark:text-white">Owed from before you started using Outlayd</span>
                            <span className="block text-slate-500 dark:text-slate-400">An opening balance: it shows as owed, but it is not counted in this year&apos;s income or expenditure, and neither is its payment.</span>
                        </span>
                    </label>

                    <div className="space-y-1.5">
                        <Label htmlFor="inv-file">Attachment (optional)</Label>
                        {inv?.has_attachment && !removeAttachment && !file && (
                            <div className="flex items-center gap-3 text-sm">
                                <a href={`/api/files/invoice/${inv.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><Paperclip className="h-3.5 w-3.5" />View attachment</a>
                                <button type="button" className="text-red-600 hover:underline" onClick={() => setRemoveAttachment(true)}>Remove</button>
                            </div>
                        )}
                        <Input id="inv-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </div>
                </fieldset>

                {dateLocked && <LockedNotice text={`${formatDay(issueDate)} is in a locked period. ${lock.message}`} />}
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    {canDraft && <Button type="button" variant="outline" onClick={() => submit("draft")} disabled={saving || dateLocked}>Save as draft</Button>}
                    <Button type="button" onClick={() => submit("open")} disabled={saving || dateLocked} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{inv && inv.status !== "draft" ? "Save" : payable ? "Save bill" : "Save and number"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
