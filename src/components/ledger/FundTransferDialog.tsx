"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCurrency } from "@/components/CurrencyProvider"
import { LockedNotice, useLock } from "@/components/LockProvider"
import { saveFundTransfer } from "@/app/actions/balance"
import type { EntryOptions } from "@/app/actions/transactions"

const selectClass = "h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

function todayLocal(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Transactions > New > Fund transfer (moved from Settings > Accounts & Transfers in simplification
// step 6). Moves money between funds without any cash moving. Saved by the same save_fund_transfer
// function, which checks the role (Admin or Editor), the plan, the lock and the organisation again.
export function FundTransferDialog({ open, onOpenChange, options }: { open: boolean; onOpenChange: (open: boolean) => void; options: EntryOptions }) {
    const router = useRouter()
    const { symbol } = useCurrency()
    const lock = useLock()
    const funds = options.funds.filter((f) => !f.archived)
    const [tr, setTr] = useState({ from: "", to: "", amount: "", date: todayLocal(), remarks: "" })
    const [busy, setBusy] = useState(false)
    const locked = lock.isLocked(tr.date)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setBusy(true)
        try {
            const res = await saveFundTransfer({ from_fund_id: tr.from, to_fund_id: tr.to, amount: tr.amount, tx_date: tr.date, remarks: tr.remarks })
            if (!res.success) return toast.error(res.error ?? "Could not save the transfer")
            toast.success("Transfer recorded")
            onOpenChange(false)
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Fund transfer</DialogTitle>
                    <DialogDescription>Move money between funds, for example to cover a restricted fund from the General Fund. No cash moves.</DialogDescription>
                </DialogHeader>
                <form className="space-y-3" onSubmit={submit} data-testid="fund-transfer-form">
                    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-slate-500">From fund
                            <select aria-label="From fund" className={selectClass} value={tr.from} onChange={(e) => setTr({ ...tr, from: e.target.value })}>
                                <option value="">Choose…</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select></label>
                        <label className="text-xs text-slate-500">To fund
                            <select aria-label="To fund" className={selectClass} value={tr.to} onChange={(e) => setTr({ ...tr, to: e.target.value })}>
                                <option value="">Choose…</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select></label>
                        <label className="text-xs text-slate-500">Amount ({symbol})
                            <Input aria-label="Transfer amount" className="h-9" inputMode="decimal" value={tr.amount} onChange={(e) => setTr({ ...tr, amount: e.target.value })} /></label>
                        <label className="text-xs text-slate-500">Date
                            <Input aria-label="Transfer date" type="date" className="h-9" value={tr.date} onChange={(e) => setTr({ ...tr, date: e.target.value })} /></label>
                        <label className="text-xs text-slate-500 sm:col-span-2">Reason (kept with the transfer)
                            <Input aria-label="Transfer reason" className="h-9" value={tr.remarks} maxLength={500} onChange={(e) => setTr({ ...tr, remarks: e.target.value })} placeholder="For example: committee approved, van fund" /></label>
                    </fieldset>
                    {locked && <LockedNotice text={`That date is in a locked period. ${lock.message}`} />}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
                        <Button type="submit" disabled={busy || locked || !tr.from || !tr.to || !tr.amount} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Transfer
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
