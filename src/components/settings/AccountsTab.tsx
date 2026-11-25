"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight, Loader2, Lock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRole } from "@/components/RoleProvider"
import { usePlan } from "@/components/PlanProvider"
import { useCurrency } from "@/components/CurrencyProvider"
import {
    getAccounts, getOpeningPosition, saveAccount,
    type AccountRow,
} from "@/app/actions/balance"
import { ACCOUNT_TYPES, type AccountType } from "@/utils/balance-input"
import { LockedNotice, useLock } from "@/components/LockProvider"
import { usePaywall } from "@/components/ui/UpgradeNotice"

const selectClass = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white disabled:opacity-60"

// Settings > Accounts: where the cash sits (spec 3.5), and the way to the Opening Position page (5.6).
// Fund transfers moved to Transactions > New > Fund transfer (simplification step 6).
export function AccountsTab() {
    const router = useRouter()
    const { isAdmin } = useRole()
    const { paid } = usePlan()
    const { symbol } = useCurrency()
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
    const [opening, setOpening] = useState<{ startDate: string | null; completedAt: string | null } | null>(null)
    const [edit, setEdit] = useState<{ id: string | null; name: string; account_type: AccountType; opening_balance: string; archived: boolean } | null>(null)
    const [busy, setBusy] = useState(false)
    const canAccounts = isAdmin && paid
    const lock = useLock()
    const paywall = usePaywall("accounts")

    const load = async () => {
        const [a, o] = await Promise.all([getAccounts(), getOpeningPosition()])
        setAccounts(a)
        setOpening(o ? { startDate: o.startDate, completedAt: o.completedAt } : null)
    }
    useEffect(() => {
        let cancelled = false
        Promise.all([getAccounts(), getOpeningPosition()]).then(([a, o]) => {
            if (cancelled) return
            setAccounts(a)
            setOpening(o ? { startDate: o.startDate, completedAt: o.completedAt } : null)
        })
        return () => { cancelled = true }
    }, [])

    const run = async (fn: () => Promise<{ success: boolean; error?: string }>, done: string, after?: () => void) => {
        setBusy(true)
        try {
            const res = await fn()
            if (!res.success) return toast.error(res.error ?? "Something went wrong")
            toast.success(done)
            after?.()
            await load()
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-10">
            {/* The opening position has its own page (and its status is on the Year end hub) */}
            <p className="text-sm">
                <Link href="/settings/opening-position" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline" data-testid="opening-position-link">
                    Opening position: where things stood on your start date <ArrowRight className="h-4 w-4" />
                </Link>
            </p>

            {/* Accounts */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Accounts</h2>
                        <p className="text-sm text-slate-500">Where your cash sits: bank accounts, a cash box, e-wallets.</p>
                    </div>
                    {paywall.modal}
                    <Button variant="outline" size="sm" disabled={!isAdmin || busy}
                        title={!paid ? "More than one account is part of the Growth and Nonprofit plans" : !isAdmin ? "Only Admins can change accounts" : ""}
                        onClick={() => (canAccounts ? setEdit({ id: null, name: "", account_type: "bank", opening_balance: "0", archived: false }) : paywall.open())}>
                        {paid ? <Plus className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}Add account
                    </Button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-left text-slate-600 dark:text-slate-400">
                            <tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium text-right">Opening balance</th><th className="px-3 py-2 font-medium text-right">Balance today</th><th className="px-3 py-2" /></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {accounts === null && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /></td></tr>}
                            {accounts?.map((a) => (
                                <tr key={a.id} className={a.archived ? "text-slate-400" : ""}>
                                    <td className="px-3 py-2.5 font-medium">{a.name}{a.is_default && <span className="ml-2 text-xs text-slate-500">default</span>}{a.archived && <span className="ml-2 text-xs">archived</span>}</td>
                                    <td className="px-3 py-2.5">{ACCOUNT_TYPES.find((t) => t.value === a.account_type)?.label}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{money(a.opening_balance)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{money(a.balance)}</td>
                                    <td className="px-3 py-2.5 text-right">
                                        {canAccounts && <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setEdit({ id: a.id, name: a.name, account_type: a.account_type, opening_balance: String(a.opening_balance), archived: a.archived })}>Edit</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {edit && (
                    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3" onSubmit={(e) => {
                        e.preventDefault()
                        run(() => saveAccount(edit), edit.id ? "Account saved" : "Account added", () => setEdit(null))
                    }}>
                        <label className="text-xs text-slate-500">Name<br /><Input aria-label="Account name" className="h-9 w-56" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={100} /></label>
                        <label className="text-xs text-slate-500">Type<br />
                            <select aria-label="Account type" className={selectClass} value={edit.account_type} onChange={(e) => setEdit({ ...edit, account_type: e.target.value as AccountType })}>
                                {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select></label>
                        <label className="text-xs text-slate-500">Opening balance ({symbol})<br /><Input aria-label="Opening balance" className="h-9 w-36" inputMode="decimal" disabled={lock.openingLocked} title={lock.openingLocked ? lock.message : undefined} value={edit.opening_balance} onChange={(e) => setEdit({ ...edit, opening_balance: e.target.value })} /></label>
                        {edit.id && !accounts?.find((a) => a.id === edit.id)?.is_default && (
                            <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={edit.archived} onChange={(e) => setEdit({ ...edit, archived: e.target.checked })} />Archived</label>
                        )}
                        <Button type="submit" size="sm" className="h-9" disabled={busy}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setEdit(null)}>Cancel</Button>
                        {lock.openingLocked && <LockedNotice className="w-full" text={`The opening position is locked, so opening balances cannot change. ${lock.message}`} />}
                        <p className="w-full text-xs text-slate-500">The opening balance is the balance on your tracking start date{opening?.startDate ? ` (${opening.startDate})` : ""}, from the bank statement.</p>
                    </form>
                )}
            </section>

        </div>
    )
}
