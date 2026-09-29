"use client";

import { useState, useRef } from "react";
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
import { Button } from "@/components/ui/button";
import { Trash2, Image as ImageIcon, SearchX, Loader2, Receipt, HelpCircle } from "lucide-react";
import { UploadButton } from "./UploadButton";
import { processUpload } from "@/app/actions/ledger";
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal";
import { useRole } from "@/components/RoleProvider";

interface LedgerTableProps {
    documents: any[];
    onRowClick: (id: string) => void;
    onDelete?: (id: string) => void;
    selectedDocs: string[];
    onToggleSelect: (id: string) => void;
    onToggleSelectAll: () => void;
    onPreviewImage?: (url: string) => void;
}

export function LedgerTable({ documents, onRowClick, onDelete, selectedDocs, onToggleSelect, onToggleSelectAll, onPreviewImage }: LedgerTableProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const { isViewer } = useRole();

    const handleFile = async (file: File) => {
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await processUpload(formData);
            if (response && response.status === "error" && response.code === "LIMIT_REACHED") {
                setShowPaywall(true);
                return;
            }
        } catch (error: any) {
            console.error("Upload failed:", error);
            alert(`Failed to upload document: ${error.message || 'Unknown error'}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            await handleFile(file);
        }
    };

    if (documents.length === 0) {
        return (
            <>
                <div 
                    onDragOver={(e) => !isViewer && handleDragOver(e)}
                    onDragLeave={(e) => !isViewer && handleDragLeave(e)}
                    onDrop={(e) => !isViewer && handleDrop(e)}
                    className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ease-in-out block w-full ${isDragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.02]' : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800'} ${isUploading || isViewer ? 'opacity-50 pointer-events-none' : ''}`}
                >
                    {isUploading ? (
                         <div className="flex flex-col items-center justify-center py-4">
                             <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
                             <p className="text-gray-500 font-medium">Processing document...</p>
                         </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <Receipt className="text-gray-400 dark:text-slate-500 w-16 h-16 mb-4" />
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Welcome to Outlayd. Let&apos;s automate your ledger.</h3>
                            <p className="text-gray-500 dark:text-slate-400 mb-6 max-w-sm text-center mt-2">
                                Drag and drop your first receipt or invoice here, and watch the AI extract the data instantly.
                            </p>
                            <UploadButton />
                        </div>
                    )}
                </div>
                <UpgradePaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
            </>
        );
    }

    const allSelected = documents.length > 0 && selectedDocs.length === documents.length;

    // Remove old frontend duplicate heuristic, using native DUPLICATE_WARNING status now

    return (
        <div className="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
            <Table>
                <TableHeader className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                    <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="w-12 text-center text-xs">
                            <Checkbox
                                checked={allSelected}
                                onCheckedChange={onToggleSelectAll}
                            />
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-900 dark:text-slate-300">Date</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-900 dark:text-slate-300">Vendor</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-900 dark:text-slate-300">Amount</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-900 dark:text-slate-300">
                            <div className="flex items-center gap-1 cursor-help" title="You can add or edit your industry categories in Settings.">
                                Fund Tag
                                <HelpCircle className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 transition-colors" />
                            </div>
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-900 dark:text-slate-300">Status</TableHead>
                        <TableHead className="w-12"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {documents.map((doc) => (
                        <TableRow
                            key={doc.id}
                            className={`cursor-pointer transition-colors duration-150 border-b border-gray-200 dark:border-slate-700 group relative ${selectedDocs.includes(doc.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/30' : 'bg-white dark:bg-slate-800 hover:bg-indigo-50/40 dark:hover:bg-slate-700/50'}`}
                            onClick={() => onRowClick(doc.id)}
                        >
                            <TableCell className="text-center py-2.5" onClick={(e) => { e.stopPropagation(); onToggleSelect(doc.id); }}>
                                <Checkbox checked={selectedDocs.includes(doc.id)} />
                            </TableCell>
                            <TableCell className="text-sm text-gray-900 dark:text-white py-2.5">
                                <div className="flex items-center gap-2">
                                    {doc.image_url && onPreviewImage && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 shrink-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPreviewImage(doc.image_url);
                                            }}
                                            title="Quick Preview"
                                        >
                                            <ImageIcon className="h-3 w-3" />
                                        </Button>
                                    )}
                                    <span>{doc.document_date || "—"}</span>
                                </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                                {doc.status === "extracting" ? (
                                    <span className="text-gray-400 dark:text-slate-400 animate-pulse flex items-center gap-2 text-sm font-medium">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                                        Extracting...
                                    </span>
                                ) : (
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                                            {doc.vendor_name || "—"}
                                        </span>
                                        {doc.invoice_number && doc.invoice_number.trim() ? (
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tracking-tight truncate">
                                                {doc.invoice_number.trim().startsWith("#") || doc.invoice_number.trim().toLowerCase().startsWith("inv")
                                                    ? doc.invoice_number.trim()
                                                    : `#${doc.invoice_number.trim()}`}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400/60 dark:text-slate-500/60 font-mono tracking-tight">
                                                No Ref #
                                            </span>
                                        )}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-gray-900 dark:text-white py-2.5">
                                {doc.amount !== null && doc.amount !== undefined && !isNaN(Number(doc.amount))
                                    ? `$${Number(doc.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : "—"}
                            </TableCell>
                            <TableCell className="py-2.5">
                                <Badge variant="outline" className="font-normal text-xs text-gray-500 dark:text-slate-300 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                                    {doc.funds?.name || "Uncategorized"}
                                </Badge>
                            </TableCell>
                            <TableCell className="py-2.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant={
                                        doc.status === "needs_review" ? "outline" :
                                        doc.status === "DUPLICATE_WARNING" ? "outline" :
                                            doc.status === "awaiting_payment" ? "secondary" :
                                                doc.status === "paid" ? "default" : "secondary"
                                    } className={
                                        doc.status === "needs_review" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50" : 
                                        doc.status === "DUPLICATE_WARNING" ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50" : 
                                        "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                    }>
                                        {doc.status.replace("_", " ")}
                                    </Badge>

                                    {typeof doc.confidence_score === 'number' && doc.status === "needs_review" && (
                                        <span className={`text-[10px] font-mono ${doc.confidence_score >= 90 ? 'text-indigo-500' : 'text-amber-500'}`}>
                                            ({Math.round(doc.confidence_score)}%)
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-right py-2.5" onClick={(e) => e.stopPropagation()}>
                                <Button
                                    id={`delete-btn-${doc.id}`}
                                    variant="ghost"
                                    size="icon"
                                    disabled={isViewer}
                                    title={isViewer ? "Viewers cannot delete documents" : ""}
                                    className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 lg:opacity-0 lg:-translate-x-2 lg:group-hover:translate-x-0 lg:group-hover:opacity-100 transition-all duration-200 cursor-pointer active:scale-[0.95]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete?.(doc.id);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
