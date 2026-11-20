"use client";

import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useCurrency } from "@/components/CurrencyProvider";
import { getReportExportRows } from "@/app/actions/aggregates";
import type { ReportFilters } from "@/utils/aggregate-types";
import { buildReportCsv, buildReportPdfTable, type ReportExportRow } from "@/utils/report-export";

// One exported row. report_rows returns whole documents rows, and the database sends the numeric
// amount column as a JSON number, so amount is a number here (the totals below add it directly).
type ServerRow = Awaited<ReturnType<typeof getReportExportRows>>["rows"][number];
type ReportRow = Omit<ServerRow, "amount"> & { amount: number | null } & ReportExportRow;

interface ExportProps {
    filters: ReportFilters;
    dateRange: string;
}

export function ReportsExportButton({ filters, dateRange }: ExportProps) {
    const { symbol } = useCurrency();
    const [isExporting, setIsExporting] = useState(false);

    // The report page only holds the totals, so the rows are fetched from the server when exporting.
    const run = async (build: (rows: ReportRow[]) => void) => {
        setIsExporting(true);
        try {
            const { rows, truncated } = await getReportExportRows(filters);
            if (truncated) {
                alert(`This report has more than ${rows.length.toLocaleString()} rows, so the export is limited to the newest ${rows.length.toLocaleString()}. Narrow the filters to export the rest.`);
            }
            build(rows as ReportRow[]);
        } catch (error) {
            console.error(error);
            alert("Failed to export the report. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    const getReportTitle = () => {
        const mapping: Record<string, string> = {
            "7days": "Last 7 Days",
            "30days": "Last 30 Days",
            "this_month": "This Month",
            "last_quarter": "Last Quarter",
            "all": "All Time"
        };
        return `Financial Report - ${mapping[dateRange] || 'Custom'}`;
    };

    const buildPDF = (filteredDocuments: ReportRow[]) => {
        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.text("Financial Report", 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Period: ${getReportTitle()}`, 14, 30);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 36);

        // Calculate Totals for Top Summary
        const totalAmount = filteredDocuments.reduce((sum, d) => sum + (d.amount || 0), 0);
        doc.setFontSize(14);
        doc.setTextColor(79, 70, 229); // Indigo 600 approximate
        doc.text(`Total Volume: ${symbol}${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, 48);

        // Outflows Table (highest amounts first), with Remarks as the last column
        const { head: headers, body: data } = buildReportPdfTable(filteredDocuments, symbol);

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Expense Ledger", 14, 62);

        autoTable(doc, {
            startY: 66,
            head: headers,
            body: data,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
            styles: { fontSize: 9, overflow: "linebreak" },
            // Remarks wrap inside a fixed-width column so long notes do not squeeze the other columns
            columnStyles: { 5: { cellWidth: 55, fontSize: 8 } },
        });

        doc.save(`financial-report-${dateRange}.pdf`);
    };

    const buildCSV = (filteredDocuments: ReportRow[]) => {
        // Same columns as before plus Remarks at the end; every cell is escaped safely
        const csvContent = buildReportCsv(filteredDocuments, symbol);

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `financial-data-${dateRange}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const exportPDF = () => run(buildPDF);
    const exportExcel = () => run(buildCSV);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 border-slate-300" disabled={isExporting}>
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-slate-500" />}
                    Export Report
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={exportPDF} className="cursor-pointer gap-2 py-2">
                    <FileText className="h-4 w-4 text-rose-500" />
                    <span>Download PDF Report</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel} className="cursor-pointer gap-2 py-2">
                    <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
                    <span>Export to CSV</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
