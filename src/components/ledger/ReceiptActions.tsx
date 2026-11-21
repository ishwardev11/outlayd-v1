"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileText, Loader2, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { getReceiptForPdf, issueDonationReceipt, voidDonationReceipt } from "@/app/actions/receipts"
import { buildReceiptContent } from "@/utils/donation-receipt"
import { buildDonationReceiptPdf } from "@/utils/donation-receipt-pdf"
import type { CashBookRow } from "@/utils/cash-book"

async function downloadReceipt(id: string, number: string) {
    const res = await getReceiptForPdf(id)
    if (!res.success || !res.data) {
        toast.error(res.success ? "That receipt was not found" : res.error)
        return
    }
    buildDonationReceiptPdf(buildReceiptContent(res.data.receipt, res.data.org)).save(`receipt-${number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`)
}

// Issue, download and void donation receipts for one cash book entry (spec 5.3).
// canWrite: Admin or Editor on a paid plan. Downloading is open to everyone who can see the entry.
export function ReceiptActions({ row, canWrite }: { row: CashBookRow; canWrite: boolean }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [voiding, setVoiding] = useState(false)
    const [reason, setReason] = useState("")
    const active = row.receipt && !row.receipt.voided ? row.receipt : null
    const lastVoided = row.receipt?.voided ? row.receipt : null

    const issue = async () => {
        setBusy(true)
        try {
            const res = await issueDonationReceipt(row.id)
            if (!res.success || !res.data) return toast.error(res.success ? "Could not issue the receipt" : res.error)
            toast.success(`Receipt ${res.data.receiptNo} issued`)
            await downloadReceipt(res.data.id, res.data.receiptNo)
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const confirmVoid = async () => {
        if (!active) return
        setBusy(true)
        try {
            const res = await voidDonationReceipt(active.id, reason)
            if (!res.success) return toast.error(res.error)
            toast.success(`Receipt ${active.number} voided. Its number stays used.`)
            setVoiding(false)
            setReason("")
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex items-center justify-end gap-2 text-xs">
            {active && (
                <>
                    <button type="button" onClick={() => downloadReceipt(active.id, active.number)} className="inline-flex items-center gap-1 text-indigo-600 hover:underline" title="Download the receipt PDF">
                        <FileText className="h-3.5 w-3.5" />{active.number}
                    </button>
                    {canWrite && <button type="button" onClick={() => setVoiding(true)} className="text-red-600 hover:underline">Void</button>}
                </>
            )}
            {!active && lastVoided && (
                <button type="button" onClick={() => downloadReceipt(lastVoided.id, lastVoided.number)} className="text-slate-400 line-through hover:underline" title="Voided receipt (download)">
                    {lastVoided.number}
                </button>
            )}
            {!active && row.donation && canWrite && (
                <button type="button" onClick={issue} disabled={busy} className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}Issue receipt
                </button>
            )}

            <Dialog open={voiding} onOpenChange={(o) => { if (!o) setVoiding(false) }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Void receipt {active?.number}</DialogTitle>
                        <DialogDescription>
                            The receipt stays on record marked VOID and its number is never reused. You can then edit the entry and issue a new receipt, which gets the next number.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea aria-label="Reason for voiding" placeholder="Reason, e.g. wrong donor name" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setVoiding(false)} disabled={busy}>Cancel</Button>
                        <Button onClick={confirmVoid} disabled={busy || !reason.trim()} className="bg-red-600 hover:bg-red-700 text-white">
                            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Void receipt
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
