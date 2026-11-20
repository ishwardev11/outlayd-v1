"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Loader2, AlertTriangle } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { errorMessage, errorProp } from "@/utils/row-types";

interface Preview {
    documents: number
    lines: number
    totalCents: number
    linesWithoutAccountCode: number
    categoriesWithoutAccountCode: string[]
    splitMismatchDocuments: number
    currency: string
}

const selectClass =
    "w-full h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white disabled:opacity-60"

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
    const [dateField, setDateField] = useState<"document_date" | "paid_date">("document_date")
    const [scope, setScope] = useState<"paid" | "approved">("paid")
    const [preview, setPreview] = useState<Preview | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const effectiveScope = dateField === "paid_date" ? "paid" : scope
    const query = new URLSearchParams({ from, to, scope: effectiveScope, dateField }).toString()
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

    const canDownload = ready && !loading && !error && !!preview && preview.documents > 0

    return (
        <div className="space-y-6">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-3">
                    <ArrowLeft className="h-4 w-4" /> Reports
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Accounting export</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Download approved documents as a CSV your accountant or accounting software can import. Documents that are still waiting for review are never included.
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
                    <div className="space-y-1.5">
                        <Label htmlFor="ae-date-field">Date to filter by</Label>
                        <select id="ae-date-field" className={selectClass} value={dateField} onChange={(e) => setDateField(e.target.value as typeof dateField)}>
                            <option value="document_date">Invoice or receipt date</option>
                            <option value="paid_date">Payment date</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="ae-scope">Include</Label>
                        <select id="ae-scope" className={selectClass} value={effectiveScope} disabled={dateField === "paid_date"} onChange={(e) => setScope(e.target.value as typeof scope)}>
                            <option value="paid">Paid documents only</option>
                            <option value="approved">Paid and awaiting payment</option>
                        </select>
                    </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                    A standard CSV that opens in Excel or imports into any accounting software: one row per fund and category
                    allocation, with the vendor, dates, category, account code, fund, amount, any original currency and remarks.
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
                    preview.documents === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            No approved documents match. Documents with no date are not included, and a document only appears once it has been approved.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                <span className="font-semibold">{preview.documents}</span> document{preview.documents === 1 ? "" : "s"} ({preview.lines} line{preview.lines === 1 ? "" : "s"}),
                                total <span className="font-semibold tabular-nums">{formatMoney(preview.totalCents, preview.currency)}</span>
                            </p>
                            {preview.linesWithoutAccountCode > 0 && (
                                <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-300">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <p>
                                        {preview.linesWithoutAccountCode} line{preview.linesWithoutAccountCode === 1 ? " has" : "s have"} no accounting code ({preview.categoriesWithoutAccountCode.join(", ")}).
                                        {" Your accountant will need to assign these. "}
                                        You can add codes under <Link href="/settings" className="underline font-medium">Settings, Expense Categories</Link>.
                                    </p>
                                </div>
                            )}
                            {preview.splitMismatchDocuments > 0 && (
                                <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-300">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <p>
                                        {preview.splitMismatchDocuments} document{preview.splitMismatchDocuments === 1 ? " has" : "s have"} fund splits that do not add up to the document total.
                                        They are exported as recorded, so check them in the ledger first.
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
