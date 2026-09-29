/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";


import { useState, useMemo } from "react";
import { KanbanFilters } from "@/components/ledger/KanbanFilters";
import { LedgerTable } from "@/components/ledger/LedgerTable";
import { ProcessingDrawer } from "@/components/ledger/ProcessingDrawer";
import { deleteDocument, updateDocument } from "@/app/actions/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, Search } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useRole } from "@/components/RoleProvider";

export function LedgerClient({ documents, funds, categories }: { documents: any[], funds: any[], categories: any[] }) {
    const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
    const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isBulkApproving, setIsBulkApproving] = useState<boolean>(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
    const { isViewer } = useRole();

    // Filtering States
    const [selectedStatus, setSelectedStatus] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [fundFilter, setFundFilter] = useState<string>("all");
    const [dateRangeFilter, setDateRangeFilter] = useState<string>("all");

    // Quick Preview State
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    // Filter Logic
    const filteredDocuments = useMemo(() => {
        const today = new Date();

        return documents.filter(doc => {
            // Status Filter
            if (selectedStatus !== 'all' && doc.status !== selectedStatus) return false;

            // Omnibar Filter (Vendor, Invoice #, Amount, Line Items if available)
            if (searchQuery) {
                const query = searchQuery.toLowerCase().trim();
                const cleanQuery = query.replace(/^#/, '').trim();
                const vendorMatch = doc.vendor_name?.toLowerCase().includes(query);
                const invoiceMatch = doc.invoice_number?.toLowerCase().includes(query) ||
                    (cleanQuery ? doc.invoice_number?.toLowerCase().includes(cleanQuery) : false);
                const amountMatch = doc.amount?.toString().includes(query);
                const lineItemsMatch = JSON.stringify(doc.line_items || []).toLowerCase().includes(query);

                if (!vendorMatch && !invoiceMatch && !amountMatch && !lineItemsMatch) return false;
            }

            // Fund Filter
            if (fundFilter !== 'all' && doc.funds?.id !== fundFilter) return false;

            // Date Range Filter
            if (dateRangeFilter !== 'all' && doc.document_date) {
                const docDate = new Date(doc.document_date);
                if (isNaN(docDate.getTime())) return false; // Invalid date

                const timeDiff = today.getTime() - docDate.getTime();
                const daysDiff = timeDiff / (1000 * 3600 * 24);

                if (dateRangeFilter === '7days' && daysDiff > 7) return false;
                if (dateRangeFilter === '30days' && daysDiff > 30) return false;
                if (dateRangeFilter === 'thisMonth') {
                    if (docDate.getMonth() !== today.getMonth() || docDate.getFullYear() !== today.getFullYear()) return false;
                }
            }

            return true;
        });
    }, [documents, selectedStatus, searchQuery, fundFilter, dateRangeFilter]);

    // Calculate filter counts based on UNFILTERED data (for Status Tabs)
    const filterCounts = {
        all: documents.length,
        needsReview: documents.filter(d => d.status === 'needs_review').length,
        awaitingPayment: documents.filter(d => d.status === 'awaiting_payment').length,
        paid: documents.filter(d => d.status === 'paid').length
    };

    const selectedDocument = documents.find(d => d.id === selectedDocId);

    const handleDelete = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this document?")) {
            setIsDeleting(id);
            try {
                await deleteDocument(id);
                setSelectedDocs(prev => prev.filter(docId => docId !== id));
            } catch (error) {
                console.error(error);
                alert("Failed to delete document");
            } finally {
                setIsDeleting(null);
            }
        }
    };

    const handleToggleSelectAll = () => {
        if (selectedDocs.length === filteredDocuments.length) {
            setSelectedDocs([]);
        } else {
            setSelectedDocs(filteredDocuments.map(doc => doc.id));
        }
    };

    const handleToggleSelect = (id: string) => {
        setSelectedDocs(prev => prev.includes(id) ? prev.filter(docId => docId !== id) : [...prev, id]);
    };

    const handleBulkApprove = async () => {
        setIsBulkApproving(true);
        try {
            await Promise.all(selectedDocs.map(id => {
                const doc = documents.find(d => d.id === id);
                if (!doc) return Promise.resolve();
                return updateDocument(id, {
                    status: (doc.document_type === 'receipt' ? 'paid' : 'awaiting_payment')
                });
            }));
            setSelectedDocs([]);
        } catch (e) {
            console.error(e);
            alert("Failed to bulk approve.");
        } finally {
            setIsBulkApproving(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedDocs.length === 0) return;
        if (window.confirm(`Are you sure you want to permanently delete the ${selectedDocs.length} selected documents?`)) {
            setIsBulkDeleting(true);
            try {
                await Promise.all(selectedDocs.map(id => deleteDocument(id)));
                setSelectedDocs([]);
            } catch (error) {
                console.error(error);
                alert("Failed to delete some documents");
            } finally {
                setIsBulkDeleting(false);
            }
        }
    };

    return (
        <div className="space-y-4">
            <KanbanFilters
                counts={filterCounts}
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
            />

            {/* Control Panel / Omnibar */}
            <div className="bg-white/80 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-md flex flex-col sm:flex-row gap-4 items-center animate-in fade-in backdrop-blur-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search vendor, invoice #, amount, or line items..."
                        className="pl-9 w-full bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-850 text-slate-900 dark:text-white placeholder:text-slate-450 dark:placeholder:slate-500 focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 transition-all rounded-lg"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
                        <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-850 text-slate-900 dark:text-white rounded-lg cursor-pointer hover:border-slate-350 dark:hover:border-slate-700 transition-colors">
                            <SelectValue placeholder="Date Range" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
                            <SelectItem value="all">All Time</SelectItem>
                            <SelectItem value="7days">Last 7 Days</SelectItem>
                            <SelectItem value="30days">Last 30 Days</SelectItem>
                            <SelectItem value="thisMonth">This Month</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={fundFilter} onValueChange={setFundFilter}>
                        <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-850 text-slate-900 dark:text-white rounded-lg cursor-pointer hover:border-slate-350 dark:hover:border-slate-700 transition-colors">
                            <SelectValue placeholder="Fund Tag" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
                            <SelectItem value="all">All Funds</SelectItem>
                            {funds.map(fund => (
                                <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {selectedDocs.length > 0 && (
                <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-300 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-500" />
                        <span className="font-medium">{selectedDocs.length} items selected</span>
                    </div>
                    <div className="flex gap-2">
                        <Button id="bulk-cancel-btn" variant="outline" size="sm" onClick={() => setSelectedDocs([])} className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/80 cursor-pointer rounded-xl active:scale-[0.98] transition-all">
                            Cancel
                        </Button>
                        <Button
                            id="bulk-delete-btn"
                            variant="destructive"
                            size="sm"
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting || isViewer}
                            title={isViewer ? "Viewers cannot bulk delete" : ""}
                            className="bg-red-600 hover:bg-red-700 dark:bg-red-750 dark:hover:bg-red-700 text-white cursor-pointer rounded-xl active:scale-[0.98] transition-all"
                        >
                            {isBulkDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete Selected
                        </Button>
                        <Button id="bulk-approve-btn" size="sm" onClick={handleBulkApprove} disabled={isBulkApproving || isViewer} title={isViewer ? "Viewers cannot bulk approve" : ""} className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer rounded-xl active:scale-[0.98] transition-all">
                            {isBulkApproving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Bulk Approve
                        </Button>
                    </div>
                </div>
            )}

            <LedgerTable
                documents={filteredDocuments}
                onRowClick={setSelectedDocId}
                onDelete={handleDelete}
                selectedDocs={selectedDocs}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                onPreviewImage={setPreviewImageUrl}
            />

            <ProcessingDrawer
                isOpen={!!selectedDocId}
                onClose={() => setSelectedDocId(undefined)}
                document={selectedDocument}
                funds={funds}
                categories={categories}
                onNext={() => {
                    // Quick next document logic if possible, else just close
                    setSelectedDocId(undefined);
                }}
            />

            {/* Quick Preview Modal */}
            <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
                <DialogContent className="max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-4 border-slate-200 dark:border-slate-800 shadow-xl">
                    <DialogHeader className="mb-2">
                        <DialogTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document Preview</DialogTitle>
                    </DialogHeader>
                    <div className="relative w-full rounded-md overflow-hidden bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 min-h-[400px] flex items-center justify-center">
                        {/* Replace with actual high-res Image component pointing to bucket later if needed */}
                        {previewImageUrl ? (
                            <img src={previewImageUrl} alt="Receipt Preview" className="max-w-full max-h-[70vh] object-contain" />
                        ) : (
                            <div className="text-slate-400 dark:text-slate-500 font-mono text-xs">No image data found.</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
