"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRole } from "@/components/RoleProvider"
import { usePlan } from "@/components/PlanProvider"
import { useCurrency } from "@/components/CurrencyProvider"
import { completeOpeningPosition, saveAccount, saveFundOpenings, saveStartDate, type OpeningPosition } from "@/app/actions/balance"
import { itemKindLabel, parseMoney } from "@/utils/balance-input"

// The Opening Position wizard (spec 5.6): where things stood on the tracking start date. The General
// Fund's opening balance is worked out as the balancing figure, so the balance sheet balances from day one.
export function OpeningPositionWizard({ data }: { data: OpeningPosition }) {
    const router = useRouter()
    const { isAdmin, isViewer } = useRole()
    const { paid } = usePlan()
    const { symbol } = useCurrency()
    const money = (n: number) => `${n < 0 ? "-" : ""}${symbol}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const canAdmin = isAdmin && paid
    const canEdit = !isViewer && paid
    const [month, setMonth] = useState(data.startDate ? data.startDate.slice(0, 7) : "")
    const [accounts, setAccounts] = useState(() => Object.fromEntries(data.accounts.map((a) => [a.id, String(a.opening_balance)])))
    const [funds, setFunds] = useState(() => Object.fromEntries(data.funds.filter((f) => !f.is_default).map((f) => [f.id, String(f.opening)])))
    const [busy, setBusy] = useState<string | null>(null)
    const started = !!data.startDate

    // Live preview: the General Fund is what is left of net assets after the other funds
    const accountsTotal = data.accounts.reduce((s, a) => s + Math.round((parseMoney(accounts[a.id] ?? "", { allowZero: true, allowNegative: true }) ?? a.opening_balance) * 100), 0)
    const savedAccounts = data.accounts.reduce((s, a) => s + Math.round(a.opening_balance * 100), 0)
    const netAssets = (Math.round(data.netAssets * 100) - savedAccounts + accountsTotal) / 100
    const otherFunds = data.funds.filter((f) => !f.is_default).reduce((s, f) => s + Math.round((parseMoney(funds[f.id] ?? "", { allowZero: true, allowNegative: true }) ?? 0) * 100), 0) / 100
    const general = Math.round((netAssets - otherFunds) * 100) / 100

    const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, done: string) => {
        setBusy(key)
        try {
            const res = await fn()
            if (!res.success) return toast.error(res.error ?? "Something went wrong")
            toast.success(done)
            router.refresh()
        } finally {
            setBusy(null)
        }
    }
    const saveAccounts = async () => {
        for (const a of data.accounts) {
            if (String(a.opening_balance) === accounts[a.id]) continue
            const res = await saveAccount({ id: a.id, name: a.name, account_type: a.account_type, opening_balance: accounts[a.id], archived: a.archived })
            if (!res.success) return res
        }
        return { success: true }
    }

    const step = (n: number, title: string, children: React.ReactNode, done?: boolean) => (
        <section className={`rounded-xl border p-5 ${started || n === 1 ? "border-slate-200 dark:border-slate-700" : "border-slate-100 dark:border-slate-800 opacity-60"} bg-white dark:bg-slate-900`}>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm text-white">{n}</span>{title}
                {done && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            </h2>
            <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-300">{children}</div>
        </section>
    )

    return (
        <div className="space-y-6">
            <div>
                <Link href="/settings?tab=accounts" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" />Settings</Link>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Opening position</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Tell Outlayd where things stood on the day you start tracking. Your balance sheet and fund balances build on this.
                    {data.completedAt && <span className="ml-1 font-medium text-emerald-700 dark:text-emerald-400">Completed.</span>}
                </p>
                {!paid && <p className="mt-2 text-sm text-amber-700">The opening position is part of the Growth and Nonprofit plans.</p>}
                {paid && !isAdmin && <p className="mt-2 text-sm text-slate-500">Only Admins can change the start date, accounts and complete this. Editors can enter fund balances, assets and loans.</p>}
            </div>

            {step(1, "Tracking start date", (
                <>
                    <p>Usually the first day of your financial year. Records before it stay in the older periods of your reports, but balances start here.</p>
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs text-slate-500">Month<br /><Input aria-label="Start month" type="month" className="h-9 w-48" value={month} onChange={(e) => setMonth(e.target.value)} disabled={!canAdmin} /></label>
                        <Button size="sm" className="h-9" disabled={!canAdmin || !month || busy !== null} onClick={() => run("start", () => saveStartDate(`${month}-01`), "Start date saved")}>
                            {busy === "start" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save start date
                        </Button>
                        {data.startDate && <span className="text-sm">Tracking from <span className="font-medium" data-testid="start-date">{data.startDate}</span></span>}
                    </div>
                </>
            ), started)}

            {step(2, "Bank and cash balances", (
                <>
                    <p>The balance of each account on {data.startDate ?? "the start date"}, from the bank statement (negative if overdrawn). <Link href="/settings?tab=accounts" className="text-indigo-600 hover:underline">Add an account</Link></p>
                    <table className="w-full max-w-xl">
                        <tbody>
                            {data.accounts.filter((a) => !a.archived).map((a) => (
                                <tr key={a.id}>
                                    <td className="py-1.5 pr-3">{a.name}</td>
                                    <td className="py-1.5 w-48"><Input aria-label={`Opening balance ${a.name}`} className="h-9" inputMode="decimal" value={accounts[a.id] ?? ""} disabled={!canAdmin || !started}
                                        onChange={(e) => setAccounts({ ...accounts, [a.id]: e.target.value })} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Button size="sm" disabled={!canAdmin || !started || busy !== null} onClick={() => run("accounts", saveAccounts, "Balances saved")}>
                        {busy === "accounts" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save balances
                    </Button>
                </>
            ))}

            {step(3, "Money owed at the start", (
                <>
                    <p>Unpaid invoices and bills dated before {data.startDate ?? "the start date"} are counted automatically. To add others, create them on the
                        {" "}<Link href="/invoices" className="text-indigo-600 hover:underline">Invoices page</Link> and tick &quot;Owed from before you started using Outlayd&quot;.</p>
                    <div className="grid max-w-xl grid-cols-2 gap-3">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Owed to you</p><p className="font-semibold tabular-nums" data-testid="owed-receivable">{money(data.owedTotals.receivable)}</p></div>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">You owe</p><p className="font-semibold tabular-nums" data-testid="owed-payable">{money(data.owedTotals.payable)}</p></div>
                    </div>
                    {data.owed.length > 0 && (
                        <ul className="max-w-xl space-y-1 text-xs text-slate-500">
                            {data.owed.slice(0, 10).map((o) => <li key={o.id}>{o.direction === "receivable" ? "Owed by" : "Owed to"} {o.payee_name}{o.invoice_no ? ` (${o.invoice_no})` : ""}, {o.issue_date}: {money(o.balance)} still unpaid today</li>)}
                            {data.owed.length > 10 && <li>and {data.owed.length - 10} more</li>}
                        </ul>
                    )}
                </>
            ))}

            {step(4, "Assets and liabilities", (
                <>
                    <p>Equipment you already owned (with its cost and depreciation so far), deposits and loans, on the <Link href="/assets" className="text-indigo-600 hover:underline">Assets &amp; Liabilities page</Link>.</p>
                    {data.items.length === 0 ? <p className="text-slate-500">None entered.</p> : (
                        <ul className="max-w-xl space-y-1">
                            {data.items.map((i) => <li key={i.id} className="flex justify-between"><span>{i.name} <span className="text-xs text-slate-500">{itemKindLabel(i.kind)}</span></span><span className="tabular-nums">{i.kind === "liability" ? `-${money(i.value)}` : money(i.value)}</span></li>)}
                        </ul>
                    )}
                </>
            ))}

            {step(5, "Fund balances", (
                <>
                    <p>How much of the total belongs to each restricted or other fund. The General Fund is what is left, so everything adds up.</p>
                    <table className="w-full max-w-xl">
                        <tbody>
                            {data.funds.filter((f) => !f.is_default && (!f.archived || f.opening !== 0)).map((f) => (
                                <tr key={f.id}>
                                    <td className="py-1.5 pr-3">{f.name} <span className="text-xs text-slate-500">{f.fund_type}</span></td>
                                    <td className="py-1.5 w-48"><Input aria-label={`Opening balance ${f.name}`} className="h-9" inputMode="decimal" value={funds[f.id] ?? ""} disabled={!canEdit || !started}
                                        onChange={(e) => setFunds({ ...funds, [f.id]: e.target.value })} /></td>
                                </tr>
                            ))}
                            <tr className="border-t border-slate-200 dark:border-slate-700">
                                <td className="py-2 pr-3 font-medium">{data.funds.find((f) => f.is_default)?.name ?? "General Fund"} (balancing figure)</td>
                                <td className="py-2 px-3 tabular-nums font-semibold" data-testid="general-opening">{money(general)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <Button size="sm" disabled={!canEdit || !started || busy !== null}
                        onClick={() => run("funds", () => saveFundOpenings(Object.entries(funds).map(([id, v]) => ({ id, opening_balance: v }))), "Fund balances saved")}>
                        {busy === "funds" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save fund balances
                    </Button>
                </>
            ))}

            <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5 space-y-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Summary on {data.startDate ?? "the start date"}</h2>
                <dl className="grid max-w-xl grid-cols-2 gap-y-1 text-sm">
                    <dt>Net assets (what you own less what you owe)</dt><dd className="text-right tabular-nums font-medium" data-testid="net-assets">{money(netAssets)}</dd>
                    <dt>Funds in total</dt><dd className="text-right tabular-nums font-medium">{money(otherFunds + general)}</dd>
                </dl>
                <p className="text-xs text-slate-500">Saved figures only: save each step before completing. You can come back and change things later; the reports always use the latest figures.</p>
                <Button disabled={!canAdmin || !started || busy !== null} className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => run("complete", () => completeOpeningPosition(data.startDate!), "Opening position complete")}>
                    {busy === "complete" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{data.completedAt ? "Mark complete again" : "Complete the opening position"}
                </Button>
            </section>
        </div>
    )
}
