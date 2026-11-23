import { getDashboardSummary, getActionQueue, getRecentDocuments, getExtractingCount, getCashThisMonth, getOverdueInvoices, getFundBalances, getOnboardingProgress } from "@/app/actions/aggregates";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { gettingStartedSteps } from "@/utils/getting-started";
import { createClient } from "@/utils/supabase/server";
import { featureAllowed } from "@/utils/plan";
import Link from "next/link";
import { getOrganizationId, getOrganizationCurrency } from "@/app/actions/document-utils";
import { getCurrencyDetails } from "@/utils/currency";
import { redirect } from "next/navigation";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { ActionQueueClient } from "@/components/dashboard/ActionQueueClient";
import { QuickUpload } from "@/components/dashboard/QuickUpload";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ExtractionPoller } from "@/components/ExtractionPoller";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileText, ArrowDownLeft, ArrowUpRight, Info, Clock } from "lucide-react";

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A small hover note next to a card title
function CardNote({ text }: { text: string }) {
  return (
    <>
      <Info className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 dark:text-slate-400 transition-colors" />
      <div className="absolute top-8 left-4 bg-slate-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity w-64 whitespace-normal normal-case tracking-normal font-normal z-50 shadow-md">
        {text}
      </div>
    </>
  );
}

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
  const supabase = await createClient();
  const [summary, actionQueueItems, recentDocuments, extractingCount, cash, canRecordIncome, overdue, { data: orgRow }, fundBalances, progress] = await Promise.all([
    getDashboardSummary(),
    getActionQueue(),
    getRecentDocuments(),
    getExtractingCount(),
    getCashThisMonth(),
    featureAllowed(supabase, orgId, "income", "use"),
    getOverdueInvoices(),
    supabase.from("organizations").select("opening_position_completed_at").eq("id", orgId).maybeSingle(),
    getFundBalances(),
    getOnboardingProgress(),
  ]);
  // Paid organisations are asked once to set up their opening position (spec 5.6)
  const needsOpening = canRecordIncome && !orgRow?.opening_position_completed_at;

  const {
    awaitingTotal: awaitingPaymentTotal,
    needsReviewCount,
    needsReviewTotal: needsReviewAmountTotal,
    cashFlow: last14Days,
  } = summary;
  // Money in is a paid feature; a free organisation still sees it if it has any (refunds, credit notes)
  const showMoneyIn = canRecordIncome || cash.moneyIn > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Morning briefing and action queue.</p>
      </div>

      <ExtractionPoller count={extractingCount} />

      <GettingStarted steps={gettingStartedSteps(progress, canRecordIncome)} orgId={orgId} paid={canRecordIncome} needsOpening={needsOpening} />

      {/* Overdue bills and invoices (spec 5.5), only when something is overdue */}
      {(overdue.payable.count > 0 || overdue.receivable.count > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm" data-testid="overdue-strip">
          <span className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-300"><Clock className="h-4 w-4" />Overdue</span>
          {overdue.payable.count > 0 && (
            <Link href="/invoices?status=overdue" className="text-red-800 dark:text-red-300 hover:underline" data-testid="overdue-bills">
              {overdue.payable.count} {overdue.payable.count === 1 ? "bill" : "bills"} to pay: <span className="font-semibold tabular-nums">{symbol}{money(overdue.payable.total)}</span>
            </Link>
          )}
          {overdue.receivable.count > 0 && (
            <Link href="/invoices?tab=receivable&status=overdue" className="text-red-800 dark:text-red-300 hover:underline" data-testid="overdue-invoices">
              {overdue.receivable.count} {overdue.receivable.count === 1 ? "invoice" : "invoices"} owed to you: <span className="font-semibold tabular-nums">{symbol}{money(overdue.receivable.total)}</span>
            </Link>
          )}
        </div>
      )}

      {/* Top Row: KPI Cards */}
      <div className={`grid gap-6 md:grid-cols-2 ${showMoneyIn ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              Awaiting Payment
              <CardNote text="Approved documents that have not been paid yet. Documents still waiting for review are not included." />
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <Link href="/ledger?status=awaiting_payment" className="text-2xl font-bold text-slate-900 dark:text-white hover:underline" data-testid="awaiting-payment">
              {symbol}{money(awaitingPaymentTotal)}
            </Link>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              Needs Review
              <CardNote text="Uploaded documents waiting for someone to check the details and approve them." />
            </CardTitle>
            <FileText className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <Link href="/ledger?status=needs_review" className="text-2xl font-bold text-slate-900 dark:text-white hover:underline" data-testid="needs-review">
              {needsReviewCount}
            </Link>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              Money Out This Month
              <CardNote text="Payments made this month, by payment date, from the cash book. Documents still waiting for review or payment are not included." />
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <Link href={`/ledger?view=cash&type=money_out&from=${cash.from}&to=${cash.to}`} className="text-2xl font-bold text-slate-900 dark:text-white hover:underline" data-testid="money-out-month">
              {symbol}{money(cash.moneyOut)}
            </Link>
            {needsReviewAmountTotal > 0 && (
              <p className="text-xs text-slate-400 mt-1 font-medium">
                + {symbol}{money(needsReviewAmountTotal)} pending approval
              </p>
            )}
          </CardContent>
        </Card>
        {showMoneyIn && (
          <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
                Money In This Month
                <CardNote text="Donations, grants and other income received this month, by date received. Refunds you received also count as money in." />
              </CardTitle>
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <Link href={`/ledger?view=cash&type=money_in&from=${cash.from}&to=${cash.to}`} className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 hover:underline" data-testid="money-in-month">
                {symbol}{money(cash.moneyIn)}
              </Link>
            </CardContent>
          </Card>
        )}
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
          {fundBalances && fundBalances.length > 0 && (
            <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm" data-testid="fund-balances">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
                  Fund Balances
                  <CardNote text="What each fund holds today: its opening balance plus income, less spending, plus or minus transfers." />
                </CardTitle>
                <Link href="/reports/changes-in-funds" className="text-xs text-indigo-600 hover:underline">Details</Link>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {fundBalances.map((f) => (
                  <div key={f.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">
                      {f.name}
                      {f.restricted && <span className="ml-1 text-xs text-slate-400">restricted</span>}
                    </span>
                    <span className={`tabular-nums font-semibold ${f.balance < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                      {f.balance < 0 ? "-" : ""}{symbol}{money(Math.abs(f.balance))}
                    </span>
                  </div>
                ))}
                {/* Spec 3.2: a soft warning when a restricted fund has spent more than it holds */}
                {fundBalances.some((f) => f.restricted && f.balance < 0) && (
                  <p className="pt-1 text-xs text-red-600 dark:text-red-400" data-testid="restricted-overspent">
                    A restricted fund is below zero: more has been spent from it than it received. Consider a transfer from an unrestricted fund.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          <div className="flex-1">
            <RecentActivity documents={recentDocuments} />
          </div>
        </div>

      </div>
    </div>
  );
}
