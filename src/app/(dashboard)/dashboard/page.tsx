import { getDocuments } from "@/app/actions/ledger";
import { getOrganizationId, getOrganizationCurrency } from "@/app/actions/document-utils";
import { getCurrencyDetails } from "@/utils/currency";
import { redirect } from "next/navigation";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { ActionQueueClient } from "@/components/dashboard/ActionQueueClient";
import { QuickUpload } from "@/components/dashboard/QuickUpload";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileText, Banknote, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const orgId = await getOrganizationId();
  if (!orgId) {
    redirect("/onboarding");
  }

  const orgCurrency = await getOrganizationCurrency();
  const { symbol } = getCurrencyDetails(orgCurrency);

  const documents = await getDocuments();
  const today = new Date();

  // 1. Calculate KPI Metrics
  let awaitingPaymentTotal = 0;
  let needsReviewCount = 0;
  let needsReviewAmountTotal = 0;
  let paidThisMonthTotal = 0;

  documents.forEach((doc: any) => {
    const amount = doc.amount || 0;
    if (doc.status === 'awaiting_payment') {
      awaitingPaymentTotal += amount;
    } else if (doc.status === 'needs_review') {
      needsReviewCount++;
      needsReviewAmountTotal += amount;
    } else if (doc.status === 'paid') {
      const docDate = new Date(doc.document_date || doc.created_at);
      if (!isNaN(docDate.getTime()) && docDate.getMonth() === today.getMonth() && docDate.getFullYear() === today.getFullYear()) {
        paidThisMonthTotal += amount;
      }
    }
  });

  // 2. Calculate 14-day cash flow (Money Out: Paid or Awaiting Payment)
  const last14Days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return {
      date: d.toISOString().split('T')[0], // YYYY-MM-DD
      displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount: 0
    };
  });

  documents.forEach((doc: any) => {
    if (doc.status === 'paid' || doc.status === 'awaiting_payment') {
      const docDateStr = doc.document_date || doc.created_at?.split('T')[0];
      if (!docDateStr) return;

      try {
        const docDateObj = new Date(docDateStr);
        const targetStr = docDateObj.toISOString().split('T')[0];
        const index = last14Days.findIndex(d => d.date === targetStr);
        if (index !== -1) {
          last14Days[index].amount += (doc.amount || 0);
        }
      } catch (e) {
        // Ignore invalid dates
      }
    }
  });

  // 3. Get recent action queue items (Needs Review or Awaiting Payment)
  const actionQueueItems = documents
    .filter((d: any) => d.status === 'needs_review' || d.status === 'awaiting_payment')
    .slice(0, 10); // Show top 10

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Morning briefing and action queue.</p>
      </div>

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
            <RecentActivity documents={documents} />
          </div>
        </div>

      </div>
    </div>
  );
}
