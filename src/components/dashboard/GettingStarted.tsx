"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Circle, Sparkles, X } from "lucide-react"
import type { GettingStartedStep } from "@/utils/getting-started"

// "Getting started" (Phase 6, onboarding). The steps tick off from the records themselves; the card
// goes away once they are all done, or when someone hides it (remembered in this browser only). When it
// is hidden and the opening position is still missing, the short opening-position reminder shows instead.
export function GettingStarted({ steps, orgId, paid, needsOpening }: {
    steps: GettingStartedStep[]
    orgId: string
    paid: boolean
    needsOpening: boolean
}) {
    const key = `outlayd.gettingStarted.hidden.${orgId}`
    // Start hidden until the browser has been asked, so a hidden card never flashes up
    const [hidden, setHidden] = useState<boolean | null>(null)
    useEffect(() => {
        let value = false
        try { value = window.localStorage.getItem(key) === "1" } catch { /* private mode: show it */ }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once after mounting
        setHidden(value)
    }, [key])

    const done = steps.filter((s) => s.done).length
    const allDone = done === steps.length
    if (hidden === null) return null

    if (hidden || allDone) {
        return needsOpening ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3 text-sm" data-testid="opening-prompt">
                <span className="text-indigo-900 dark:text-indigo-200">
                    <span className="font-semibold">Set up your opening position</span> so your balance sheet and fund balances start from the right figures.
                </span>
                <Link href="/settings/opening-position" className="font-medium text-indigo-700 dark:text-indigo-300 hover:underline">Start now</Link>
            </div>
        ) : null
    }

    const hide = () => {
        try { window.localStorage.setItem(key, "1") } catch { /* nothing to remember it in */ }
        setHidden(true)
    }
    const next = steps.find((s) => !s.done)

    return (
        <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-800 shadow-sm" data-testid="getting-started" aria-labelledby="getting-started-title">
            <div className="flex items-start justify-between gap-3 px-5 pt-4">
                <div>
                    <h2 id="getting-started-title" className="text-lg font-semibold text-slate-900 dark:text-white">Getting started</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{done} of {steps.length} done</p>
                </div>
                <button type="button" onClick={hide} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700" aria-label="Hide getting started">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
            <ol className="mt-3 grid gap-px sm:grid-cols-2">
                {steps.map((s) => (
                    <li key={s.key} data-step={s.key} data-done={s.done ? "1" : "0"}>
                        <Link href={s.href} className={`flex gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 ${s === next ? "bg-indigo-50/60 dark:bg-indigo-950/20" : ""}`}>
                            {s.done
                                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="Done" />
                                : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" aria-label="To do" />}
                            <span>
                                <span className={`block text-sm font-medium ${s.done ? "text-slate-500 line-through decoration-slate-300" : "text-slate-900 dark:text-white"}`}>{s.title}</span>
                                {!s.done && <span className="block text-xs text-slate-500 dark:text-slate-400">{s.text}</span>}
                            </span>
                        </Link>
                    </li>
                ))}
            </ol>
            {!paid && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-700 px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    Growth adds money in, invoices, funds and financial statements.
                    <Link href="/reports/income-expenditure" className="font-medium text-indigo-600 hover:underline">See a sample statement</Link>
                </div>
            )}
        </section>
    )
}
