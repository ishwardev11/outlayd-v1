"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Lock, LockOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getYearEnd, saveStatementNote, setLockDate, type YearEndState } from "@/app/actions/assurance"
import { formatDay } from "@/utils/lock"
import { UpgradeNotice } from "@/components/ui/UpgradeNotice"

// Lock the books up to a date (spec 3.9), the lock history and the line printed on statements. Shown on
// the Year end hub (moved from Settings > Year end in simplification step 5). Same rules: only Admins on
// a paid plan can lock, unlock or change the statement line; every change is logged by the database.
export function LockBooks() {
    const router = useRouter()
    const [state, setState] = useState<YearEndState | null>(null)
    const [date, setDate] = useState("")
    const [reason, setReason] = useState("")
    const [removeReason, setRemoveReason] = useState("")
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)

    const apply = (s: YearEndState | null) => {
        setState(s)
        setNote(s?.statementNote ?? "")
        setDate("")
        setReason("")
        setRemoveReason("")
    }
    useEffect(() => {
        let cancelled = false
        getYearEnd().then((s) => { if (!cancelled) apply(s) })
        return () => { cancelled = true }
    }, [])

    if (!state) return <div className="py-10 text-center text-slate-500"><Loader2 className="inline h-5 w-5 animate-spin" /></div>

    const current = state.lockDate
    const unlocking = current !== null && date !== "" && date < current
    const run = async (fn: () => Promise<{ success: boolean; error?: string }>, done: string) => {
        setBusy(true)
        try {
            const res = await fn()
            if (!res.success) return toast.error(res.error ?? "Something went wrong")
            toast.success(done)
            apply(await getYearEnd())
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-10">
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Lock the books</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Once a year (or a month) is finished and the statements are final, lock it. Nothing dated on or before the lock
                        date can then be added, changed or deleted, so the figures you reported stay as they were. Paying an old invoice
                        later still works, because the payment is dated after the lock.
                    </p>
                </div>

                <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${current ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300"}`}>
                    {current ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                    {current ? `The books are locked up to ${formatDay(current)}` : "The books are not locked"}
                    {state.startDate && <span className="ml-auto text-xs font-normal text-slate-500">Tracking since {formatDay(state.startDate)}</span>}
                </div>

                {!state.lockPaid && <UpgradeNotice context="period_lock">Locking periods is part of the Growth and Nonprofit plans.</UpgradeNotice>}
                {state.lockPaid && !state.isAdmin && <p className="text-sm text-slate-500">Only Admins can lock or unlock a period.</p>}

                {state.canLock && (
                    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-4" onSubmit={(e) => {
                        e.preventDefault()
                        run(() => setLockDate({ date, reason }), unlocking ? "Period unlocked" : "Books locked")
                    }}>
                        <label className="text-xs text-slate-500">Lock everything up to and including<br />
                            <Input aria-label="Lock date" type="date" className="h-9 w-44" max={state.today} value={date} onChange={(e) => setDate(e.target.value)} />
                        </label>
                        {unlocking && (
                            <label className="text-xs text-slate-500 flex-1 min-w-[16rem]">Reason for unlocking (kept in the history)<br />
                                <Input aria-label="Reason for unlocking" className="h-9" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="For example: the auditor asked for a correction" />
                            </label>
                        )}
                        <Button type="submit" size="sm" className="h-9" disabled={busy || !date || (unlocking && !reason.trim())}>
                            {unlocking ? "Unlock to this date" : "Lock"}
                        </Button>
                        {current && (
                            <details className="w-full text-sm">
                                <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Remove the lock completely</summary>
                                <div className="mt-2 flex flex-wrap items-end gap-3">
                                    <Input aria-label="Reason for removing the lock" className="h-9 flex-1 min-w-[16rem]" value={removeReason} maxLength={500}
                                        onChange={(e) => setRemoveReason(e.target.value)} placeholder="Reason (kept in the history)" />
                                    <Button type="button" size="sm" variant="outline" className="h-9" disabled={busy || !removeReason.trim()}
                                        onClick={() => { if (window.confirm("Remove the lock? Every period can then be changed again.")) run(() => setLockDate({ date: null, reason: removeReason }), "Lock removed") }}>
                                        Remove the lock
                                    </Button>
                                </div>
                            </details>
                        )}
                    </form>
                )}

                <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Lock history</h3>
                    {state.history.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">No locks yet.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            {state.history.map((h, i) => (
                                <li key={i} className="py-2">
                                    <div className="flex flex-wrap gap-x-2">
                                        <span className="font-medium text-slate-900 dark:text-slate-100">{h.action}</span>
                                        <span className="text-slate-600 dark:text-slate-300">{h.details.join("; ")}</span>
                                    </div>
                                    <div className="text-xs text-slate-500">{h.when} · {h.who}{h.reason ? ` · Reason: ${h.reason}` : ""}</div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            <section className="space-y-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Statement line</h2>
                    <p className="mt-1 text-sm text-slate-500">A short line printed at the foot of your statements, for example &ldquo;Prepared from Outlayd records, unaudited&rdquo;.</p>
                </div>
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => saveStatementNote(note), "Statement line saved") }}>
                    <Textarea aria-label="Statement line" value={note} maxLength={300} rows={2} disabled={!state.isAdmin || busy} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex items-center gap-3">
                        {state.isAdmin && <Button type="submit" size="sm" disabled={busy || note === (state.statementNote ?? "")}>Save</Button>}
                        <span className="text-xs text-slate-500">{note.length}/300{!state.isAdmin && " · Only Admins can change it"}</span>
                    </div>
                </form>
            </section>

        </div>
    )
}
