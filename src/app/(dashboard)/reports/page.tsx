import { getFunds } from "@/app/actions/ledger";
import { getOrganizationTimezone } from "@/app/actions/document-utils";
import { getLargeTransactions, getReportSummary } from "@/app/actions/aggregates";
import { ReportsClient } from "@/components/reports/ReportsClient";
import { parsePage, parseReportFilters } from "@/utils/aggregate-types";
import { todayInTimezone } from "@/utils/dates";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const currentYear = todayInTimezone(await getOrganizationTimezone()).slice(0, 4);

    // Filters live in the URL so the database can do the work and the page can be shared/bookmarked
    const filters = parseReportFilters(sp, currentYear);
    const page = parsePage(sp);

    const [summary, largeTransactions, funds] = await Promise.all([
        getReportSummary(filters),
        getLargeTransactions(filters, page),
        getFunds(),
    ]);

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <ReportsClient
                summary={summary}
                largeTransactions={largeTransactions}
                filters={filters}
                page={page}
                currentYear={currentYear}
                fundOptions={funds || []}
            />
        </div>
    );
}
