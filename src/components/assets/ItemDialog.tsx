"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCurrency } from "@/components/CurrencyProvider"
import { saveItem, type ItemRow } from "@/app/actions/balance"
import { ITEM_KINDS, type ItemKind } from "@/utils/balance-input"
import { LockedNotice, useLock } from "@/components/LockProvider"
import { itemValuesLocked } from "@/utils/lock"

const selectClass = "h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white disabled:opacity-60"

// Add or edit an asset or liability. A fixed asset owned before the tracking start date takes its cost
// and depreciation to date here; one bought later gets its cost from "Record purchase".
export function ItemDialog({ open, onOpenChange, edit, funds, startDate, defaultKind, onSaved }: {
    open: boolean
    onOpenChange: (o: boolean) => void
    edit: ItemRow | null
    funds: { id: string; name: string; archived: boolean; is_default: boolean }[]
    startDate: string | null
    defaultKind?: ItemKind
    onSaved?: (id: string) => void
}) {
    const router = useRouter()
    const { symbol } = useCurrency()
    const hasEntries = (edit?.entries.length ?? 0) > 0
    const [f, setF] = useState({
        name: edit?.name ?? "",
        kind: (edit?.kind ?? defaultKind ?? "fixed_asset") as ItemKind,
        classification: edit?.classification ?? "current",
        fund_id: edit?.fund_id ?? funds.find((x) => x.is_default)?.id ?? "",
        notes: edit?.notes ?? "",
        opening_balance: edit ? String(edit.opening_balance) : "",
        acquired_date: edit?.acquired_date ?? "",
        opening_cost: edit ? String(edit.opening_cost) : "",
        opening_accumulated_depreciation: edit ? String(edit.opening_accumulated_depreciation) : "",
        residual_value: edit ? String(edit.residual_value) : "",
        useful_life_months: edit?.useful_life_months ? String(edit.useful_life_months) : "",
    })
    const [saving, setSaving] = useState(false)
    const fixed = f.kind === "fixed_asset"
    // Owned before the start date: its cost and depreciation so far belong to the opening position
    const heldAtStart = fixed && !!startDate && !!f.acquired_date && f.acquired_date < startDate
    const lock = useLock()
    // A locked item keeps its figures; only its name and notes can change
    const frozen = !!edit && itemValuesLocked(edit, lock)
    const newDateLocked = !edit && fixed && lock.isLocked(f.acquired_date)

    const submit = async () => {
        setSaving(true)
        try {
            const res = await saveItem({
                id: edit?.id ?? null, name: f.name, kind: f.kind, classification: f.classification, fund_id: f.fund_id || null, notes: f.notes,
                archived: edit?.archived ?? false,
                opening_balance: fixed ? "0" : f.opening_balance,
                acquired_date: fixed ? f.acquired_date : null,
                opening_cost: heldAtStart ? f.opening_cost : "0",
                opening_accumulated_depreciation: heldAtStart ? f.opening_accumulated_depreciation : "0",
                residual_value: fixed ? f.residual_value : "0",
                useful_life_months: fixed ? f.useful_life_months : null,
            })
            if (!res.success || !res.data) return toast.error(res.success ? "Could not save" : res.error)
            toast.success(edit ? "Saved" : fixed && !heldAtStart ? "Asset added. Now record its purchase." : "Added")
            onOpenChange(false)
            onSaved?.(res.data.id)
            router.refresh()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{edit ? `Edit ${edit.name}` : "Add an asset or liability"}</DialogTitle>
                    <DialogDescription>Things you own or owe that are not cash, invoices or bills: equipment, deposits, loans.</DialogDescription>
                </DialogHeader>
                <fieldset disabled={saving} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="item-kind">Kind</Label>
                        <select id="item-kind" className={selectClass} value={f.kind} disabled={hasEntries || frozen} onChange={(e) => setF({ ...f, kind: e.target.value as ItemKind })}>
                            {ITEM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </select>
                        <p className="text-xs text-slate-500">{ITEM_KINDS.find((k) => k.value === f.kind)?.help}</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="item-name">Name</Label>
                            <Input id="item-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={200} placeholder={fixed ? "e.g. Toyota Hiace van" : f.kind === "liability" ? "e.g. Bank loan" : "e.g. Hall rental deposit"} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="item-fund">Fund</Label>
                            <select id="item-fund" className={selectClass} value={f.fund_id} disabled={hasEntries || frozen} onChange={(e) => setF({ ...f, fund_id: e.target.value })}>
                                {funds.filter((x) => !x.archived || x.id === f.fund_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                        </div>
                        {!fixed && (
                            <div className="space-y-1.5">
                                <Label htmlFor="item-class">Due</Label>
                                <select id="item-class" className={selectClass} value={f.classification} disabled={frozen} onChange={(e) => setF({ ...f, classification: e.target.value as "current" | "non_current" })}>
                                    <option value="current">Within a year (current)</option>
                                    <option value="non_current">After more than a year (non-current)</option>
                                </select>
                            </div>
                        )}
                        {fixed && (
                            <>
                                <div className="space-y-1.5">
                                    <Label htmlFor="item-acquired">Date bought</Label>
                                    <Input id="item-acquired" type="date" value={f.acquired_date} disabled={hasEntries || frozen} onChange={(e) => setF({ ...f, acquired_date: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="item-life">Useful life (months)</Label>
                                    <Input id="item-life" inputMode="numeric" value={f.useful_life_months} disabled={frozen} onChange={(e) => setF({ ...f, useful_life_months: e.target.value })} placeholder="e.g. 60 for 5 years" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="item-residual">Value at the end of its life ({symbol})</Label>
                                    <Input id="item-residual" inputMode="decimal" value={f.residual_value} disabled={frozen} onChange={(e) => setF({ ...f, residual_value: e.target.value })} placeholder="0.00" />
                                </div>
                            </>
                        )}
                    </div>

                    {fixed && heldAtStart && (
                        <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-indigo-200 dark:border-indigo-900 p-3">
                            <p className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-300">Bought before your start date ({startDate}): enter its cost and the depreciation already charged.</p>
                            <div className="space-y-1.5">
                                <Label htmlFor="item-cost">Cost ({symbol})</Label>
                                <Input id="item-cost" inputMode="decimal" value={f.opening_cost} disabled={frozen || lock.openingLocked} onChange={(e) => setF({ ...f, opening_cost: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="item-acc">Depreciation to the start date ({symbol})</Label>
                                <Input id="item-acc" inputMode="decimal" value={f.opening_accumulated_depreciation} disabled={frozen || lock.openingLocked} onChange={(e) => setF({ ...f, opening_accumulated_depreciation: e.target.value })} />
                            </div>
                        </div>
                    )}
                    {fixed && !heldAtStart && !edit && (
                        <p className="text-sm text-slate-500">After saving, use &quot;Record purchase&quot; to enter what you paid. Depreciation starts in the month it was bought.</p>
                    )}

                    {!fixed && (
                        <div className="space-y-1.5">
                            <Label htmlFor="item-opening">{f.kind === "liability" ? "Amount owed" : "Amount"} at your start date ({symbol})</Label>
                            <Input id="item-opening" inputMode="decimal" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} placeholder="0.00" disabled={!startDate || frozen || lock.openingLocked} />
                            <p className="text-xs text-slate-500">{startDate ? `Leave 0 if it started after ${startDate}; record the money with the buttons on the item.` : "Set your start date in the opening position first to enter an opening amount."}</p>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="item-notes">Notes</Label>
                        <Textarea id="item-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} rows={2} />
                    </div>
                </fieldset>
                {frozen && <LockedNotice text={`Its figures are in a locked period, so only the name and notes can change. ${lock.message}`} />}
                {!frozen && lock.openingLocked && (heldAtStart || !fixed) && <LockedNotice text={`The opening position is locked, so opening amounts cannot be entered. ${lock.message}`} />}
                {newDateLocked && <LockedNotice text={`That purchase date is in a locked period. ${lock.message}`} />}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={submit} disabled={saving || newDateLocked} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
