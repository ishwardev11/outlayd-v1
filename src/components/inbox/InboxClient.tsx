"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle, ChevronLeft, ChevronRight, Inbox as InboxIcon, Loader2, Search } from "lucide-react";
import { LedgerTable } from "@/components/ledger/LedgerTable";
import { ProcessingDrawer } from "@/components/ledger/ProcessingDrawer";
import { UploadButton } from "@/components/ledger/UploadButton";
import { deleteDocument, updateDocument } from "@/app/actions/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRole } from "@/components/RoleProvider";
import type { InboxCounts, InboxFilters, InboxStatus } from "@/utils/inbox";
import type { CategoryRow, DocumentRow, FundRow } from "@/utils/row-types";

interface InboxClientProps {
    documents: DocumentRow[];
    total: number;
    page: number;
    pageSize: number;
    counts: InboxCounts;
    filters: InboxFilters;
    funds: FundRow[];
    categories: CategoryRow[];
}

const FILTERS: { id: InboxStatus; label: string; key: keyof InboxCounts }[] = [
    { id: "all", label: "Everything to do", key: "all" },
    { id: "extracting", label: "Extracting", key: "extracting" },
    { id: "needs_review", label: "Needs review", key: "needs_review" },
    { id: "duplicate", label: "Possible duplicate", key: "duplicate" },
];

