"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SchedulesPageData } from "@/app/actions/statements";
import { CSV_BOM, csvRow, csvText } from "@/utils/csv";
import { formatAmount } from "@/utils/income-expenditure";
import { AGEING_LABELS, type AgeingBucket } from "@/utils/invoices";
import { StatementControls } from "./StatementControls";
import { downloadCsv } from "./IncomeExpenditureClient";

const BUCKETS: AgeingBucket[] = ["current", "1_30", "31_60", "61_plus"];
const c = (n: number) => Math.round(n * 100);

// Schedules and notes (spec 6.5): fixed assets, money owed by age, donations and grants by fund, and
// an optional donor list (off by default, for privacy)
export function SchedulesClient({ data, heading }: { data: SchedulesPageData; heading: string }) {
    const { filters } = data;
    const fundName = new Map(data.funds.map((f) => [f.id, f.name]));
    const num = (n: number) => <span className="tabular-nums">{formatAmount(n)}</span>;

    // Donations and grants: one row per fund
    const byFund = new Map<string, { donation: number; grant: number }>();
    for (const r of data.income) {
        const cur = byFund.get(r.fund_id) ?? { donation: 0, grant: 0 };
        if (r.nature === "donation") cur.donation += c(r.amount);
        if (r.nature === "grant") cur.grant += c(r.amount);
        byFund.set(r.fund_id, cur);
    }
    const fundRows = [...byFund].map(([id, v]) => ({ name: fundName.get(id) ?? "", donation: v.donation / 100, grant: v.grant / 100 }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const ageing = (dir: "receivable" | "payable") => BUCKETS.map((b) => data.ageing.find((a) => a.direction === dir && a.bucket === b) ?? { amount: 0, count: 0 });
    const fa = data.fixedAssets;
    const faTotal = (k: keyof SchedulesPageData["fixedAssets"][number]) => fa.reduce((s, r) => s + c(Number(r[k])), 0) / 100;

    const exportCsv = () => {
        const n = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
        const lines = [csvRow([csvText(data.orgName)]), csvRow([csvText("Schedules")]), csvRow([csvText(heading)]), csvRow([csvText(`Amounts in ${data.currency}.`)]), ""];
        lines.push(csvRow([csvText("FIXED ASSETS")]));
        lines.push(csvRow(["Asset", "Fund", "Cost b/f", "Additions", "Disposals", "Cost c/f", "Depreciation b/f", "Charge", "On disposals", "Depreciation c/f", "Book value b/f", "Book value c/f"].map(csvText)));
        for (const r of fa) lines.push(csvRow([csvText(r.name), csvText(fundName.get(r.fund_id) ?? ""), ...[r.cost_open, r.additions, r.disposals_cost, r.cost_close, r.dep_open, r.dep_charge, r.dep_disposals, r.dep_close, r.nbv_open, r.nbv_close].map(n)]));
        lines.push("", csvRow([csvText("MONEY OWED BY AGE (today)")]), csvRow(["", ...BUCKETS.map((b) => AGEING_LABELS[b])].map(csvText)));
        lines.push(csvRow([csvText("Owed to you"), ...ageing("receivable").map((a) => n(a.amount))]));
        lines.push(csvRow([csvText("You owe"), ...ageing("payable").map((a) => n(a.amount))]));
        lines.push("", csvRow([csvText("DONATIONS AND GRANTS BY FUND")]), csvRow(["Fund", "Donations", "Grants"].map(csvText)));
        for (const r of fundRows) lines.push(csvRow([csvText(r.name), n(r.donation), n(r.grant)]));
        if (data.donors) {
            lines.push("", csvRow([csvText("DONORS")]), csvRow(["Donor", "Donations", "Amount"].map(csvText)));
            for (const d of data.donors) lines.push(csvRow([csvText(d.name), String(d.count), n(d.amount)]));
        }
        downloadCsv(CSV_BOM + lines.join("\r\n") + "\r\n", `schedules-${filters.from}-to-${filters.to}.csv`);
    };

    const donorsHref = () => {
        const p = new URLSearchParams({ period: filters.period });
        if (filters.period === "custom") { p.set("from", filters.from); p.set("to", filters.to); }
        if (filters.fund) p.set("fund", filters.fund);
        if (!data.donors) p.set("donors", "1");
        return `/reports/schedules?${p.toString()}`;
    };

    const th = "py-2 pl-3 text-right font-medium text-slate-500 whitespace-nowrap";
    return (
        <div className="space-y-8 animate-in fade-in">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Reports</Link>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Schedules</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">{data.orgName} · {heading}</p>
            </div>
            <StatementControls basePath="/reports/schedules" filters={filters} funds={data.funds} showLayout={false} showCompare={false}
                extraParams={{ donors: data.donors ? "1" : "" }} onExport={exportCsv} exportDisabled={false} />

            <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Fixed assets</h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3">
                    <table className="w-full min-w-[900px] text-sm" data-testid="fixed-asset-schedule">
                        <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="py-2 text-left font-medium text-slate-500">Asset</th>
                            {["Cost b/f", "Additions", "Disposals", "Cost c/f", "Depr. b/f", "Charge", "On disposals", "Depr. c/f", "Book value c/f"].map((h) => <th key={h} className={th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {fa.length === 0 && <tr><td colSpan={10} className="py-4 text-center text-slate-500">No fixed assets in this period</td></tr>}
                            {fa.map((r) => (
                                <tr key={r.item_id} className="border-b border-slate-100 dark:border-slate-800">
                                    <td className="py-1.5">{r.name} <span className="text-xs text-slate-500">{fundName.get(r.fund_id)}</span></td>
                                    {[r.cost_open, r.additions, -r.disposals_cost, r.cost_close, r.dep_open, r.dep_charge, -r.dep_disposals, r.dep_close, r.nbv_close].map((v, i) => <td key={i} className="py-1.5 pl-3 text-right">{num(v)}</td>)}
                                </tr>
                            ))}
                            {fa.length > 0 && (
                                <tr className="font-semibold">
                                    <td className="py-2">Total</td>
                                    {[faTotal("cost_open"), faTotal("additions"), -faTotal("disposals_cost"), faTotal("cost_close"), faTotal("dep_open"), faTotal("dep_charge"), -faTotal("dep_disposals"), faTotal("dep_close"), faTotal("nbv_close")]
                                        .map((v, i) => <td key={i} className="py-2 pl-3 text-right">{num(v)}</td>)}
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Money owed by age <span className="text-sm font-normal text-slate-500">(today)</span></h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3">
                    <table className="w-full text-sm">
                        <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2 text-left font-medium text-slate-500" />{BUCKETS.map((b) => <th key={b} className={th}>{AGEING_LABELS[b]}</th>)}</tr></thead>
                        <tbody>
                            <tr><td className="py-1.5"><Link href="/invoices?tab=receivable" className="hover:underline">Owed to you</Link></td>{ageing("receivable").map((a, i) => <td key={i} className="py-1.5 pl-3 text-right">{num(a.amount)}</td>)}</tr>
                            <tr><td className="py-1.5"><Link href="/invoices" className="hover:underline">You owe</Link></td>{ageing("payable").map((a, i) => <td key={i} className="py-1.5 pl-3 text-right">{num(a.amount)}</td>)}</tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Donations and grants by fund</h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3">
                    <table className="w-full text-sm" data-testid="donations-by-fund">
                        <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2 text-left font-medium text-slate-500">Fund</th><th className={th}>Donations</th><th className={th}>Grants</th></tr></thead>
                        <tbody>
                            {fundRows.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">None in this period</td></tr>}
                            {fundRows.map((r) => <tr key={r.name}><td className="py-1.5">{r.name}</td><td className="py-1.5 pl-3 text-right">{num(r.donation)}</td><td className="py-1.5 pl-3 text-right">{num(r.grant)}</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Donor list</h2>
                    <Link href={donorsHref()} className="text-sm text-indigo-600 hover:underline">{data.donors ? "Hide donor list" : "Show donor list"}</Link>
                </div>
                {data.donors ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3">
                        <table className="w-full text-sm" data-testid="donor-list">
                            <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2 text-left font-medium text-slate-500">Donor</th><th className={th}>Donations</th><th className={th}>Amount</th></tr></thead>
                            <tbody>
                                {data.donors.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">No donations in this period</td></tr>}
                                {data.donors.map((d) => <tr key={d.name}><td className="py-1.5">{d.name}</td><td className="py-1.5 pl-3 text-right">{d.count}</td><td className="py-1.5 pl-3 text-right">{num(d.amount)}</td></tr>)}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">Hidden by default, to protect donors&apos; privacy. Show it only when the report is not shared publicly.</p>
                )}
            </section>
        </div>
    );
}
