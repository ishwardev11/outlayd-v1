"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Download, Loader2, Lock, Paperclip, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRole } from "@/components/RoleProvider"
import { useCurrency } from "@/components/CurrencyProvider"
import { exportInvoicesCsv, getInvoiceDetail, type InvoiceDetail, type InvoicesPage } from "@/app/actions/invoices"
import type { EntryOptions } from "@/app/actions/transactions"
import { AGEING_LABELS, STATUS_OPTIONS, type AgeingBucket, type InvoiceFilters } from "@/utils/invoices"
import { StatusBadge } from "./StatusBadge"
import { InvoiceDialog } from "./InvoiceDialog"
import { InvoiceDetailDialog } from "./InvoiceDetailDialog"
import { UpgradeNotice, usePaywall } from "@/components/ui/UpgradeNotice"

const selectClass = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

// The Bills & Invoices page (spec 5.4): bills to pay and invoices you issued, with what is still owed by age.
export function InvoicesClient({ data, filters, options }: { data: InvoicesPage; filters: InvoiceFilters; options: EntryOptions }) {
    const router = useRouter()
    const { isViewer } = useRole()
    const { symbol } = useCurrency()
    const [draft, setDraft] = useState({ status: filters.status, q: filters.q })
    const [detail, setDetail] = useState<InvoiceDetail | null>(null)
    const [form, setForm] = useState<{ edit: InvoiceDetail | null; key: number } | null>(null)
    const [loading, setLoading] = useState<string | null>(null)
    const [exporting, setExporting] = useState(false)

    const payable = filters.tab === "payable"
    const canWrite = !isViewer && options.paid
    const paywall = usePaywall("invoices")
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize))

    const href = (patch: Partial<InvoiceFilters>) => {
        const f = { ...filters, open: "", ...patch }
        const p = new URLSearchParams()
        if (f.tab !== "payable") p.set("tab", f.tab)
        if (f.status !== "all") p.set("status", f.status)
        if (f.q) p.set("q", f.q)
        if (f.page > 1) p.set("page", String(f.page))
        if (f.open) p.set("open", f.open)
        for (const k of ["from", "to", "category", "fund"] as const) if (f[k]) p.set(k, f[k])
        const s = p.toString()
        return `/invoices${s ? `?${s}` : ""}`
    }

    const openDetail = async (id: string) => {
        setLoading(id)
        try {
            const d = await getInvoiceDetail(id)
            if (!d) return toast.error("That invoice could not be opened")
            setDetail(d)
        } finally {
            setLoading(null)
        }
    }

    // A link such as /invoices?open=<id> (from the cash book) opens that invoice straight away
    useEffect(() => {
        if (!filters.open) return
        let cancelled = false
        getInvoiceDetail(filters.open).then((d) => { if (!cancelled && d) setDetail(d) })
        return () => { cancelled = true }
    }, [filters.open])

    const refreshDetail = async () => {
        if (!detail) return
        const d = await getInvoiceDetail(detail.invoice.id)
        setDetail(d)
    }

    const exportCsv = async () => {
        setExporting(true)
        try {
            const res = await exportInvoicesCsv(filters)
            if (!res.success || !res.data) return toast.error(res.success ? "Nothing to export" : res.error)
            if (res.data.truncated) toast.warning("The export is limited to 10,000 invoices. Narrow the filters to export the rest.")
            const url = URL.createObjectURL(new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" }))
            const a = document.createElement("a")
            a.href = url
            a.download = `${payable ? "bills" : "invoices"}${filters.status !== "all" ? `-${filters.status}` : ""}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } finally {
            setExporting(false)
        }
    }

    const fromStatement = !!(filters.from || filters.to || filters.category || filters.fund)
    const categoryName = options.categories.find((c) => c.id === filters.category)?.name
    const fundName = options.funds.find((f) => f.id === filters.fund)?.name
    const clearStatement = { from: "", to: "", category: "", fund: "", page: 1 }

    const tab = (key: InvoiceFilters["tab"], label: string) => (
        <Link href={href({ tab: key, status: "all", q: "", ...clearStatement })} aria-current={filters.tab === key ? "page" : undefined}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${filters.tab === key
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-cyan-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"}`}>
            {label}
        </Link>
    )

    const buckets: AgeingBucket[] = ["current", "1_30", "31_60", "61_plus"]

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Bills &amp; Invoices</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Bills you owe and invoices you issued, with what is still outstanding.</p>
                </div>
                <Button onClick={() => (options.paid ? setForm({ edit: null, key: Date.now() }) : paywall.open())} disabled={isViewer}
                    title={isViewer ? "Viewers cannot create invoices" : !options.paid ? "Creating invoices is part of the Growth and Nonprofit plans" : ""}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    {options.paid ? <Plus className="h-4 w-4 mr-1.5" /> : <Lock className="h-4 w-4 mr-1.5" />}{payable ? "New bill" : "New invoice"}
                </Button>
                {paywall.modal}
            </div>

            {!options.paid && (
                <UpgradeNotice context="invoices">
                    Bills you approve in the Inbox appear here automatically. Open one and choose Mark as paid when you pay it.
                    Creating bills and invoices, invoicing others and recording part-payments are part of the Growth and Nonprofit plans.
                </UpgradeNotice>
            )}

            <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800 pb-2" aria-label="Invoice types">
                {tab("payable", "Bills to pay")}
                {tab("receivable", "Invoices issued")}
            </nav>

            {/* Ageing: everything still owed on this tab */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5" data-testid="ageing">
                {buckets.map((b) => (
                    <div key={b} className={`rounded-xl border p-4 ${b === "current" ? "border-slate-200 dark:border-slate-700" : data.ageing[b] > 0 ? "border-red-200 dark:border-red-900" : "border-slate-200 dark:border-slate-700"} bg-white dark:bg-slate-800`}>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{AGEING_LABELS[b]}</p>
                        <p className={`mt-1 text-xl font-bold tabular-nums ${b !== "current" && data.ageing[b] > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>{money(data.ageing[b])}</p>
                    </div>
                ))}
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 col-span-2 lg:col-span-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{payable ? "Total you owe" : "Total owed to you"}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white" data-testid="ageing-total">{money(data.ageing.total)}</p>
                </div>
            </div>

            {fromStatement && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 px-3 py-2 text-sm text-slate-700 dark:text-slate-300" data-testid="statement-filter">
                    <span>
                        Showing {payable ? "bills" : "invoices"}
                        {filters.from || filters.to ? ` dated ${filters.from || "…"} to ${filters.to || "…"}` : ""}
                        {categoryName ? ` with ${categoryName}` : filters.category ? " in the chosen category" : ""}
                        {fundName ? ` on ${fundName}` : ""}
                        , from the statement. Drafts, void and opening-balance invoices are listed but not counted there.
                    </span>
                    <Link href={href(clearStatement)} className="text-indigo-600 hover:underline">Show all</Link>
                </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
                <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); router.push(href({ status: draft.status, q: draft.q.trim(), page: 1 })) }}>
                    <select aria-label="Status" className={selectClass} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as InvoiceFilters["status"] })}>
                        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <Input aria-label="Search" placeholder="Search payee, number, reference" className="h-9 w-64" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
                    <Button type="submit" size="sm" className="h-9">Apply</Button>
                    {(filters.status !== "all" || filters.q) && <Link href={href({ status: "all", q: "", page: 1 })} className="text-sm text-slate-500 hover:underline self-center">Clear</Link>}
                </form>
                <Button variant="outline" onClick={exportCsv} disabled={exporting || data.total === 0}>
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}Export CSV
                </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-left">
                        <tr>
                            <th className="px-3 py-2.5 font-medium">Number</th>
                            <th className="px-3 py-2.5 font-medium">{payable ? "Supplier" : "Bill to"}</th>
                            <th className="px-3 py-2.5 font-medium">Invoice date</th>
                            <th className="px-3 py-2.5 font-medium">Due</th>
                            <th className="px-3 py-2.5 font-medium text-right">Total</th>
                            <th className="px-3 py-2.5 font-medium text-right">Paid</th>
                            <th className="px-3 py-2.5 font-medium text-right">Balance</th>
                            <th className="px-3 py-2.5 font-medium">Status</th>
                            <th className="px-3 py-2.5 font-medium">Source</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.rows.length === 0 && (
                            <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                                {payable ? "No bills match. Bills you approve in the Inbox appear here automatically." : "No invoices match. Create one with the button above."}
                            </td></tr>
                        )}
                        {data.rows.map((r) => (
                            <tr key={r.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950/50" onClick={() => openDetail(r.id)}>
                                <td className="px-3 py-2.5 whitespace-nowrap font-medium text-indigo-600">
                                    {loading === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (r.invoice_no || <span className="text-slate-400 font-normal">{r.status === "draft" ? "Draft" : "—"}</span>)}
                                </td>
                                <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                                    {r.payee_name}
                                    {r.has_attachment && <Paperclip className="inline ml-1 h-3.5 w-3.5 text-slate-400" />}
                                    {r.is_opening_balance && <span className="ml-1 text-xs font-normal text-slate-500">(opening)</span>}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">{r.issue_date}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">{r.due_date ?? "—"}{r.days_overdue > 0 && <span className="ml-1 text-xs text-red-600">{r.days_overdue}d late</span>}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{money(r.total)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{money(r.paid)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums font-medium">{money(r.balance)}</td>
                                <td className="px-3 py-2.5"><StatusBadge status={r.derived_status} /></td>
                                <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{r.source === "document" ? "Uploaded bill" : "Entered"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Page {data.page} of {pages} ({data.total} invoices)</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => router.push(href({ page: data.page - 1 }))}><ChevronLeft className="h-4 w-4" />Previous</Button>
                        <Button variant="outline" size="sm" disabled={data.page >= pages} onClick={() => router.push(href({ page: data.page + 1 }))}>Next<ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            )}

            {detail && !form && (
                <InvoiceDetailDialog key={detail.invoice.id + detail.invoice.paid + detail.invoice.status} detail={detail} options={options} canWrite={canWrite}
                    onClose={() => { setDetail(null); if (filters.open) router.replace(href({})) }}
                    onEdit={() => setForm({ edit: detail, key: Date.now() })}
                    onChanged={refreshDetail} />
            )}
            {form && (
                <InvoiceDialog key={form.key} open direction={form.edit?.invoice.direction ?? filters.tab} options={options} edit={form.edit}
                    onOpenChange={(o) => { if (!o) setForm(null) }}
                    onSaved={async (id) => { const d = await getInvoiceDetail(id); setDetail(d) }} />
            )}
        </div>
    )
}
