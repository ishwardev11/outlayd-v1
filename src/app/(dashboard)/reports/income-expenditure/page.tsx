import { redirect } from "next/navigation";
import { getIncomeExpenditurePage } from "@/app/actions/statements";
import { IncomeExpenditureClient } from "@/components/reports/IncomeExpenditureClient";
import { IncomeExpenditureLocked } from "@/components/reports/IncomeExpenditureLocked";
import { buildStatement, columnLabel, periodHeading } from "@/utils/income-expenditure";

export const dynamic = "force-dynamic";

// Statement of Income and Expenditure (Profit and Loss for small businesses), spec 6.1.
// Cash basis: money in and out by payment date, read from transactions only.
export default async function IncomeExpenditurePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const data = await getIncomeExpenditurePage(await searchParams);
    if (!data) redirect("/onboarding");

    if (data.locked) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
                <IncomeExpenditureLocked business={data.orgType === "small_business"} />
            </div>
        );
    }

    const { filters, fiscalYearStart, priorRange } = data;
    const statement = buildStatement({
        orgType: data.orgType,
        current: data.current,
        prior: data.prior,
        layout: filters.layout,
        labels: {
            current: columnLabel(filters.from, filters.to, fiscalYearStart),
            prior: priorRange ? columnLabel(priorRange.from, priorRange.to, fiscalYearStart) : "",
        },
    });

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <IncomeExpenditureClient
                statement={statement}
                filters={filters}
                priorRange={priorRange}
                heading={periodHeading(filters.from, filters.to, fiscalYearStart)}
                funds={data.funds}
                orgName={data.orgName}
                currency={data.currency}
            />
        </div>
    );
}
