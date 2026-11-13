"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, AlertTriangle, Wallet, PieChart, ListX, Info, FileCheck } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportsExportButton } from "@/components/reports/ReportsExportButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { subDays, subMonths, subQuarters, isAfter } from "date-fns";
import { useCurrency } from "@/components/CurrencyProvider";

export function ReportsClient({ documents }: { documents: any[] }) {
    const { symbol } = useCurrency();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState<string>("all");
    const [selectedFund, setSelectedFund] = useState<string>("all");
    const [selectedStatus, setSelectedStatus] = useState<string>("all");
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Derive filter options from documents
    const availableYears = useMemo(() => {
        const years = new Set<string>();
        documents.forEach(doc => {
            const dateStr = doc.document_date || doc.created_at;
            if (dateStr) {
                years.add(new Date(dateStr).getFullYear().toString());
            }
        });
        const currentYear = new Date().getFullYear().toString();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [documents]);

    const availableFunds = useMemo(() => {
        const funds = new Set<string>();
        documents.forEach(doc => {
            if (doc.funds?.name) funds.add(doc.funds.name);
        });
        return Array.from(funds).sort();
    }, [documents]);

    const availableStatuses = useMemo(() => {
        const statuses = new Set<string>();
        documents.forEach(doc => {
            if (doc.status) statuses.add(doc.status);
        });
        // We typically exclude needs_review but let's just show standard ones
        return Array.from(statuses).sort();
    }, [documents]);

    const filteredDocuments = useMemo(() => {
        return documents.filter((doc) => {
            if (doc.status === 'needs_review' || (doc.amount || 0) <= 0) return false;

            const docDate = new Date(doc.document_date || doc.created_at);
            const docYear = docDate.getFullYear().toString();
            const docMonth = (docDate.getMonth() + 1).toString(); // 1-12

            if (selectedYear !== "all" && docYear !== selectedYear) return false;

            if (selectedMonth !== "all") {
                // selectedMonth is 1-12 as string
                if (docMonth !== selectedMonth) return false;
            }

            if (selectedFund !== "all" && doc.funds?.name !== selectedFund) return false;

            // Allow selecting standard statuses, or default behaviour filter out needs_review
            if (selectedStatus !== "all" && doc.status !== selectedStatus) return false;

            return true;
        });
    }, [documents, selectedYear, selectedMonth, selectedFund, selectedStatus]);

    const { totalVolume, sortedFunds, sortedCategories, largeTransactions } = useMemo(() => {
        let totalVolume = 0;
        const fundTotals = new Map<string, number>();
        const categoryTotals = new Map<string, number>();
        const largeTransactions: any[] = [];

        filteredDocuments.forEach((doc: any) => {
            const amount = doc.amount || 0;
            totalVolume += amount;

            // Fund Totals
            const fundName = doc.funds?.name || "Unassigned";
            fundTotals.set(fundName, (fundTotals.get(fundName) || 0) + amount);

            // Category Totals
            const catName = doc.categories?.name || "Uncategorized";
            categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + amount);

            // Large Transactions (>RM500)
            if (amount >= 500) {
                largeTransactions.push(doc);
            }
        });

        const sortedFunds = Array.from(fundTotals.entries())
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total);

        const sortedCategories = Array.from(categoryTotals.entries())
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5); // display Top 5

        largeTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return { totalVolume, sortedFunds, sortedCategories, largeTransactions };
    }, [filteredDocuments]);

    const absoluteTotalVolume = sortedFunds.reduce((sum, f) => sum + f.total, 0);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return (
        <div className="space-y-8 animate-in fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 group cursor-default relative w-fit">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Financial Reports</h1>
                        <Info className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-gray-500 dark:group-hover:text-slate-400 transition-colors mt-1" />
                        <div className="absolute top-10 -right-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-md">
                            Excludes documents pending manual review.
                        </div>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 mt-2 text-lg">Detailed breakdown of expense allocation and spending.</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        href="/reports/donor-memo"
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                    >
                        <FileCheck className="h-4 w-4" />
                        Donor Memo
                    </Link>
                    <ReportsExportButton filteredDocuments={filteredDocuments} dateRange="Custom" />
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-2 flex items-center gap-2 sm:gap-4 flex-wrap shadow-sm w-full overflow-x-auto">
                <div className="flex items-center gap-2 pl-2 pr-3 sm:pr-4 border-r border-gray-200 dark:border-slate-700 shrink-0">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-500 dark:text-slate-400">
                        <path d="M14.5 2H0.5L5.5 8V12.5L9.5 14V8L14.5 2Z" stroke="currentColor" strokeLinejoin="round" />
                    </svg>
                    <span className="font-medium text-gray-500 dark:text-slate-400 text-sm">Filters</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-400 px-1">Year</span>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-[90px] h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 dark:text-white text-sm">
                                <SelectValue placeholder="Year" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                <SelectItem value="all">All Years</SelectItem>
                                {availableYears.map(year => (
                                    <SelectItem key={year} value={year}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-400 px-1">Month</span>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-[110px] h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 dark:text-white text-sm">
                                <SelectValue placeholder="Month" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                <SelectItem value="all">All Months</SelectItem>
                                {monthNames.map((month, idx) => (
                                    <SelectItem key={idx + 1} value={(idx + 1).toString()}>{month}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-400 px-1">Fund</span>
                        <Select value={selectedFund} onValueChange={setSelectedFund}>
                            <SelectTrigger className="w-[120px] h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 dark:text-white text-sm">
                                <SelectValue placeholder="Fund" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                <SelectItem value="all">All Funds</SelectItem>
                                {availableFunds.map(fund => (
                                    <SelectItem key={fund} value={fund}>{fund}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-400 px-1">Status</span>
                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                            <SelectTrigger className="w-[130px] h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 dark:text-white text-sm">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                <SelectItem value="all">All Statuses</SelectItem>
                                {availableStatuses.filter(s => s !== "needs_review").map(s => (
                                    <SelectItem key={s} value={s}>{
                                        s === "approved" ? "Approved" :
                                            s === "paid" ? "Paid" :
                                                s === "rejected" ? "Rejected" : s
                                    }</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Top Level Metric */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
                <Card className="bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
                            Processed Volume
                        </CardTitle>
                        <Wallet className="h-4 w-4 text-indigo-600 " />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-200">
                            {symbol}{totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-1">Total approved & paid expenses within selected date range</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
                {/* Spend by Fund */}
                <Card className="col-span-1 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                            <BarChart3 className="w-5 h-5 text-indigo-500 " />
                            Spend by Fund
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {sortedFunds.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in duration-300">
                                <div className="mb-3 h-12 w-12 rounded-full bg-gray-50 dark:bg-slate-900 flex items-center justify-center border border-gray-200 dark:border-slate-700 shadow-sm">
                                    <PieChart className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                                </div>
                                <p className="text-sm font-medium text-gray-900 dark:text-slate-400">No data available.</p>
                            </div>
                        ) : (
                            sortedFunds.map(fund => {
                                const percentage = absoluteTotalVolume > 0 ? (fund.total / absoluteTotalVolume) * 100 : 0;
                                return (
                                    <div key={fund.name} className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-medium text-gray-900 dark:text-white">{fund.name}</span>
                                            <span className="text-gray-500 dark:text-slate-400">{symbol}{fund.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="h-2 w-full bg-gray-50 dark:bg-slate-900/50 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full transition-all"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                {/* Categories */}
                <Card className="col-span-1 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                            <TrendingUp className="w-5 h-5 text-rose-500 " />
                            Top Categories
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {sortedCategories.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in duration-300">
                                    <div className="mb-3 h-12 w-12 rounded-full bg-gray-50 dark:bg-slate-900 flex items-center justify-center border border-gray-200 dark:border-slate-700 shadow-sm">
                                        <TrendingUp className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-slate-400">No data available.</p>
                                </div>
                            ) : (
                                sortedCategories.map((cat, i) => (
                                    <div key={cat.name} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 shadow-sm flex items-center justify-center text-xs font-bold text-gray-500 dark:text-slate-400">
                                                {i + 1}
                                            </div>
                                            <span className="font-medium text-gray-900 dark:text-white">{cat.name}</span>
                                        </div>
                                        <span className="font-semibold text-gray-900 dark:text-white border-b border-b-slate-300 dark:border-b-slate-600 border-dashed pb-0.5">
                                            {symbol}{cat.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Large Transactions Table */}
            <Card className="border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                        <AlertTriangle className="w-5 h-5 text-amber-500 " />
                        Significant Outflows (&gt;{symbol}500)
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0 sm:px-6 overflow-x-auto">
                    {largeTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center animate-in fade-in duration-300 px-4">
                            <div className="mb-3 sm:mb-4 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gray-50 dark:bg-slate-900 flex items-center justify-center border border-gray-200 dark:border-slate-700">
                                <ListX className="h-5 w-5 sm:h-6 sm:w-6 text-slate-300 dark:text-slate-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-900 dark:text-slate-400">No large transactions recorded for this period.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="dark:border-slate-700">
                                <TableRow className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 border-gray-200 dark:border-slate-700">
                                    <TableHead className="text-gray-900 dark:text-slate-300">Vendor</TableHead>
                                    <TableHead className="text-gray-900 dark:text-slate-300">Date</TableHead>
                                    <TableHead className="text-gray-900 dark:text-slate-300">Fund</TableHead>
                                    <TableHead className="text-gray-900 dark:text-slate-300">Category</TableHead>
                                    <TableHead className="text-right text-gray-900 dark:text-slate-300">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {largeTransactions.slice(0, 10).map((doc) => (
                                    <TableRow key={doc.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 border-gray-200 dark:border-slate-700">
                                        <TableCell className="font-medium text-gray-900 dark:text-white">{doc.vendor_name || "Unknown"}</TableCell>
                                        <TableCell className="text-gray-500 dark:text-slate-400">{doc.document_date || "—"}</TableCell>
                                        <TableCell>
                                            {doc.funds?.name ? <Badge variant="secondary" className="bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{doc.funds.name}</Badge> : "—"}
                                        </TableCell>
                                        <TableCell className="text-gray-500 dark:text-slate-400">{doc.categories?.name || "—"}</TableCell>
                                        <TableCell className="text-right font-bold text-gray-900 dark:text-white">
                                            {symbol}{doc.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
