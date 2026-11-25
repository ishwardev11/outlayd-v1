import { getOrganizationSettings, getSettingsFunds, getFundBudgetSummary, getSettingsCategories, getTeamMembers } from "@/app/actions/settings"
import { SettingsLayout } from "@/components/settings/SettingsLayout"
import { getReceiptSettings } from "@/app/actions/receipts"
import { createClient } from "@/utils/supabase/server"
import { getAssetsPage } from "@/app/actions/balance"
import { getEntryOptions } from "@/app/actions/transactions"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
    const orgSettings = await getOrganizationSettings()
    const funds = await getSettingsFunds()
    const fundSpend = await getFundBudgetSummary()
    const categories = await getSettingsCategories()
    const team = await getTeamMembers()
    const receiptSettings = await getReceiptSettings()
    // Assets & Loans is a Settings tab (simplification step 6); same rules as its old page
    const [assets, entryOptions] = await Promise.all([getAssetsPage(), getEntryOptions()])

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const currentUserEmail = user?.email || null

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h1>
                <p className="text-muted-foreground mt-2">Your organisation, funds and categories, accounts, assets and loans, letterhead, team and billing.</p>
            </div>

            <SettingsLayout
                orgSettings={orgSettings}
                initialFunds={funds}
                fundSpend={fundSpend}
                initialCategories={categories}
                initialTeam={team}
                currentUserEmail={currentUserEmail}
                receiptSettings={receiptSettings}
                assets={assets}
                entryOptions={entryOptions}
            />
        </div>
    )
}
