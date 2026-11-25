"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Building2, Landmark, Users, CreditCard, Wallet, Package, Stamp } from "lucide-react"
import { AccountsTab } from "./AccountsTab"
import { OrganizationProfileTab } from "./OrganizationProfileTab"
import { ReceiptSettingsForm, type ReceiptSettingsData } from "./ReceiptSettingsForm"
import { AssetsClient } from "@/components/assets/AssetsClient"
import type { AssetsPage } from "@/app/actions/balance"
import type { EntryOptions } from "@/app/actions/transactions"
import { FinancialCustomizationTab } from "./FinancialCustomizationTab"
import { TeamManagementTab } from "./TeamManagementTab"
import { BillingSettingsTab } from "./BillingSettingsTab"
import { SETTINGS_TABS, settingsTab, type SettingsTabId } from "@/utils/settings-tabs"

export interface OrgSettings {
    id: string;
    name: string;
    registration_id?: string | null;
    base_currency?: string | null;
    fiscal_year_start?: number | null;
    timezone?: string | null;
    org_type?: string | null;
    subscription_status?: string | null;
    subscription_tier?: string | null;
    cancel_at_period_end?: boolean | null;
    subscription_end_date?: string | null;
}

export interface Fund {
    id: string;
    name: string;
    code?: string;
    donor_name?: string | null;
    grant_reference?: string | null;
    purpose?: string | null;
    award_amount?: number | string | null;
    budget?: number | string | null;
    period_start?: string | null;
    period_end?: string | null;
    archived_at?: string | null;
    fund_type?: "unrestricted" | "restricted";
    is_default?: boolean;
}

// Per-fund totals worked out in the database from document splits (see fund_budget_summary)
export interface FundSpend {
    fund_id: string;
    spent: number;
    committed: number;
}

export interface Category {
    id: string;
    name: string;
    account_code?: string | null;
    kind?: "income" | "expense";
    is_system?: boolean;
    nature?: string | null;
    group_name?: string | null;
    sort_order?: number;
    archived_at?: string | null;
}

export interface TeamMember {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
    created_at: string;
}

interface SettingsLayoutProps {
    orgSettings: OrgSettings | null;
    initialFunds: Fund[];
    fundSpend?: FundSpend[];
    initialCategories: Category[];
    initialTeam: TeamMember[];
    currentUserEmail: string | null;
    receiptSettings?: ReceiptSettingsData | null;
    // Assets & Loans (moved here from its own page in simplification step 6)
    assets?: AssetsPage | null;
    entryOptions?: EntryOptions | null;
}

// Icons for the tabs listed in utils/settings-tabs (order, labels and old links are tested there)
const ICONS: Record<SettingsTabId, typeof Building2> = {
    organization: Building2, financial: Landmark, accounts: Wallet, assets: Package, letterhead: Stamp, team: Users, billing: CreditCard,
}
const TABS = SETTINGS_TABS.map((t) => ({ ...t, icon: ICONS[t.id] }))

export function SettingsLayout({ orgSettings, initialFunds, fundSpend = [], initialCategories, initialTeam, currentUserEmail, receiptSettings, assets = null, entryOptions = null }: SettingsLayoutProps) {
    // ?tab=accounts (from the Opening Position wizard) opens that tab
    const requested = useSearchParams().get("tab")
    const [activeTab, setActiveTab] = useState<string>(settingsTab(requested))
    // On a phone the tabs are one row that scrolls sideways; slide it so the open tab is in view
    // (e.g. Assets & Loans from the sidebar). Moves only this row, never the page.
    const nav = useRef<HTMLElement>(null)
    useEffect(() => {
        const row = nav.current
        const button = row?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`)
        if (!row || !button || row.scrollWidth <= row.clientWidth) return
        row.scrollLeft += button.getBoundingClientRect().left - row.getBoundingClientRect().left - 16
    }, [activeTab])

    return (
        <div className="flex flex-col md:flex-row gap-8">
            {/* Sidebar Navigation */}
            <nav ref={nav} className="w-full md:w-64 shrink-0 flex md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 scrollbar-hide">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        data-tab={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                            ${activeTab === tab.id
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'}
                        `}
                    >
                        <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Main Content Area */}
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 md:p-8">
                    {activeTab === 'organization' && (
                        <OrganizationProfileTab orgSettings={orgSettings} receiptSettings={receiptSettings ?? null} />
                    )}
                    {activeTab === 'financial' && (
                        <FinancialCustomizationTab initialFunds={initialFunds} fundSpend={fundSpend} initialCategories={initialCategories} orgType={orgSettings?.org_type ?? null} />
                    )}
                    {activeTab === 'accounts' && (
                        <AccountsTab />
                    )}
                    {activeTab === 'assets' && (
                        assets && entryOptions ? <AssetsClient data={assets} options={entryOptions} /> : <p className="text-sm text-slate-500">Could not load assets and loans.</p>
                    )}
                    {activeTab === 'letterhead' && (
                        receiptSettings ? <ReceiptSettingsForm initial={receiptSettings} /> : <p className="text-sm text-slate-500">Could not load the letterhead and numbering settings.</p>
                    )}
                    {activeTab === 'team' && (
                        <TeamManagementTab
                            initialTeam={initialTeam}
                            currentUserEmail={currentUserEmail}
                        />
                    )}
                    {activeTab === 'billing' && (
                        <BillingSettingsTab orgSettings={orgSettings} />
                    )}
                </div>
            </div>
        </div>
    )
}
