"use client"

import { useState } from "react"
import { AlertTriangle, Check } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useCurrency } from "@/components/CurrencyProvider"
import type { SlipReading } from "@/app/actions/payment-slip"

const selectClass = "h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

// What the AI read from a payment slip and the open invoices it could be paying (step 7). Choosing one
// opens Record payment on that invoice, filled in from the slip; nothing is recorded until Save payment.
export function SlipMatchDialog({ reading, fileName, busy, onPick, onClose }: {
    reading: SlipReading
    fileName: string
    busy: boolean
    onPick: (invoiceId: string) => void
    onClose: () => void
}) {
    const { symbol } = useCurrency()
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const { slip, direction, matches, open, currencyMismatch } = reading
    const [manual, setManual] = useState("")
    const received = direction === "receivable"
    const label = (o: { invoice_no: string | null; payee_name: string; balance: number }) =>
        `${o.invoice_no ?? "No number"} · ${o.payee_name} · ${money(o.balance)} owed`

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Match the payment slip</DialogTitle>
                    <DialogDescription>
                        {received ? "Money received" : "Money paid"}
                        {slip.amount !== null ? <> of <span className="font-medium">{currencyMismatch ? `${slip.currency} ${slip.amount.toFixed(2)}` : money(slip.amount)}</span></> : null}
                        {slip.date ? <> on {slip.date}</> : null}
                        {received && slip.payerName ? <> from {slip.payerName}</> : null}
                        {!received && slip.recipientName ? <> to {slip.recipientName}</> : null}
                        {slip.reference ? <> · ref. {slip.reference}</> : null}
                        <span className="block text-xs mt-1">Read by the AI from {fileName}. Choose the {received ? "invoice it pays" : "bill it pays"}; you check the payment before it is saved.</span>
                    </DialogDescription>
                </DialogHeader>

                {currencyMismatch && (
                    <p className="flex gap-1.5 text-sm text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />The slip is in {slip.currency}, so its amount was not used to find a match.</p>
                )}

                {matches.length > 0 ? (
                    <div className="space-y-2" data-testid="slip-matches">
                        <h3 className="text-sm font-semibold">Suggested {received ? "invoices" : "bills"}</h3>
                        {matches.map((m, i) => (
                            <div key={m.id} className={`rounded-lg border p-3 ${i === 0 ? "border-indigo-300 dark:border-indigo-800" : "border-slate-200 dark:border-slate-700"}`}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium text-slate-900 dark:text-white">{m.invoice_no ?? "No number"} · {m.payee_name}</p>
                                        <p className="text-xs text-slate-500">{money(m.balance)} owed · dated {m.issue_date}{m.due_date ? ` · due ${m.due_date}` : ""}</p>
                                    </div>
                                    <Button size="sm" disabled={busy} className={i === 0 ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""} variant={i === 0 ? "default" : "outline"}
                                        onClick={() => onPick(m.id)}>Record payment</Button>
                                </div>
                                <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                                    {m.reasons.map((r) => <li key={r} className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" />{r}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300" data-testid="slip-no-match">
                        No open {received ? "invoice" : "bill"} matches this slip. Pick one below if you know which it pays.
                    </p>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="slip-manual">{matches.length > 0 ? "Or pick another" : "Pick the"} {received ? "invoice" : "bill"}</Label>
                    <div className="flex gap-2">
                        <select id="slip-manual" className={selectClass} value={manual} onChange={(e) => setManual(e.target.value)}>
                            <option value="">{open.length === 0 ? `No open ${received ? "invoices" : "bills"}` : "Choose…"}</option>
                            {open.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
                        </select>
                        <Button variant="outline" disabled={!manual || busy} onClick={() => onPick(manual)}>Record payment</Button>
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
