"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Eye, FileCheck, Info, Loader2 } from "lucide-react";
import {
    addMonths, endOfMonth, endOfQuarter, format, startOfMonth, startOfQuarter, subMonths, subQuarters,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getFundMemoData } from "@/app/actions/memo";
import { generateFundMemoPdf } from "@/utils/fund-memo-pdf";
import type { FundMemoData } from "@/utils/fund-memo";

export interface MemoFundOption {
    id: string;
    name: string;
    period_start?: string | null;
    period_end?: string | null;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const numberFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FLAG_LABELS: Record<string, string> = {
    NO_RECEIPT: "No receipt",
    NO_REFERENCE: "No invoice/ref no.",
    NO_CATEGORY: "No category",
    OUTSIDE_GRANT_PERIOD: "Outside grant period",
    SPLIT_MISMATCH: "Split mismatch",
};

function presetRange(preset: string, fund: MemoFundOption | undefined, fiscalYearStart: number): [string, string] | null {
    const now = new Date();
    switch (preset) {
        case "grant":
            return fund?.period_start && fund?.period_end ? [fund.period_start, fund.period_end] : null;
        case "last_month": {
            const m = subMonths(now, 1);
            return [iso(startOfMonth(m)), iso(endOfMonth(m))];
        }
        case "last_quarter": {
            const q = subQuarters(now, 1);
            return [iso(startOfQuarter(q)), iso(endOfQuarter(q))];
        }
        case "fiscal_year": {
            const fy = Math.min(Math.max(fiscalYearStart || 1, 1), 12);
            const startYear = now.getMonth() + 1 >= fy ? now.getFullYear() : now.getFullYear() - 1;
            const start = new Date(startYear, fy - 1, 1);
            return [iso(start), iso(endOfMonth(addMonths(start, 11)))];
        }
        default:
            return null;
    }
}

export function DonorMemoClient({ funds, fiscalYearStart }: { funds: MemoFundOption[]; fiscalYearStart: number }) {
    const [fundId, setFundId] = useState("");
    const [preset, setPreset] = useState("last_month");
    const [start, setStart] = useState(() => presetRange("last_month", undefined, 1)![0]);
    const [end, setEnd] = useState(() => presetRange("last_month", undefined, 1)![1]);
    const [isLoading, setIsLoading] = useState(false);
    const [memo, setMemo] = useState<FundMemoData | null>(null);
    const [memoKey, setMemoKey] = useState("");

    const fund = useMemo(() => funds.find((f) => f.id === fundId), [funds, fundId]);
    const hasGrantPeriod = !!(fund?.period_start && fund?.period_end);
    const currentKey = `${fundId}|${start}|${end}`;
    const isStale = memo !== null && currentKey !== memoKey;

    const applyPreset = (value: string, forFund = fund) => {
        setPreset(value);
        const range = presetRange(value, forFund, fiscalYearStart);
        if (range) {
            setStart(range[0]);
            setEnd(range[1]);
        }
    };

    const onFundChange = (id: string) => {
        setFundId(id);
        const chosen = funds.find((f) => f.id === id);
        if (chosen?.period_start && chosen?.period_end) {
            applyPreset("grant", chosen);
        } else if (preset === "grant") {
            applyPreset("last_month", chosen);
        }
    };

    const handlePreview = async () => {
        if (!fundId) {
            toast.error("Please choose a fund.");
            return;
        }
        if (!start || !end || start > end) {
            toast.error("Please choose a valid period.", { description: "The start date must be on or before the end date." });
            return;
        }
        setIsLoading(true);
        try {
            const result = await getFundMemoData({ fundId, periodStart: start, periodEnd: end });
            if (!result.success) {
                toast.error("Could not build the memo", { description: result.error });
                return;
            }
            setMemo(result.data);
            setMemoKey(currentKey);
        } catch (e) {
            console.error(e);
            toast.error("Could not build the memo", { description: "Please try again." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = () => {
        if (!memo) return;
        try {
            generateFundMemoPdf(memo);
        } catch (e) {
            console.error(e);
            toast.error("Could not create the PDF", { description: "Please try again." });
        }
    };

    // Which problems apply to which transaction (shown as tags in the table)
    const flagsByTxn = useMemo(() => {
        const map = new Map<string, string[]>();
        memo?.exceptions.forEach((e) => {
            const label = FLAG_LABELS[e.code];
            if (!label) return;
            e.txnNos.forEach((n) => map.set(n, [...(map.get(n) ?? []), label]));
        });
        return map;
    }, [memo]);

    const money = (n: number) => `${memo?.currency ?? ""} ${numberFormat.format(n)}`;
    const noGrantDetails = memo && !memo.fund.donorName && !memo.fund.grantReference && memo.fund.awardAmount === null;

    return (
        <div className="space-y-8 animate-in fade-in">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Donor & Audit Memo</h1>
                <p className="text-gray-500 dark:text-slate-400 mt-2 text-lg">
                    Preview a fund&apos;s spending, fix anything flagged, then download a signed-off PDF for your donor, board or auditor.
                </p>
            </div>

            {/* Controls */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardContent className="pt-6">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                        <div className="flex flex-col gap-1.5 lg:w-64">
                            <Label>Fund</Label>
                            <Select value={fundId} onValueChange={onFundChange}>
                                <SelectTrigger className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white">
                                    <SelectValue placeholder={funds.length ? "Choose a fund" : "No funds yet"} />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                    {funds.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-1.5 lg:w-48">
                            <Label>Period</Label>
                            <Select value={preset} onValueChange={(v) => applyPreset(v)}>
                                <SelectTrigger className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                    {hasGrantPeriod && <SelectItem value="grant">Full grant period</SelectItem>}
                                    <SelectItem value="last_month">Last month</SelectItem>
                                    <SelectItem value="last_quarter">Last quarter</SelectItem>
                                    <SelectItem value="fiscal_year">This fiscal year</SelectItem>
                                    <SelectItem value="custom">Custom dates</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="memo-start">From</Label>
                            <Input id="memo-start" type="date" value={start}
                                onChange={(e) => { setStart(e.target.value); setPreset("custom"); }}
                                className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="memo-end">To</Label>
                            <Input id="memo-end" type="date" value={end}
                                onChange={(e) => { setEnd(e.target.value); setPreset("custom"); }}
                                className="bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
                        </div>

                        <Button onClick={handlePreview} disabled={isLoading || !fundId} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                            Preview memo
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {!memo && !isLoading && (
                <div className="text-center py-16 text-slate-400 dark:text-slate-500">
                    <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-60" />
                    <p>Choose a fund and period, then click Preview memo.</p>
                </div>
            )}

            {memo && (
                <div className="space-y-6">
                    {/* Title bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{memo.fund.name}</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {memo.period.start} to {memo.period.end} &middot; Ref {memo.memoRef}
                            </p>
                        </div>
                        <Button onClick={handleDownload} disabled={isStale} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                            <Download className="h-4 w-4" />
                            Download PDF
                        </Button>
                    </div>

                    {isStale && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
                            <Info className="h-4 w-4 mt-0.5 shrink-0" />
                            You changed the fund or dates. Click Preview memo again to update this preview before downloading.
                        </div>
                    )}

                    {noGrantDetails && (
                        <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300">
                            <Info className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>
                                No donor, grant reference or award amount is recorded for this fund, so the memo shows less than it could. Add them in{" "}
                                <Link href="/settings" className="underline font-medium">Settings, Financial Customization</Link>.
                            </span>
                        </div>
                    )}

                    {/* Summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="dark:bg-slate-900 dark:border-slate-800">
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Total this period</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold dark:text-white">{money(memo.totals.periodTotal)}</div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{memo.totals.transactionCount} transaction(s)</p></CardContent>
                        </Card>
                        <Card className="dark:bg-slate-900 dark:border-slate-800">
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Paid</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold dark:text-white">{money(memo.totals.periodPaid)}</div></CardContent>
                        </Card>
                        <Card className="dark:bg-slate-900 dark:border-slate-800">
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Committed (unpaid)</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold dark:text-white">{money(memo.totals.periodCommitted)}</div></CardContent>
                        </Card>
                        <Card className="dark:bg-slate-900 dark:border-slate-800">
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Award remaining</CardTitle></CardHeader>
                            <CardContent>
                                {memo.totals.remaining !== null ? (
                                    <>
                                        <div className={`text-2xl font-bold ${memo.totals.remaining < 0 ? "text-red-600" : "dark:text-white"}`}>{money(memo.totals.remaining)}</div>
                                        {memo.totals.percentOfAwardUsed !== null && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{memo.totals.percentOfAwardUsed.toFixed(1)}% of {money(memo.fund.awardAmount ?? 0)} used</p>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-sm text-slate-400">Award amount not set</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Exceptions */}
                    <Card className={memo.exceptions.length ? "border-amber-200 dark:border-amber-900/50 dark:bg-slate-900" : "border-emerald-200 dark:border-emerald-900/50 dark:bg-slate-900"}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2 dark:text-white">
                                {memo.exceptions.length ? (
                                    <><AlertTriangle className="h-4 w-4 text-amber-500" /> {memo.exceptions.length} thing(s) to check before you send this</>
                                ) : (
                                    <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> No exceptions found by the automated checks</>
                                )}
                            </CardTitle>
                        </CardHeader>
                        {memo.exceptions.length > 0 && (
                            <CardContent>
                                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                                    {memo.exceptions.map((e) => <li key={e.code}>{e.message}</li>)}
                                </ul>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                                    Fix these in the <Link href="/ledger" className="underline">Ledger</Link>, then click Preview memo again. Flagged rows are tagged in the table below.
                                </p>
                            </CardContent>
                        )}
                    </Card>

                    {/* By category */}
                    <Card className="dark:bg-slate-900 dark:border-slate-800">
                        <CardHeader><CardTitle className="text-base dark:text-white">Spending by category</CardTitle></CardHeader>
                        <CardContent>
                            {memo.byCategory.length === 0 ? (
                                <p className="text-sm text-slate-500">No paid or committed transactions in this period.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Category</TableHead>
                                            <TableHead className="text-right">Paid</TableHead>
                                            <TableHead className="text-right">Committed</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead className="text-right">% of total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {memo.byCategory.map((c) => (
                                            <TableRow key={c.name}>
                                                <TableCell className="font-medium">{c.name}</TableCell>
                                                <TableCell className="text-right">{numberFormat.format(c.paid)}</TableCell>
                                                <TableCell className="text-right">{numberFormat.format(c.committed)}</TableCell>
                                                <TableCell className="text-right font-semibold">{numberFormat.format(c.total)}</TableCell>
                                                <TableCell className="text-right">{c.percent.toFixed(1)}%</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Transactions */}
                    <Card className="dark:bg-slate-900 dark:border-slate-800">
                        <CardHeader><CardTitle className="text-base dark:text-white">Transactions ({memo.transactions.length})</CardTitle></CardHeader>
                        <CardContent className="overflow-x-auto">
                            {memo.transactions.length === 0 ? (
                                <p className="text-sm text-slate-500">No transactions to list.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>No.</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Vendor</TableHead>
                                            <TableHead>Invoice / ref</TableHead>
                                            <TableHead>Category</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Receipt</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Flags</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {memo.transactions.map((t) => {
                                            const flags = flagsByTxn.get(t.txnNo) ?? [];
                                            return (
                                                <TableRow key={t.txnNo} className={flags.length ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                                                    <TableCell className="font-mono text-xs">{t.txnNo}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                                                    <TableCell className="font-medium">{t.vendor}</TableCell>
                                                    <TableCell>{t.reference || "-"}</TableCell>
                                                    <TableCell>{t.category}</TableCell>
                                                    <TableCell>{t.status === "paid" ? "Paid" : "Committed"}</TableCell>
                                                    <TableCell className={t.hasReceipt ? "" : "text-red-600 font-semibold"}>{t.hasReceipt ? "Yes" : "No"}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">{numberFormat.format(t.amount)}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-wrap gap-1">
                                                            {flags.map((f) => (
                                                                <span key={f} className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">{f}</span>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {(memo.excluded.pendingReviewCount > 0 || memo.excluded.duplicateCount > 0) && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Not included in this memo:
                            {memo.excluded.pendingReviewCount > 0 && ` ${memo.excluded.pendingReviewCount} document(s) still awaiting review (${money(memo.excluded.pendingReviewAmount)}).`}
                            {memo.excluded.duplicateCount > 0 && ` ${memo.excluded.duplicateCount} possible duplicate(s).`}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
