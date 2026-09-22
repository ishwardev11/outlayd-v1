"use client"

import { useState } from "react"
import { updateOrganizationSettings, deleteOrganizationAccount } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save, AlertTriangle, Trash2 } from "lucide-react"
import { useRole } from "@/components/RoleProvider"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

import { OrgSettings } from "./SettingsLayout"

export function OrganizationProfileTab({ orgSettings }: { orgSettings: OrgSettings | null }) {
    const router = useRouter()
    const { isViewer, isAdmin } = useRole()
    const [isSaving, setIsSaving] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const [confirmText, setConfirmText] = useState("")
    const [isDeleting, setIsDeleting] = useState(false)
    const [formData, setFormData] = useState({
        name: orgSettings?.name || "",
        registration_id: orgSettings?.registration_id || "",
        base_currency: orgSettings?.base_currency || "USD",
        fiscal_year_start: orgSettings?.fiscal_year_start?.toString() || "1"
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)
        try {
            await updateOrganizationSettings({
                ...formData,
                fiscal_year_start: parseInt(formData.fiscal_year_start)
            })
            alert("Settings saved successfully!")
        } catch (error) {
            console.error(error)
            alert("Failed to save settings")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteAccount = async () => {
        setIsDeleting(true)
        try {
            const res = await deleteOrganizationAccount()
            if (res.success) {
                const supabase = createClient()
                await supabase.auth.signOut()
                setIsConfirmOpen(false)
                router.push("/")
            } else {
                throw new Error("Deletion failed")
            }
        } catch (error) {
            console.error(error)
            alert("Failed to delete organization account. Please try again.")
            setIsDeleting(false)
        }
    }

    return (
        <div className="max-w-2xl space-y-12">
            <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Organization Profile</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="orgName" className="dark:text-slate-200">Organization Name</Label>
                        <Input
                            id="orgName"
                            value={formData.name}
                            onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                            className="dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="registrationId" className="dark:text-slate-200">Registration / Tax ID</Label>
                        <Input
                            id="registrationId"
                            value={formData.registration_id}
                            onChange={(e) => setFormData(f => ({ ...f, registration_id: e.target.value }))}
                            placeholder="e.g. 12-3456789"
                            className="dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="dark:text-slate-200">Base Currency</Label>
                            <Select
                                value={formData.base_currency}
                                onValueChange={(val) => setFormData(f => ({ ...f, base_currency: val }))}
                            >
                                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500">
                                    <SelectValue placeholder="Select currency" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USD">USD ($)</SelectItem>
                                    <SelectItem value="EUR">EUR (€)</SelectItem>
                                    <SelectItem value="GBP">GBP (£)</SelectItem>
                                    <SelectItem value="CAD">CAD ($)</SelectItem>
                                    <SelectItem value="AUD">AUD ($)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="dark:text-slate-200">Fiscal Year Start Month</Label>
                            <Select
                                value={formData.fiscal_year_start}
                                onValueChange={(val) => setFormData(f => ({ ...f, fiscal_year_start: val }))}
                            >
                                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500">
                                    <SelectValue placeholder="Select month" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">January</SelectItem>
                                    <SelectItem value="4">April</SelectItem>
                                    <SelectItem value="7">July</SelectItem>
                                    <SelectItem value="10">October</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button type="submit" disabled={isSaving || isViewer} title={isViewer ? "Viewers cannot edit organization settings" : ""} className="bg-indigo-600 hover:bg-indigo-700">
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </div>

            {/* Danger Zone */}
            {isAdmin && (
                <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
                    <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/50 rounded-xl p-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-red-900 dark:text-red-400 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-500" />
                                    Danger Zone
                                </h3>
                                <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">
                                    Permanently delete this organization, all database records (invoices, vendors, documents), all user accounts, and cancel any Stripe subscriptions.
                                </p>
                            </div>
                            <div>
                                <Dialog open={isConfirmOpen} onOpenChange={(open) => {
                                    setIsConfirmOpen(open)
                                    if (!open) setConfirmText("")
                                }}>
                                    <DialogTrigger asChild>
                                        <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white shrink-0">
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete Account
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-800">
                                        <DialogHeader>
                                            <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                                                <AlertTriangle className="w-5 h-5" />
                                                Are you absolutely sure?
                                            </DialogTitle>
                                            <DialogDescription asChild>
                                                <div className="text-slate-600 dark:text-slate-400 text-sm mt-2 space-y-2">
                                                    <p>
                                                        This action is <strong className="text-red-600 dark:text-red-400">permanent</strong> and cannot be undone. It will:
                                                    </p>
                                                    <ul className="list-disc pl-5 space-y-1">
                                                        <li>Cancel your Stripe subscription (if on the Growth plan).</li>
                                                        <li>Delete all transaction records, invoices, categories, and vendors.</li>
                                                        <li>Permanently delete the user accounts of all team members.</li>
                                                    </ul>
                                                    <p className="mt-4">
                                                        Please type the organization name <span className="font-semibold text-slate-900 dark:text-white">&quot;{orgSettings?.name}&quot;</span> to confirm.
                                                    </p>
                                                </div>
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="my-4">
                                            <Input
                                                placeholder="Type organization name"
                                                value={confirmText}
                                                onChange={(e) => setConfirmText(e.target.value)}
                                                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                            />
                                        </div>
                                        <DialogFooter className="gap-2 sm:gap-0">
                                            <Button
                                                variant="outline"
                                                onClick={() => setIsConfirmOpen(false)}
                                                className="dark:border-slate-700 dark:text-slate-300"
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                disabled={confirmText !== orgSettings?.name || isDeleting}
                                                onClick={handleDeleteAccount}
                                                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                                            >
                                                {isDeleting ? (
                                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...</>
                                                ) : (
                                                    "Permanently Delete"
                                                )}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

