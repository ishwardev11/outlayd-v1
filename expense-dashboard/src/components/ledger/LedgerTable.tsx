"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const mockData = [
    { id: "INV-001", date: "2026-02-27", vendor: "AWS Services", amount: "$840.00", fund: "General Admin", status: "Needs Review" },
    { id: "REC-045", date: "2026-02-26", vendor: "Staples", amount: "$124.50", fund: "Uncategorized", status: "Needs Review" },
    { id: "INV-002", date: "2026-02-25", vendor: "Local Caterer", amount: "$450.00", fund: "Summer Youth", status: "Awaiting Payment" },
    { id: "REC-046", date: "2026-02-25", vendor: "Uber", amount: "$42.10", fund: "Board Meetings", status: "Paid" },
];

interface LedgerTableProps {
    onRowClick: (id: string) => void;
}

export function LedgerTable({ onRowClick }: LedgerTableProps) {
    return (
        <div className="rounded-md border bg-white">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12 text-center text-xs">
                            <Checkbox />
                        </TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Vendor</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Fund Tag</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {mockData.map((invoice) => (
                        <TableRow
                            key={invoice.id}
                            className="cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => onRowClick(invoice.id)}
                        >
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                <Checkbox />
                            </TableCell>
                            <TableCell className="text-sm">{invoice.date}</TableCell>
                            <TableCell className="font-medium">{invoice.vendor}</TableCell>
                            <TableCell className="text-sm">{invoice.amount}</TableCell>
                            <TableCell>
                                <Badge variant="outline" className="font-normal text-xs text-slate-500">
                                    {invoice.fund}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={
                                    invoice.status === "Needs Review" ? "outline" :
                                        invoice.status === "Awaiting Payment" ? "secondary" : "default"
                                }>
                                    {invoice.status}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
