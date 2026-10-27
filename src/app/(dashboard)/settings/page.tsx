import { getOrganizationSettings, getSettingsFunds, getSettingsCategories, getTeamMembers } from "@/app/actions/settings"
import { SettingsLayout } from "@/components/settings/SettingsLayout"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
    const orgSettings = await getOrganizationSettings()
    const funds = await getSettingsFunds()
    const categories = await getSettingsCategories()
    const team = await getTeamMembers()

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h1>
                <p className="text-muted-foreground mt-2">Manage your organization&apos;s profile, financial setup, and team permissions.</p>
            </div>

            <SettingsLayout
                orgSettings={orgSettings}
                initialFunds={funds}
                initialCategories={categories}
                initialTeam={team}
            />
        </div>
    )
}
