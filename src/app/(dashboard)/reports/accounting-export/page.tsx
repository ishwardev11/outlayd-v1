import { FileSpreadsheet } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getOrganizationTimezone } from "@/app/actions/document-utils"
import { organizationIsPro } from "@/utils/plan"
import { todayInTimezone } from "@/utils/dates"
import { AccountingExportClient } from "@/components/reports/AccountingExportClient"
import { FeatureLocked } from "@/components/ui/FeatureLocked"

export const dynamic = "force-dynamic"

// Default range: the whole of last month, in the organisation's timezone
function lastMonthRange(today: string): { from: string; to: string } {
    const [y, m] = today.split("-").map(Number)
    const prevYear = m === 1 ? y - 1 : y
    const prevMonth = m === 1 ? 12 : m - 1
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()
    const mm = String(prevMonth).padStart(2, "0")
    return { from: `${prevYear}-${mm}-01`, to: `${prevYear}-${mm}-${String(lastDay).padStart(2, "0")}` }
}

export default async function AccountingExportPage() {
    // Paid plans only (same rule as the Donor & Audit Memo)
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId || !(await organizationIsPro(supabase, organizationId))) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
                <FeatureLocked
                    title="Accounting export"
                    tagline="Hand your accountant a file they can import, instead of retyping every invoice."
                    heading="The Accounting Export is a Growth feature"
                    features={[
                        "A CSV of approved documents that opens in Excel or imports into your accounting software",
                        "An accounting code per category, so each expense posts to the right account",
                        "A preview that warns about missing account codes and splits that do not add up",
                    ]}
                    context="accounting_export"
                    icon={<FileSpreadsheet className="h-4 w-4" />}
                />
            </div>
        )
    }

    const timezone = await getOrganizationTimezone()
    const range = lastMonthRange(todayInTimezone(timezone))

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
            <AccountingExportClient defaultFrom={range.from} defaultTo={range.to} />
        </div>
    )
}
