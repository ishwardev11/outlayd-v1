"use client"

import { useState } from "react"
import { updateOrganizationSettings } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save } from "lucide-react"

export function OrganizationProfileTab({ orgSettings }: { orgSettings: any }) {
    const [isSaving, setIsSaving] = useState(false)
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

    return (
        <div className="max-w-2xl">
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
                    <Button type="submit" disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Changes
                    </Button>
                </div>
            </form>
        </div>
    )
}
