import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDashboardOverview, getExtractingCount, getOnboardingProgress } from "@/app/actions/aggregates";
import { getOrganizationId, getOrganizationCurrency, getOrganizationTimezone } from "@/app/actions/document-utils";
import { createClient } from "@/utils/supabase/server";
import { featureAllowed } from "@/utils/plan";
import { getCurrencyDetails } from "@/utils/currency";
import { gettingStartedSteps } from "@/utils/getting-started";
import { dashboardMode, greeting, hourInTimezone, monthYearLabel, usesFunds } from "@/utils/dashboard";
import { ExtractionPoller } from "@/components/ExtractionPoller";
import { GettingStartedCard } from "@/components/dashboard/GettingStartedCard";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { DashboardActions, DashboardDropZone } from "@/components/dashboard/DashboardUpload";
import { FundBalances, KpiRow, NeedsAttention, RecentActivity } from "@/components/dashboard/DashboardSections";

export const metadata: Metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";
// Uploads started from this page extract their data in the background (see processUpload), and that
// work counts towards this limit. 60s suits most receipts and invoices; raise it if your hosting plan
// allows longer functions and large PDFs still time out.
export const maxDuration = 60;

// The dashboard: a greeting with Upload receipt / Record money in, a Getting started card for new
// organisations (or the slim opening-position banner), four KPI cards, cash flow beside what needs
// attention, then fund balances and recent activity. Every figure is worked out in the database by
// dashboard_overview, in one call; the other reads run alongside it.
export default async function Home() {
  const orgId = await getOrganizationId();
  if (!orgId) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const [overview, extractingCount, progress, canRecordIncome, canReconcile, orgCurrency, timezone, { data: org }, { data: auth }] = await Promise.all([
    getDashboardOverview(),
    // Also hands over uploads whose reading never finished (see getExtractingCount)
    getExtractingCount(),
    getOnboardingProgress(),
    featureAllowed(supabase, orgId, "income", "use"),
    featureAllowed(supabase, orgId, "reconciliation", "use"),
    getOrganizationCurrency(),
    getOrganizationTimezone(),
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const { symbol } = getCurrencyDetails(orgCurrency);
  const steps = gettingStartedSteps(progress, canRecordIncome);
  const mode = dashboardMode(steps.filter((s) => s.done).length, overview.cashFlow);
  // Paid organisations are asked once to set up their opening position (spec 5.6)
  const needsOpening = canRecordIncome && !overview.openingComplete;
  const showFunds = usesFunds(overview.funds);
  const orgName = org?.name?.trim() || "your organisation";
  const fullName = typeof auth.user?.user_metadata?.full_name === "string" ? auth.user.user_metadata.full_name.trim() : "";
  const firstName = fullName.split(/\s+/)[0] ?? "";
  const hello = greeting(hourInTimezone(timezone));

  return (
    <DashboardDropZone>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white" data-testid="greeting">
              {firstName ? `${hello}, ${firstName}` : hello}
            </h1>
            <p className="mt-1.5 text-slate-500 dark:text-slate-400 truncate">
              <span className="font-medium text-slate-700 dark:text-slate-300">{org?.name?.trim() || "Dashboard"}</span> · {monthYearLabel(overview.today)}
            </p>
          </div>
          <DashboardActions canRecordIncome={canRecordIncome} />
        </div>

        <ExtractionPoller count={extractingCount} />

        <GettingStartedCard steps={steps} orgId={orgId} orgName={orgName} mode={mode} paid={canRecordIncome} needsOpening={needsOpening} />

        <KpiRow o={overview} symbol={symbol} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 min-w-0">
            <CashFlowChart data={overview.cashFlow} />
          </div>
          <div className="min-w-0">
            <NeedsAttention o={overview} canReconcile={canReconcile} />
          </div>
        </div>

        <div className={`grid gap-6 ${showFunds ? "lg:grid-cols-2" : ""}`}>
          {showFunds && <FundBalances funds={overview.funds} symbol={symbol} />}
          <RecentActivity entries={overview.recent} symbol={symbol} canRecordIncome={canRecordIncome} />
        </div>
      </div>
    </DashboardDropZone>
  );
}
