"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { IEFilters } from "@/utils/income-expenditure"

const selectClass = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

// Period, fund, layout and comparison controls shared by the financial statements. The filters live
// in the URL, so a statement can be bookmarked or shared within the organisation.
export function StatementControls({ basePath, filters, funds, showLayout, onExport, onExportPdf, pdfBusy, exportDisabled, showFund = true, showCompare = true, extraParams }: {
    basePath: string
    filters: IEFilters
    funds: { id: string; name: string; archived: boolean }[]
    showLayout: boolean
    onExport: () => void
    onExportPdf?: () => void
    pdfBusy?: boolean
    exportDisabled: boolean
    showFund?: boolean
    showCompare?: boolean
    // extra query parameters a page keeps (e.g. the schedules' donor list switch)
    extraParams?: Record<string, string>
}) {
    const router = useRouter()
    const [custom, setCustom] = useState({ from: filters.from, to: filters.to })

    const go = (patch: Partial<Record<"period" | "from" | "to" | "fund" | "compare" | "layout", string>>) => {
        const next = {
            period: filters.period, from: filters.from, to: filters.to, fund: filters.fund,
            compare: filters.compare ? "1" : "0", layout: filters.layout, ...patch,
        }
        const p = new URLSearchParams()
        p.set("period", next.period)
        if (next.period === "custom") { p.set("from", next.from); p.set("to", next.to) }
        if (next.fund) p.set("fund", next.fund)
        if (next.compare === "0") p.set("compare", "0")
        if (showLayout && next.layout === "by_fund") p.set("layout", "by_fund")
        for (const [k, v] of Object.entries(extraParams ?? {})) if (v) p.set(k, v)
        router.push(`${basePath}?${p.toString()}`)
    }

    return (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <label className="text-xs text-slate-500">Period<br />
                <select aria-label="Period" className={selectClass} value={filters.period}
                    onChange={(e) => go(e.target.value === "custom" ? { period: "custom", from: custom.from, to: custom.to } : { period: e.target.value })}>
                    <option value="current">This financial year</option>
                    <option value="previous">Last financial year</option>
                    <option value="custom">Custom dates</option>
                </select>
            </label>
            {filters.period === "custom" && (
                <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); go({ from: custom.from, to: custom.to }) }}>
                    <label className="text-xs text-slate-500">From<br /><Input type="date" aria-label="From" className="h-9 w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">To<br /><Input type="date" aria-label="To" className="h-9 w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
                    <Button type="submit" size="sm" className="h-9">Apply</Button>
                </form>
            )}
            {showFund && (
                <label className="text-xs text-slate-500">Fund<br />
                    <select aria-label="Fund" className={selectClass} value={filters.fund} onChange={(e) => go({ fund: e.target.value })}>
                        <option value="">All funds</option>
                        {funds.map((f) => <option key={f.id} value={f.id}>{f.name}{f.archived ? " (archived)" : ""}</option>)}
                    </select>
                </label>
            )}
            {showLayout && (
                <label className="text-xs text-slate-500">Layout<br />
                    <select aria-label="Layout" className={selectClass} value={filters.layout} onChange={(e) => go({ layout: e.target.value })}>
                        <option value="total">Totals</option>
                        <option value="by_fund">One column per fund</option>
                    </select>
                </label>
            )}
            {showCompare && filters.layout === "total" && (
                <label className="flex h-9 items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={filters.compare} onChange={(e) => go({ compare: e.target.checked ? "1" : "0" })} />
                    Compare with the year before
                </label>
            )}
            <div className="ml-auto flex gap-2">
                {onExportPdf && (
                    <Button variant="outline" className="h-9" onClick={onExportPdf} disabled={exportDisabled || pdfBusy}>
                        {pdfBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Export PDF
                    </Button>
                )}
                <Button variant="outline" className="h-9" onClick={onExport} disabled={exportDisabled}>
                    <Download className="mr-2 h-4 w-4" />Export CSV
                </Button>
            </div>
        </div>
    )
}
