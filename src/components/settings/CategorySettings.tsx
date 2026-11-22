"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRole } from "@/components/RoleProvider"
import { usePlan } from "@/components/PlanProvider"
import { UpgradeNotice } from "@/components/ui/UpgradeNotice"
import { addSettingCategory, deleteSettingCategory, moveCategory, setCategoryArchived, updateCategory } from "@/app/actions/settings"
import { INCOME_NATURES, OTHER_GROUP, expenseGroupsFor } from "@/utils/category-options"
import { CategoryAccountCode } from "./CategoryAccountCode"
import type { Category } from "./SettingsLayout"

const selectClass = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white disabled:opacity-60"

type Kind = "expense" | "income"

// Expense and income categories (spec 3.3): add, rename, group or type of income, reorder, archive.
// A category anything uses is archived, never deleted; the database refuses deleting it.
export function CategorySettings({ categories, orgType }: { categories: Category[]; orgType: string | null }) {
    return (
        <div className="space-y-12">
            <CategorySection kind="expense" categories={categories.filter((c) => c.kind !== "income")} orgType={orgType} />
            <CategorySection kind="income" categories={categories.filter((c) => c.kind === "income")} orgType={orgType} />
        </div>
    )
}

function CategorySection({ kind, categories, orgType }: { kind: Kind; categories: Category[]; orgType: string | null }) {
    const { isViewer } = useRole()
    const { paid } = usePlan()
    // Income categories belong to income tracking, a paid feature
    const locked = isViewer || (kind === "income" && !paid)
    const lockReason = isViewer ? "Viewers cannot change categories" : "Income tracking is part of the Growth and Nonprofit plans"
    const groups = expenseGroupsFor(orgType)

    const [name, setName] = useState("")
    const [option, setOption] = useState<string>(kind === "income" ? "donation" : OTHER_GROUP)
    const [busy, setBusy] = useState<string | null>(null)
    const [showArchived, setShowArchived] = useState(false)
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

    const active = categories.filter((c) => !c.archived_at)
    const archived = categories.filter((c) => c.archived_at)

    const run = async (key: string, action: () => Promise<{ success: boolean; error?: string }>, done?: string) => {
        setBusy(key)
        try {
            const res = await action()
            if (!res.success) toast.error(res.error || "Something went wrong")
            else if (done) toast.success(done)
            return res.success
        } catch {
            toast.error("Something went wrong. Please try again.")
            return false
        } finally {
            setBusy(null)
        }
    }

    const add = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        const ok = await run("add", () => addSettingCategory(name, kind === "income" ? { kind, nature: option } : { kind, group_name: option }), "Category added")
        if (ok) setName("")
    }

    const saveName = async () => {
        if (!editing) return
        const ok = await run(`name-${editing.id}`, () => updateCategory(editing.id, { name: editing.name }))
        if (ok) setEditing(null)
    }

    const remove = async (c: Category) => {
        if (!window.confirm(`Delete the category "${c.name}"? This cannot be undone. A category that is already used cannot be deleted; archive it instead.`)) return
        await run(`del-${c.id}`, () => deleteSettingCategory(c.id), "Category deleted")
    }

    const archive = async (c: Category, value: boolean) => {
        if (value && !window.confirm(`Archive "${c.name}"? It will no longer be offered for new entries, but existing entries and reports keep it. You can restore it at any time.`)) return
        await run(`arch-${c.id}`, () => setCategoryArchived(c.id, value), value ? "Category archived" : "Category restored")
    }

    const title = kind === "income" ? "Income Categories" : "Expense Categories"
    const intro = kind === "income"
        ? "A category answers \"what kind of income is this?\" (for example General donations or Government grants). The type of income decides whether it appears under Donation or Other income when you record money in."
        : "A category answers \"what was the money spent on?\" (for example Rent or Printing). The group decides where it appears in the Income & Expenditure statement."

    const row = (c: Category, i: number, list: Category[]) => {
        const isArchived = !!c.archived_at
        return (
            <tr key={c.id} className={isArchived ? "opacity-70" : ""}>
                <td className="px-4 py-2.5">
                    {editing?.id === c.id ? (
                        <div className="flex items-center gap-1">
                            <Input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} className="h-8" maxLength={100} aria-label="Category name"
                                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditing(null) }} autoFocus />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveName} disabled={busy === `name-${c.id}`} aria-label="Save name"><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)} aria-label="Cancel"><X className="h-4 w-4" /></Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                            {isArchived && <span className="text-[10px] uppercase tracking-wide rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-500">Archived</span>}
                            {!locked && !isArchived && (
                                <button type="button" className="text-slate-400 hover:text-indigo-600" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                </td>
                <td className="px-4 py-2.5">
                    {kind === "income" ? (
                        <select className={selectClass} value={c.nature ?? "other_income"} disabled={locked || isArchived} title={locked ? lockReason : ""} aria-label={`Type of income for ${c.name}`}
                            onChange={(e) => run(`opt-${c.id}`, () => updateCategory(c.id, { nature: e.target.value }))}>
                            {INCOME_NATURES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                        </select>
                    ) : (
                        <select className={selectClass} value={c.group_name && groups.includes(c.group_name) ? c.group_name : OTHER_GROUP} disabled={locked || isArchived} title={locked ? lockReason : ""} aria-label={`Group for ${c.name}`}
                            onChange={(e) => run(`opt-${c.id}`, () => updateCategory(c.id, { group_name: e.target.value }))}>
                            {[...groups, OTHER_GROUP].map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                    )}
                </td>
                {kind === "expense" && (
                    <td className="px-4 py-2.5">
                        <CategoryAccountCode key={`${c.id}-${c.account_code ?? ""}`} id={c.id} initial={c.account_code} disabled={isViewer} />
                    </td>
                )}
                <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        {!isArchived && (
                            <>
                                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={locked || i === 0 || busy !== null} title={locked ? lockReason : "Move up"} aria-label={`Move ${c.name} up`}
                                    onClick={() => run(`mv-${c.id}`, () => moveCategory(c.id, "up"))}><ArrowUp className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={locked || i === list.length - 1 || busy !== null} title={locked ? lockReason : "Move down"} aria-label={`Move ${c.name} down`}
                                    onClick={() => run(`mv-${c.id}`, () => moveCategory(c.id, "down"))}><ArrowDown className="h-4 w-4" /></Button>
                            </>
                        )}
                        <Button variant="ghost" size="sm" disabled={locked || busy === `arch-${c.id}`} title={locked ? lockReason : ""} onClick={() => archive(c, !isArchived)}
                            className={isArchived ? "text-indigo-600" : "text-amber-700 hover:text-amber-800"}>
                            {isArchived ? <><ArchiveRestore className="w-4 h-4 mr-1" />Restore</> : <><Archive className="w-4 h-4 mr-1" />Archive</>}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={locked || busy === `del-${c.id}`} title={locked ? lockReason : "Only categories that were never used can be deleted"}
                            onClick={() => remove(c)} className="text-red-600 hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${c.name}`}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </td>
            </tr>
        )
    }

    return (
        <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">{title}</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{intro}</p>
            {kind === "income" && !paid && (
                <UpgradeNotice context="income" className="mb-4">
                    Recording income and donations is part of the Growth and Nonprofit plans, so these categories are shown read-only.
                </UpgradeNotice>
            )}
            <form onSubmit={add} className="flex flex-wrap gap-3 items-end mb-6">
                <Input placeholder={kind === "income" ? "e.g. Zakat collections" : "e.g. Travel Stipends"} value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
                    className="flex-1 min-w-48 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white" aria-label={`New ${kind} category name`} disabled={locked} />
                {kind === "income" ? (
                    <select className={selectClass} value={option} onChange={(e) => setOption(e.target.value)} disabled={locked} aria-label="Type of income">
                        {INCOME_NATURES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                    </select>
                ) : (
                    <select className={selectClass} value={option} onChange={(e) => setOption(e.target.value)} disabled={locked} aria-label="Group">
                        {[...groups, OTHER_GROUP].map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                )}
                <Button type="submit" disabled={locked || busy === "add"} title={locked ? lockReason : ""} className="bg-indigo-600 hover:bg-indigo-700">
                    {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Add Category
                </Button>
            </form>

            <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left align-middle border-collapse">
                    <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                        <tr>
                            <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200">Category Name</th>
                            <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 w-48">{kind === "income" ? "Type of income" : "Group"}</th>
                            {kind === "expense" && <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 w-40" title="The account code from your accounting software, used by the accounting export">Accounting code</th>}
                            <th className="px-4 py-3 font-medium text-gray-900 dark:text-slate-200 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                        {active.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No {kind} categories yet.</td></tr>
                        )}
                        {active.map((c, i) => row(c, i, active))}
                        {showArchived && archived.map((c, i) => row(c, i, archived))}
                    </tbody>
                </table>
            </div>
            {archived.length > 0 && (
                <button type="button" className="mt-2 text-sm text-indigo-600 hover:underline" onClick={() => setShowArchived((v) => !v)}>
                    {showArchived ? "Hide" : "Show"} archived ({archived.length})
                </button>
            )}
        </div>
    )
}
