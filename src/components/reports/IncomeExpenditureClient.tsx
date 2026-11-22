"use client";

import Link from "next/link";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { buildStatementCsv, formatAmount, type IEColumn, type IEFilters, type IEGroup, type IEStatement } from "@/utils/income-expenditure";
import { StatementControls } from "./StatementControls";
import { ReadyToSubmit, useStatementPdf } from "./StatementAssurance";
import { printIncomeExpenditure } from "@/utils/statement-print";

interface Props {
    statement: IEStatement;
    filters: IEFilters;
    priorRange: { from: string; to: string } | null;
    heading: string;
    funds: { id: string; name: string; archived: boolean }[];
    orgName: string;
    currency: string;
}

export function downloadCsv(csv: string, fileName: string) {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

export const amountCell = (value: number | undefined, strong = false) => (
    <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${(value ?? 0) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{value === undefined ? "" : formatAmount(value)}</span>
);

// The cash book entries behind a figure (category, period and fund)
export function cashBookLink(filters: IEFilters, priorRange: { from: string; to: string } | null) {
    return (col: IEColumn, categoryId: string) => {
        const range = col.key === "prior" && priorRange ? priorRange : { from: filters.from, to: filters.to };
        const p = new URLSearchParams({ view: "cash", from: range.from, to: range.to, category: categoryId });
        const fund = col.fundId ?? filters.fund;
        if (fund) p.set("fund", fund);
        return `/ledger?${p.toString()}`;
    };
}

export function IncomeExpenditureClient({ statement: s, filters, priorRange, heading, funds, orgName, currency }: Props) {
    const fundName = funds.find((f) => f.id === filters.fund)?.name ?? null;
    const drill = cashBookLink(filters, priorRange);
    const { exportPdf, busy } = useStatementPdf();
    // Bills and invoices count on their invoice date (rule R1): these open the Invoices page on the same lines
    const invoicesLink = (tab: "payable" | "receivable") => (categoryId: string) => {
        const p = new URLSearchParams({ tab, from: filters.from, to: filters.to, category: categoryId });
        if (filters.fund) p.set("fund", filters.fund);
        return `/invoices?${p.toString()}`;
    };

    const section = (title: string, groups: IEGroup[], total: Record<string, number>, totalLabel: string, tab: "payable" | "receivable") => (
        <>
            <tr><td colSpan={s.columns.length + 1} className="pt-6 pb-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400">{title}</td></tr>
            {groups.map((g) => (
                <GroupRows key={g.label} group={g} columns={s.columns} drill={drill} invoices={invoicesLink(tab)} />
            ))}
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

            <StatementControls basePath="/reports/income-expenditure" filters={filters} funds={funds} showLayout
                onExport={() => downloadCsv(buildStatementCsv(s, { orgName, heading, fundName, currency }), `${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}-${filters.from}-to-${filters.to}.csv`)}
                onExportPdf={() => exportPdf(printIncomeExpenditure(s, { heading, fundName, currency, from: filters.from, to: filters.to }), filters.from, filters.to)}
                pdfBusy={busy}
                exportDisabled={s.empty} />

            <ReadyToSubmit from={filters.from} to={filters.to} />

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 pb-6">
                {s.empty ? (
                    <p className="py-12 text-center text-slate-500">No income or spending was recorded in this period{fundName ? " for this fund" : ""}.</p>
                ) : (
                    <table className="w-full min-w-[480px] text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="py-3 text-left font-medium text-slate-500">{currency}</th>
                                {s.columns.map((c) => <th key={c.key} className="py-3 pl-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody className="text-slate-700 dark:text-slate-300">
                            {section("Income", s.income, s.totalIncome, "Total income", "receivable")}
                            {section("Expenditure", s.expense, s.totalExpense, "Total expenditure", "payable")}
                            <tr className="border-t-4 border-double border-slate-400 dark:border-slate-500">
                                <td className="py-3 font-bold text-slate-900 dark:text-white">{s.surplusLabel}</td>
                                {s.columns.map((c) => <td key={c.key} className="py-3 text-right font-bold">{amountCell(s.surplus[c.key], true)}</td>)}
                            </tr>
                        </tbody>
                    </table>
                )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
                Bills and invoices count on their invoice date, whether paid yet or not, and their payments are not counted again.
                Everything else counts on the date the money moved. Refunds reduce the expense they refund.
                Negative figures are shown in brackets. Click a figure to see the cash book entries for it (dated by payment), or the
                <ReceiptText className="inline mx-1 h-3 w-3" />icon for the bills and invoices behind it.
                Expense categories without a group are shown under &quot;Other expenses&quot;; set groups in Settings, Financial Customization.
            </p>
        </div>
    );
}

export function GroupRows({ group, columns, drill, invoices }: {
    group: IEGroup;
    columns: IEColumn[];
    drill: (c: IEColumn, categoryId: string) => string;
    invoices?: (categoryId: string) => string;
}) {
    return (
        <>
            <tr><td colSpan={columns.length + 1} className="pt-3 pb-1 font-semibold text-slate-900 dark:text-white">{group.label}</td></tr>
            {group.lines.map((l) => (
                <tr key={l.categoryId} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="py-1.5 pl-4">
                        {l.name}
                        {invoices && (
                            <Link href={invoices(l.categoryId)} className="ml-1.5 inline-flex align-middle text-slate-400 hover:text-indigo-600" title="Bills and invoices for this category" aria-label={`Bills and invoices for ${l.name}`}>
                                <ReceiptText className="h-3.5 w-3.5" />
                            </Link>
                        )}
                    </td>
                    {columns.map((c) => (
                        <td key={c.key} className="py-1.5 pl-4 text-right">
                            {Math.abs(l.values[c.key]) >= 0.005
                                ? <Link href={drill(c, l.categoryId)} className="hover:underline" title="Open these entries in the cash book">{amountCell(l.values[c.key])}</Link>
                                : amountCell(0)}
                        </td>
                    ))}
                </tr>
            ))}
            <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-1.5 pl-4 text-slate-500">Total {group.label.toLowerCase()}</td>
                {columns.map((c) => <td key={c.key} className="py-1.5 pl-4 text-right">{amountCell(group.total[c.key], true)}</td>)}
            </tr>
        </>
    );
}
