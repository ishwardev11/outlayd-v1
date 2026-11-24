"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { getCategories, getDocument, getFunds } from "@/app/actions/ledger"
import { errorMessage, type CategoryRow, type DocumentRow, type FundRow } from "@/utils/row-types"
import { ProcessingDrawer } from "./ProcessingDrawer"

// "Open document": shows the upload an entry or bill came from (its image, details, remarks and change
// history) in the same drawer as the Inbox, right where you are. Changes follow the same rules there
// (role, plan and locked periods).
export function DocumentOpener({ documentId, label = "Open document", className, title }: {
    documentId: string
    label?: string
    className?: string
    title?: string
}) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<{ doc: DocumentRow; funds: FundRow[]; categories: CategoryRow[] } | null>(null)

    const open = async () => {
        setLoading(true)
        try {
            const [doc, funds, categories] = await Promise.all([getDocument(documentId), getFunds(), getCategories()])
            setData({ doc: doc as DocumentRow, funds: (funds ?? []) as FundRow[], categories: (categories ?? []) as CategoryRow[] })
        } catch (e) {
            toast.error("That document could not be opened", { description: errorMessage(e) || undefined })
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <button type="button" onClick={open} disabled={loading} title={title}
                className={className ?? "inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs"} data-testid="open-document">
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}{label}
            </button>
            {data && (
                <ProcessingDrawer
                    isOpen
                    onClose={() => { setData(null); router.refresh() }}
                    document={data.doc}
                    funds={data.funds}
                    categories={data.categories}
                />
            )}
        </>
    )
}
