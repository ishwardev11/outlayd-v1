"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { IEFilters } from "@/utils/income-expenditure";
import { buildChangesInFundsCsv, type CIFStatement } from "@/utils/financial-position";
import { StatementControls } from "./StatementControls";
import { amountCell, downloadCsv } from "./IncomeExpenditureClient";

const COLS = [
    ["opening", "Opening balance"], ["income", "Income"], ["expense", "Expenditure"],
    ["transfers_in", "Transfers in"], ["transfers_out", "Transfers out"], ["closing", "Closing balance"],
] as const;

// Statement of Changes in Funds (spec 6.4): per fund, the balance at the start of the period, income,
// expenditure, transfers and the balance at the end (rule R4)
export function ChangesInFundsClient({ statement: s, filters, heading, orgName, currency, funds }: {
    statement: CIFStatement;
    filters: IEFilters;
    heading: string;
    orgName: string;
    currency: string;
    funds: { id: string; name: string; archived: boolean }[];
}) {
    // Income and expenditure of one fund open the statement filtered to it
    const ieLink = (fundId: string) => {
        const p = new URLSearchParams({ period: "custom", from: filters.from, to: filters.to, fund: fundId, compare: "0" });
        return `/reports/income-expenditure?${p.toString()}`;
    };
    return (
        <div className="space-y-6 animate-in fade-in">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Reports</Link>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Statement of Changes in Funds</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">{orgName} · {heading}</p>
            </div>
            <StatementControls basePath="/reports/changes-in-funds" filters={filters} funds={funds} showLayout={false} showFund={false} showCompare={false}
                onExport={() => downloadCsv(buildChangesInFundsCsv(s, { orgName, heading, currency }), `statement-of-changes-in-funds-${filters.from}-to-${filters.to}.csv`)}
                exportDisabled={s.groups.length === 0} />
            {!s.transfersBalance && (
                <div className="flex gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><p>Transfers in and out do not match. Please contact support.</p>
                </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 pb-6">
                <table className="w-full min-w-[760px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="py-3 text-left font-medium text-slate-500">{currency}</th>
                            {COLS.map(([k, label]) => <th key={k} className="py-3 pl-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">{label}</th>)}
                        </tr>
                    </thead>
                    <tbody className="text-slate-700 dark:text-slate-300">
                        {s.groups.map((g) => (
                            <GroupBlock key={g.title} title={g.title} rows={g.rows} total={g.total} ieLink={ieLink} />
                        ))}
                        <tr className="border-t-4 border-double border-slate-400 dark:border-slate-500" data-testid="cif-total">
                            <td className="py-3 font-bold text-slate-900 dark:text-white">Total funds</td>
                            {COLS.map(([k]) => <td key={k} className="py-3 pl-4 text-right font-bold">{amountCell(s.total[k], true)}</td>)}
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Income and expenditure follow the Income &amp; Expenditure statement (bills and invoices by invoice date, depreciation charged to
                each asset&apos;s fund). Transfers move money between funds without any cash moving. The closing total equals net assets on the
                Statement of Financial Position. Click a fund to see its income and expenditure.
            </p>
        </div>
    );
}

function GroupBlock({ title, rows, total, ieLink }: {
    title: string;
    rows: CIFStatement["groups"][number]["rows"];
    total: CIFStatement["total"];
    ieLink: (id: string) => string;
}) {
    return (
        <>
            <tr><td colSpan={7} className="pt-5 pb-1 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400">{title}</td></tr>
            {rows.map((r) => (
                <tr key={r.fund_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40" data-testid={`fund-${r.fund_name}`}>
                    <td className="py-1.5 pl-4"><Link href={ieLink(r.fund_id)} className="hover:underline">{r.fund_name}</Link>{r.archived && <span className="ml-1 text-xs text-slate-400">(archived)</span>}</td>
                    {COLS.map(([k]) => <td key={k} className="py-1.5 pl-4 text-right">{amountCell(r[k], k === "closing")}</td>)}
                </tr>
            ))}
            <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-1.5 pl-4 text-slate-500">Total {title.toLowerCase()}</td>
                {COLS.map(([k]) => <td key={k} className="py-1.5 pl-4 text-right">{amountCell(total[k], true)}</td>)}
            </tr>
        </>
    );
}
