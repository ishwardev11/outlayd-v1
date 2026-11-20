"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, ChevronRight as ChevronRightSmall, Download, Loader2, Lock, Paperclip, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRole } from "@/components/RoleProvider"
import { useCurrency } from "@/components/CurrencyProvider"
import { exportCashBookCsv, getMoneyIn, type EntryOptions } from "@/app/actions/transactions"
import { cashBookTotals, sourceLabel, summarise, typeLabel, type CashBookFilters, type CashBookRow } from "@/utils/cash-book"
import { TransactionDialog, type MoneyInEdit } from "./TransactionDialog"

const selectClass = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

// The cash book (spec 5.2): every movement of cash, read from transactions only. Paid documents
// arrive through the database mirror and open in Documents; money in is entered and edited here.
export function CashBook({ rows, total, page, pageSize, filters, options }: {
    rows: CashBookRow[]
    total: number
    page: number
    pageSize: number
    filters: CashBookFilters
    options: EntryOptions
}) {
    const router = useRouter()
    const pathname = usePathname()
    const { isViewer } = useRole()
    const { symbol } = useCurrency()
    const [draft, setDraft] = useState(filters)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [dialog, setDialog] = useState<{ mode: "in" | "out"; edit: MoneyInEdit | null; key: number } | null>(null)
    const [loadingEdit, setLoadingEdit] = useState<string | null>(null)
    const [exporting, setExporting] = useState(false)

    const showAccount = options.accounts.length > 1
    const showBalance = !!filters.account
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const totals = cashBookTotals(rows)
    const canMoneyIn = !isViewer && options.paid

    const go = (f: CashBookFilters) => {
        const p = new URLSearchParams({ view: "cash" })
        for (const [k, v] of Object.entries(f)) if (v && v !== "all" && !(k === "page" && v === 1)) p.set(k, String(v))
        router.push(`${pathname}?${p.toString()}`)
    }

    const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

    const openEdit = async (id: string) => {
        setLoadingEdit(id)
        try {
            const entry = await getMoneyIn(id)
            if (!entry) return toast.error("That entry could not be opened")
            setDialog({ mode: "in", edit: entry, key: Date.now() })
        } finally {
            setLoadingEdit(null)
        }
    }

    const exportCsv = async () => {
        setExporting(true)
        try {
            const res = await exportCashBookCsv(filters)
            if (!res.success || !res.data) return toast.error(res.success ? "Nothing to export" : res.error)
            if (res.data.truncated) toast.warning("The export is limited to the newest 10,000 entries. Narrow the filters to export the rest.")
            const url = URL.createObjectURL(new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" }))
            const a = document.createElement("a")
            a.href = url
            a.download = `cash-book${filters.from ? `-${filters.from}` : ""}${filters.to ? `-to-${filters.to}` : ""}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } finally {
            setExporting(false)
        }
    }

    const filterSelect = (key: "fund" | "category" | "payee" | "account", label: string, plural: string, items: { id: string; name: string }[]) => (
        <select aria-label={label} className={selectClass} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}>
            <option value="">All {plural}</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setDialog({ mode: "in", edit: null, key: Date.now() })} disabled={!canMoneyIn}
                        title={isViewer ? "Viewers cannot record money in" : !options.paid ? "Recording income and donations is part of the Growth and Nonprofit plans" : ""}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {options.paid ? <ArrowDownLeft className="h-4 w-4 mr-1.5" /> : <Lock className="h-4 w-4 mr-1.5" />}Money in
                    </Button>
                    <Button onClick={() => setDialog({ mode: "out", edit: null, key: Date.now() })} disabled={isViewer}
                        title={isViewer ? "Viewers cannot record money out" : "A payment without a receipt to upload"} variant="outline">
                        <ArrowUpRight className="h-4 w-4 mr-1.5" />Money out
                    </Button>
                </div>
                <Button variant="outline" onClick={exportCsv} disabled={exporting || total === 0}>
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}Export CSV
                </Button>
            </div>

            <form className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                onSubmit={(e) => { e.preventDefault(); go({ ...draft, page: 1 }) }}>
                <label className="text-xs text-slate-500 space-y-1"><span className="block">From</span>
                    <Input type="date" className="h-9 w-40" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
                <label className="text-xs text-slate-500 space-y-1"><span className="block">To</span>
                    <Input type="date" className="h-9 w-40" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
                <select aria-label="Type" className={selectClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CashBookFilters["type"] })}>
                    <option value="all">Money in and out</option>
                    <option value="money_in">Money in</option>
                    <option value="money_out">Money out</option>
                </select>
                {filterSelect("fund", "Fund", "funds", options.funds)}
                {filterSelect("category", "Category", "categories", options.categories)}
                {filterSelect("payee", "Payee", "payees", options.payees)}
                {showAccount && filterSelect("account", "Account", "accounts", options.accounts)}
                <Input aria-label="Search" placeholder="Search payee, remarks, reference" className="h-9 w-56" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
                <Button type="submit" size="sm" className="h-9">Apply</Button>
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => go({ from: "", to: "", type: "all", fund: "", category: "", payee: "", account: "", q: "", page: 1 })}>Clear</Button>
            </form>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-left">
                        <tr>
                            <th className="px-3 py-2.5 font-medium w-8" />
                            <th className="px-3 py-2.5 font-medium">Date</th>
                            <th className="px-3 py-2.5 font-medium">Payee</th>
                            <th className="px-3 py-2.5 font-medium">Type</th>
                            <th className="px-3 py-2.5 font-medium">Category</th>
                            <th className="px-3 py-2.5 font-medium">Fund</th>
                            {showAccount && <th className="px-3 py-2.5 font-medium">Account</th>}
                            <th className="px-3 py-2.5 font-medium text-right">Money in</th>
                            <th className="px-3 py-2.5 font-medium text-right">Money out</th>
                            {showBalance && <th className="px-3 py-2.5 font-medium text-right">Balance</th>}
                            <th className="px-3 py-2.5 font-medium">Reference</th>
                            <th className="px-3 py-2.5 font-medium">Remarks</th>
                            <th className="px-3 py-2.5 font-medium">Source</th>
                            <th className="px-3 py-2.5" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.length === 0 && (
                            <tr><td colSpan={14} className="px-4 py-10 text-center text-slate-500">
                                No entries match. Paid documents appear here automatically, and money in can be recorded with the button above.
                            </td></tr>
                        )}
                        {rows.map((r) => {
                            const isIn = r.type === "money_in"
                            const isSplit = r.lines.length > 1
                            const open = expanded.has(r.id)
                            return (
                                <Fragment key={r.id}>
                                    <tr className="align-top">
                                        <td className="px-3 py-2.5">
                                            {isSplit && (
                                                <button type="button" onClick={() => toggle(r.id)} aria-label={open ? "Hide split" : "Show split"} aria-expanded={open} className="text-slate-400 hover:text-slate-700">
                                                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRightSmall className="h-4 w-4" />}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            {r.date}{r.dateEstimated && <span className="ml-1 text-amber-600" title="No payment date was recorded, so the document date is used">≈</span>}
                                        </td>
                                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{r.payee || "—"}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">{typeLabel(r)}</td>
                                        <td className="px-3 py-2.5">{summarise(r.lines.map((l) => l.categoryName))}</td>
                                        <td className="px-3 py-2.5">{summarise(r.lines.map((l) => l.fundName))}</td>
                                        {showAccount && <td className="px-3 py-2.5">{r.accountName}</td>}
                                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{isIn ? money(r.total) : ""}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">{r.type === "money_out" ? money(r.total) : ""}</td>
                                        {showBalance && <td className="px-3 py-2.5 text-right tabular-nums">{r.balance === null ? "" : money(r.balance)}</td>}
                                        <td className="px-3 py-2.5">{r.reference}</td>
                                        <td className="px-3 py-2.5 max-w-56"><span className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300" title={r.remarks}>{r.remarks}</span></td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{sourceLabel(r.source)}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {r.hasAttachment && (
                                                    <a href={`/api/files/transaction/${r.id}`} target="_blank" rel="noopener noreferrer" aria-label="View attachment" className="text-slate-400 hover:text-indigo-600"><Paperclip className="h-4 w-4" /></a>
                                                )}
                                                {r.source === "manual" && r.type === "money_in" ? (
                                                    <button type="button" onClick={() => openEdit(r.id)} disabled={loadingEdit === r.id} className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs">
                                                        {loadingEdit === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}{isViewer ? "View" : "Edit"}
                                                    </button>
                                                ) : r.documentId ? (
                                                    <Link href={`/ledger?status=paid&q=${encodeURIComponent(r.payee)}`} className="text-indigo-600 hover:underline text-xs" title="This entry comes from a document. Change it there.">Open document</Link>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                    {isSplit && open && r.lines.map((l, i) => (
                                        <tr key={`${r.id}-${i}`} className="bg-slate-50/60 dark:bg-slate-950/40 text-xs text-slate-600 dark:text-slate-300">
                                            <td /><td /><td className="px-3 py-1.5 text-slate-400">Line {i + 1}</td><td />
                                            <td className="px-3 py-1.5">{l.categoryName}</td>
                                            <td className="px-3 py-1.5">{l.fundName}</td>
                                            {showAccount && <td />}
                                            <td className="px-3 py-1.5 text-right tabular-nums">{isIn ? money(l.amount) : ""}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{r.type === "money_out" ? money(l.amount) : ""}</td>
                                            {showBalance && <td />}
                                            <td colSpan={4} />
                                        </tr>
                                    ))}
                                </Fragment>
                            )
                        })}
                    </tbody>
                    {rows.length > 0 && (
                        <tfoot className="bg-slate-50 dark:bg-slate-950 text-sm font-medium">
                            <tr>
                                <td colSpan={showAccount ? 7 : 6} className="px-3 py-2.5 text-slate-500">Totals on this page</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{money(totals.moneyIn)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{money(totals.moneyOut)}</td>
                                <td colSpan={showBalance ? 5 : 4} />
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Page {page} of {pages} ({total} entries)</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go({ ...filters, page: page - 1 })}><ChevronLeft className="h-4 w-4" />Previous</Button>
                        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go({ ...filters, page: page + 1 })}>Next<ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            )}

            {dialog && (
                <TransactionDialog key={dialog.key} open onOpenChange={(o) => { if (!o) setDialog(null) }} mode={dialog.mode} options={options} edit={dialog.edit} readOnly={isViewer || (dialog.mode === "in" && !options.paid)} />
            )}
        </div>
    )
}
