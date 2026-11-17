"use client"

import { useState } from "react"
import { addSettingFund, archiveSettingFund, restoreSettingFund, addSettingCategory, deleteSettingCategory } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Trash2, Archive, ArchiveRestore } from "lucide-react"
import { useRole } from "@/components/RoleProvider"
import { useCurrency } from "@/components/CurrencyProvider"
import { Fund, FundSpend, Category } from "./SettingsLayout"
import { FundDetailsDialog } from "./FundDetailsDialog"

export function FinancialCustomizationTab({ initialFunds, fundSpend = [], initialCategories }: { initialFunds: Fund[], fundSpend?: FundSpend[], initialCategories: Category[] }) {
    const { isViewer } = useRole()
    const { formatAmount } = useCurrency()
    const spendByFund = new Map(fundSpend.map((s) => [s.fund_id, s]))
    const [isSavingFund, setIsSavingFund] = useState(false)
    const [isSavingCategory, setIsSavingCategory] = useState(false)
    const [newFundName, setNewFundName] = useState("")
    const [newCategoryName, setNewCategoryName] = useState("")

    const handleAddFund = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newFundName.trim()) return
        setIsSavingFund(true)
        try {
            await addSettingFund(newFundName)
            setNewFundName("")
        } catch (error) {
            console.error(error)
            alert("Failed to add fund")
        } finally {
            setIsSavingFund(false)
        }
    }

    const handleAddCategory = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newCategoryName.trim()) return
        setIsSavingCategory(true)
        try {
            await addSettingCategory(newCategoryName)
            setNewCategoryName("")
        } catch (error) {
            console.error(error)
            alert("Failed to add category")
        } finally {
            setIsSavingCategory(false)
        }
    }

    const handleArchiveFund = async (id: string, name: string) => {
        if (!window.confirm(`Archive the fund "${name}"? It will no longer be offered when you assign documents, but existing documents and reports keep it. You can restore it at any time.`)) return
        try {
            await archiveSettingFund(id)
        } catch (error) {
            console.error(error)
            alert("Failed to archive fund")
        }
    }

    const handleRestoreFund = async (id: string) => {
        try {
            await restoreSettingFund(id)
        } catch (error) {
            console.error(error)
            alert("Failed to restore fund")
        }
    }

    const handleDeleteCategory = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the category "${name}"? This action cannot be undone.`)) return
        try {
            await deleteSettingCategory(id)
        } catch (error) {
            console.error(error)
            alert("Failed to delete category")
        }
    }

    const activeFunds = initialFunds.filter((f) => !f.archived_at)
    const archivedFunds = initialFunds.filter((f) => f.archived_at)

    return (
        <div className="space-y-12">

            {/* Funds Section */}
            <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Active Funds</h2>
                <form onSubmit={handleAddFund} className="flex gap-4 items-end mb-6">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="newFund" className="sr-only">New Fund Name</Label>
                        <Input
                            id="newFund"
                            placeholder="e.g. NextGen Scholarship Fund"
                            value={newFundName}
                            onChange={(e) => setNewFundName(e.target.value)}
                            className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
                        />
                    </div>
                    <Button type="submit" disabled={isSavingFund || isViewer} title={isViewer ? "Viewers cannot add funds" : ""} className="bg-indigo-600 hover:bg-indigo-700">
                        {isSavingFund ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        Add Fund
                    </Button>
                </form>

                <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left align-middle border-collapse">
                        <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                            <tr>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200">Fund Name</th>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 text-right">Budget</th>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 text-right">Spent</th>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 text-right">Committed</th>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 text-right">Remaining</th>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 w-48 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                            {activeFunds.map(fund => {
                                const spend = spendByFund.get(fund.id)
                                const spent = spend?.spent ?? 0
                                const committed = spend?.committed ?? 0
                                const budget = fund.budget != null && fund.budget !== "" ? Number(fund.budget) : null
                                const remaining = budget !== null ? budget - spent - committed : null
                                return (
                                <tr key={fund.id}>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-gray-900 dark:text-white">{fund.name}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-slate-300">{budget !== null ? formatAmount(budget) : "—"}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-slate-300">{formatAmount(spent)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-slate-300">{formatAmount(committed)}</td>
                                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${remaining !== null && remaining < 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-700 dark:text-slate-300"}`}>
                                        {remaining !== null ? formatAmount(remaining) : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                        <FundDetailsDialog key={`${fund.id}-${fund.donor_name}-${fund.grant_reference}-${fund.award_amount}-${fund.budget}-${fund.period_start}-${fund.period_end}-${fund.purpose}`} fund={fund} disabled={isViewer} />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleArchiveFund(fund.id, fund.name)}
                                            disabled={isViewer}
                                            title={isViewer ? "Viewers cannot archive funds" : ""}
                                            className="text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                        >
                                            <Archive className="w-4 h-4 mr-2" />
                                            Archive
                                        </Button>
                                    </td>
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Spent counts paid documents and Committed counts documents awaiting payment, both added up from each document&apos;s fund splits. Remaining = Budget − Spent − Committed.
                </p>

                {archivedFunds.length > 0 && (
                    <div className="mt-6">
                        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Archived Funds</h3>
                        <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-slate-700/50">
                            {archivedFunds.map((fund) => (
                                <div key={fund.id} className="flex items-center justify-between px-4 py-3 text-sm">
                                    <span className="text-gray-500 dark:text-slate-400">{fund.name}</span>
                                    <Button variant="ghost" size="sm" onClick={() => handleRestoreFund(fund.id)} disabled={isViewer}>
                                        <ArchiveRestore className="w-4 h-4 mr-2" />
                                        Restore
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Categories Section */}
            <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Expense Categories</h2>
                <form onSubmit={handleAddCategory} className="flex gap-4 items-end mb-6">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="newCategory" className="sr-only">New Category Name</Label>
                        <Input
                            id="newCategory"
                            placeholder="e.g. Travel Stipends"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
                        />
                    </div>
                    <Button type="submit" disabled={isSavingCategory || isViewer} title={isViewer ? "Viewers cannot add categories" : ""} className="bg-indigo-600 hover:bg-indigo-700">
                        {isSavingCategory ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        Add Category
                    </Button>
                </form>

                <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left align-middle border-collapse">
                        <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                            <tr>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200">Category Name</th>
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 w-24 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                            {initialCategories.map(cat => (
                                <tr key={cat.id}>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-gray-900 dark:text-white">{cat.name}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                            disabled={isViewer}
                                            title={isViewer ? "Viewers cannot delete categories" : ""}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    )
}
