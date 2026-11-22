"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildStatementCsv, formatAmount, type IEColumn, type IEFilters, type IEGroup, type IEStatement } from "@/utils/income-expenditure";

const selectClass = "h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white"

interface Props {
    statement: IEStatement;
    filters: IEFilters;
    priorRange: { from: string; to: string } | null;
    heading: string;
    funds: { id: string; name: string; archived: boolean }[];
    orgName: string;
    currency: string;
}

export function IncomeExpenditureClient({ statement: s, filters, priorRange, heading, funds, orgName, currency }: Props) {
    const router = useRouter();
    const [custom, setCustom] = useState({ from: filters.from, to: filters.to });
    const fundName = funds.find((f) => f.id === filters.fund)?.name ?? null;

    // Filters live in the URL, so a statement can be bookmarked or shared within the organisation
    const go = (patch: Partial<Record<"period" | "from" | "to" | "fund" | "compare" | "layout", string>>) => {
        const next = {
            period: filters.period,
            from: filters.from,
            to: filters.to,
            fund: filters.fund,
            compare: filters.compare ? "1" : "0",
            layout: filters.layout,
            ...patch,
        };
        const p = new URLSearchParams();
        p.set("period", next.period);
        if (next.period === "custom") { p.set("from", next.from); p.set("to", next.to); }
        if (next.fund) p.set("fund", next.fund);
        if (next.compare === "0") p.set("compare", "0");
        if (next.layout === "by_fund") p.set("layout", "by_fund");
        router.push(`/reports/income-expenditure?${p.toString()}`);
    };

    // Each figure opens the cash book entries behind it
    const drill = (col: IEColumn, categoryId: string) => {
        const range = col.key === "prior" && priorRange ? priorRange : { from: filters.from, to: filters.to };
        const p = new URLSearchParams({ view: "cash", from: range.from, to: range.to, category: categoryId });
        const fund = col.fundId ?? filters.fund;
        if (fund) p.set("fund", fund);
        return `/ledger?${p.toString()}`;
    };

    const downloadCsv = () => {
        const csv = buildStatementCsv(s, { orgName, heading, fundName, currency });
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}-${filters.from}-to-${filters.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const amountCell = (value: number, strong = false) => (
        <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${value < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{formatAmount(value)}</span>
    );

    const section = (title: string, groups: IEGroup[], total: Record<string, number>, totalLabel: string) => (
        <>
            <tr><td colSpan={s.columns.length + 1} className="pt-6 pb-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400">{title}</td></tr>
            {groups.map((g) => (
                <GroupRows key={g.label} group={g} columns={s.columns} drill={drill} amountCell={amountCell} />
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

            {/* Controls */}
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <label className="text-xs text-slate-500">Period<br />
                    <select aria-label="Period" className={selectClass} value={filters.period}
                        onChange={(e) => go(e.target.value === "custom" ? { period: "custom", from: custom.from, to: custom.to } : { period: e.target.value })}>
                        <option value="current">This financial year</option>
                        <option value="previous">Last financial year</option>
                        <option value="custom">Custom dates</option>
                    </select>
                </label>
                {filters.period === "custom" && (
                    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); go({ from: custom.from, to: custom.to }); }}>
                        <label className="text-xs text-slate-500">From<br /><Input type="date" aria-label="From" className="h-9 w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
                        <label className="text-xs text-slate-500">To<br /><Input type="date" aria-label="To" className="h-9 w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
                        <Button type="submit" size="sm" className="h-9">Apply</Button>
                    </form>
                )}
                <label className="text-xs text-slate-500">Fund<br />
                    <select aria-label="Fund" className={selectClass} value={filters.fund} onChange={(e) => go({ fund: e.target.value })}>
                        <option value="">All funds</option>
                        {funds.map((f) => <option key={f.id} value={f.id}>{f.name}{f.archived ? " (archived)" : ""}</option>)}
                    </select>
                </label>
                <label className="text-xs text-slate-500">Layout<br />
                    <select aria-label="Layout" className={selectClass} value={filters.layout} onChange={(e) => go({ layout: e.target.value })}>
                        <option value="total">Totals</option>
                        <option value="by_fund">One column per fund</option>
                    </select>
                </label>
                {filters.layout === "total" && (
                    <label className="flex h-9 items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={filters.compare} onChange={(e) => go({ compare: e.target.checked ? "1" : "0" })} />
                        Compare with the year before
                    </label>
                )}
                <div className="ml-auto">
                    <Button variant="outline" className="h-9" onClick={downloadCsv} disabled={s.empty}>
                        <Download className="mr-2 h-4 w-4" />Export CSV
                    </Button>
                </div>
            </div>

            {/* Statement */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 pb-6">
                {s.empty ? (
                    <p className="py-12 text-center text-slate-500">No money in or out was recorded in this period{fundName ? " for this fund" : ""}.</p>
                ) : (
                    <table className="w-full min-w-[480px] text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="py-3 text-left font-medium text-slate-500">{currency}</th>
                                {s.columns.map((c) => <th key={c.key} className="py-3 pl-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody className="text-slate-700 dark:text-slate-300">
                            {section("Income", s.income, s.totalIncome, "Total income")}
                            {section("Expenditure", s.expense, s.totalExpense, "Total expenditure")}
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
                Negative figures are shown in brackets. Click a figure to see the cash book entries for it (dated by payment).
                Expense categories without a group are shown under &quot;Other expenses&quot;; set groups in Settings, Financial Customization.
            </p>
        </div>
    );
}

function GroupRows({ group, columns, drill, amountCell }: {
    group: IEGroup;
    columns: IEColumn[];
    drill: (c: IEColumn, categoryId: string) => string;
    amountCell: (v: number, strong?: boolean) => React.ReactNode;
}) {
    return (
        <>
            <tr><td colSpan={columns.length + 1} className="pt-3 pb-1 font-semibold text-slate-900 dark:text-white">{group.label}</td></tr>
            {group.lines.map((l) => (
                <tr key={l.categoryId} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="py-1.5 pl-4">{l.name}</td>
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
