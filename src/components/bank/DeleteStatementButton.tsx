"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
import { deleteBankStatement } from "@/app/actions/bank-statements"

export function DeleteStatementButton({ id, redirectTo, label = "Delete" }: { id: string; redirectTo?: string; label?: string }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)

    const remove = async () => {
        if (!window.confirm("Delete this statement and its lines? Documents and entries that were matched stay as they are.")) return
        setBusy(true)
        const res = await deleteBankStatement(id)
        setBusy(false)
        if (!res.ok) {
            toast.error("Could not delete the statement", { description: res.error })
            return
        }
        toast.success("Statement deleted")
        if (redirectTo) router.push(redirectTo)
        else router.refresh()
    }

    return (
        <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-60"
        >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {label}
        </button>
    )
}
