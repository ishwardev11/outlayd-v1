import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getChangesInFundsPage } from "@/app/actions/statements";
import { ChangesInFundsClient } from "@/components/reports/ChangesInFundsClient";
import { IncomeExpenditureLocked } from "@/components/reports/IncomeExpenditureLocked";
import { OpeningPositionPrompt } from "@/components/reports/OpeningPositionPrompt";
import { buildChangesInFunds } from "@/utils/financial-position";
import { periodHeading } from "@/utils/income-expenditure";

export const metadata: Metadata = { title: "Changes in Funds" };

export const dynamic = "force-dynamic";

// Statement of Changes in Funds (spec 6.4)
export default async function ChangesInFundsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const data = await getChangesInFundsPage(await searchParams);
    if (!data) redirect("/onboarding");
    const wrap = (child: React.ReactNode) => <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">{child}</div>;
    if (data.locked) return wrap(<IncomeExpenditureLocked business={data.orgType === "small_business"} kind="changes_in_funds" />);
    if (!data.ready) return wrap(<OpeningPositionPrompt title="Statement of Changes in Funds" />);
    const { filters } = data;
    return wrap(
        <ChangesInFundsClient statement={buildChangesInFunds(data.rows)} filters={filters}
            heading={periodHeading(filters.from, filters.to, data.fiscalYearStart)} orgName={data.orgName} currency={data.currency}
            funds={data.funds.map((f) => ({ id: f.id, name: f.name, archived: false }))} />
    );
}
