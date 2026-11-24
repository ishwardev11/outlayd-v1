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
import { deleteMoneyIn, recordMoneyOut, saveMoneyIn, type EntryOptions } from "@/app/actions/transactions"
import { createPayee } from "@/app/actions/ledger"
import { linesTotal, parseAmount } from "@/utils/transaction-input"
import { errorMessage } from "@/utils/row-types"
import { LockedNotice, useLock } from "@/components/LockProvider"
import { formatDay } from "@/utils/lock"

const selectClass = "h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white disabled:opacity-60"
const TYPED = "__typed__"

export interface MoneyInEdit {
    id: string
    tx_date: string
    account_id: string
    payee_id: string | null
    payee_name: string
    reference: string
    remarks: string
    is_refund: boolean
    has_attachment: boolean
    has_receipt: boolean
    lines: { amount: number; fund_id: string; category_id: string }[]
}

interface Line { key: number; amount: string; fundId: string; categoryId: string }

function todayLocal(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Money in or money out (spec 5.3). Money in is saved as a transaction; money out as a paid document
// with no file, so existing reports include it. The database checks everything again.
export function TransactionDialog({ open, onOpenChange, mode, options, edit, readOnly = false, prefill, onSaved }: {
    readOnly?: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
    mode: "in" | "out"
    options: EntryOptions
    edit?: MoneyInEdit | null
    // A new entry started from a bank statement line: its date, amount, reference and account filled in
    prefill?: { date: string; amount: string; reference?: string; payeeName?: string; accountId?: string | null } | null
    // Called after a save with what was created: money in is an entry, money out a paid document
    onSaved?: (saved: { kind: "transaction" | "document"; id: string }) => void | Promise<void>
}) {
    const router = useRouter()
    const { symbol } = useCurrency()
    const defaultFund = options.funds.find((f) => f.is_default)?.id ?? options.funds.find((f) => !f.archived)?.id ?? ""
    const defaultAccount = options.accounts.find((a) => a.is_default)?.id ?? ""
    const anonymous = options.payees.find((p) => p.is_system && p.name === "Anonymous donor")?.id ?? ""

    const editCategory = edit ? options.categories.find((c) => c.id === edit.lines[0]?.category_id) : undefined
    const [date, setDate] = useState(edit?.tx_date ?? prefill?.date ?? todayLocal())
    const [incomeKind, setIncomeKind] = useState<"donation" | "other">(editCategory && editCategory.kind === "income" && editCategory.nature !== "donation" ? "other" : "donation")
    const [isRefund, setIsRefund] = useState(edit?.is_refund ?? false)
    const [payeeChoice, setPayeeChoice] = useState<string>(edit ? (edit.payee_id ?? TYPED) : prefill?.payeeName ? TYPED : mode === "in" && anonymous ? anonymous : TYPED)
    const [payeeName, setPayeeName] = useState(edit && !edit.payee_id ? edit.payee_name : prefill?.payeeName ?? "")
    const [savePayee, setSavePayee] = useState(false)
    const [accountId, setAccountId] = useState(edit?.account_id ?? prefill?.accountId ?? defaultAccount)
    const [reference, setReference] = useState(edit?.reference ?? prefill?.reference ?? "")
    const [remarks, setRemarks] = useState(edit?.remarks ?? "")
    const [total, setTotal] = useState(edit ? String(edit.lines.reduce((s, l) => s + l.amount, 0)) : prefill?.amount ?? "")
    const [lines, setLines] = useState<Line[]>(edit && edit.lines.length > 0
        ? edit.lines.map((l, i) => ({ key: i, amount: String(l.amount), fundId: l.fund_id, categoryId: l.category_id }))
        : [{ key: 0, amount: "", fundId: defaultFund, categoryId: "" }])
    const [file, setFile] = useState<File | null>(null)
    const [removeAttachment, setRemoveAttachment] = useState(false)
    const [saving, setSaving] = useState(false)

    const lock = useLock()
    // An entry dated in a locked period cannot change; a new one cannot be dated there
    const entryLocked = !readOnly && lock.isLocked(edit?.tx_date)
    const periodLocked = entryLocked || (!readOnly && lock.isLocked(date))
    const locked = !!edit?.has_receipt || readOnly || entryLocked
    const split = lines.length > 1

    // Categories offered: money in uses income categories filtered by Donation / Other income (or
    // expense categories for a refund); money out uses expense categories. Archived ones only when
    // already chosen on this entry.
    const categoryChoices = useMemo(() => {
        const chosen = new Set(lines.map((l) => l.categoryId))
        return options.categories.filter((c) => {
            if (c.archived && !chosen.has(c.id)) return false
            if (mode === "out" || isRefund) return c.kind === "expense"
            if (c.kind !== "income") return false
            return incomeKind === "donation" ? c.nature === "donation" : c.nature !== "donation"
        })
    }, [options.categories, lines, mode, isRefund, incomeKind])
    const fundChoices = options.funds.filter((f) => !f.archived || lines.some((l) => l.fundId === f.id))
    const accountChoices = options.accounts.filter((a) => !a.archived || a.id === accountId)
    const payeeChoices = useMemo(() => {
        const list = options.payees.filter((p) => !p.archived || p.id === payeeChoice)
        // Donors first when recording a donation
        return mode === "in" && incomeKind === "donation" && !isRefund
            ? [...list.filter((p) => p.payee_type === "donor"), ...list.filter((p) => p.payee_type !== "donor")]
            : list
    }, [options.payees, payeeChoice, mode, incomeKind, isRefund])

    const totalNum = parseAmount(total) ?? 0
    const lineAmounts = split ? lines.map((l) => parseAmount(l.amount) ?? 0) : [totalNum]
    const allocated = linesTotal(lineAmounts.map((amount) => ({ amount })))
    const unallocated = Math.round((totalNum - allocated) * 100) / 100

    const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    const addLine = () => setLines((ls) => {
        const next = [...ls]
        // Turning one line into a split: the first line keeps the full amount to start from
        if (next.length === 1) next[0] = { ...next[0], amount: total }
        return [...next, { key: Math.max(...ls.map((l) => l.key)) + 1, amount: "", fundId: defaultFund, categoryId: "" }]
    })
    const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key))

    const switchKind = (patch: () => void) => {
        patch()
        // The category list changes, so clear choices that no longer fit
        setLines((ls) => ls.map((l) => ({ ...l, categoryId: "" })))
    }

    const submit = async () => {
        if (totalNum <= 0) return toast.error("Enter the total amount")
        if (split && unallocated !== 0) return toast.error(`The lines must add up to the total. ${unallocated < 0 ? `Over-allocated by ${symbol}${Math.abs(unallocated).toFixed(2)}` : `Unallocated: ${symbol}${unallocated.toFixed(2)}`}`)
        if (lines.some((l) => !l.categoryId)) return toast.error("Choose a category for every line")
        const outLines = lines.map((l, i) => ({ amount: split ? l.amount : String(lineAmounts[i]), fund_id: l.fundId || null, category_id: l.categoryId }))

        setSaving(true)
        try {
            let payeeId: string | null = payeeChoice && payeeChoice !== TYPED ? payeeChoice : null
            const typedName = payeeChoice === TYPED ? payeeName.trim() : ""
            if (!payeeId && typedName && savePayee) {
                const created = await createPayee(typedName, mode === "in" && !isRefund ? (incomeKind === "donation" ? "donor" : "other") : "vendor")
                payeeId = (created as { id: string }).id
            }
            const payeeLabel = payeeId ? options.payees.find((p) => p.id === payeeId)?.name ?? typedName : typedName

            if (mode === "out") {
                const res = await recordMoneyOut({ tx_date: date, payee_id: payeeId, payee_name: payeeLabel, reference, remarks, lines: outLines })
                if (!res.success) return toast.error(res.error)
                toast.success("Payment recorded")
                if (onSaved && res.data) await onSaved({ kind: "document", id: res.data.documentId })
            } else {
                const fd = new FormData()
                fd.set("payload", JSON.stringify({
                    id: edit?.id ?? null, tx_date: date, account_id: accountId || null, payee_id: payeeId, payee_name: typedName || null,
                    reference, remarks, is_refund: isRefund, lines: outLines,
                }))
                if (file) fd.set("file", file)
                if (removeAttachment) fd.set("removeAttachment", "1")
                const res = await saveMoneyIn(fd)
                if (!res.success) return toast.error(res.error)
                toast.success(edit ? "Entry updated" : "Money in recorded")
                if (onSaved && res.data) await onSaved({ kind: "transaction", id: res.data.id })
            }
            onOpenChange(false)
            router.refresh()
        } catch (e) {
            toast.error(errorMessage(e) || "Could not save. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        if (!edit || !window.confirm("Delete this entry? This cannot be undone.")) return
        setSaving(true)
        try {
            const res = await deleteMoneyIn(edit.id)
            if (!res.success) return toast.error(res.error)
            toast.success("Entry deleted")
            onOpenChange(false)
            router.refresh()
        } finally {
            setSaving(false)
        }
    }

    const title = mode === "out" ? "Record money out" : readOnly ? "Money in" : edit ? "Edit money in" : "Record money in"

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {mode === "out"
                            ? "For a payment without a receipt to upload. It is saved as a paid expense, so reports, fund totals and exports include it."
                            : "Money received into your account: a donation, a grant, fees or other income."}
                    </DialogDescription>
                </DialogHeader>

                {!!edit?.has_receipt && !readOnly && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-300">
                        A donation receipt has been issued for this entry, so it cannot be changed. Void the receipt first.
                    </p>
                )}

                <fieldset disabled={locked || saving} className="space-y-4">
                    {mode === "in" && (
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of money in">
                            {([["donation", "Donation"], ["other", "Other income"]] as const).map(([v, label]) => (
                                <button key={v} type="button" role="radio" aria-checked={!isRefund && incomeKind === v}
                                    onClick={() => switchKind(() => { setIsRefund(false); setIncomeKind(v) })}
                                    className={`rounded-full border px-3 py-1.5 text-sm ${!isRefund && incomeKind === v ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "border-slate-200 dark:border-slate-700"}`}>
                                    {label}
                                </button>
                            ))}
                            <button type="button" role="radio" aria-checked={isRefund} onClick={() => switchKind(() => setIsRefund(true))}
                                className={`rounded-full border px-3 py-1.5 text-sm ${isRefund ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "border-slate-200 dark:border-slate-700"}`}
                                title="Money given back to you for an expense, for example a supplier refund. It reduces that expense.">
                                Refund of an expense
                            </button>
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="tx-date">{mode === "in" ? "Date received" : "Date paid"}</Label>
                            <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tx-total">Total ({symbol})</Label>
                            <Input id="tx-total" inputMode="decimal" placeholder="0.00" value={total} onChange={(e) => setTotal(e.target.value)} />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="tx-payee">{mode === "in" ? (isRefund ? "Received from" : incomeKind === "donation" ? "Donor" : "Received from") : "Paid to"}</Label>
                            <select id="tx-payee" className={selectClass} value={payeeChoice} onChange={(e) => setPayeeChoice(e.target.value)}>
                                <option value={TYPED}>Type a name…</option>
                                {payeeChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {payeeChoice === TYPED && (
                                <div className="flex flex-wrap items-center gap-3">
                                    <Input aria-label="Name" placeholder="Name" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} maxLength={255} className="flex-1 min-w-48" />
                                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                        <input type="checkbox" checked={savePayee} onChange={(e) => setSavePayee(e.target.checked)} /> Save as a new payee
                                    </label>
                                </div>
                            )}
                        </div>
                        {mode === "in" && accountChoices.length > 1 && (
                            <div className="space-y-1.5">
                                <Label htmlFor="tx-account">Account</Label>
                                <select id="tx-account" className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                                    {accountChoices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="tx-ref">{mode === "in" ? "Reference (cheque or bank ref.)" : "Reference (invoice or receipt no.)"}</Label>
                            <Input id="tx-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Allocation</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={lines.length >= 50}><Plus className="h-3.5 w-3.5 mr-1" />Split</Button>
                        </div>
                        {lines.map((l) => (
                            <div key={l.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto] items-center">
                                <select aria-label="Category" className={selectClass} value={l.categoryId} onChange={(e) => setLine(l.key, { categoryId: e.target.value })}>
                                    <option value="">Category…</option>
                                    {categoryChoices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? " (archived)" : ""}</option>)}
                                </select>
                                <select aria-label="Fund" className={selectClass} value={l.fundId} onChange={(e) => setLine(l.key, { fundId: e.target.value })}>
                                    {fundChoices.map((f) => <option key={f.id} value={f.id}>{f.name}{f.archived ? " (archived)" : ""}</option>)}
                                </select>
                                {split ? (
                                    <Input aria-label="Line amount" inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} />
                                ) : (
                                    <span className="text-sm text-slate-500 tabular-nums px-2">{symbol}{totalNum.toFixed(2)}</span>
                                )}
                                {split ? (
                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeLine(l.key)} aria-label="Remove line"><Trash2 className="h-4 w-4" /></Button>
                                ) : <span />}
                            </div>
                        ))}
                        {split && (
                            <p className={`text-sm tabular-nums ${unallocated === 0 ? "text-emerald-600" : "text-amber-700"}`}>
                                {unallocated < 0 ? `Over-allocated by ${symbol}${Math.abs(unallocated).toFixed(2)}` : `Unallocated: ${symbol}${unallocated.toFixed(2)}`}
                            </p>
                        )}
                        {categoryChoices.length === 0 && (
                            <p className="text-sm text-amber-700">No categories of this kind yet. Add them under Settings, Financial Customization.</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="tx-remarks">Remarks</Label>
                        <Textarea id="tx-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} rows={2}
                            placeholder={mode === "in" ? "e.g. Hari Raya appeal, cheque 4471" : "e.g. Paid in cash at the hardware shop"} />
                        <p className="text-xs text-slate-500 text-right">{remarks.length}/500</p>
                    </div>

                    {mode === "in" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="tx-file">Attachment (optional)</Label>
                            {edit?.has_attachment && !removeAttachment && !file && (
                                <div className="flex items-center gap-3 text-sm">
                                    <a href={`/api/files/transaction/${edit.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><Paperclip className="h-3.5 w-3.5" />View attachment</a>
                                    <button type="button" className="text-red-600 hover:underline" onClick={() => setRemoveAttachment(true)}>Remove</button>
                                </div>
                            )}
                            <Input id="tx-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        </div>
                    )}
                </fieldset>
                {periodLocked && (
                    <LockedNotice text={entryLocked
                        ? `This entry is in a locked period, so it cannot be changed or deleted. ${lock.message}`
                        : `${formatDay(date)} is in a locked period. Choose a later date. ${lock.message}`} />
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div>
                        {edit && !locked && (
                            <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={remove} disabled={saving}>
                                <Trash2 className="h-4 w-4 mr-1" />Delete
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{readOnly ? "Close" : "Cancel"}</Button>
                        {!readOnly && (
                            <Button type="button" onClick={submit} disabled={saving || locked || periodLocked} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
