import { redirect } from "next/navigation";
import { getReceiptsPaymentsPage } from "@/app/actions/statements";
import { ReceiptsPaymentsClient } from "@/components/reports/ReceiptsPaymentsClient";
import { IncomeExpenditureLocked } from "@/components/reports/IncomeExpenditureLocked";
import { columnLabel, periodHeading } from "@/utils/income-expenditure";
import { buildReceiptsPayments } from "@/utils/receipts-payments";

export const dynamic = "force-dynamic";

// Receipts and Payments (spec 6.3, rule R2): cash received and paid, by payment date, transactions only.
export default async function ReceiptsPaymentsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const data = await getReceiptsPaymentsPage(await searchParams);
    if (!data) redirect("/onboarding");

    if (data.locked) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
                <IncomeExpenditureLocked business={data.orgType === "small_business"} kind="receipts_payments" />
            </div>
        );
    }

    const { filters, fiscalYearStart, priorRange } = data;
    const statement = buildReceiptsPayments({
        orgType: data.orgType,
        current: data.current,
        prior: data.prior,
        labels: {
            current: columnLabel(filters.from, filters.to, fiscalYearStart),
            prior: priorRange ? columnLabel(priorRange.from, priorRange.to, fiscalYearStart) : "",
        },
        cash: data.cash,
    });

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <ReceiptsPaymentsClient
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
