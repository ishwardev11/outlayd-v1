import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFinancialPositionPage } from "@/app/actions/statements";
import { FinancialPositionClient } from "@/components/reports/FinancialPositionClient";
import { IncomeExpenditureLocked } from "@/components/reports/IncomeExpenditureLocked";
import { OpeningPositionPrompt } from "@/components/reports/OpeningPositionPrompt";
import { buildFinancialPosition } from "@/utils/financial-position";
import { longDate } from "@/utils/income-expenditure";

export const metadata: Metadata = { title: "Financial Position" };

export const dynamic = "force-dynamic";

// Statement of Financial Position (spec 6.2), as at the end of the chosen period (today for the
// current one), with last year's figures alongside
export default async function FinancialPositionPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const data = await getFinancialPositionPage(await searchParams);
    if (!data) redirect("/onboarding");
    const wrap = (child: React.ReactNode) => <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">{child}</div>;
    if (data.locked) return wrap(<IncomeExpenditureLocked business={data.orgType === "small_business"} kind="financial_position" />);
    if (!data.ready) return wrap(<OpeningPositionPrompt title="Statement of Financial Position" />);
    if (data.current.length === 0) return wrap(<OpeningPositionPrompt title="Statement of Financial Position" beforeStart={data.startDate} />);

    const statement = buildFinancialPosition({
        current: data.current,
        prior: data.prior,
        labels: { current: longDate(data.asAt), prior: data.priorAsAt ? longDate(data.priorAsAt) : "" },
        funds: data.funds,
    });
    return wrap(
        <FinancialPositionClient statement={statement} filters={data.filters} heading={`As at ${longDate(data.asAt)}`}
            orgName={data.orgName} currency={data.currency} funds={data.funds.map((f) => ({ id: f.id, name: f.name, archived: false }))} />
    );
}
