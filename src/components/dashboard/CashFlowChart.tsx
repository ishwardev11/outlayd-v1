"use client";

import { useIsClient } from "@/lib/use-is-client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useCurrency } from "@/components/CurrencyProvider";
import type { CashFlowDay } from "@/utils/dashboard";
import { dayLabel } from "@/utils/dashboard";
import { useDashboardUpload } from "./DashboardUpload";

// Money in and money out per day for the last 30 days, as paired bars, with the period's totals.
// Brand teal = in, brand indigo = out (checked for colour-blind separation with the dataviz validator).
// The colours come from the theme tokens in globals.css.
const IN_FILL = "var(--color-brand-teal-600)";
const OUT_FILL = "var(--color-brand-600)";

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The empty state's placeholder: fixed, made-up bar heights (percent), drawn grey and faint with no axes,
// so it cannot be read as real figures
const SAMPLE = [18, 30, 12, 0, 42, 22, 8, 0, 35, 55, 20, 0, 14, 38, 26, 10, 0, 48, 30, 16, 0, 24, 60, 28, 12, 0, 34, 20, 44, 18];

export function CashFlowChart({ data }: { data: CashFlowDay[] }) {
    const { symbol } = useCurrency();
    const mounted = useIsClient();
    const upload = useDashboardUpload();
    const totalIn = data.reduce((s, d) => s + d.moneyIn, 0);
    const totalOut = data.reduce((s, d) => s + d.moneyOut, 0);
    const empty = totalIn === 0 && totalOut === 0;
    const rows = data.map((d) => ({ ...d, label: dayLabel(d.date) }));

    return (
        <section className="flex h-full flex-col rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm p-5" data-testid="cash-flow" aria-labelledby="cash-flow-title">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div>
                    <h2 id="cash-flow-title" className="text-base font-semibold text-slate-900 dark:text-white">Cash flow</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Last 30 days, by payment date</p>
                </div>
                <dl className="flex gap-6 text-sm">
                    <div>
                        <dt className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-brand-teal-600" />Money in</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-white">{symbol}{money(totalIn)}</dd>
                    </div>
                    <div>
                        <dt className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" />Money out</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-white">{symbol}{money(totalOut)}</dd>
                    </div>
                </dl>
            </div>

            <div className="relative mt-4 min-h-60 w-full min-w-0 flex-1">
                {empty ? (
                    <div className="absolute inset-0" data-testid="cash-flow-empty">
                        {/* Placeholder bars: grey, faint, no axes */}
                        <div className="absolute inset-x-0 bottom-0 top-6 flex items-end gap-1 border-b border-slate-200 dark:border-slate-700 opacity-40" aria-hidden>
                            {SAMPLE.map((h, i) => (
                                <div key={i} className="flex flex-1 items-end justify-center gap-px h-full">
                                    <div className="w-1/3 max-w-1.5 rounded-t-sm bg-slate-300 dark:bg-slate-600" style={{ height: `${h}%` }} />
                                    <div className="w-1/3 max-w-1.5 rounded-t-sm bg-slate-200 dark:bg-slate-700" style={{ height: `${Math.round(h * 0.6)}%` }} />
                                </div>
                            ))}
                        </div>
                        <span className="absolute left-0 top-0 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">Sample</span>
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            <div className="max-w-sm rounded-xl bg-white/90 dark:bg-slate-800/90 px-5 py-4 text-center shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 backdrop-blur-sm">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">No money in or out in the last 30 days</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Approved receipts and money you record will show here, day by day.</p>
                                {upload.canUpload && (
                                    <button type="button" onClick={upload.pick} disabled={upload.uploading} className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline">
                                        Upload a receipt
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : !mounted ? (
                    <div className="absolute inset-0 animate-pulse rounded-lg bg-slate-50 dark:bg-slate-900/50" />
                ) : (
                    <div className="absolute inset-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 240 }}>
                            <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24}
                                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} dy={6} />
                                <YAxis axisLine={false} tickLine={false} width={64}
                                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                                    tickFormatter={(v) => `${symbol}${Number(v).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })}`} />
                                <Tooltip
                                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                                    contentStyle={{ borderRadius: "10px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 }}
                                    labelStyle={{ color: "var(--muted-foreground)", marginBottom: 4 }}
                                    formatter={(value, name) => [`${symbol}${money(Number(value))}`, name === "moneyIn" ? "Money in" : "Money out"]}
                                />
                                <Bar dataKey="moneyIn" name="moneyIn" fill={IN_FILL} radius={[3, 3, 0, 0]} maxBarSize={10} />
                                <Bar dataKey="moneyOut" name="moneyOut" fill={OUT_FILL} radius={[3, 3, 0, 0]} maxBarSize={10} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </section>
    );
}
