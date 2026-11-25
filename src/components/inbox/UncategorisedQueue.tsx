"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Loader2, Lock, Sparkles, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCurrency } from "@/components/CurrencyProvider"
import { useLock } from "@/components/LockProvider"
import { acceptCategories, suggestUncategorisedWithAi, type AcceptChoice, type QueueItem, type UncategorisedQueue as Queue } from "@/app/actions/uncategorised"
import type { CategorySuggestion } from "@/utils/category-suggest"

const selectClass = "h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"
const KIND_LABEL = { document: "Upload", transaction: "Entry", invoice: "Invoice" } as const

// Entries in the books as Uncategorised (step 8), with a suggested category for each. One tap accepts a
// suggestion, a different category can be picked, and "Accept all suggestions" saves every suggestion
// after a confirmation. Year-end statements stay in draft while anything here is left.
export function UncategorisedQueue({ queue, from, to }: { queue: Queue; from: string | null; to: string | null }) {
    const router = useRouter()
    const { symbol } = useCurrency()
    const lock = useLock()
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const [ai, setAi] = useState<Record<string, CategorySuggestion>>({})
    const [picks, setPicks] = useState<Record<string, string>>({})
    const [always, setAlways] = useState<Record<string, boolean>>({})
    const [busy, setBusy] = useState<string | null>(null)
    const [aiBusy, setAiBusy] = useState(false)

    const suggestionFor = (i: QueueItem) => i.suggestion ?? ai[i.key] ?? null
    const chosen = (i: QueueItem) => picks[i.key] ?? suggestionFor(i)?.categoryId ?? ""
    const catName = useMemo(() => new Map(queue.categories.map((c) => [c.id, c.name])), [queue.categories])
    const open = queue.items.filter((i) => !lock.isLocked(i.date))
    const withSuggestion = open.filter((i) => !!suggestionFor(i))
    const noSuggestion = open.filter((i) => !suggestionFor(i))

    const choiceFor = (i: QueueItem, categoryId: string): AcceptChoice => ({
        kind: i.kind, recordId: i.recordId, lineId: i.lineId, categoryId,
        alwaysForPayeeId: always[i.key] && i.payeeId ? i.payeeId : null,
    })

    const save = async (choices: AcceptChoice[], label: string) => {
        setBusy(label)
        try {
            const res = await acceptCategories(choices)
            if (!res.success) return toast.error(res.error)
            const { saved, failed } = res.data
            if (saved > 0) toast.success(saved === 1 ? "Category saved" : `${saved} categories saved`)
            if (failed.length > 0) toast.error(`${failed.length} could not be saved: ${failed[0].error}`, { duration: 10000 })
            router.refresh()
        } finally {
            setBusy(null)
        }
    }

    const acceptAll = () => {
        if (withSuggestion.length === 0) return
        if (!window.confirm(`Save the suggested category for ${withSuggestion.length} ${withSuggestion.length === 1 ? "entry" : "entries"}? Check the list first: each change is recorded in the history.`)) return
        save(withSuggestion.map((i) => choiceFor(i, chosen(i))), "all")
    }

    const askAi = async () => {
        setAiBusy(true)
        try {
            const res = await suggestUncategorisedWithAi(noSuggestion.map((i) => i.key), from, to)
            if (!res.success) return toast.error(res.error, { duration: 8000 })
            const n = Object.keys(res.data).length
            setAi((cur) => ({ ...cur, ...res.data }))
            toast[n > 0 ? "success" : "info"](n > 0 ? `The AI suggested ${n} ${n === 1 ? "category" : "categories"}. Check them before accepting.` : "The AI could not suggest a category for these. Choose them by hand.")
        } finally {
            setAiBusy(false)
        }
    }

    if (queue.items.length === 0) return null

    return (
        <section id="uncategorised" className="rounded-xl border border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-900 p-4 space-y-3" data-testid="uncategorised-queue">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                        <Tags className="h-5 w-5 text-amber-600" />Uncategorised <span className="text-sm font-normal text-slate-500">({queue.items.length})</span>
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        These are in the books without a real category{from || to ? ` (${from ?? "start"} to ${to ?? "today"})` : ""}. Year-end statements stay in draft until they are categorised.
                        {(from || to) && <> <Link href="/inbox#uncategorised" className="text-indigo-600 hover:underline">Show all</Link></>}
                    </p>
                </div>
                {queue.canWrite && (
                    <div className="flex flex-wrap gap-2">
                        {queue.canUseAi && noSuggestion.length > 0 && (
                            <Button variant="outline" size="sm" disabled={aiBusy || !!busy} onClick={askAi} data-testid="ai-suggest">
                                {aiBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                                Suggest with AI ({Math.min(noSuggestion.length, 25)})
                            </Button>
                        )}
                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={withSuggestion.length === 0 || !!busy || aiBusy} onClick={acceptAll} data-testid="accept-all">
                            {busy === "all" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Accept all suggestions ({withSuggestion.length})
                        </Button>
                    </div>
                )}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {queue.items.map((i) => {
                    const sug = suggestionFor(i)
                    const value = chosen(i)
                    const locked = lock.isLocked(i.date)
                    const choices = queue.categories.filter((c) => c.kind === i.categoryKind)
                    return (
                        <div key={i.key} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_15rem_auto] sm:items-center">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                    {i.payeeName || "No contact"}<span className="ml-2 font-normal tabular-nums">{money(i.amount)}</span>
                                    <span className="ml-2 text-xs font-normal text-slate-500">{KIND_LABEL[i.kind]} · {i.direction === "in" ? "money in" : "money out"} · {i.date}</span>
                                </p>
                                {i.description && <p className="text-xs text-slate-500 truncate">{i.description}</p>}
                                {sug ? (
                                    <p className="text-xs text-emerald-700 dark:text-emerald-400">Suggested: {catName.get(sug.categoryId)} · {sug.reason}</p>
                                ) : (
                                    <p className="text-xs text-slate-400">No suggestion: choose a category</p>
                                )}
                                {queue.canWrite && !locked && i.direction === "out" && i.payeeId && (
                                    <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                        <input type="checkbox" checked={!!always[i.key]} onChange={(e) => setAlways({ ...always, [i.key]: e.target.checked })} />
                                        Always use this category for {i.payeeName}
                                    </label>
                                )}
                            </div>
                            {locked ? (
                                <p className="flex items-center gap-1 text-xs text-slate-500 sm:col-span-2"><Lock className="h-3.5 w-3.5" />In a locked period</p>
                            ) : queue.canWrite ? (
                                <>
                                    <select aria-label="Category" className={selectClass} value={value} onChange={(e) => setPicks({ ...picks, [i.key]: e.target.value })}>
                                        <option value="">Choose a category…</option>
                                        {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <Button size="sm" variant="outline" disabled={!value || !!busy || aiBusy} onClick={() => save([choiceFor(i, value)], i.key)}>
                                        {busy === i.key ? <Loader2 className="h-4 w-4 animate-spin" /> : value && sug && value === sug.categoryId ? "Accept" : "Save"}
                                    </Button>
                                </>
                            ) : (
                                <p className="text-xs text-slate-500 sm:col-span-2">Only Admins and Editors can change categories.</p>
                            )}
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
