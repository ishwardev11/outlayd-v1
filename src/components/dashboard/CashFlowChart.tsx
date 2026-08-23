"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export function CashFlowChart({ data, hasPendingDocuments }: { data: { displayDate: string; amount: number; }[], hasPendingDocuments?: boolean }) {
    const total = useMemo(() => data.reduce((sum, d) => sum + d.amount, 0), [data]);

    return (
        <Card className="col-span-full bg-white/80 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 shadow-md backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                        14-Day Money Out
                    </CardTitle>
                    <CardDescription>Approved expenditures over the last two weeks.</CardDescription>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-xs text-muted-foreground mt-1 font-medium tracking-wide uppercase">Total Burn Pulse</div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-62.5 w-full mt-4">
                    {total === 0 ? (
                        <div className="h-full w-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300 bg-slate-50/50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                            <div className="mb-4 h-14 w-14 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-850 shadow-sm">
                                <TrendingUp className="h-6 w-6 text-slate-300 dark:text-slate-500" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                {hasPendingDocuments ? "You have pending documents." : "No expenditures recorded in the last 14 days."}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-50">
                                {hasPendingDocuments
                                    ? "Approve them in the Action Queue to update this chart."
                                    : "Your cash flow chart will populate here once transactions are processed."}
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis
                                    dataKey="displayDate"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 500 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 500 }}
                                    tickFormatter={(value) => `$${value}`}
                                    dx={-10}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', background: 'var(--card)', color: 'var(--foreground)' }}
                                    itemStyle={{ color: 'var(--foreground)', fontWeight: 'bold' }}
                                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Amount']}
                                    labelStyle={{ color: 'var(--muted-foreground)', marginBottom: '4px', fontWeight: 500 }}
                                    cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#4f46e5"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorAmount)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#4338ca' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
