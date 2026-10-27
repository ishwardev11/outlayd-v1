"use client"

import { useState } from "react"
import { addSettingFund, deleteSettingFund, addSettingCategory, deleteSettingCategory } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useRole } from "@/components/RoleProvider"
import { Fund, Category } from "./SettingsLayout"

export function FinancialCustomizationTab({ initialFunds, initialCategories }: { initialFunds: Fund[], initialCategories: Category[] }) {
    const { isViewer } = useRole()
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

    const handleDeleteFund = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the fund "${name}"? This action cannot be undone.`)) return
        try {
            await deleteSettingFund(id)
        } catch (error) {
            console.error(error)
            alert("Failed to delete fund")
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
                                <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 w-24 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                            {initialFunds.map(fund => (
                                <tr key={fund.id}>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-gray-900 dark:text-white">{fund.name}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteFund(fund.id, fund.name)}
                                            disabled={isViewer}
                                            title={isViewer ? "Viewers cannot delete funds" : ""}
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
