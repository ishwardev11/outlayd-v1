"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { IEFilters, IEGroup } from "@/utils/income-expenditure";
import { buildReceiptsPaymentsCsv, type RPStatement } from "@/utils/receipts-payments";
import { StatementControls } from "./StatementControls";
import { GroupRows, amountCell, cashBookLink, downloadCsv } from "./IncomeExpenditureClient";

interface Props {
    statement: RPStatement;
    filters: IEFilters;
    priorRange: { from: string; to: string } | null;
    heading: string;
    funds: { id: string; name: string; archived: boolean }[];
    orgName: string;
    currency: string;
}

// Receipts and Payments (spec 6.3): the cash version many small societies submit. Every figure is cash
// that moved in the period, so it agrees to the bank: opening + receipts - payments = closing.
export function ReceiptsPaymentsClient({ statement: s, filters, priorRange, heading, funds, orgName, currency }: Props) {
    const fundName = funds.find((f) => f.id === filters.fund)?.name ?? null;
    const drill = cashBookLink(filters, priorRange);

    const cashRow = (label: string, values: Record<string, number> | null, testId: string) => values && (
        <tr className="border-b border-slate-200 dark:border-slate-700" data-testid={testId}>
            <td className="py-2.5 font-semibold text-slate-900 dark:text-white">{label}</td>
            {s.columns.map((c) => <td key={c.key} className="py-2.5 pl-4 text-right">{amountCell(values[c.key], true)}</td>)}
        </tr>
    );
    const section = (title: string, groups: IEGroup[], total: Record<string, number>, totalLabel: string) => (
        <>
            <tr><td colSpan={s.columns.length + 1} className="pt-6 pb-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400">{title}</td></tr>
            {groups.length === 0 && <tr><td colSpan={s.columns.length + 1} className="py-1.5 pl-4 text-slate-400">None in this period</td></tr>}
            {groups.map((g) => <GroupRows key={g.label} group={g} columns={s.columns} drill={drill} />)}
            <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                <td className="py-2 font-semibold text-slate-900 dark:text-white">{totalLabel}</td>
                {s.columns.map((c) => <td key={c.key} className="py-2 text-right">{amountCell(total[c.key], true)}</td>)}
            </tr>
        </>
    );

    return (
        <div className="space-y-6 animate-in fade-in">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                    <ArrowLeft className="h-4 w-4" /> Reports
                </Link>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{s.title}</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">{orgName} · {heading} · {fundName ? `Fund: ${fundName}` : "All funds"}</p>
            </div>

            <StatementControls basePath="/reports/receipts-payments" filters={filters} funds={funds} showLayout={false}
                onExport={() => downloadCsv(buildReceiptsPaymentsCsv(s, { orgName, heading, fundName, currency }), `receipts-and-payments-${filters.from}-to-${filters.to}.csv`)}
                exportDisabled={s.empty && !s.opening} />

            {s.balanced === false && (
                <div className="flex gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>Opening cash plus receipts less payments does not equal closing cash. Please contact support so we can look into it.</p>
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 pb-6">
                <table className="w-full min-w-[480px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="py-3 text-left font-medium text-slate-500">{currency}</th>
                            {s.columns.map((c) => <th key={c.key} className="py-3 pl-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">{c.label}</th>)}
                        </tr>
                    </thead>
                    <tbody className="text-slate-700 dark:text-slate-300">
                        {cashRow("Opening cash and bank", s.opening, "rp-opening")}
                        {section("Receipts", s.receipts, s.totalReceipts, "Total receipts")}
                        {section("Payments", s.payments, s.totalPayments, "Total payments")}
                        <tr className="border-t border-slate-200 dark:border-slate-700">
                            <td className="py-2.5 font-medium">Receipts less payments</td>
                            {s.columns.map((c) => <td key={c.key} className="py-2.5 pl-4 text-right">{amountCell(s.net[c.key], true)}</td>)}
                        </tr>
                        {s.closing && (
                            <tr className="border-t-4 border-double border-slate-400 dark:border-slate-500" data-testid="rp-closing">
                                <td className="py-3 font-bold text-slate-900 dark:text-white">Closing cash and bank</td>
                                {s.columns.map((c) => <td key={c.key} className="py-3 pl-4 text-right font-bold">{amountCell(s.closing![c.key], true)}</td>)}
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
                Cash only: money received and paid in the period, by payment date, across all your accounts. Unpaid bills and invoices are not
                included; a payment of a bill or invoice is shown under its categories. Transfers between your own accounts are left out.
                {fundName ? " Opening and closing cash are shown for all funds together, so they are hidden when one fund is selected." : ""}
                {!fundName && !s.opening ? " Opening and closing cash are shown for periods from your tracking start date (Settings, opening position)." : ""}
                {" "}Click a figure to see the cash book entries behind it.
            </p>
        </div>
    );
}