// The review queue for uploads (simplification step 4). Approving moves a document out: a receipt paid
// on the spot to Transactions, an unpaid bill to Bills & Invoices.
export function InboxClient({ documents, total, page, pageSize, counts, filters, funds, categories }: InboxClientProps) {
    const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
    const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
    const [isBulkApproving, setIsBulkApproving] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const { isViewer } = useRole();

    // Filters, search and paging live in the URL, so the database returns only one page of rows
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState<string>(filters.q);

    const updateParams = (patch: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "" || value === "all") params.delete(key);
            else params.set(key, value);
        }
        if (!("page" in patch)) params.delete("page");
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
    };

    // Search is debounced so the database isn't queried on every keystroke
    useEffect(() => {
        if (searchQuery.trim() === filters.q.trim()) return;
        const timer = setTimeout(() => updateParams({ q: searchQuery.trim() }), 350);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    const selectedDocument = documents.find((d) => d.id === selectedDocId);

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this document?")) return;
        const res = await deleteDocument(id);
        if (!res.success) {
            toast.error("Could not delete the document", { description: res.error });
            return;
        }
        setSelectedDocs((prev) => prev.filter((docId) => docId !== id));
        router.refresh();
    };

    const handleBulkApprove = async () => {
        setIsBulkApproving(true);
        try {
            const results = await Promise.all(selectedDocs.map(async (id) => {
                const doc = documents.find((d) => d.id === id);
                if (!doc) return { ok: false, error: null as string | null, receipt: false };
                const result = await updateDocument(id, { status: doc.document_type === "receipt" ? "paid" : "awaiting_payment" });
                return result && result.success === false
                    ? { ok: false, error: `${doc.vendor_name || "Document"}: ${result.error}`, receipt: false }
                    : { ok: true, error: null, receipt: doc.document_type === "receipt" };
            }));
            const failures = results.filter((r) => !r.ok && r.error).map((r) => r.error as string);
            const receipts = results.filter((r) => r.ok && r.receipt).length;
            const bills = results.filter((r) => r.ok && !r.receipt).length;
            if (failures.length > 0) toast.error(`${failures.length} document(s) could not be approved`, { description: failures.join("\n") });
            if (receipts + bills > 0) {
                toast.success(`${receipts + bills} approved`, {
                    description: [receipts ? `${receipts} paid receipt${receipts === 1 ? "" : "s"} now in Transactions` : "", bills ? `${bills} bill${bills === 1 ? "" : "s"} now in Bills & Invoices` : ""].filter(Boolean).join(", "),
                    action: { label: bills ? "Bills to pay" : "Transactions", onClick: () => router.push(bills ? "/invoices?status=unpaid" : "/transactions?type=money_out") },
                });
            }
            setSelectedDocs([]);
            router.refresh();
        } finally {
            setIsBulkApproving(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedDocs.length === 0) return;
        if (!window.confirm(`Are you sure you want to permanently delete the ${selectedDocs.length} selected documents?`)) return;
        setIsBulkDeleting(true);
        try {
            const results = await Promise.all(selectedDocs.map(async (id) => {
                const res = await deleteDocument(id);
                const doc = documents.find((d) => d.id === id);
                return res.success ? null : `${doc?.vendor_name || "Document"}: ${res.error}`;
            }));
            const failures = results.filter((r): r is string => !!r);
            if (failures.length > 0) toast.error(`${failures.length} document(s) could not be deleted`, { description: failures.join("\n") });
            setSelectedDocs([]);
            router.refresh();
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const empty = counts.all === 0;

    return (
        <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Inbox filters">
                {FILTERS.map((f) => {
                    const active = filters.status === f.id;
                    return (
                        <button key={f.id} type="button" role="tab" aria-selected={active} data-testid={`inbox-filter-${f.id}`}
                            onClick={() => updateParams({ status: f.id })}
                            className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors ${active
                                ? "border-indigo-600 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/30"
                                : "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"}`}>
                            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">{f.label}</span>
                            <span className="block text-xl font-bold text-slate-900 dark:text-white tabular-nums">{counts[f.key]}</span>
                        </button>
                    );
                })}
            </div>

            {empty ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-14 text-center" data-testid="inbox-empty">
                    <InboxIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">All caught up</h2>
                    <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
                        Nothing is waiting for review. Upload a receipt or bill and it appears here while it is read, ready for you to check.
                        Approved receipts are in <Link href="/transactions" className="text-indigo-600 hover:underline">Transactions</Link>, and unpaid bills in{" "}
                        <Link href="/invoices" className="text-indigo-600 hover:underline">Bills &amp; Invoices</Link>.
                    </p>
                    <div className="mt-5 flex justify-center"><UploadButton /></div>
                </div>
            ) : (
                <>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Search payee, invoice number or remarks" className="pl-9 w-full bg-white dark:bg-slate-900"
                            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>

                    {selectedDocs.length > 0 && (
                        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-300 px-4 py-3 rounded-xl flex flex-wrap gap-2 items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-500" />
                                <span className="font-medium">{selectedDocs.length} selected</span>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setSelectedDocs([])}>Cancel</Button>
                                <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isBulkDeleting || isViewer} title={isViewer ? "Viewers cannot delete" : ""}>
                                    {isBulkDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Delete selected
                                </Button>
                                <Button size="sm" onClick={handleBulkApprove} disabled={isBulkApproving || isViewer} title={isViewer ? "Viewers cannot approve" : ""} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                    {isBulkApproving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Approve selected
                                </Button>
                            </div>
                        </div>
                    )}

                    {documents.length === 0 ? (
                        <p className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-10 text-center text-sm text-slate-500">Nothing here matches.</p>
                    ) : (
                        <LedgerTable
                            documents={documents}
                            onRowClick={setSelectedDocId}
                            onDelete={handleDelete}
                            selectedDocs={selectedDocs}
                            onToggleSelect={(id) => setSelectedDocs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                            onToggleSelectAll={() => setSelectedDocs(selectedDocs.length === documents.length ? [] : documents.map((d) => d.id))}
                            onPreviewImage={setPreviewImageUrl}
                        />
                    )}

                    {total > pageSize && (
                        <div className="flex items-center justify-between pt-2 text-sm text-slate-500 dark:text-slate-400">
                            <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}</span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}><ChevronLeft className="w-4 h-4" /> Previous</Button>
                                <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => updateParams({ page: String(page + 1) })}>Next <ChevronRight className="w-4 h-4" /></Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            <ProcessingDrawer
                isOpen={!!selectedDocId}
                onClose={() => setSelectedDocId(undefined)}
                document={selectedDocument}
                funds={funds}
                categories={categories}
                onNext={() => { setSelectedDocId(undefined); router.refresh(); }}
            />

            <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
                <DialogContent className="max-w-2xl p-4">
                    <DialogHeader className="mb-2">
                        <DialogTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document preview</DialogTitle>
                    </DialogHeader>
                    <div className="relative w-full rounded-md overflow-hidden bg-slate-100 dark:bg-slate-950 min-h-[400px] flex items-center justify-center">
                        {previewImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={previewImageUrl} alt="Receipt preview" className="max-w-full max-h-[70vh] object-contain" />
                        ) : (
                            <div className="text-slate-400 font-mono text-xs">No image data found.</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
