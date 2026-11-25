import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { getOrganizationId, getOrganizationTimezone } from "@/app/actions/document-utils";
import { ReportHub } from "@/components/reports/ReportHub";
import { ReadyToSubmit } from "@/components/reports/StatementAssurance";
import { featureAllowed } from "@/utils/plan";
import { todayInTimezone } from "@/utils/dates";
import { clampToToday, financialYear, longDate } from "@/utils/income-expenditure";
import { reportSections } from "@/utils/report-hub";

export const metadata: Metadata = { title: "Reports" };

export const dynamic = "force-dynamic";

// The report hub (spec 6): one card per report with what it is for and who needs it, and the
// integrity checks for the current financial year at the top ("is this ready to submit?").
// Every figure lives on the report pages themselves, which read the ledger.
export default async function ReportsPage() {
    const supabase = await createClient();
    const organizationId = await getOrganizationId();

    const [{ data: org }, timezone, statements, donorMemo, accountingExport] = await Promise.all([
        organizationId
            ? supabase.from("organizations").select("org_type, fiscal_year_start").eq("id", organizationId).maybeSingle()
            : Promise.resolve({ data: null }),
        getOrganizationTimezone(),
        featureAllowed(supabase, organizationId, "financial_statements", "read"),
        featureAllowed(supabase, organizationId, "donor_memo", "read"),
        featureAllowed(supabase, organizationId, "accounting_export", "read"),
    ]);

    const today = todayInTimezone(timezone);
    const fy = financialYear(Number(org?.fiscal_year_start) || 1, today);
    const to = clampToToday(fy.from, fy.to, today);
    const sections = reportSections((org?.org_type as string | null) ?? null, { statements, donorMemo, accountingExport });

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Reports</h1>
                <p className="text-gray-500 dark:text-slate-400 mt-2 text-lg">
                    Statements, the donor memo and exports, all built from your cash book, bills and invoices.
                </p>
            </div>

            {statements && (
                <section aria-labelledby="reports-ready" className="space-y-2" data-testid="reports-ready">
                    <h2 id="reports-ready" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        This financial year so far: {longDate(fy.from)} to {longDate(to)}
                    </h2>
                    <ReadyToSubmit from={fy.from} to={to} />
                </section>
            )}

            <ReportHub sections={sections} />
        </div>
    );
}
