"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, UploadCloud } from "lucide-react"

// accounts: the active accounts to choose from; the statement belongs to one of them (main account by default)
export function BankStatementUpload({ accounts = [] }: { accounts?: { id: string; name: string; is_default: boolean }[] }) {
    const router = useRouter()
    const input = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [existingId, setExistingId] = useState<string | null>(null)
    const [accountId, setAccountId] = useState(accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? "")

    const upload = async (file: File) => {
        setError(null)
        setExistingId(null)
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            setError("Only PDF bank statements can be imported for now.")
            return
        }
        if (file.size > 4 * 1024 * 1024) {
            setError("That PDF is larger than 4 MB. Try uploading one month at a time.")
            return
        }
        setBusy(true)
        try {
            const body = new FormData()
            body.append("file", file)
            if (accountId) body.append("account_id", accountId)
            const res = await fetch("/api/bank-statements", { method: "POST", body })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(json?.error || "The upload failed. Please try again.")
                if (json?.existingId) setExistingId(json.existingId)
                return
            }
            router.refresh()
        } catch {
            setError("The upload failed. Check your connection and try again.")
        } finally {
            setBusy(false)
            if (input.current) input.current.value = ""
        }
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Import a bank statement</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Upload a PDF statement (up to 4 MB). The lines are read for you, then matched to your invoices, receipts and cash book entries. Only the last four digits of the account number are kept.
            </p>
            <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }}
            />
            {accounts.length > 1 && (
                <label className="mt-4 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Account this statement is for
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy}
                        className="mt-1 block h-9 w-full max-w-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white">
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_default ? " (main)" : ""}</option>)}
                    </select>
                </label>
            )}
            <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white transition-colors"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {busy ? "Uploading…" : "Choose PDF"}
            </button>
            {error && (
                <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
                    {error}{" "}
                    {existingId && <Link href={`/bank/${existingId}`} className="underline font-medium">Open it</Link>}
                </p>
            )}
        </div>
    )
}
