"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { IEFilters } from "@/utils/income-expenditure";
import { buildFinancialPositionCsv, type BSGroup, type BSLine, type BSStatement } from "@/utils/financial-position";
import { StatementControls } from "./StatementControls";
import { amountCell, downloadCsv } from "./IncomeExpenditureClient";

// Where each line leads: the entries or register behind it
function lineLink(l: BSLine): string | null {
    switch (l.section) {
        case "cash": return l.refId ? `/ledger?view=cash&account=${l.refId}` : null;
        case "receivables": return "/invoices?tab=receivable";
        case "payables": return "/invoices";
        case "funds": return "/reports/changes-in-funds";
        default: return "/assets";
    }
}

// Statement of Financial Position (spec 6.2): what the organisation owns and owes on a date, and the
// funds that make up its net assets. Net assets always equal the funds (rule R5); if not, a red banner.
export function FinancialPositionClient({ statement: s, filters, heading, orgName, currency, funds }: {
    statement: BSStatement;
    filters: IEFilters;
    heading: string;
    orgName: string;
    currency: string;
    funds: { id: string; name: string; archived: boolean }[];
}) {
    const cols = s.columns;
    const totalRow = (label: string, values: Record<string, number>, strong = false, testId?: string) => (
        <tr className={strong ? "border-t-2 border-slate-300 dark:border-slate-600" : ""} data-testid={testId}>
            <td className={`py-2 ${strong ? "font-bold text-slate-900 dark:text-white" : "font-semibold text-slate-900 dark:text-white"}`}>{label}</td>
            {cols.map((c) => <td key={c.key} className="py-2 pl-4 text-right">{amountCell(values[c.key], true)}</td>)}
        </tr>
    );
    const group = (g: BSGroup) => g.lines.length === 0 ? null : (
        <>
            <tr><td colSpan={cols.length + 1} className="pt-4 pb-1 font-semibold text-slate-900 dark:text-white">{g.title}</td></tr>
            {g.lines.map((l) => {
                const href = lineLink(l);
                return (
                    <tr key={l.key} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="py-1.5 pl-4">{href ? <Link href={href} className="hover:underline">{l.label}</Link> : l.label}</td>
                        {cols.map((c) => <td key={c.key} className="py-1.5 pl-4 text-right">{amountCell(l.values[c.key])}</td>)}
                    </tr>
                );
            })}
            <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-1.5 pl-4 text-slate-500">Total {g.title.toLowerCase()}</td>
                {cols.map((c) => <td key={c.key} className="py-1.5 pl-4 text-right">{amountCell(g.total[c.key], true)}</td>)}
            </tr>
        </>
    );
    const sectionTitle = (t: string) => <tr><td colSpan={cols.length + 1} className="pt-6 pb-1 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400">{t}</td></tr>;

    return (
        <div className="space-y-6 animate-in fade-in">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Reports</Link>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Statement of Financial Position</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">{orgName} · {heading}</p>
            </div>

            <StatementControls basePath="/reports/financial-position" filters={filters} funds={funds} showLayout={false} showFund={false}
                onExport={() => downloadCsv(buildFinancialPositionCsv(s, { orgName, heading, currency }), `statement-of-financial-position-${filters.to}.csv`)}
                exportDisabled={false} />

            {!s.balanced && (
                <div className="flex gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300" data-testid="r5-banner">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>Net assets do not equal the total of the funds ({cols.map((c) => `${c.label}: difference ${s.difference[c.key].toFixed(2)}`).join("; ")}). Check the opening position, or contact support.</p>
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 pb-6">
                <table className="w-full min-w-[480px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="py-3 text-left font-medium text-slate-500">{currency}</th>
                            {cols.map((c) => <th key={c.key} className="py-3 pl-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">{c.label}</th>)}
                        </tr>
                    </thead>
                    <tbody className="text-slate-700 dark:text-slate-300">
                        {sectionTitle("Assets")}
                        {group(s.nonCurrentAssets)}
                        {group(s.currentAssets)}
                        {totalRow("Total assets", s.totalAssets, true)}
                        {sectionTitle("Liabilities")}
                        {group(s.currentLiabilities)}
                        {group(s.nonCurrentLiabilities)}
                        {s.currentLiabilities.lines.length + s.nonCurrentLiabilities.lines.length === 0 && <tr><td colSpan={cols.length + 1} className="py-1.5 pl-4 text-slate-400">None</td></tr>}
                        {totalRow("Total liabilities", s.totalLiabilities, true)}
                        <tr className="border-t-4 border-double border-slate-400 dark:border-slate-500" data-testid="net-assets">
                            <td className="py-3 font-bold text-slate-900 dark:text-white">Net assets</td>
                            {cols.map((c) => <td key={c.key} className="py-3 pl-4 text-right font-bold">{amountCell(s.netAssets[c.key], true)}</td>)}
                        </tr>
                        {sectionTitle("Funds")}
                        {group(s.restrictedFunds)}
                        {group(s.unrestrictedFunds)}
                        {totalRow("Total funds", s.totalFunds, true, "total-funds")}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
                Fixed assets at cost less depreciation. Money owed is unpaid invoices and bills; other assets and loans come from the Assets &amp; Liabilities page.
                Each fund&apos;s balance is its opening balance plus income, less expenditure, plus or minus transfers. Net assets always equal the total of the funds.
                Click a line to see what is behind it.
            </p>
        </div>
    );
}
