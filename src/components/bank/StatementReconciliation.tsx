"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
    confirmBankMatch, confirmBankMatchesBulk, searchMatchableDocuments, setBankTransactionIgnored, unmatchBankTransaction,
} from "@/app/actions/bank-statements"
import { formatCents } from "@/utils/format-cents"
import type { BankTransactionView, DocSummary, StatementDetail } from "@/utils/bank-statement-types"
import { DeleteStatementButton } from "./DeleteStatementButton"

type Filter = "attention" | "matched" | "ignored" | "in" | "all"

const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-60"
const primary = `${btn} bg-indigo-600 hover:bg-indigo-700 text-white`
const outline = `${btn} border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800`

export function StatementReconciliation({ detail, canEdit }: { detail: StatementDetail; canEdit: boolean }) {
    const router = useRouter()
    const { statement, transactions, baseCurrency } = detail
    const currency = statement.currency ?? baseCurrency
    const [busyId, setBusyId] = useState<string | null>(null)
    const [bulkBusy, setBulkBusy] = useState(false)
    const [picker, setPicker] = useState<BankTransactionView | null>(null)

    const counts = useMemo(() => {
        const out = transactions.filter((t) => t.cents < 0)
        return {
            out: out.length,
            matched: transactions.filter((t) => t.status === "matched").length,
            attention: out.filter((t) => t.status === "unmatched").length,
            ignored: transactions.filter((t) => t.status === "ignored").length,
            moneyIn: transactions.filter((t) => t.cents > 0).length,
            strong: transactions.filter((t) => t.status === "unmatched" && t.suggestion?.strong),
        }
    }, [transactions])

    const [filter, setFilter] = useState<Filter>(counts.attention > 0 ? "attention" : "all")
    const visible = transactions.filter((t) =>
        filter === "all" ? true
        : filter === "attention" ? t.cents < 0 && t.status === "unmatched"
        : filter === "matched" ? t.status === "matched"
        : filter === "ignored" ? t.status === "ignored"
        : t.cents > 0
    )

    const run = async (id: string, work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
        setBusyId(id)
        try {
            const res = await work()
            if (!res.ok) toast.error("That did not work", { description: res.error })
            else {
                toast.success(success)
                router.refresh()
            }
        } finally {
            setBusyId(null)
        }
    }

    const confirm = (t: BankTransactionView, doc: DocSummary) => {
        if (doc.cents !== Math.abs(t.cents) && !window.confirm(
            `The payment is ${formatCents(Math.abs(t.cents), currency)} but the document is ${formatCents(doc.cents, baseCurrency)}. Match them anyway?`
        )) return
        return run(t.id, () => confirmBankMatch(t.id, doc.id, true), doc.status === "awaiting_payment" ? "Matched and marked as paid" : "Matched")
    }

    const ignore = (t: BankTransactionView) => {
        const reason = window.prompt("Why is this payment not an expense? (optional, for example: bank fee, transfer between accounts)", "")
        if (reason === null) return
        return run(t.id, () => setBankTransactionIgnored(t.id, true, reason), "Payment ignored")
    }

    const confirmStrong = async () => {
        const pairs = counts.strong.map((t) => ({ transactionId: t.id, documentId: t.suggestion!.doc.id }))
        const unpaid = counts.strong.filter((t) => t.suggestion!.doc.status === "awaiting_payment").length
        if (!window.confirm(`Confirm ${pairs.length} strong match${pairs.length === 1 ? "" : "es"}?${unpaid ? ` ${unpaid} unpaid document${unpaid === 1 ? " is" : "s are"} marked as paid on the date the money left the bank.` : ""}`)) return
        setBulkBusy(true)
        let done = 0
        const failures: string[] = []
        try {
            for (let i = 0; i < pairs.length; i += 10) {
                const res = await confirmBankMatchesBulk(pairs.slice(i, i + 10))
                done += res.done
                failures.push(...res.failed.map((f) => f.error))
            }
        } finally {
            setBulkBusy(false)
        }
        if (failures.length > 0) toast.error(`${failures.length} could not be matched`, { description: failures[0] })
        if (done > 0) toast.success(`${done} payment${done === 1 ? "" : "s"} matched`)
        router.refresh()
    }

    const tab = (key: Filter, label: string, n: number) => (
        <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filter === key
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
        >
            {label} <span className="opacity-80">({n})</span>
        </button>
    )

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {statement.bank_name || "Bank statement"}
                        {statement.account_last4 && <span className="text-slate-500 dark:text-slate-400 font-normal"> •••• {statement.account_last4}</span>}
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {statement.period_start && statement.period_end ? `${statement.period_start} to ${statement.period_end}` : "Period not shown on the statement"}
                        {statement.opening_balance !== null && statement.closing_balance !== null &&
                            ` · Opening ${formatCents(Math.round(Number(statement.opening_balance) * 100), currency)} · Closing ${formatCents(Math.round(Number(statement.closing_balance) * 100), currency)}`}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <a href={`/api/files/statement/${statement.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> Open PDF
                    </a>
                    {canEdit && <DeleteStatementButton id={statement.id} redirectTo="/bank-statements" label="Delete statement" />}
                </div>
            </div>

            {statement.warning && (
                <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{statement.warning}</p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {tab("attention", "Need attention", counts.attention)}
                {tab("matched", "Matched", counts.matched)}
                {tab("ignored", "Ignored", counts.ignored)}
                {tab("in", "Money in", counts.moneyIn)}
                {tab("all", "All", transactions.length)}
                {canEdit && counts.strong.length > 0 && (
                    <button type="button" onClick={confirmStrong} disabled={bulkBusy} className={`${primary} ml-auto`}>
                        {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Confirm {counts.strong.length} strong match{counts.strong.length === 1 ? "" : "es"}
                    </button>
                )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-3 font-medium whitespace-nowrap">Date</th>
                            <th className="px-4 py-3 font-medium">Description</th>
                            <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Amount</th>
                            <th className="px-4 py-3 font-medium">Match</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {visible.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">Nothing here.</td></tr>
                        )}
                        {visible.map((t) => (
                            <tr key={t.id} className="align-top">
                                <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{t.date}</td>
                                <td className="px-4 py-3 text-slate-900 dark:text-slate-100 max-w-xs break-words">{t.description || "—"}</td>
                                <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium ${t.cents < 0 ? "text-slate-900 dark:text-slate-100" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {formatCents(t.cents, null)}
                                </td>
                                <td className="px-4 py-3 min-w-[18rem]">
                                    <MatchCell
                                        t={t}
                                        baseCurrency={baseCurrency}
                                        canEdit={canEdit}
                                        busy={busyId === t.id}
                                        onConfirm={(doc) => confirm(t, doc)}
                                        onPick={() => setPicker(t)}
                                        onIgnore={() => ignore(t)}
                                        onUndoIgnore={() => run(t.id, () => setBankTransactionIgnored(t.id, false), "Payment is back in the list")}
                                        onUnmatch={() => window.confirm("Remove this match? The document stays as it is.") && run(t.id, () => unmatchBankTransaction(t.id), "Match removed")}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <DocumentPicker
                transaction={picker}
                baseCurrency={baseCurrency}
                onClose={() => setPicker(null)}
                onSelect={(doc) => {
                    const t = picker
                    setPicker(null)
                    if (t) void confirm(t, doc)
                }}
            />
        </div>
    )
}

function docLine(d: DocSummary, baseCurrency: string) {
    return `${d.vendor}${d.invoiceNumber ? ` · ${d.invoiceNumber}` : ""} · ${formatCents(d.cents, baseCurrency)}${d.date ? ` · ${d.date}` : ""}`
}

function MatchCell(props: {
    t: BankTransactionView; baseCurrency: string; canEdit: boolean; busy: boolean
    onConfirm: (doc: DocSummary) => void; onPick: () => void; onIgnore: () => void; onUndoIgnore: () => void; onUnmatch: () => void
}) {
    const { t, baseCurrency, canEdit, busy } = props
    const spinner = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null

    if (t.status === "matched") {
        return (
            <div className="space-y-1">
                <div className="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="text-slate-900 dark:text-slate-100">{t.matchedDoc ? docLine(t.matchedDoc, baseCurrency) : "Matched document"}</span>
                </div>
                {canEdit && <button type="button" disabled={busy} onClick={props.onUnmatch} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">{spinner}Remove match</button>}
            </div>
        )
    }
    if (t.status === "ignored") {
        return (
            <div className="space-y-1 text-slate-600 dark:text-slate-400">
                <div>Ignored{t.ignoreReason ? `: ${t.ignoreReason}` : ""}</div>
                {canEdit && <button type="button" disabled={busy} onClick={props.onUndoIgnore} className="text-xs hover:underline">{spinner}Undo</button>}
            </div>
        )
    }
    if (t.cents > 0) return <span className="text-slate-500 dark:text-slate-400">Money in. Not matched to expenses.</span>

    return (
        <div className="space-y-2">
            {t.suggestion ? (
                <div className="space-y-1">
                    <div className="text-slate-900 dark:text-slate-100">
                        <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1.5">{t.suggestion.strong ? "Strong match" : "Possible match"}</span>
                        {docLine(t.suggestion.doc, baseCurrency)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        {t.suggestion.reasons.join(", ")}
                        {t.suggestion.alternatives > 0 && ` · ${t.suggestion.alternatives} other document${t.suggestion.alternatives === 1 ? "" : "s"} fit about as well`}
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>No matching document. Is there paperwork for this payment?</span>
                </div>
            )}
            {canEdit && (
                <div className="flex flex-wrap gap-2">
                    {t.suggestion && (
                        <button type="button" disabled={busy} onClick={() => props.onConfirm(t.suggestion!.doc)} className={primary}>
                            {spinner}{t.suggestion.doc.status === "awaiting_payment" ? "Confirm and mark paid" : "Confirm"}
                        </button>
                    )}
                    <button type="button" disabled={busy} onClick={props.onPick} className={outline}>{t.suggestion ? "Choose another" : "Find document"}</button>
                    <button type="button" disabled={busy} onClick={props.onIgnore} className={outline}>Ignore</button>
                </div>
            )}
        </div>
    )
}

function DocumentPicker({ transaction, baseCurrency, onClose, onSelect }: {
    transaction: BankTransactionView | null; baseCurrency: string; onClose: () => void; onSelect: (d: DocSummary) => void
}) {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<DocSummary[]>([])
    const [loading, setLoading] = useState(false)

    // Opening the picker for another payment clears the search box
    const [pickerFor, setPickerFor] = useState(transaction)
    if (transaction !== pickerFor) {
        setPickerFor(transaction)
        if (transaction) setQuery("")
    }

    useEffect(() => {
        if (!transaction) return
        let cancelled = false
        // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the spinner as soon as a server search starts
        setLoading(true)
        const timer = setTimeout(async () => {
            try {
                const rows = await searchMatchableDocuments(query, transaction.id)
                if (!cancelled) setResults(rows)
            } catch {
                if (!cancelled) setResults([])
            } finally {
                if (!cancelled) setLoading(false)
            }
        }, query ? 300 : 0)
        return () => { cancelled = true; clearTimeout(timer) }
    }, [transaction, query])

    return (
        <Dialog open={!!transaction} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Choose a document</DialogTitle>
                    <DialogDescription>
                        {transaction ? `${transaction.description || "Payment"} · ${formatCents(Math.abs(transaction.cents), null)}. Only approved, unmatched documents are listed.` : ""}
                    </DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by vendor or invoice number" className="pl-9" />
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800">
                    {loading && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Searching…</p>}
                    {!loading && results.length === 0 && (
                        <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                            {query ? "No approved documents match." : "No unmatched document has this exact amount. Search by vendor or invoice number."}
                        </p>
                    )}
                    {!loading && results.map((d) => (
                        <button key={d.id} type="button" onClick={() => onSelect(d)} className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm text-slate-900 dark:text-slate-100">
                            {docLine(d, baseCurrency)}
                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{d.status === "paid" ? "Paid" : "Awaiting payment"}</span>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
