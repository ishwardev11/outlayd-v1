"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Loader2, AlertTriangle } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { errorMessage, errorProp } from "@/utils/row-types";

interface Preview {
    entries: number
    lines: number
    moneyInCents: number
    moneyOutCents: number
    linesWithoutAccountCode: number
    categoriesWithoutAccountCode: string[]
    currency: string
}

function formatMoney(cents: number, currency: string): string {
    const value = cents / 100
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value)
    } catch {
        return `${currency} ${value.toFixed(2)}`
    }
}

export function AccountingExportClient({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
    const [from, setFrom] = useState(defaultFrom)
    const [to, setTo] = useState(defaultTo)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const query = new URLSearchParams({ from, to }).toString()
    const ready = !!from && !!to && from <= to

    // Show what the export will contain before anything is downloaded
    useEffect(() => {
        if (!ready) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- the preview is fetched from the server whenever the filters change
            setPreview(null)
            setError(!from || !to ? null : "The start date must be on or before the end date")
            return
        }
        const controller = new AbortController()
        setLoading(true)
        setError(null)
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/accounting-export?${query}&preview=1`, { signal: controller.signal })
                const body = await res.json()
                if (!res.ok) throw new Error(body?.error || "Could not load the preview")
                setPreview(body as Preview)
            } catch (e) {
                if (errorProp(e, "name") === "AbortError") return
                setPreview(null)
                setError(errorMessage(e) || "Could not load the preview")
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }, 300)
        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [query, ready, from, to])

    const canDownload = ready && !loading && !error && !!preview && preview.entries > 0

    return (
        <div className="space-y-6">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-3">
                    <ArrowLeft className="h-4 w-4" /> Reports
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Accounting export</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Download your cash book (every payment in and out between two dates) as a CSV your accountant or accounting
                    software can import. Uploads still waiting for review are not in the cash book yet, so they are not included.
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="ae-from">From</Label>
                        <Input id="ae-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="ae-to">To</Label>
                        <Input id="ae-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                    A standard CSV that opens in Excel or imports into any accounting software: one row per fund and category
                    line, dated by the day the money moved, with the payee, type, category, account code, fund, account,
                    amount in or out, bill or invoice number, any original currency and remarks. Fund transfers and transfers
                    between your own accounts are not included, because no money comes in or goes out.
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">What will be exported</h2>
                {loading && (
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                    </p>
                )}
                {!loading && error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                {!loading && !error && preview && (
                    preview.entries === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Nothing came in or went out between these dates.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="export-preview">
                                <span className="font-semibold">{preview.entries}</span> entr{preview.entries === 1 ? "y" : "ies"} ({preview.lines} line{preview.lines === 1 ? "" : "s"}):
                                money in <span className="font-semibold tabular-nums">{formatMoney(preview.moneyInCents, preview.currency)}</span>,
                                money out <span className="font-semibold tabular-nums">{formatMoney(preview.moneyOutCents, preview.currency)}</span>
                            </p>
                            {preview.linesWithoutAccountCode > 0 && (
                                <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-300">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <p>
                                        {preview.linesWithoutAccountCode} line{preview.linesWithoutAccountCode === 1 ? " has" : "s have"} no accounting code ({preview.categoriesWithoutAccountCode.join(", ")}).
                                        {" Your accountant will need to assign these. "}
                                        You can add codes under <Link href="/settings?tab=financial" className="underline font-medium">Settings, Funds &amp; Categories</Link>.
                                    </p>
                                </div>
                            )}
                        </>
                    )
                )}

                {canDownload ? (
                    <a
                        href={`/api/accounting-export?${query}`}
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                    >
                        <Download className="h-4 w-4" />
                        Download CSV
                    </a>
                ) : (
                    <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed">
                        <Download className="h-4 w-4" />
                        Download CSV
                    </span>
                )}
            </div>

        </div>
    )
}
