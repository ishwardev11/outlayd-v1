"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { updateFundDetails } from "@/app/actions/settings"
import { Fund } from "./SettingsLayout"

export function FundDetailsDialog({ fund, disabled }: { fund: Fund; disabled?: boolean }) {
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [donorName, setDonorName] = useState(fund.donor_name ?? "")
    const [grantReference, setGrantReference] = useState(fund.grant_reference ?? "")
    const [purpose, setPurpose] = useState(fund.purpose ?? "")
    const [awardAmount, setAwardAmount] = useState(fund.award_amount != null ? String(fund.award_amount) : "")
    const [periodStart, setPeriodStart] = useState(fund.period_start ?? "")
    const [periodEnd, setPeriodEnd] = useState(fund.period_end ?? "")

    const handleSave = async () => {
        if (periodStart && periodEnd && periodStart > periodEnd) {
            toast.error("The grant start date must be on or before the end date.")
            return
        }
        setSaving(true)
        try {
            await updateFundDetails(fund.id, {
                donor_name: donorName,
                grant_reference: grantReference,
                purpose,
                award_amount: awardAmount.trim() === "" ? null : Number(awardAmount),
                period_start: periodStart || null,
                period_end: periodEnd || null,
            })
            toast.success("Fund details saved")
            setOpen(false)
        } catch (e: any) {
            toast.error("Could not save fund details", { description: e?.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={disabled} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                    <Pencil className="w-4 h-4 mr-2" />
                    Details
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg dark:bg-slate-900 dark:border-slate-700">
                <DialogHeader>
                    <DialogTitle>{fund.name}: grant details</DialogTitle>
                    <DialogDescription>Shown on the Donor & Audit Memo. All fields are optional.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="donor">Donor / grantor</Label>
                            <Input id="donor" value={donorName} maxLength={255} onChange={(e) => setDonorName(e.target.value)} className="bg-white dark:bg-slate-900 dark:border-slate-700" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ref">Grant reference</Label>
                            <Input id="ref" value={grantReference} maxLength={100} onChange={(e) => setGrantReference(e.target.value)} className="bg-white dark:bg-slate-900 dark:border-slate-700" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="purpose">Purpose / restrictions</Label>
                        <Textarea id="purpose" value={purpose} maxLength={2000} rows={3} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Scholarships and learning materials only. No staff salaries." className="bg-white dark:bg-slate-900 dark:border-slate-700" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="award">Award amount</Label>
                        <Input id="award" type="number" min="0" step="0.01" value={awardAmount} onChange={(e) => setAwardAmount(e.target.value)} className="bg-white dark:bg-slate-900 dark:border-slate-700" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="gstart">Grant start</Label>
                            <Input id="gstart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-white dark:bg-slate-900 dark:border-slate-700" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="gend">Grant end</Label>
                            <Input id="gend" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-white dark:bg-slate-900 dark:border-slate-700" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Save details
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
