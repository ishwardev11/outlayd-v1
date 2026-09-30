"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileText, AlertCircle, Search, DollarSign, Building2, Merge, Loader2, Trash2, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mergeVendors, deleteVendor, updateVendor } from "@/app/actions/ledger";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/components/RoleProvider";
import { toast } from "sonner";

export function VendorsClient({ vendorsList, categories = [] }: { vendorsList: any[]; categories?: any[] }) {
    const [vendors, setVendors] = useState<any[]>(vendorsList);
    const [updatingVendorId, setUpdatingVendorId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [isMerging, setIsMerging] = useState(false);
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [primaryVendorId, setPrimaryVendorId] = useState<string | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [vendorToDelete, setVendorToDelete] = useState<{ id: string, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { isViewer } = useRole();

    useEffect(() => {
        setVendors(vendorsList);
    }, [vendorsList]);

    const handleCategoryChange = async (vendorId: string, categoryId: string) => {
        const targetCategory = categoryId === "none" ? null : categoryId;
        const previousVendors = [...vendors];

        // Optimistic UI update
        setVendors(prev => prev.map(v => {
            if (v.id === vendorId) {
                const catObj = categories.find(c => c.id === targetCategory);
                return {
                    ...v,
                    default_category_id: targetCategory,
                    topCategory: catObj ? catObj.name : null
                };
            }
            return v;
        }));

        setUpdatingVendorId(vendorId);
        try {
            await updateVendor(vendorId, { default_category_id: targetCategory });
            const catName = categories.find(c => c.id === targetCategory)?.name;
            toast.success(catName ? `Default category set to "${catName}"` : "Default category cleared");
        } catch (error: any) {
            console.error("Failed to update vendor default category:", error);
            toast.error("Failed to update default category");
            setVendors(previousVendors);
        } finally {
            setUpdatingVendorId(null);
        }
    };

    const filteredVendors = vendors.filter(v => {
        const catName = categories.find(c => c.id === v.default_category_id)?.name || v.topCategory || v.suggestedCategoryName || "";
        return (
            v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            catName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    });

    const totalVendors = vendors.length;
    const totalOutstanding = vendors.reduce((sum, v) => sum + v.totalUnpaid, 0);
    const totalPaidLifelong = vendors.reduce((sum, v) => sum + v.totalPaid, 0);

    const toggleSelect = (id: string) => {
        setSelectedVendors(prev =>
            prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
        );
    };

    const handleMergeClick = () => {
        if (isViewer) return;
        if (selectedVendors.length === 2) {
            setPrimaryVendorId(selectedVendors[0]); // default
            setMergeModalOpen(true);
        }
    };

    const executeMerge = async () => {
        if (!primaryVendorId || selectedVendors.length !== 2 || isViewer) return;
        setIsMerging(true);

        const secondaryVendorId = selectedVendors.find(id => id !== primaryVendorId);

        try {
            await mergeVendors(primaryVendorId, secondaryVendorId!);
            setSelectedVendors([]);
            setMergeModalOpen(false);
        } catch (e) {
            alert("Failed to merge vendors");
        } finally {
            setIsMerging(false);
        }
    }

    const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (isViewer) return;
        setVendorToDelete({ id, name });
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!vendorToDelete || isViewer) return;
        setIsDeleting(true);
        try {
            await deleteVendor(vendorToDelete.id);
            setDeleteModalOpen(false);
            setVendorToDelete(null);
            setSelectedVendors(prev => prev.filter(v => v !== vendorToDelete.id));
        } catch (e) {
            alert("Failed to delete vendor");
        } finally {
            setIsDeleting(false);
        }
    };

    const selectedVendorObjects = selectedVendors.map(id => vendors.find(v => v.id === id));

    return (
        <div className="space-y-8">
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">Total Vendors</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground dark:text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalVendors}</div>
                        <p className="text-xs text-muted-foreground dark:text-slate-400">Active partnerships</p>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">Total Outstanding</CardTitle>
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <p className="text-xs text-muted-foreground dark:text-slate-400">Needs to be paid</p>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">Total Paid (All Time)</CardTitle>
                        <DollarSign className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">${totalPaidLifelong.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <p className="text-xs text-muted-foreground dark:text-slate-400">Historical volume</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 " />
                    <Input
                        placeholder="Search vendors or categories..."
                        className="pl-8 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {selectedVendors.length > 0 && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 font-medium">{selectedVendors.length} selected</span>
                        {selectedVendors.length === 2 && (
                            <Button
                                onClick={handleMergeClick}
                                size="sm"
                                disabled={isViewer}
                                title={isViewer ? "Viewers cannot merge vendors" : ""}
                                className="bg-indigo-600 hover:bg-indigo-700 animate-in fade-in zoom-in duration-200"
                            >
                                <Merge className="w-4 h-4 mr-2" />
                                Merge Duplicates
                            </Button>
                        )}
                        {selectedVendors.length > 2 && (
                            <Badge variant="secondary" className="bg-gray-50 text-gray-500 border-none">
                                Select exactly 2 to merge
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            {filteredVendors.length === 0 ? (
                <Card className="border-gray-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-slate-400">
                        <Users className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
                        <p>{searchQuery ? "No vendors match your search." : "No vendors found yet. Process documents to build your directory."}</p>
                    </CardContent>
                </Card>
            ) : (
                <Card className="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                            <TableRow className="hover:bg-transparent border-none">
                                <TableHead className="w-12 text-center"></TableHead>
                                <TableHead className="font-semibold text-gray-900 dark:text-slate-300">Vendor Info</TableHead>
                                <TableHead className="font-semibold text-gray-900 dark:text-slate-300">Default Category</TableHead>
                                <TableHead className="font-semibold text-gray-900 dark:text-slate-300 text-center">Documents</TableHead>
                                <TableHead className="text-right font-semibold text-gray-900 dark:text-slate-300">Total Paid</TableHead>
                                <TableHead className="text-right font-semibold text-gray-900 dark:text-slate-300">Outstanding Balance</TableHead>
                                <TableHead className="w-12 text-center"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredVendors.map((vendor) => (
                                <TableRow key={vendor.id} className={`transition-colors group border-b border-gray-200 dark:border-slate-700 ${selectedVendors.includes(vendor.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/30' : 'bg-white dark:bg-slate-800 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 cursor-pointer'}`} onClick={() => toggleSelect(vendor.id)}>
                                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selectedVendors.includes(vendor.id)}
                                            onCheckedChange={() => toggleSelect(vendor.id)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-gray-900 dark:text-white">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 font-bold text-sm shrink-0 border border-gray-200 group-hover:border-slate-300 transition-colors dark:bg-slate-700 dark:text-white dark:border-slate-600">
                                                {vendor.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="truncate group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors">{vendor.name}</div>
                                                <div className="text-xs text-gray-500 dark:text-slate-400 font-normal mt-0.5">Last active: {vendor.lastActivity}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Select
                                            value={vendor.default_category_id || "none"}
                                            onValueChange={(val) => handleCategoryChange(vendor.id, val)}
                                            disabled={isViewer || updatingVendorId === vendor.id}
                                        >
                                            <SelectTrigger className={`h-8 text-xs font-medium rounded-lg transition-all border w-47.5 max-w-52.5 ${
                                                vendor.default_category_id
                                                    ? "bg-indigo-50/80 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800/80 dark:text-indigo-300 font-semibold"
                                                    : vendor.suggestedCategoryName
                                                        ? "bg-amber-50/70 border-amber-200/90 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-300"
                                                        : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-400"
                                            }`}>
                                                {updatingVendorId === vendor.id ? (
                                                    <span className="flex items-center gap-1.5 text-slate-400 text-xs">
                                                        <Loader2 className="h-3 w-3 animate-spin text-indigo-500 shrink-0" />
                                                        Saving...
                                                    </span>
                                                ) : (
                                                    <SelectValue>
                                                        {vendor.default_category_id ? (
                                                            <span className="truncate">
                                                                {categories.find((c: any) => c.id === vendor.default_category_id)?.name || vendor.topCategory}
                                                            </span>
                                                        ) : vendor.suggestedCategoryName ? (
                                                            <span className="flex items-center gap-1.5 truncate" title={`Suggested from past invoices: ${vendor.suggestedCategoryName}`}>
                                                                <span className="text-[10px] uppercase font-bold tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 shrink-0">Auto</span>
                                                                <span className="truncate text-xs font-normal">{vendor.suggestedCategoryName}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 dark:text-slate-500 font-normal">— Set default</span>
                                                        )}
                                                    </SelectValue>
                                                )}
                                            </SelectTrigger>
                                            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl min-w-52.5">
                                                <SelectItem value="none" className="text-xs text-slate-400 dark:text-slate-500 cursor-pointer">
                                                    — None (No Default)
                                                </SelectItem>
                                                {vendor.suggestedCategoryId && !vendor.default_category_id && (
                                                    <SelectItem value={vendor.suggestedCategoryId} className="text-xs font-medium text-amber-600 dark:text-amber-400 cursor-pointer">
                                                        ⚡ Set to &ldquo;{vendor.suggestedCategoryName}&rdquo; (Suggested)
                                                    </SelectItem>
                                                )}
                                                {categories.map((c: any) => (
                                                    <SelectItem key={c.id} value={c.id} className="text-xs cursor-pointer">
                                                        {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="inline-flex items-center justify-center bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-slate-400">
                                            <FileText className="h-3 w-3 mr-1" />
                                            {vendor.docCount}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                                        ${vendor.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {vendor.totalUnpaid > 0 ? (
                                            <div className="items-center justify-end font-semibold text-red-600 gap-1.5 bg-red-50 px-2 py-1 rounded-md inline-flex border border-red-100 ">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                ${vendor.totalUnpaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        ) : (
                                            <span className="text-indigo-600 font-medium text-sm flex items-center justify-end gap-1">
                                                All Settled
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-gray-500 hover:text-red-500 hover:bg-red-50/20 transition-colors"
                                            onClick={(e) => handleDeleteClick(e, vendor.id, vendor.name)}
                                            disabled={isViewer}
                                            title={isViewer ? "Viewers cannot delete vendors" : ""}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}

            <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Merge className="w-5 h-5 text-indigo-500" />
                            Merge Selected Vendors
                        </DialogTitle>
                        <DialogDescription>
                            Select which vendor profile should be kept. All historical documents from the secondary vendor will be reassigned to the primary vendor, and the secondary vendor will be permanently deleted.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        {selectedVendorObjects.map(v => v && (
                            <div
                                key={v.id}
                                onClick={() => setPrimaryVendorId(v.id)}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${primaryVendorId === v.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' : 'border-gray-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'}`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <h4 className="font-semibold text-gray-900 dark:text-white">{v.name}</h4>
                                    {primaryVendorId === v.id && <Badge variant="default" className="bg-indigo-500 ">Primary (Keep)</Badge>}
                                </div>
                                <div className="text-sm border-t border-gray-200 dark:border-slate-700 pt-2 mt-2 flex justify-between text-gray-500 dark:text-slate-400">
                                    <span>{v.docCount} documents recorded</span>
                                    <span>${(v.totalPaid + v.totalUnpaid).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} volume</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMergeModalOpen(false)}>Cancel</Button>
                        <Button onClick={executeMerge} disabled={isMerging} className="bg-indigo-600 hover:bg-indigo-700">
                            {isMerging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Execute Merge
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="w-5 h-5" />
                            Delete Vendor
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            Are you sure you want to permanently delete <strong>{vendorToDelete?.name}</strong>?
                            <br /><br />
                            This action cannot be undone. If there are documents associated with this vendor, their vendor field will be cleared.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
                        <Button onClick={confirmDelete} disabled={isDeleting} variant="destructive">
                            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete Vendor
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
