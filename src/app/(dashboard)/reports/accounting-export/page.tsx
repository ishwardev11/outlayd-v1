import { getOrganizationTimezone } from "@/app/actions/document-utils"
import { todayInTimezone } from "@/utils/dates"
import { AccountingExportClient } from "@/components/reports/AccountingExportClient"

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
    const timezone = await getOrganizationTimezone()
    const range = lastMonthRange(todayInTimezone(timezone))

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
            <AccountingExportClient defaultFrom={range.from} defaultTo={range.to} />
        </div>
    )
}
