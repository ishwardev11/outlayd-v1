"use client"

import { useState } from "react"
import { History, Loader2 } from "lucide-react"
import { getRecordHistory, type HistoryRow } from "@/app/actions/assurance"
import { ChangeList } from "./ChangeList"

// "History" on an invoice, asset or loan: loaded when opened, newest first
export function RecordHistory({ recordId }: { recordId: string }) {
    const [rows, setRows] = useState<HistoryRow[] | null>(null)
    const [loading, setLoading] = useState(false)
    return (
        <details className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2" onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open && rows === null && !loading) {
                setLoading(true)
                getRecordHistory(recordId).then(setRows).finally(() => setLoading(false))
            }
        }}>
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <History className="h-4 w-4" />History
            </summary>
            <div className="mt-2">
                {loading || rows === null
                    ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    : <ChangeList rows={rows} compact empty="No changes recorded yet. Changes made from now on appear here." />}
            </div>
        </details>
    )
}
