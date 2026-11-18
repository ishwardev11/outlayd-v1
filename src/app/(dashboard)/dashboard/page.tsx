import { getDashboardSummary, getActionQueue, getRecentDocuments, getExtractingCount } from "@/app/actions/aggregates";
import { getOrganizationId, getOrganizationCurrency } from "@/app/actions/document-utils";
import { getCurrencyDetails } from "@/utils/currency";
import { redirect } from "next/navigation";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { ActionQueueClient } from "@/components/dashboard/ActionQueueClient";
import { QuickUpload } from "@/components/dashboard/QuickUpload";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ExtractionPoller } from "@/components/ExtractionPoller";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileText, Banknote, Info } from "lucide-react";

export const dynamic = "force-dynamic";
// Uploads started from this page extract their data in the background (see processUpload), and that
// work counts towards this limit. 60s suits most receipts and invoices; raise it if your hosting plan
// allows longer functions and large PDFs still time out.
export const maxDuration = 60;

export default async function Home() {
  const orgId = await getOrganizationId();
  if (!orgId) {
    redirect("/onboarding");
  }

  const orgCurrency = await getOrganizationCurrency();
  const { symbol } = getCurrencyDetails(orgCurrency);

  // Totals, the 14-day cash flow and the lists are computed in the database, so the page stays
  // fast however many documents there are.
  const [summary, actionQueueItems, recentDocuments, extractingCount] = await Promise.all([
    getDashboardSummary(),
    getActionQueue(),
    getRecentDocuments(),
    getExtractingCount(),
  ]);

  const {
    awaitingTotal: awaitingPaymentTotal,
    needsReviewCount,
    needsReviewTotal: needsReviewAmountTotal,
    paidThisMonth: paidThisMonthTotal,
    cashFlow: last14Days,
  } = summary;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Morning briefing and action queue.</p>
      </div>

      <ExtractionPoller count={extractingCount} />

      {/* Top Row: KPI Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              Awaiting Payment
              <Info className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 dark:text-slate-400 transition-colors" />
              <div className="absolute top-8 left-4 bg-slate-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-md">
                Excludes documents pending manual review.
              </div>
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {symbol}{awaitingPaymentTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Needs Review
            </CardTitle>
            <FileText className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{needsReviewCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              Paid This Month
              <Info className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 dark:text-slate-400 transition-colors" />
              <div className="absolute top-8 left-4 bg-slate-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-md">
                Excludes documents pending manual review.
              </div>
            </CardTitle>
            <Banknote className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {symbol}{paidThisMonthTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {needsReviewAmountTotal > 0 && (
              <p className="text-xs text-slate-400 mt-1 font-medium">
                + {symbol}{needsReviewAmountTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending approval
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Split */}
      <div className="grid lg:grid-cols-3 gap-8">

        {/* Left Column (70%) */}
        <div className="lg:col-span-2 space-y-8 min-w-0">
          <CashFlowChart data={last14Days} hasPendingDocuments={needsReviewCount > 0} />

          <div className="pt-2">
            <h2 className="text-xl font-bold tracking-tight mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              Action Queue
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700">{actionQueueItems.length}</span>
            </h2>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
              <ActionQueueClient initialQueue={actionQueueItems} />
            </div>
          </div>
        </div>

        {/* Right Column (30%): The Action Hub */}
        <div className="lg:col-span-1 space-y-6 flex flex-col">
          <div className="h-52 shrink-0">
            <QuickUpload />
          </div>
          <div className="flex-1">
            <RecentActivity documents={recentDocuments} />
          </div>
        </div>

      </div>
    </div>
  );
}
