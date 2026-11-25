"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Building2, Landmark, Users, Settings, CreditCard, Wallet } from "lucide-react"
import { AccountsTab } from "./AccountsTab"
import { GeneralSettingsTab } from "./GeneralSettingsTab"
import { OrganizationProfileTab } from "./OrganizationProfileTab"
import type { ReceiptSettingsData } from "./ReceiptSettingsForm"
import { FinancialCustomizationTab } from "./FinancialCustomizationTab"
import { TeamManagementTab } from "./TeamManagementTab"
import { BillingSettingsTab } from "./BillingSettingsTab"

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
}

const TABS = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'organization', label: 'Organization Profile', icon: Building2 },
    { id: 'financial', label: 'Financial Customization', icon: Landmark },
    { id: 'accounts', label: 'Accounts & Transfers', icon: Wallet },
    { id: 'team', label: 'Team Management', icon: Users },
    { id: 'billing', label: 'Billing & Subscription', icon: CreditCard },
]

export function SettingsLayout({ orgSettings, initialFunds, fundSpend = [], initialCategories, initialTeam, currentUserEmail, receiptSettings }: SettingsLayoutProps) {
    // ?tab=accounts (from the Opening Position wizard) opens that tab
    const requested = useSearchParams().get("tab")
    const [activeTab, setActiveTab] = useState(TABS.some((x) => x.id === requested) ? (requested as string) : 'general')

    return (
        <div className="flex flex-col md:flex-row gap-8">
            {/* Sidebar Navigation */}
            <nav className="w-full md:w-64 shrink-0 flex md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 scrollbar-hide">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
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
                    {activeTab === 'general' && (
                        <GeneralSettingsTab />
                    )}
                    {activeTab === 'organization' && (
                        <OrganizationProfileTab orgSettings={orgSettings} receiptSettings={receiptSettings ?? null} />
                    )}
                    {activeTab === 'financial' && (
                        <FinancialCustomizationTab initialFunds={initialFunds} fundSpend={fundSpend} initialCategories={initialCategories} orgType={orgSettings?.org_type ?? null} />
                    )}
                    {activeTab === 'accounts' && (
                        <AccountsTab funds={initialFunds} />
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
