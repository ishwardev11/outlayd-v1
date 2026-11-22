"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Loader2, XCircle } from "lucide-react"
import { getStatementAssurance, getStatementFrame, setLockDate, type StatementAssurance } from "@/app/actions/assurance"
import { buildStatementPdf } from "@/utils/statement-pdf"
import type { StatementPrint } from "@/utils/statement-print"
import { formatDay } from "@/utils/lock"

// "Ready to submit" (spec 8): the checks for the period of the statement on screen. Blocking checks must
// pass for the statement to be final; until then its PDF is marked DRAFT. Warnings are listed but do
// not block. Each failing check links to where it can be fixed.
export function ReadyToSubmit({ from, to }: { from: string; to: string }) {
    const [data, setData] = useState<StatementAssurance | null | undefined>(undefined)
    const [open, setOpen] = useState(false)
    useEffect(() => {
        let cancelled = false
        getStatementAssurance(from, to).then((d) => { if (!cancelled) setData(d) }).catch(() => { if (!cancelled) setData(null) })
        return () => { cancelled = true }
    }, [from, to])

    if (data === undefined) {
        return <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking the books for this period…</div>
    }
    if (data === null) return null
    const failing = data.checks.filter((c) => c.severity === "block" && c.passed === false)
    const warnings = data.checks.filter((c) => c.severity === "warning" && c.passed === false)
    const tone = failing.length > 0
        ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300"
        : warnings.length > 0
            ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
            : "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
    const summary = failing.length > 0
        ? `Not ready to submit: ${failing.length} check${failing.length === 1 ? "" : "s"} to fix. PDFs are marked DRAFT until then.`
        : warnings.length > 0
            ? `Ready to submit, with ${warnings.length} warning${warnings.length === 1 ? "" : "s"} to look at.`
            : "Ready to submit: every check passes."

    return (
        <div className={`rounded-lg border ${tone}`} data-testid="ready-to-submit">
            <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium" onClick={() => setOpen(!open)} aria-expanded={open}>
                {failing.length > 0 ? <XCircle className="h-4 w-4 shrink-0" /> : warnings.length > 0 ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span className="flex-1">{summary}{data.lockDate && to <= data.lockDate ? ` This period is locked (up to ${formatDay(data.lockDate)}).` : ""}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <ul className="divide-y divide-black/5 dark:divide-white/10 border-t border-black/5 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 text-sm text-slate-700 dark:text-slate-300">
                    {data.checks.map((c) => (
                        <li key={c.code} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
                            {c.passed === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Passed" />
                                : c.passed === null ? <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="Does not apply" />
                                : c.severity === "block" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Failed" />
                                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Warning" />}
                            <div className="flex-1 min-w-[12rem]">
                                <span>{c.title}</span>
                                {c.severity === "warning" && <span className="ml-2 text-xs text-slate-500">(warning)</span>}
                                {c.detail && <span className="block text-xs text-slate-500">{c.detail}</span>}
                            </div>
                            {c.fixHref && c.passed === false && <Link href={c.fixHref} className="text-xs font-medium text-indigo-600 hover:underline">{c.fixLabel}</Link>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

// Builds and downloads the PDF of the statement on screen. A final PDF (every blocking check passes) of a
// period that is not locked yet offers an Admin to lock it, so the figures just reported stay as they are.
export function useStatementPdf() {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const exportPdf = async (print: StatementPrint, from: string, to: string) => {
        setBusy(true)
        try {
            const res = await getStatementFrame(from, to)
            if (!res.success || !res.data) return toast.error(res.success ? "Could not prepare the PDF" : res.error)
            const f = res.data
            buildStatementPdf(print, { ...f, draft: !f.assurance.final }).save(print.fileName)
            if (!f.assurance.final) {
                toast.warning("Downloaded as a DRAFT", { description: "Some checks do not pass yet. Open \"Ready to submit\" to see what to fix." })
            } else if (f.assurance.canLockPeriod) {
                toast.success("Final PDF downloaded", {
                    description: `Lock the books up to ${formatDay(to)} so these figures cannot change?`,
                    duration: 20000,
                    action: {
                        label: "Lock the period",
                        onClick: async () => {
                            const r = await setLockDate({ date: to })
                            if (!r.success) toast.error(r.error)
                            else { toast.success(`Books locked up to ${formatDay(to)}`); router.refresh() }
                        },
                    },
                })
            } else {
                toast.success("Final PDF downloaded")
            }
        } catch (e) {
            console.error(e)
            toast.error("Could not build the PDF. Please try again.")
        } finally {
            setBusy(false)
        }
    }
    return { exportPdf, busy }
}
