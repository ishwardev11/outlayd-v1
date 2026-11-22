/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";


import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { KanbanFilters } from "@/components/ledger/KanbanFilters";
import { LedgerTable } from "@/components/ledger/LedgerTable";
import { ProcessingDrawer } from "@/components/ledger/ProcessingDrawer";
import { deleteDocument, updateDocument } from "@/app/actions/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { LedgerFilters, LedgerStatusCounts } from "@/utils/aggregate-types";
import type { CategoryRow, DocumentRow, FundRow } from "@/utils/row-types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useRole } from "@/components/RoleProvider";

interface LedgerClientProps {
    documents: DocumentRow[];
    total: number;
    page: number;
    pageSize: number;
    counts: LedgerStatusCounts;
    filters: LedgerFilters;
    funds: FundRow[];
    categories: CategoryRow[];
}

export function LedgerClient({ documents, total, page, pageSize, counts, filters, funds, categories }: LedgerClientProps) {
    const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
    const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isBulkApproving, setIsBulkApproving] = useState<boolean>(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
    const { isViewer } = useRole();

    // Filters, search and paging live in the URL, so the server (database) returns only one page of rows.
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const selectedStatus = filters.status;
    const fundFilter = filters.fund;
    const dateRangeFilter = filters.range;
    const [searchQuery, setSearchQuery] = useState<string>(filters.q);

    const updateParams = (patch: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "" || value === "all") params.delete(key);
            else params.set(key, value);
        }
        if (!("page" in patch)) params.delete("page"); // changing a filter starts again from page 1
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
    };
    const setSelectedStatus = (value: string) => updateParams({ status: value });
    const setFundFilter = (value: string) => updateParams({ fund: value });
    const setDateRangeFilter = (value: string) => updateParams({ range: value });
    const goToPage = (nextPage: number) => updateParams({ page: String(nextPage) });

    // Search is debounced so the database isn't queried on every keystroke
    useEffect(() => {
        if (searchQuery.trim() === filters.q.trim()) return;
        const timer = setTimeout(() => updateParams({ q: searchQuery.trim() }), 350);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    // Quick Preview State
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    // The server has already applied every filter; "documents" is the current page.
    const filteredDocuments = documents;

    // Status tab counts cover the whole ledger, not just this page
    const filterCounts = {
        all: counts.all,
        needsReview: counts.needs_review,
        awaitingPayment: counts.awaiting_payment,
        paid: counts.paid
    };

    const selectedDocument = documents.find(d => d.id === selectedDocId);

    const handleDelete = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this document?")) {
            setIsDeleting(id);
            try {
                const res = await deleteDocument(id);
                if (!res.success) {
                    alert(res.error);
                    return;
                }
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
            const results = await Promise.all(selectedDocs.map(async id => {
                const doc = documents.find(d => d.id === id);
                if (!doc) return null;
                const result = await updateDocument(id, {
                    status: (doc.document_type === 'receipt' ? 'paid' : 'awaiting_payment')
                });
                return result && result.success === false
                    ? `${doc.vendor_name || 'Document'}: ${result.error}`
                    : null;
            }));
            const failures = results.filter((r): r is string => !!r);
            if (failures.length > 0) {
                alert(`${failures.length} document(s) could not be approved:\n\n${failures.join('\n')}`);
            }
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
                const results = await Promise.all(selectedDocs.map(async id => {
                    const res = await deleteDocument(id);
                    const doc = documents.find(d => d.id === id);
                    return res.success ? null : `${doc?.vendor_name || 'Document'}: ${res.error}`;
                }));
                const failures = results.filter((r): r is string => !!r);
                if (failures.length > 0) {
                    alert(`${failures.length} document(s) could not be deleted:\n\n${failures.join('\n')}`);
                }
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

            {total > pageSize && (
                <div className="flex items-center justify-between pt-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>
                        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                            <ChevronLeft className="w-4 h-4" /> Previous
                        </Button>
                        <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => goToPage(page + 1)}>
                            Next <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

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
