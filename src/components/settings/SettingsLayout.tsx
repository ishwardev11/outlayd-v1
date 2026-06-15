"use client"

import { useState } from "react"
import { Building2, Landmark, Users, Settings, CreditCard } from "lucide-react"
import { GeneralSettingsTab } from "./GeneralSettingsTab"
import { OrganizationProfileTab } from "./OrganizationProfileTab"
import { FinancialCustomizationTab } from "./FinancialCustomizationTab"
import { TeamManagementTab } from "./TeamManagementTab"
import { BillingSettingsTab } from "./BillingSettingsTab"

export interface OrgSettings {
    id: string;
    name: string;
    registration_id?: string | null;
    base_currency?: string | null;
    fiscal_year_start?: number | null;
    subscription_status?: string | null;
    subscription_tier?: string | null;
    cancel_at_period_end?: boolean | null;
    subscription_end_date?: string | null;
}

export interface Fund {
    id: string;
    name: string;
    code?: string;
}

export interface Category {
    id: string;
    name: string;
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
    initialCategories: Category[];
    initialTeam: TeamMember[];
}

const TABS = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'organization', label: 'Organization Profile', icon: Building2 },
    { id: 'financial', label: 'Financial Customization', icon: Landmark },
    { id: 'team', label: 'Team Management', icon: Users },
    { id: 'billing', label: 'Billing & Subscription', icon: CreditCard },
]

export function SettingsLayout({ orgSettings, initialFunds, initialCategories, initialTeam }: SettingsLayoutProps) {
    const [activeTab, setActiveTab] = useState('general')

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
                        <OrganizationProfileTab orgSettings={orgSettings} />
                    )}
                    {activeTab === 'financial' && (
                        <FinancialCustomizationTab initialFunds={initialFunds} initialCategories={initialCategories} />
                    )}
                    {activeTab === 'team' && (
                        <TeamManagementTab initialTeam={initialTeam} orgSettings={orgSettings} />
                    )}
                    {activeTab === 'billing' && (
                        <BillingSettingsTab orgSettings={orgSettings} />
                    )}
                </div>
            </div>
        </div>
    )
}
