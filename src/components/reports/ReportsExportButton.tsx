"use client";

import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ExportProps {
    filteredDocuments: any[];
    dateRange: string;
}

export function ReportsExportButton({ filteredDocuments, dateRange }: ExportProps) {
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

    const exportPDF = () => {
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
        doc.text(`Total Volume: $${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, 48);

        // Outflows Table
        const headers = [["Vendor / Payee", "Date", "Fund", "Category", "Amount"]];

        // Sort for the table display: highest amounts first
        const sortedDocs = [...filteredDocuments].sort((a, b) => (b.amount || 0) - (a.amount || 0));

        const data = sortedDocs.map(d => [
            d.vendor_name || "Unknown",
            d.document_date || "—",
            d.funds?.name || "—",
            d.categories?.name || "—",
            `$${(d.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Expense Ledger", 14, 62);

        autoTable(doc, {
            startY: 66,
            head: headers,
            body: data,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
            styles: { fontSize: 9 },
        });

        doc.save(`financial-report-${dateRange}.pdf`);
    };

    const exportExcel = () => {
        const headers = ["ID", "Vendor", "Date", "Fund", "Category", "Amount", "Status"];

        const rows = filteredDocuments.map(doc => [
            `"${doc.id}"`,
            `"${doc.vendor_name || "Unknown"}"`,
            `"${doc.document_date || doc.created_at || ""}"`,
            `"${doc.funds?.name || "Unassigned"}"`,
            `"${doc.categories?.name || "Uncategorized"}"`,
            `"${doc.amount || 0}"`,
            `"${doc.status || "Unknown"}"`
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(e => e.join(","))
        ].join("\n");

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

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 border-slate-300">
                    <Download className="h-4 w-4 text-slate-500" />
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
