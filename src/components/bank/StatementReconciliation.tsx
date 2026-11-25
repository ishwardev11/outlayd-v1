"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
    confirmBankMatch, confirmBankMatchesBulk, searchMatchTargets, setBankTransactionIgnored, setStatementAccount, unmatchBankTransaction,
} from "@/app/actions/bank-statements"
import type { EntryOptions } from "@/app/actions/transactions"
import { TransactionDialog } from "@/components/ledger/TransactionDialog"
import { formatCents } from "@/utils/format-cents"
import type { BankTransactionView, MatchTarget, StatementDetail } from "@/utils/bank-statement-types"
import { DeleteStatementButton } from "./DeleteStatementButton"

type Filter = "attention" | "matched" | "ignored" | "all"

const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-60"
const primary = `${btn} bg-indigo-600 hover:bg-indigo-700 text-white`
const outline = `${btn} border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800`

// entryOptions: the money in / money out form's choices, given only to people who can write
export function StatementReconciliation({ detail, canEdit, entryOptions = null }: { detail: StatementDetail; canEdit: boolean; entryOptions?: EntryOptions | null }) {
    const router = useRouter()
    const { statement, transactions, baseCurrency, accountName, isMainAccount } = detail
    const currency = statement.currency ?? baseCurrency
    const [busyId, setBusyId] = useState<string | null>(null)
    const [bulkBusy, setBulkBusy] = useState(false)
    const [picker, setPicker] = useState<BankTransactionView | null>(null)
    const [recording, setRecording] = useState<BankTransactionView | null>(null)

    const counts = useMemo(() => ({
        matched: transactions.filter((t) => t.status === "matched").length,
        attention: transactions.filter((t) => t.status === "unmatched").length,
        ignored: transactions.filter((t) => t.status === "ignored").length,
        strong: transactions.filter((t) => t.status === "unmatched" && t.suggestion?.strong),
    }), [transactions])

    const [filter, setFilter] = useState<Filter>(counts.attention > 0 ? "attention" : "all")
    const visible = transactions.filter((t) =>
        filter === "all" ? true
        : filter === "attention" ? t.status === "unmatched"
        : filter === "matched" ? t.status === "matched"
        : t.status === "ignored"
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

    const confirm = (t: BankTransactionView, target: MatchTarget) => {
        if (target.cents !== Math.abs(t.cents) && !window.confirm(
            `The bank line is ${formatCents(Math.abs(t.cents), currency)} but the ${target.kind === "document" ? "document" : "entry"} is ${formatCents(target.cents, baseCurrency)}. Match them anyway?`
        )) return
        return run(t.id, () => confirmBankMatch(t.id, target.kind, target.id, true), target.unpaid ? "Matched and marked as paid" : "Matched")
    }

    const ignore = (t: BankTransactionView) => {
        const reason = window.prompt("Why does this line need nothing recorded? (optional, for example: already recorded elsewhere, reversed the same day)", "")
        if (reason === null) return
        return run(t.id, () => setBankTransactionIgnored(t.id, true, reason), "Line ignored")
    }

    const confirmStrong = async () => {
        const pairs = counts.strong.map((t) => ({ lineId: t.id, kind: t.suggestion!.target.kind, targetId: t.suggestion!.target.id }))
        const unpaid = counts.strong.filter((t) => t.suggestion!.target.unpaid).length
        if (!window.confirm(`Confirm ${pairs.length} strong match${pairs.length === 1 ? "" : "es"}?${unpaid ? ` ${unpaid} unpaid bill${unpaid === 1 ? " is" : "s are"} marked as paid on the date the money left the bank.` : ""}`)) return
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
        if (done > 0) toast.success(`${done} line${done === 1 ? "" : "s"} matched`)
        router.refresh()
    }

    // After the form saves a new entry for a line, match the line to it (money out is saved as a paid
    // document with no file, so the line is matched to that document)
    const linkNewEntry = async (line: BankTransactionView, saved: { kind: "transaction" | "document"; id: string }) => {
        const res = await confirmBankMatch(line.id, saved.kind, saved.id, false)
        if (!res.ok) toast.error("The entry was saved but not matched to this line", { description: `${res.error} Match it with Find a match.` })
        else toast.success("Line matched to the new entry")
    }

    const changeAccount = (accountId: string) => {
        if (!accountId || accountId === statement.account_id) return
        return run(statement.id, () => setStatementAccount(statement.id, accountId), "Account changed")
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

    const recordMode = recording ? (recording.cents < 0 ? "out" : "in") : "in"
    const activeAccounts = entryOptions?.accounts.filter((a) => !a.archived || a.id === statement.account_id) ?? []

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
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span>Account:</span>
                        {canEdit && activeAccounts.length > 1 && counts.matched === 0 ? (
                            <select aria-label="Account" value={statement.account_id ?? ""} disabled={busyId === statement.id}
                                onChange={(e) => changeAccount(e.target.value)}
                                className="h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white">
                                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        ) : (
                            <span className="font-medium text-slate-900 dark:text-slate-100" data-testid="statement-account">{accountName ?? "Not set"}</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <a href={`/api/files/statement/${statement.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> Open PDF
                    </a>
                    {canEdit && <DeleteStatementButton id={statement.id} redirectTo="/bank" label="Delete statement" />}
                </div>
            </div>

            {statement.warning && (
                <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{statement.warning}</p>
                </div>
            )}
            {!isMainAccount && (
                <p className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-600 dark:text-slate-400">
                    Uploaded invoices and receipts, and money out recorded without a receipt, are paid from your main account.
                    On this statement, lines are matched to entries in {accountName ?? "this account"} only.
                </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {tab("attention", "Need attention", counts.attention)}
                {tab("matched", "Matched", counts.matched)}
                {tab("ignored", "Ignored", counts.ignored)}
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
                            <tr key={t.id} className="align-top" data-testid={`bank-line-${t.id}`}>
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
                                        canRecord={!!entryOptions && (t.cents > 0 || isMainAccount)}
                                        busy={busyId === t.id}
                                        onConfirm={(target) => confirm(t, target)}
                                        onPick={() => setPicker(t)}
                                        onRecord={() => setRecording(t)}
                                        onIgnore={() => ignore(t)}
                                        onUndoIgnore={() => run(t.id, () => setBankTransactionIgnored(t.id, false), "Line is back in the list")}
                                        onUnmatch={() => window.confirm("Remove this match? The document or entry stays as it is.") && run(t.id, () => unmatchBankTransaction(t.id), "Match removed")}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <TargetPicker
                line={picker}
                baseCurrency={baseCurrency}
                onClose={() => setPicker(null)}
                onSelect={(target) => {
                    const t = picker
                    setPicker(null)
                    if (t) void confirm(t, target)
                }}
            />

            {recording && entryOptions && (
                <TransactionDialog
                    key={recording.id}
                    open
                    onOpenChange={(open) => { if (!open) setRecording(null) }}
                    mode={recordMode}
                    options={entryOptions}
                    prefill={{
                        date: recording.date,
                        amount: (Math.abs(recording.cents) / 100).toFixed(2),
                        reference: recording.description.slice(0, 100),
                        accountId: statement.account_id,
                    }}
                    onSaved={(saved) => linkNewEntry(recording, saved)}
                />
            )}
        </div>
    )
}

function targetLine(d: MatchTarget, baseCurrency: string) {
    return `${d.payee}${d.reference ? ` · ${d.reference}` : ""} · ${formatCents(d.cents, baseCurrency)}${d.date ? ` · ${d.date}` : ""}`
}

function MatchCell(props: {
    t: BankTransactionView; baseCurrency: string; canEdit: boolean; canRecord: boolean; busy: boolean
    onConfirm: (target: MatchTarget) => void; onPick: () => void; onRecord: () => void; onIgnore: () => void; onUndoIgnore: () => void; onUnmatch: () => void
}) {
    const { t, baseCurrency, canEdit, canRecord, busy } = props
    const spinner = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null
    const moneyIn = t.cents > 0

    if (t.status === "matched") {
        return (
            <div className="space-y-1">
                <div className="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="text-slate-900 dark:text-slate-100">
                        {t.matched ? <>{targetLine(t.matched, baseCurrency)} <span className="text-xs text-slate-500 dark:text-slate-400">({t.matched.label})</span></> : "Matched"}
                    </span>
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

    return (
        <div className="space-y-2">
            {t.suggestion ? (
                <div className="space-y-1">
                    <div className="text-slate-900 dark:text-slate-100">
                        <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1.5">{t.suggestion.strong ? "Strong match" : "Possible match"}</span>
                        {targetLine(t.suggestion.target, baseCurrency)}
                        <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">({t.suggestion.target.label})</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        {t.suggestion.reasons.join(", ")}
                        {t.suggestion.alternatives > 0 && ` · ${t.suggestion.alternatives} other${t.suggestion.alternatives === 1 ? "" : "s"} fit about as well`}
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{moneyIn ? "Nothing recorded for this money in yet." : "Nothing recorded for this payment yet. Is there paperwork for it?"}</span>
                </div>
            )}
            {canEdit && (
                <div className="flex flex-wrap gap-2">
                    {t.suggestion && (
                        <button type="button" disabled={busy} onClick={() => props.onConfirm(t.suggestion!.target)} className={primary}>
                            {spinner}{t.suggestion.target.unpaid ? "Confirm and mark paid" : "Confirm"}
                        </button>
                    )}
                    <button type="button" disabled={busy} onClick={props.onPick} className={outline}>{t.suggestion ? "Choose another" : "Find a match"}</button>
                    {canRecord && (
                        <button type="button" disabled={busy} onClick={props.onRecord} className={outline}>
                            {moneyIn ? "Record as money in" : "Record as money out"}
                        </button>
                    )}
                    <button type="button" disabled={busy} onClick={props.onIgnore} className={outline}>Ignore</button>
                </div>
            )}
        </div>
    )
}

function TargetPicker({ line, baseCurrency, onClose, onSelect }: {
    line: BankTransactionView | null; baseCurrency: string; onClose: () => void; onSelect: (d: MatchTarget) => void
}) {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<MatchTarget[]>([])
    const [loading, setLoading] = useState(false)

    // Opening the picker for another line clears the search box
    const [pickerFor, setPickerFor] = useState(line)
    if (line !== pickerFor) {
        setPickerFor(line)
        if (line) setQuery("")
    }

    useEffect(() => {
        if (!line) return
        let cancelled = false
        // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the spinner as soon as a server search starts
        setLoading(true)
        const timer = setTimeout(async () => {
            try {
                const rows = await searchMatchTargets(query, line.id)
                if (!cancelled) setResults(rows)
            } catch {
                if (!cancelled) setResults([])
            } finally {
                if (!cancelled) setLoading(false)
            }
        }, query ? 300 : 0)
        return () => { cancelled = true; clearTimeout(timer) }
    }, [line, query])

    const moneyIn = (line?.cents ?? 0) > 0
    return (
        <Dialog open={!!line} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Find a match</DialogTitle>
                    <DialogDescription>
                        {line ? `${line.description || "Bank line"} · ${formatCents(Math.abs(line.cents), null)}. ${moneyIn
                            ? "Money in, refunds and transfers into this account that are not matched yet."
                            : "Approved invoices and receipts, money out and transfers out of this account that are not matched yet."}` : ""}
                    </DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by contact, invoice number or reference" className="pl-9" />
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800">
                    {loading && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Searching…</p>}
                    {!loading && results.length === 0 && (
                        <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                            {query ? "Nothing unmatched fits that search." : "Nothing unmatched has this exact amount. Search by contact, invoice number or reference."}
                        </p>
                    )}
                    {!loading && results.map((d) => (
                        <button key={`${d.kind}-${d.id}`} type="button" onClick={() => onSelect(d)} className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm text-slate-900 dark:text-slate-100">
                            {targetLine(d, baseCurrency)}
                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{d.label}</span>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
