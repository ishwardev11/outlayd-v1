"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Circle, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GettingStartedStep } from "@/utils/getting-started"
import type { DashboardMode } from "@/utils/dashboard"
import { useDashboardUpload } from "./DashboardUpload"

const STEP_ACTION: Record<string, string> = {
    upload: "Upload a receipt", approve: "Review it now", money_in: "Record money in", opening: "Set it up", reconcile: "Reconcile a month", team: "Invite your team",
}

// "Getting started" (Phase 6 onboarding, dashboard polish). Shown only in new mode (see dashboardMode in
// utils/dashboard.ts): a welcome card with progress, the next step large, and every step listed. The steps
// tick off from the records themselves. Hiding it is remembered in this browser (same key as before) and
// switches the page to working mode, where the only reminder left is the slim opening-position banner.
export function GettingStartedCard({ steps, orgId, orgName, mode, paid, needsOpening }: {
    steps: GettingStartedStep[]
    orgId: string
    orgName: string
    mode: DashboardMode
    paid: boolean
    needsOpening: boolean
}) {
    const key = `outlayd.gettingStarted.hidden.${orgId}`
    // Unknown until the browser has been asked, so a hidden card never flashes up
    const [hidden, setHidden] = useState<boolean | null>(null)
    const upload = useDashboardUpload()
    useEffect(() => {
        let value = false
        try { value = window.localStorage.getItem(key) === "1" } catch { /* private mode: show it */ }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once after mounting
        setHidden(value)
    }, [key])

    const done = steps.filter((s) => s.done).length
    const next = steps.find((s) => !s.done)
    if (hidden === null) return null

    if (mode !== "new" || hidden || !next) {
        return needsOpening ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/30 px-4 py-3 text-sm" data-testid="opening-prompt">
                <span className="text-brand-900 dark:text-brand-200">
                    <span className="font-semibold">Set up your opening position</span> so your balances and statements start from the right figures.
                </span>
                <Link href="/settings/opening-position" className="font-medium text-brand-700 dark:text-brand-300 hover:underline">Start now</Link>
            </div>
        ) : null
    }

    const hide = () => {
        try { window.localStorage.setItem(key, "1") } catch { /* nothing to remember it in */ }
        setHidden(true)
    }
    const nextIsUpload = next.key === "upload" && upload.canUpload

    return (
        <section className="relative overflow-hidden rounded-2xl border border-brand-100 dark:border-brand-900 bg-white dark:bg-slate-800 shadow-sm" data-testid="getting-started" aria-labelledby="getting-started-title">
            <button type="button" onClick={hide} className="absolute right-3 top-3 z-10 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700" aria-label="Hide getting started">
                <X className="h-4 w-4" />
            </button>
            <div className="grid md:grid-cols-[minmax(0,1fr)_220px] lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="p-5 sm:p-6">
                    <h2 id="getting-started-title" className="pr-8 text-xl font-semibold text-slate-900 dark:text-white">Let&apos;s get {orgName} set up</h2>
                    <div className="mt-2 flex items-center gap-3">
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-950" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress">
                            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(4, (done / steps.length) * 100)}%` }} />
                        </div>
                        <span className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">{done} of {steps.length} done</span>
                    </div>

                    {/* The next step, large */}
                    <div className="mt-5 rounded-xl bg-brand-50 dark:bg-brand-950/40 p-4 sm:p-5" data-testid="next-step" data-step={next.key}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">Next step</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{next.title}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{next.text}</p>
                        <div className="mt-4">
                            {nextIsUpload ? (
                                <Button onClick={upload.pick} disabled={upload.uploading} className="bg-brand-600 hover:bg-brand-700 text-white">
                                    {STEP_ACTION.upload}<ArrowRight className="h-4 w-4 ml-1.5" />
                                </Button>
                            ) : (
                                <Button asChild className="bg-brand-600 hover:bg-brand-700 text-white">
                                    <Link href={next.href}>{STEP_ACTION[next.key] ?? "Go"}<ArrowRight className="h-4 w-4 ml-1.5" /></Link>
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Every step, compact */}
                    <ol className="mt-4 space-y-0.5" aria-label="All setup steps">
                        {steps.map((s, i) => (
                            <li key={s.key} data-step={s.key} data-done={s.done ? "1" : "0"}>
                                <Link href={s.href} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                                    {s.done
                                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-teal-600" aria-label="Done" />
                                        : <Circle className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-label="To do" />}
                                    <span className={`flex-1 text-sm ${s.done ? "text-slate-500 line-through decoration-slate-300" : s === next ? "font-medium text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300"}`}>{s.title}</span>
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-brand-600" aria-hidden />
                                </Link>
                            </li>
                        ))}
                    </ol>

                    {!paid && (
                        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <Sparkles className="h-4 w-4 text-brand-500" />
                            Growth adds money in, invoices, funds and financial statements.
                            <Link href="/reports/income-expenditure" className="font-medium text-brand-700 dark:text-brand-300 hover:underline">See a sample statement</Link>
                        </p>
                    )}
                </div>

                {/* Decoration only: hidden on phones */}
                <div className="hidden md:flex items-center justify-center bg-linear-to-br from-brand-50 via-white to-brand-teal-50 dark:from-brand-950/50 dark:via-slate-800 dark:to-brand-teal-950/40" aria-hidden>
                    <WelcomeIllustration />
                </div>
            </div>
        </section>
    )
}

// A receipt, a coin and a tick, in brand tints
function WelcomeIllustration() {
    return (
        <svg viewBox="0 0 200 200" className="h-44 w-44 lg:h-52 lg:w-52" role="presentation">
            <circle cx="100" cy="100" r="78" className="fill-brand-100/70 dark:fill-brand-900/40" />
            <g transform="rotate(-6 100 100)">
                <path d="M62 40h76v118l-9.5-7-9.5 7-9.5-7-9.5 7-9.5-7-9.5 7-9.5-7-9.5 7z" className="fill-white dark:fill-slate-700 stroke-brand-200 dark:stroke-brand-800" strokeWidth="2" strokeLinejoin="round" />
                <rect x="76" y="58" width="48" height="6" rx="3" className="fill-brand-200 dark:fill-brand-700" />
                <rect x="76" y="74" width="34" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
                <rect x="76" y="86" width="40" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
                <rect x="76" y="98" width="28" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
                <rect x="76" y="118" width="48" height="2" rx="1" className="fill-slate-200 dark:fill-slate-600" />
                <rect x="100" y="126" width="24" height="7" rx="3.5" className="fill-brand-500" />
            </g>
            <circle cx="148" cy="138" r="20" className="fill-brand-amber-300 stroke-brand-amber-500" strokeWidth="3" />
            <circle cx="148" cy="138" r="11" className="fill-none stroke-brand-amber-500" strokeWidth="2" />
            <circle cx="56" cy="64" r="16" className="fill-brand-teal-500" />
            <path d="M49 64l5 5 9-10" className="fill-none stroke-white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
