import type { Metadata } from "next";
import { getDashboardSummary, getBillsToPay, getExtractingCount, getCashThisMonth, getOverdueInvoices, getFundBalances, getOnboardingProgress } from "@/app/actions/aggregates";
import { getInboxCounts } from "@/app/actions/inbox";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { gettingStartedSteps } from "@/utils/getting-started";
import { createClient } from "@/utils/supabase/server";
import { featureAllowed } from "@/utils/plan";
import Link from "next/link";
import { getOrganizationId, getOrganizationCurrency } from "@/app/actions/document-utils";
import { getCurrencyDetails } from "@/utils/currency";
import { redirect } from "next/navigation";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { QuickUpload } from "@/components/dashboard/QuickUpload";
import { ExtractionPoller } from "@/components/ExtractionPoller";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Inbox, ArrowDownLeft, ArrowUpRight, Info, Clock } from "lucide-react";

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

export const metadata: Metadata = { title: "Dashboard" };

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

  // Totals and the 14-day cash flow are computed in the database, so the page stays fast however
  // many documents there are. Step 7 of the simplification trimmed the page to four cards: what is
  // waiting in the Inbox, the bills to pay, and money in and out this month. The action queue and the
  // recent activity list went; the Inbox and Bills & Invoices show the same things in full.
  const supabase = await createClient();
  const [summary, inbox, bills, extractingCount, cash, canRecordIncome, overdue, { data: orgRow }, fundBalances, progress] = await Promise.all([
    getDashboardSummary(),
    getInboxCounts(),
    getBillsToPay(),
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
    needsReviewCount,
    needsReviewTotal: needsReviewAmountTotal,
    cashFlow: last14Days,
  } = summary;
  // The small line under "To review": what kind of uploads are waiting, only the kinds there are
  const inboxParts = [
    inbox.needs_review > 0 ? `${inbox.needs_review} to check` : "",
    inbox.extracting > 0 ? `${inbox.extracting} being read` : "",
    inbox.duplicate > 0 ? `${inbox.duplicate} possible ${inbox.duplicate === 1 ? "duplicate" : "duplicates"}` : "",
  ].filter(Boolean);
  // Money in is a paid feature; a free organisation still sees it if it has any (refunds, credit notes)
  const showMoneyIn = canRecordIncome || cash.moneyIn > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">What needs doing, and where the money stands.</p>
      </div>

      <ExtractionPoller count={extractingCount} />

      <GettingStarted steps={gettingStartedSteps(progress, canRecordIncome)} orgId={orgId} paid={canRecordIncome} needsOpening={needsOpening} />

      {/* Invoices owed to you that are overdue (spec 5.5). Overdue bills you owe are on the Bills to pay
          card below, in red. */}
      {overdue.receivable.count > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm" data-testid="overdue-strip">
          <span className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-300"><Clock className="h-4 w-4" />Overdue</span>
          <Link href="/invoices?tab=receivable&status=overdue" className="text-red-800 dark:text-red-300 hover:underline" data-testid="overdue-invoices">
            {overdue.receivable.count} {overdue.receivable.count === 1 ? "invoice" : "invoices"} owed to you: <span className="font-semibold tabular-nums">{symbol}{money(overdue.receivable.total)}</span>
          </Link>
        </div>
      )}

      {/* Top Row: KPI Cards */}
      {/* One row of four cards (step 7); a free organisation without money in sees three */}
      <div className={`grid gap-6 md:grid-cols-2 ${showMoneyIn ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              To Review
              <CardNote text="Uploads in the Inbox: being read, waiting for someone to check and approve them, or possible duplicates." />
            </CardTitle>
            <Inbox className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <Link href="/inbox" className="text-2xl font-bold text-slate-900 dark:text-white hover:underline" data-testid="to-review">
              {inbox.all}
            </Link>
            <p className="text-xs text-slate-400 mt-1 font-medium">{inboxParts.length > 0 ? inboxParts.join(" · ") : "Nothing waiting"}</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              Bills To Pay
              <CardNote text="Bills you have not fully paid yet, with what is still owed on them: the same total as Bills & Invoices. Overdue ones are in red." />
            </CardTitle>
            <Receipt className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <Link href="/invoices?status=unpaid" className="text-2xl font-bold text-slate-900 dark:text-white hover:underline" data-testid="bills-to-pay">
              {symbol}{money(bills.total)}
            </Link>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {bills.count === 0 ? "Nothing to pay" : `${bills.count} ${bills.count === 1 ? "bill" : "bills"}`}
              {bills.overdueCount > 0 && (
                <Link href="/invoices?status=overdue" className="text-red-600 dark:text-red-400 hover:underline" data-testid="bills-overdue">
                  {" · "}{symbol}{money(bills.overdueTotal)} overdue
                </Link>
              )}
            </p>
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
              <Link href={`/transactions?type=money_in&from=${cash.from}&to=${cash.to}`} className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 hover:underline" data-testid="money-in-month">
                {symbol}{money(cash.moneyIn)}
              </Link>
            </CardContent>
          </Card>
        )}
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group cursor-default">
              Money Out This Month
              <CardNote text="Payments made this month, by payment date, from the cash book. Documents still waiting for review or payment are not included." />
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <Link href={`/transactions?type=money_out&from=${cash.from}&to=${cash.to}`} className="text-2xl font-bold text-slate-900 dark:text-white hover:underline" data-testid="money-out-month">
              {symbol}{money(cash.moneyOut)}
            </Link>
            {needsReviewAmountTotal > 0 && (
              <p className="text-xs text-slate-400 mt-1 font-medium">
                + {symbol}{money(needsReviewAmountTotal)} pending approval
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
        </div>

        {/* Right Column (30%): upload, and what each fund holds */}
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
        </div>

      </div>
    </div>
  );
}
