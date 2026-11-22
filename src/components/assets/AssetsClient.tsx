"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Lock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRole } from "@/components/RoleProvider"
import { useCurrency } from "@/components/CurrencyProvider"
import {
    deleteItem, deleteItemTransaction, disposeItem, recordItemTransaction, saveItem, undoDisposal,
    type AssetsPage, type ItemRow,
} from "@/app/actions/balance"
import type { EntryOptions } from "@/app/actions/transactions"
import { ITEM_ACTIONS, itemKindLabel, type ItemAction, type ItemKind } from "@/utils/balance-input"
import { ItemDialog } from "./ItemDialog"

const selectClass = "h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

// Assets & Liabilities (spec 3.6): everything on the balance sheet that is not cash, invoices or bills.
export function AssetsClient({ data, options }: { data: AssetsPage; options: EntryOptions }) {
    const router = useRouter()
    const { isViewer } = useRole()
    const { symbol } = useCurrency()
    const canWrite = !isViewer && options.paid
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const [form, setForm] = useState<{ edit: ItemRow | null; kind?: ItemKind; key: number } | null>(null)
    const [openId, setOpenId] = useState<string | null>(null)
    const open = data.items.find((i) => i.id === openId) ?? null

    const groups: { kind: ItemKind; title: string }[] = [
        { kind: "fixed_asset", title: "Fixed assets" },
        { kind: "other_asset", title: "Other assets" },
        { kind: "liability", title: "Liabilities" },
    ]
    const totalOf = (kind: ItemKind) => data.items.filter((i) => i.kind === kind && !i.disposed_date).reduce((s, i) => s + Math.round(i.balance * 100), 0) / 100

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Assets &amp; Liabilities</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Equipment, deposits and loans: what you own and owe besides cash, invoices and bills.</p>
                </div>
                <Button onClick={() => setForm({ edit: null, key: Date.now() })} disabled={!canWrite}
                    title={isViewer ? "Viewers cannot add items" : !options.paid ? "Assets and liabilities are part of the Growth and Nonprofit plans" : ""}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    {options.paid ? <Plus className="h-4 w-4 mr-1.5" /> : <Lock className="h-4 w-4 mr-1.5" />}Add
                </Button>
            </div>

            {!options.paid && (
                <div className="flex gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
                    <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>Recording assets, loans and depreciation is part of the Growth and Nonprofit plans. Anything already recorded stays visible here.</p>
                </div>
            )}
            {data.startDate === null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-300">
                    Tip: set your tracking start date in Settings, Accounts &amp; Transfers, Opening position, so you can enter what you already owned and owed on that date.
                </div>
            )}

            {groups.map((g) => {
                const list = data.items.filter((i) => i.kind === g.kind)
                return (
                    <section key={g.kind} className="space-y-2">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{g.title}</h2>
                            <span className="text-sm text-slate-500" data-testid={`total-${g.kind}`}>{g.kind === "fixed_asset" ? "Book value" : "Balance"} {money(totalOf(g.kind))}</span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-left">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Name</th>
                                        <th className="px-3 py-2 font-medium">Fund</th>
                                        {g.kind === "fixed_asset" ? (
                                            <>
                                                <th className="px-3 py-2 font-medium">Bought</th>
                                                <th className="px-3 py-2 font-medium text-right">Cost</th>
                                                <th className="px-3 py-2 font-medium text-right">Depreciation</th>
                                                <th className="px-3 py-2 font-medium text-right">Book value</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-3 py-2 font-medium">Due</th>
                                                <th className="px-3 py-2 font-medium text-right">Balance</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {list.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">None yet</td></tr>}
                                    {list.map((i) => (
                                        <tr key={i.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950/50" onClick={() => setOpenId(i.id)}>
                                            <td className="px-3 py-2.5 font-medium text-indigo-600">
                                                {i.name}
                                                {i.disposed_date && <span className="ml-2 text-xs font-normal text-slate-500">disposed {i.disposed_date}</span>}
                                                {i.archived && <span className="ml-2 text-xs font-normal text-slate-500">archived</span>}
                                            </td>
                                            <td className="px-3 py-2.5">{i.fund_name}</td>
                                            {g.kind === "fixed_asset" ? (
                                                <>
                                                    <td className="px-3 py-2.5 whitespace-nowrap">{i.acquired_date ?? "—"}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">{money(i.cost)}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">{money(i.accumulated)}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{money(i.balance)}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-3 py-2.5">{i.classification === "current" ? "Within a year" : "After a year"}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{money(i.balance)}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )
            })}
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Figures as of today ({data.today}). Depreciation is straight-line, a full month from the month of purchase, and is shown in
                Income &amp; Expenditure under &quot;Depreciation&quot;, charged to the asset&apos;s fund. Buying an asset, receiving a loan and repaying it are not income or expenditure.
            </p>

            {open && !form && (
                <ItemDetail key={open.id + open.entries.length + (open.disposed_date ?? "")} item={open} options={options} canWrite={canWrite} startDate={data.startDate}
                    disposal={data.disposals.find((d) => d.item_id === open.id) ?? null}
                    onClose={() => setOpenId(null)} onEdit={() => setForm({ edit: open, key: Date.now() })} onChanged={() => router.refresh()} />
            )}
            {form && (
                <ItemDialog key={form.key} open edit={form.edit} funds={options.funds} startDate={data.startDate} defaultKind={form.kind}
                    onOpenChange={(o) => { if (!o) setForm(null) }} onSaved={(id) => setOpenId(id)} />
            )}
        </div>
    )
}

function todayLocal(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function ItemDetail({ item, options, canWrite, startDate, disposal, onClose, onEdit, onChanged }: {
    item: ItemRow
    options: EntryOptions
    canWrite: boolean
    startDate: string | null
    disposal: { proceeds: number; loss: number } | null
    onClose: () => void
    onEdit: () => void
    onChanged: () => void
}) {
    const { symbol } = useCurrency()
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const [mode, setMode] = useState<"view" | ItemAction | "dispose">("view")
    const [busy, setBusy] = useState(false)
    const fixed = item.kind === "fixed_asset"
    const accounts = options.accounts.filter((a) => !a.archived)
    const [entry, setEntry] = useState({ amount: "", date: fixed && item.acquired_date ? item.acquired_date : todayLocal(), account: options.accounts.find((a) => a.is_default)?.id ?? "", payee: "", reference: "", remarks: "" })

    const run = async (fn: () => Promise<{ success: boolean; error?: string }>, done: string) => {
        setBusy(true)
        try {
            const res = await fn()
            if (!res.success) return toast.error(res.error ?? "Something went wrong")
            toast.success(done)
            setMode("view")
            onChanged()
        } finally {
            setBusy(false)
        }
    }
    const purchased = fixed && (item.opening_cost > 0 || item.entries.some((e) => e.direction === "out"))
    const actions = ITEM_ACTIONS[item.kind].filter((a) => !(a.value === "purchase" && purchased))
    const canAct = canWrite && !item.archived && !item.disposed_date

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{item.name}</DialogTitle>
                    <DialogDescription>
                        {itemKindLabel(item.kind)} · {item.fund_name}
                        {fixed && item.useful_life_months ? ` · ${item.useful_life_months}-month life` : ""}
                        {item.disposed_date ? ` · disposed ${item.disposed_date}` : ""}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-3 text-sm">
                    {fixed ? (
                        <>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Cost</p><p className="font-semibold tabular-nums">{money(item.cost)}</p></div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Depreciation to date</p><p className="font-semibold tabular-nums">{money(item.accumulated)}</p></div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Book value</p><p className="font-semibold tabular-nums" data-testid="item-value">{money(item.balance)}</p></div>
                        </>
                    ) : (
                        <>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">At the start date</p><p className="font-semibold tabular-nums">{money(item.opening_balance)}</p></div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 col-span-2"><p className="text-xs text-slate-500">{item.kind === "liability" ? "Still owed" : "Balance"}</p><p className="font-semibold tabular-nums" data-testid="item-value">{money(item.balance)}</p></div>
                        </>
                    )}
                </div>
                {disposal && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Sold for {money(disposal.proceeds)}: {disposal.loss > 0 ? `a loss of ${money(disposal.loss)}` : disposal.loss < 0 ? `a gain of ${money(-disposal.loss)}` : "no gain or loss"}, shown under &quot;Gain/loss on disposal&quot;.
                    </p>
                )}

                <div>
                    <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Entries</h3>
                    {item.entries.length === 0 ? <p className="text-sm text-slate-500">No money recorded yet.</p> : (
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {item.entries.map((e) => (
                                    <tr key={e.transaction_id}>
                                        <td className="py-1.5">{e.tx_date}</td>
                                        <td className="py-1.5">{e.direction === "out" ? "Money out" : "Money in"}{e.reference ? ` · ${e.reference}` : ""}</td>
                                        <td className="py-1.5 text-right tabular-nums">{money(e.amount)}</td>
                                        <td className="py-1.5 text-right w-20">
                                            {canWrite && !item.disposed_date && (
                                                <button type="button" className="text-xs text-red-600 hover:underline" disabled={busy}
                                                    onClick={() => { if (window.confirm("Delete this entry?")) run(() => deleteItemTransaction(e.transaction_id), "Entry deleted") }}>Delete</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                {item.notes && <p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-medium">Notes:</span> {item.notes}</p>}

                {mode !== "view" && mode !== "dispose" && (
                    <div className="space-y-3 rounded-lg border border-indigo-200 dark:border-indigo-900 p-4">
                        <h3 className="text-sm font-semibold">{ITEM_ACTIONS[item.kind].find((a) => a.value === mode)?.label}</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label htmlFor="ie-amount">Amount ({symbol})</Label>
                                <Input id="ie-amount" inputMode="decimal" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label htmlFor="ie-date">Date</Label>
                                <Input id="ie-date" type="date" value={entry.date} disabled={mode === "purchase"} min={startDate ?? undefined} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></div>
                            {accounts.length > 1 && (
                                <div className="space-y-1.5"><Label htmlFor="ie-account">Account</Label>
                                    <select id="ie-account" className={selectClass} value={entry.account} onChange={(e) => setEntry({ ...entry, account: e.target.value })}>
                                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select></div>
                            )}
                            <div className="space-y-1.5"><Label htmlFor="ie-payee">{mode === "purchase" ? "Bought from" : "Paid to / received from"}</Label>
                                <Input id="ie-payee" value={entry.payee} onChange={(e) => setEntry({ ...entry, payee: e.target.value })} maxLength={255} /></div>
                            <div className="space-y-1.5"><Label htmlFor="ie-ref">Reference</Label>
                                <Input id="ie-ref" value={entry.reference} onChange={(e) => setEntry({ ...entry, reference: e.target.value })} maxLength={100} /></div>
                        </div>
                        <Textarea aria-label="Entry remarks" placeholder="Remarks (optional)" value={entry.remarks} onChange={(e) => setEntry({ ...entry, remarks: e.target.value })} maxLength={500} rows={2} />
                        {mode === "purchase" && <p className="text-xs text-slate-500">The purchase is dated the day the asset was bought ({item.acquired_date}). It is not an expense; depreciation is.</p>}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setMode("view")} disabled={busy}>Cancel</Button>
                            <Button disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={() => run(() => recordItemTransaction({ item_id: item.id, action: mode, amount: entry.amount, tx_date: entry.date, account_id: entry.account || null, payee_name: entry.payee, reference: entry.reference, remarks: entry.remarks }), "Recorded")}>
                                Save
                            </Button>
                        </div>
                    </div>
                )}

                {mode === "dispose" && (
                    <div className="space-y-3 rounded-lg border border-red-200 dark:border-red-900 p-4">
                        <h3 className="text-sm font-semibold">Sell or write off</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label htmlFor="dp-date">Date</Label>
                                <Input id="dp-date" type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label htmlFor="dp-proceeds">Amount received ({symbol}, 0 for a write-off)</Label>
                                <Input id="dp-proceeds" inputMode="decimal" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></div>
                        </div>
                        <p className="text-xs text-slate-500">Depreciation stops before the month of sale. Any difference from the book value is shown as a gain or loss.</p>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setMode("view")} disabled={busy}>Cancel</Button>
                            <Button disabled={busy} className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={() => run(() => disposeItem({ item_id: item.id, disposed_date: entry.date, proceeds: entry.amount, account_id: entry.account || null }), "Disposal recorded")}>
                                Record disposal
                            </Button>
                        </div>
                    </div>
                )}

                {mode === "view" && (
                    <div className="flex flex-wrap justify-between gap-2 pt-2">
                        <div className="flex flex-wrap gap-2">
                            {canWrite && item.entries.length === 0 && !item.disposed_date && (
                                <Button variant="ghost" className="text-red-600" disabled={busy}
                                    onClick={() => { if (window.confirm("Delete this item?")) run(async () => { const r = await deleteItem(item.id); if (r.success) onClose(); return r }, "Deleted") }}>Delete</Button>
                            )}
                            {canWrite && item.entries.length > 0 && !item.disposed_date && (
                                <Button variant="ghost" disabled={busy} onClick={() => run(() => saveItem({ ...item, archived: !item.archived }), item.archived ? "Restored" : "Archived")}>
                                    {item.archived ? "Restore" : "Archive"}
                                </Button>
                            )}
                            {canWrite && item.disposed_date && (
                                <Button variant="ghost" disabled={busy} onClick={() => run(() => undoDisposal(item.id), "Disposal undone")}>Undo disposal</Button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {canWrite && !item.disposed_date && <Button variant="outline" onClick={onEdit}>Edit</Button>}
                            {canAct && fixed && purchased && <Button variant="outline" className="text-red-600" onClick={() => { setEntry({ ...entry, date: todayLocal(), amount: "" }); setMode("dispose") }}>Sell or write off</Button>}
                            {canAct && actions.map((a) => (
                                <Button key={a.value} className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setMode(a.value)}>{a.label}</Button>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
