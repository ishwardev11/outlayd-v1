"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCurrency } from "@/components/CurrencyProvider"
import { LockedNotice } from "@/components/LockProvider"
import { deleteReconciliation, saveReconciliation, type ReconciliationPage, type ReconciliationRow } from "@/app/actions/assurance"
import { formatDay, isLockedDate, lockedMessage } from "@/utils/lock"

const selectClass = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

function toNumber(s: string): number | null {
    const t = s.trim().replace(/,/g, "")
    return /^-?\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null
}

export function ReconciliationsClient({ data }: { data: ReconciliationPage }) {
    const router = useRouter()
    const { symbol } = useCurrency()
    const money = (n: number) => `${n < 0 ? "-" : ""}${symbol}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const locked = isLockedDate(data.periodEnd, data.lockDate)
    const editable = data.canEdit && !locked
    const done = data.rows.filter((r) => !r.archived && r.reconciliation_id).length
    const open = data.rows.filter((r) => !r.archived).length

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reconciliations</h1>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                        At each month-end, enter the closing balance from the bank statement of every account. Outlayd shows its own
                        balance and the difference. A difference is normal while a payment has not cleared or a bank fee is not yet entered;
                        explain it in the note.
                    </p>
                </div>
                <label className="text-xs text-slate-500">Month-end<br />
                    <select aria-label="Month-end" className={selectClass} value={data.periodEnd} onChange={(e) => router.push(`/reconciliations?month=${e.target.value}`)}>
                        {data.monthEnds.map((m) => (
                            <option key={m.date} value={m.date}>{formatDay(m.date)}{m.reconciled > 0 ? ` (${m.reconciled} reconciled)` : ""}</option>
                        ))}
                    </select>
                </label>
            </div>

            {!data.paid && <p className="text-sm text-amber-700">Recording reconciliations is part of the Growth and Nonprofit plans. Existing ones stay available to view.</p>}
            {data.paid && !data.canEdit && <p className="text-sm text-slate-500">Only Admins and Editors can record reconciliations.</p>}
            {locked && data.lockDate && <LockedNotice text={`${formatDay(data.periodEnd)} is in a locked period. ${lockedMessage(data.lockDate)}`} />}

            <p className="text-sm text-slate-600 dark:text-slate-300">
                {open === 0 ? "No accounts yet." : done === open
                    ? <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Every account is reconciled at {formatDay(data.periodEnd)}</span>
                    : `${done} of ${open} account${open === 1 ? "" : "s"} reconciled at ${formatDay(data.periodEnd)}`}
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-left text-slate-600 dark:text-slate-400">
                        <tr>
                            <th className="px-3 py-2 font-medium">Account</th>
                            <th className="px-3 py-2 font-medium text-right">Outlayd balance</th>
                            <th className="px-3 py-2 font-medium">Statement balance</th>
                            <th className="px-3 py-2 font-medium text-right">Difference</th>
                            <th className="px-3 py-2 font-medium">Note</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.rows.map((r) => (
                            <Row key={`${data.periodEnd}-${r.account_id}`} row={r} periodEnd={data.periodEnd} editable={editable} money={money} symbol={symbol}
                                onDone={() => router.refresh()} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function Row({ row, periodEnd, editable, money, symbol, onDone }: {
    row: ReconciliationRow; periodEnd: string; editable: boolean; money: (n: number) => string; symbol: string; onDone: () => void
}) {
    const [balance, setBalance] = useState(row.statement_balance !== null ? row.statement_balance.toFixed(2) : "")
    const [note, setNote] = useState(row.note ?? "")
    const [busy, setBusy] = useState(false)
    const entered = toNumber(balance)
    const diff = entered === null ? null : Math.round((entered - row.outlayd_balance) * 100) / 100
    const changed = balance !== (row.statement_balance !== null ? row.statement_balance.toFixed(2) : "") || note !== (row.note ?? "")
    const suggestion = row.suggested_balance !== null && row.suggested_balance !== entered ? row.suggested_balance : null

    const run = async (fn: () => Promise<{ success: boolean; error?: string }>, msg: string) => {
        setBusy(true)
        try {
            const res = await fn()
            if (!res.success) return toast.error(res.error ?? "Something went wrong")
            toast.success(msg)
            onDone()
        } finally {
            setBusy(false)
        }
    }

    return (
        <tr className={row.archived ? "text-slate-400" : ""}>
            <td className="px-3 py-2.5 font-medium align-top">
                {row.account_name}{row.archived && <span className="ml-2 text-xs font-normal">archived</span>}
                {row.reconciliation_id && !changed && (diff === 0 || (diff !== null && row.note))
                    ? <CheckCircle2 aria-label="Reconciled" className="ml-2 inline h-4 w-4 text-emerald-600" /> : null}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums align-top">{money(row.outlayd_balance)}</td>
            <td className="px-3 py-2.5 align-top">
                <Input aria-label={`Statement balance of ${row.account_name}`} className="h-9 w-36" inputMode="decimal" placeholder={`${symbol}0.00`}
                    value={balance} disabled={!editable || busy} onChange={(e) => setBalance(e.target.value)} />
                {editable && suggestion !== null && (
                    <button type="button" className="mt-1 block text-xs text-indigo-600 hover:underline" onClick={() => setBalance(suggestion.toFixed(2))}>
                        Use {money(suggestion)} from your uploaded bank statement
                    </button>
                )}
            </td>
            <td className={`px-3 py-2.5 text-right tabular-nums align-top ${diff ? "text-amber-700 dark:text-amber-400" : ""}`}>
                {diff === null ? "—" : diff === 0 ? money(0) : <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{money(diff)}</span>}
            </td>
            <td className="px-3 py-2.5 align-top">
                <Input aria-label={`Note for ${row.account_name}`} className="h-9 min-w-[14rem]" value={note} maxLength={500} disabled={!editable || busy}
                    placeholder={diff ? "Explain the difference" : ""} onChange={(e) => setNote(e.target.value)} />
            </td>
            <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">
                {editable && (
                    <>
                        <Button size="sm" className="h-9" disabled={busy || entered === null || !changed}
                            onClick={() => run(() => saveReconciliation({ account_id: row.account_id, period_end: periodEnd, statement_balance: balance, note }), "Reconciliation saved")}>
                            Save
                        </Button>
                        {row.reconciliation_id && (
                            <button type="button" className="ml-3 text-xs text-red-600 hover:underline" disabled={busy}
                                onClick={() => { if (window.confirm("Remove this reconciliation?")) run(() => deleteReconciliation(row.reconciliation_id as string), "Reconciliation removed") }}>
                                Remove
                            </button>
                        )}
                    </>
                )}
            </td>
        </tr>
    )
}
