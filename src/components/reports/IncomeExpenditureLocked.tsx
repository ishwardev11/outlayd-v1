"use client";

import { Download, Sparkles } from "lucide-react";
import { usePaywall } from "@/components/ui/UpgradeNotice";
import { SAMPLE_ORG, sampleStatement, type SampleKind } from "@/utils/sample-statements";
import { printAmount, type PrintRow, type StatementPrint } from "@/utils/statement-print";
import { buildStatementPdf } from "@/utils/statement-pdf";

// What the Free plan sees in place of a financial statement (spec 9, "sample preview"): the statement
// of a made-up society, built exactly like a real one, marked SAMPLE, with the way to upgrade. No data of
// the organisation is read (the server refuses statements on the Free plan).
export function IncomeExpenditureLocked({ business, kind = "income_expenditure" }: { business: boolean; kind?: SampleKind }) {
    const paywall = usePaywall("financial_statements");
    const p = sampleStatement(kind, business);
    const downloadSample = () => buildStatementPdf(p, {
        letterhead: [SAMPLE_ORG], letterheadImage: null, signatories: [{ name: "Aminah Yusof", title: "Treasurer" }, { name: "Rajesh Kumar", title: "Chairperson" }],
        statementNote: "Sample statement of a made-up society, produced by Outlayd", draft: false, preparedOn: "31 Jan 2026",
    }).save(`sample-${p.fileName}`);

    return (
        <div className="space-y-6 animate-in fade-in">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{p.title}</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Produced from your own records on the Growth and Nonprofit plans.</p>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 p-4" data-testid="sample-banner">
                <Sparkles className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <p className="flex-1 min-w-[16rem] text-sm text-slate-700 dark:text-slate-300">
                    This is a <strong>sample</strong> from a made-up society, so you can see what you get. Upgrade and Outlayd builds yours
                    from the receipts, donations, invoices and assets you record, with checks that it adds up and a signed PDF for your AGM.
                </p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={downloadSample} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-slate-800">
                        <Download className="h-4 w-4" />Sample PDF
                    </button>
                    <button type="button" onClick={paywall.open} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                        Upgrade to unlock
                    </button>
                </div>
                {paywall.modal}
            </div>

            <SampleView print={p} />
        </div>
    );
}

const rowClass: Record<PrintRow["style"], string> = {
    section: "pt-5 pb-1 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-cyan-400",
    group: "pt-3 pb-1 font-semibold text-slate-900 dark:text-white",
    line: "py-1.5 pl-4",
    subtotal: "py-1.5 pl-4 text-slate-500 border-t border-slate-200 dark:border-slate-700",
    total: "py-2 font-semibold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-600",
    grand: "py-3 font-bold text-slate-900 dark:text-white border-t-4 border-double border-slate-400 dark:border-slate-500",
    note: "py-1.5 pl-4 italic text-slate-400",
};

function SampleView({ print: p }: { print: StatementPrint }) {
    return (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 pb-6" data-testid="sample-statement">
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="-rotate-[25deg] select-none text-[5rem] sm:text-[8rem] font-black tracking-widest text-slate-900/[0.05] dark:text-white/[0.06]">SAMPLE</span>
            </div>
            <div className="pt-5 text-center">
                <p className="font-semibold text-slate-900 dark:text-white">{SAMPLE_ORG}</p>
                <p className="text-sm text-slate-500">{p.heading}</p>
            </div>
            {p.tables.map((t, ti) => (
                <div key={ti} className="mt-4 overflow-x-auto">
                    {t.title && <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">{t.title}</h2>}
                    <table className="w-full min-w-[480px] text-sm text-slate-700 dark:text-slate-300">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="py-2 text-left font-medium text-slate-500">{p.currency}</th>
                                {t.columns.map((c) => <th key={c} className="py-2 pl-4 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">{c}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {t.rows.map((r, i) => (
                                <tr key={i}>
                                    <td className={rowClass[r.style]}>{r.label}</td>
                                    {r.cells.map((c, j) => (
                                        <td key={j} className={`${rowClass[r.style]} pl-4 text-right tabular-nums ${typeof c === "number" && c < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{printAmount(c)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            {p.notes.length > 0 && <p className="mt-4 text-xs text-slate-500">{p.notes.join(" ")}</p>}
        </div>
    );
}
