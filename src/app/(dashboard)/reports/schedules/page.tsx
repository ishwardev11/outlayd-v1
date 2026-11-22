import { redirect } from "next/navigation";
import { getSchedulesPage } from "@/app/actions/statements";
import { SchedulesClient } from "@/components/reports/SchedulesClient";
import { IncomeExpenditureLocked } from "@/components/reports/IncomeExpenditureLocked";
import { periodHeading } from "@/utils/income-expenditure";

export const dynamic = "force-dynamic";

// Schedules and notes (spec 6.5)
export default async function SchedulesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const data = await getSchedulesPage(await searchParams);
    if (!data) redirect("/onboarding");
    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            {data.locked
                ? <IncomeExpenditureLocked business={data.orgType === "small_business"} title="Schedules" />
                : <SchedulesClient data={data} heading={periodHeading(data.filters.from, data.filters.to, data.fiscalYearStart)} />}
        </div>
    );
}
