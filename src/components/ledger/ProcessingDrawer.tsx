import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { updateDocument, createFund, createCategory, deleteDocument } from "@/app/actions/ledger";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRole } from "@/components/RoleProvider";

interface Split {
    id: string; // temporary UI id
    amount: number | "";
    fund_id: string;
    category_id: string;
    customFundName?: string;
    customCategoryName?: string;
}

interface ProcessingDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    document?: any;
    funds: any[];
    categories: any[];
    onNext?: () => void;
}

export function ProcessingDrawer({ isOpen, onClose, document, funds, categories, onNext }: ProcessingDrawerProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState<any>({});
    const [splits, setSplits] = useState<Split[]>([]);
    const [lineItems, setLineItems] = useState<any[]>([]);
    const { isViewer } = useRole();

    useEffect(() => {
        if (document) {
            setFormData({
                vendor_name: document.vendor_name || "",
                document_date: document.document_date || "",
                amount: document.amount || 0,
                document_type: document.document_type || "receipt",
                confidence_score: document.confidence_score || 0
            });
            // Load existing splits or generate single default split
            if (document.splits && document.splits.length > 0) {
                setSplits(document.splits.map((s: any) => ({ ...s, id: Math.random().toString(36).substring(7) })));
            } else {
                setSplits([{
                    id: "initial",
                    amount: document.amount || "",
                    fund_id: document.fund_id || "",
                    category_id: document.category_id || ""
                }]);
            }
            setLineItems(document.line_items || []);
        }
    }, [document]);

    const addSplit = () => {
        setSplits([...splits, { id: Math.random().toString(36).substring(7), amount: "", fund_id: "", category_id: "" }]);
    };

    const removeSplit = (id: string) => {
        setSplits(splits.filter(s => s.id !== id));
    };

    const updateSplit = (id: string, field: keyof Split, value: any) => {
        setSplits(splits.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const totalSplitAmount = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const isValidAmount = Math.abs(totalSplitAmount - (Number(formData.amount) || 0)) < 0.01;

    const handleSave = useCallback(async () => {
        // --- 1. Form Validation with Visible Errors ---
        const validationErrors: string[] = [];

        if (!formData.vendor_name?.trim()) {
            validationErrors.push("Vendor name is required.");
        }
        if (!formData.document_date?.trim()) {
            validationErrors.push("Document date is required.");
        }
        const parsedTotalAmount = parseFloat(String(formData.amount));
        if (isNaN(parsedTotalAmount) || parsedTotalAmount <= 0) {
            validationErrors.push("Total Amount must be a valid positive number.");
        }
        if (!isValidAmount) {
            validationErrors.push(`Split amounts ($${totalSplitAmount.toFixed(2)}) do not match the total ($${Number(formData.amount || 0).toFixed(2)}).`);
        }

        // Validate each split has a fund and category selected
        splits.forEach((split, idx) => {
            if (!split.fund_id) {
                validationErrors.push(`Split #${idx + 1}: Fund is required.`);
            }
            if (!split.category_id) {
                validationErrors.push(`Split #${idx + 1}: Category is required.`);
            }
            if (split.fund_id === "custom" && !split.customFundName?.trim()) {
                validationErrors.push(`Split #${idx + 1}: Custom fund name cannot be empty.`);
            }
            if (split.category_id === "custom" && !split.customCategoryName?.trim()) {
                validationErrors.push(`Split #${idx + 1}: Custom category name cannot be empty.`);
            }
            const splitAmt = parseFloat(String(split.amount));
            if (isNaN(splitAmt) || splitAmt <= 0) {
                validationErrors.push(`Split #${idx + 1}: Amount must be a valid positive number.`);
            }
        });

        if (validationErrors.length > 0) {
            toast.error("Validation Error: Please check the highlighted fields.", {
                description: validationErrors.join(" "),
                duration: 6000,
            });
            return;
        }

        setIsSubmitting(true);
        try {
            // --- 2. Data Type Coercion for Splits ---
            const finalSplits = await Promise.all(splits.map(async (split) => {
                let fId = split.fund_id;
                let cId = split.category_id;

                if (fId === "custom" && split.customFundName) {
                    try {
                        const newFund = await createFund(split.customFundName.trim());
                        fId = newFund.id;
                    } catch (fundErr: any) {
                        throw new Error(`Failed to create fund "${split.customFundName}": ${fundErr.message}`);
                    }
                }
                if (cId === "custom" && split.customCategoryName) {
                    try {
                        const newCategory = await createCategory(split.customCategoryName.trim());
                        cId = newCategory.id;
                    } catch (catErr: any) {
                        throw new Error(`Failed to create category "${split.customCategoryName}": ${catErr.message}`);
                    }
                }
                return {
                    amount: parseFloat(String(split.amount)) || 0, // Explicit float coercion
                    fund_id: fId === "custom" ? null : fId,
                    category_id: cId === "custom" ? null : cId
                };
            }));

            let newStatus = formData.document_type === "receipt" ? "paid" : "awaiting_payment";
            if (document.status === "awaiting_payment") {
                newStatus = "paid";
            } else if (document.status === "paid") {
                newStatus = "paid";
            }

            // --- 3. Data Type Coercion for Line Items ---
            const sanitizedLineItems = lineItems.map((item) => ({
                description: String(item.description || ""),
                quantity: parseFloat(String(item.quantity)) || 0,
                unit_price: parseFloat(String(item.unit_price)) || 0,
                total: parseFloat(String(item.total)) || 0,
            }));

            // --- Try/Catch wrapping the actual DB update ---
            const result = await updateDocument(document.id, {
                ...formData,
                amount: parsedTotalAmount, // Coerced float, not raw string
                splits: finalSplits,
                fund_id: finalSplits[0]?.fund_id || null,
                category_id: finalSplits[0]?.category_id || null,
                line_items: sanitizedLineItems,
                status: newStatus
            });

            if (result && !result.success) {
                toast.error("Save Failed", {
                    description: result.error || "The database rejected the save.",
                    duration: 6000,
                });
                return;
            }

            toast.success(
                document.status === "awaiting_payment"
                    ? "Invoice marked as paid."
                    : "Document approved successfully."
            );

            if (onNext) onNext();
            else onClose();
        } catch (e: any) {
            console.error("Submission Error:", e);
            toast.error("Save Failed", {
                description: e?.message || "An unexpected error occurred while saving. Please try again.",
                duration: 6000,
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [formData, splits, lineItems, isValidAmount, totalSplitAmount, document?.id, document?.status, onClose, onNext]);

    // Keyboard handling
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (!isSubmitting) handleSave();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, handleSave, isSubmitting]);

    const handleDelete = async () => {
        if (!document?.id) return;
        if (window.confirm("Are you sure you want to permanently delete this document?")) {
            setIsSubmitting(true);
            try {
                await deleteDocument(document.id);
                toast.success("Document deleted successfully");
                onClose();
            } catch (error) {
                console.error(error);
                toast.error(error instanceof Error ? error.message : "Failed to delete document");
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    if (!document) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[95vw] sm:max-w-5xl h-[90vh] p-0 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden dark:border-slate-800">
                <DialogHeader className="px-6 py-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-row items-center justify-between">
                    <DialogTitle className="dark:text-white">{document.status === "awaiting_payment" ? "Settle Invoice" : "Review Document"}: {document.id.split('-')[0]}</DialogTitle>
                    <div className="flex items-center gap-2">
                        {formData.confidence_score >= 90 ? (
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800">High Confidence ({formData.confidence_score}%)</Badge>
                        ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">Review Required ({formData.confidence_score || 'N/A'}%)</Badge>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
                    {/* Left Pane - Document Viewer */}
                    <div className="border-r border-b md:border-b-0 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex flex-col h-[40vh] md:h-full">
                        <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 flex justify-between">
                            <span className="truncate mr-4">Original Document</span>
                            <span className="shrink-0">1 of 1 pages</span>
                        </div>
                        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                            {document.image_url ? (
                                document.image_url.toLowerCase().includes('.pdf') ? (
                                    <iframe
                                        src={`${document.image_url}#toolbar=0`}
                                        className="w-full h-full border-0 rounded-md"
                                        title="Document Preview"
                                    />
                                ) : (
                                    <img
                                        src={document.image_url}
                                        alt="Document Preview"
                                        className="max-w-full max-h-full object-contain rounded-md shadow-sm border border-slate-200 dark:border-slate-800"
                                    />
                                )
                            ) : (
                                <div className="w-full h-full max-w-sm max-h-150 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                                    <div className="w-32 h-4 bg-slate-200 dark:bg-slate-800 rounded mb-8"></div>
                                    <div className="w-64 h-2 bg-slate-200 dark:bg-slate-800 rounded mb-4"></div>
                                    <div className="w-48 h-2 bg-slate-200 dark:bg-slate-800 rounded mb-4"></div>
                                    <div className="w-56 h-2 bg-slate-200 dark:bg-slate-800 rounded mb-12"></div>
                                    <span className="mt-8 text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">No Document Available</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Pane - Form Data */}
                    <div className="flex flex-col h-[40vh] md:h-full overflow-hidden bg-white dark:bg-slate-900 border-t md:border-t-0 dark:border-slate-800">
                        {/* Scrollable Form Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6" data-lenis-prevent="true">
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Extracted Data</h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="vendor" className="dark:text-slate-300">Vendor</Label>
                                        <Input
                                            id="vendor"
                                            className="dark:bg-slate-950 dark:border-slate-800"
                                            value={formData.vendor_name}
                                            onChange={e => setFormData({ ...formData, vendor_name: e.target.value })}
                                            disabled={isViewer}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="date" className="dark:text-slate-300">Date</Label>
                                        <Input
                                            id="date"
                                            className="dark:bg-slate-950 dark:border-slate-800"
                                            value={formData.document_date}
                                            onChange={e => setFormData({ ...formData, document_date: e.target.value })}
                                            disabled={isViewer}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount" className="dark:text-slate-300">Total Amount</Label>
                                        <Input
                                            id="amount"
                                            value={formData.amount}
                                            onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                            className="text-lg font-semibold dark:bg-slate-950 dark:border-slate-800"
                                            disabled={isViewer}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="type" className="dark:text-slate-300">Document Type</Label>
                                        <Select
                                            value={formData.document_type}
                                            onValueChange={v => setFormData({ ...formData, document_type: v })}
                                            disabled={isViewer}
                                        >
                                            <SelectTrigger className="dark:bg-slate-950 dark:border-slate-800">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="receipt">Receipt (Paid)</SelectItem>
                                                <SelectItem value="invoice">Invoice (Unpaid)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t dark:border-slate-800">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Split Categorization</h3>
                                    <span className={`text-xs font-mono font-semibold ${isValidAmount ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                        Allocated: ${totalSplitAmount.toFixed(2)} / ${Number(formData.amount || 0).toFixed(2)}
                                    </span>
                                </div>

                                {splits.map((split, index) => (
                                    <div key={split.id} className="p-4 border dark:border-slate-800 rounded-md bg-slate-50 dark:bg-slate-950 space-y-3 relative">
                                        {splits.length > 1 && (
                                            <button onClick={() => removeSplit(split.id)} className="absolute top-2 right-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        <div className="grid grid-cols-[1fr_2fr_2fr] gap-4 items-start w-full">
                                            <div className="space-y-1 w-full min-w-0">
                                                <Label className="text-xs dark:text-slate-300">Amount</Label>
                                                <Input className="w-full dark:bg-slate-900 dark:border-slate-800" type="number" value={split.amount} onChange={e => updateSplit(split.id, "amount", e.target.value)} />
                                            </div>
                                            <div className="space-y-1 w-full min-w-0">
                                                <Label className="text-xs dark:text-slate-300">Fund</Label>
                                                <Select value={split.fund_id || undefined} onValueChange={v => updateSplit(split.id, "fund_id", v)}>
                                                    <SelectTrigger className="w-full dark:bg-slate-900 dark:border-slate-800 [&>span]:truncate text-left"><SelectValue placeholder="Fund..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {funds.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                                                        <SelectItem value="custom" className="text-indigo-600 dark:text-indigo-400 font-medium">+ Custom</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                {split.fund_id === "custom" && (
                                                    <Input className="mt-1 w-full bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-900/30" placeholder="New fund name..." value={split.customFundName || ""} onChange={e => updateSplit(split.id, "customFundName", e.target.value)} />
                                                )}
                                            </div>
                                            <div className="space-y-1 w-full min-w-0">
                                                <Label className="text-xs dark:text-slate-300">Category</Label>
                                                <Select value={split.category_id || undefined} onValueChange={v => updateSplit(split.id, "category_id", v)}>
                                                    <SelectTrigger className="w-full dark:bg-slate-900 dark:border-slate-800 [&>span]:truncate text-left"><SelectValue placeholder="Category..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                                        <SelectItem value="custom" className="text-indigo-600 dark:text-indigo-400 font-medium">+ Custom</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                {split.category_id === "custom" && (
                                                    <Input className="mt-1 w-full bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-900/30" placeholder="New category name..." value={split.customCategoryName || ""} onChange={e => updateSplit(split.id, "customCategoryName", e.target.value)} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <Button type="button" variant="outline" size="sm" onClick={addSplit} className="w-full text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-900/30 dark:hover:bg-blue-900/40">
                                    <Plus className="w-4 h-4 mr-2" /> Add Split Attribute
                                </Button>
                            </div>

                            <div className="pt-8 mb-4">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-sm font-semibold text-[#0f172a] dark:text-slate-200 tracking-wide uppercase">LINE ITEMS</h3>
                                    <button
                                        type="button"
                                        onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unit_price: 0, total: 0 }])}
                                        className="text-[#3b27b9] dark:text-[#818cf8] hover:text-[#2d1b96] dark:hover:text-[#6366f1] text-[14px] font-medium flex items-center"
                                    >
                                        <Plus className="w-4 h-4 mr-1 stroke-2" /> Add item
                                    </button>
                                </div>

                                <div className="space-y-0 relative">
                                    <div className="grid grid-cols-[60px_1fr_100px_100px_32px] gap-2 py-2.5 border-y border-[#e2e8f0] dark:border-slate-800 text-[13px] font-semibold text-[#94a3b8] dark:text-slate-400 mb-2 items-center">
                                        <div className="text-center">Qty</div>
                                        <div>Description</div>
                                        <div className="text-right">Unit $</div>
                                        <div className="text-right">Total</div>
                                        <div></div>
                                    </div>

                                    <div className="pt-1">
                                        {lineItems.map((item, idx) => (
                                            <div key={idx} className="grid grid-cols-[60px_1fr_100px_100px_32px] gap-2 py-1 items-center group">
                                                <input
                                                    type="number"
                                                    value={item.quantity === 0 ? '' : item.quantity}
                                                    onChange={e => {
                                                        const newItems = [...lineItems];
                                                        newItems[idx].quantity = parseFloat(e.target.value) || 0;
                                                        newItems[idx].total = newItems[idx].quantity * newItems[idx].unit_price;
                                                        setLineItems(newItems);
                                                    }}
                                                    className="bg-transparent border border-transparent rounded-[6px] h-9 px-1 text-[14px] text-center text-[#1e293b] dark:text-slate-300 outline-none hover:border-[#e2e8f0] dark:hover:border-slate-700 focus:border-[#cbd5e1] dark:focus:border-slate-600 focus:ring-1 focus:ring-[#e2e8f0] dark:focus:ring-slate-700 transition-colors"
                                                    placeholder="0"
                                                />
                                                <input
                                                    value={item.description}
                                                    onChange={e => {
                                                        const newItems = [...lineItems];
                                                        newItems[idx].description = e.target.value;
                                                        setLineItems(newItems);
                                                    }}
                                                    className="bg-transparent border border-transparent rounded-[6px] h-9 px-2 text-[14px] text-[#1e293b] dark:text-slate-300 outline-none hover:border-[#e2e8f0] dark:hover:border-slate-700 focus:border-[#cbd5e1] dark:focus:border-slate-600 focus:ring-1 focus:ring-[#e2e8f0] dark:focus:ring-slate-700 transition-colors"
                                                    placeholder="Item description"
                                                />
                                                <input
                                                    type="number"
                                                    value={item.unit_price === 0 ? '' : item.unit_price}
                                                    onChange={e => {
                                                        const newItems = [...lineItems];
                                                        newItems[idx].unit_price = parseFloat(e.target.value) || 0;
                                                        newItems[idx].total = newItems[idx].quantity * newItems[idx].unit_price;
                                                        setLineItems(newItems);
                                                    }}
                                                    className="bg-transparent border border-transparent rounded-[6px] h-9 px-1 text-[14px] text-right text-[#1e293b] dark:text-slate-300 outline-none hover:border-[#e2e8f0] dark:hover:border-slate-700 focus:border-[#cbd5e1] dark:focus:border-slate-600 focus:ring-1 focus:ring-[#e2e8f0] dark:focus:ring-slate-700 transition-colors"
                                                    placeholder="0.00"
                                                />
                                                <div className="font-medium text-[#1e293b] dark:text-slate-300 text-[14px] text-right pr-2">
                                                    {(Number(item.total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                                <button
                                                    onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))}
                                                    className="text-[#cbd5e1] dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                                                    title="Remove item"
                                                >
                                                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {lineItems.length === 0 && (
                                        <div className="py-8 text-center border-2 border-dashed border-[#e2e8f0] dark:border-slate-800 rounded-md text-slate-400 dark:text-slate-500 text-xs italic mt-4">
                                            No line items extracted. Add them manually or rely on the total amount.
                                        </div>
                                    )}

                                    <div className="flex flex-col items-end pt-5 mt-4 border-t border-[#f1f5f9] dark:border-slate-800 gap-2">
                                        <div className="grid grid-cols-[1fr_100px] gap-2 items-center w-64">
                                            <div className="text-[14px] font-semibold text-[#0f172a] dark:text-slate-200 text-right">Total:</div>
                                            <div className="text-[15px] font-semibold text-[#0f172a] dark:text-slate-200 text-right pr-8">
                                                ${(lineItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* Pinned Action Buttons Footer */}
                        <div className="p-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0 flex gap-3 mt-auto justify-between items-center w-full">
                            <Button
                                id="drawer-delete-btn"
                                variant="destructive"
                                className="bg-red-600 hover:bg-red-700 dark:bg-red-750 dark:hover:bg-red-700 text-white cursor-pointer rounded-xl active:scale-[0.98] transition-all px-4"
                                onClick={handleDelete}
                                disabled={isSubmitting || isViewer}
                                title={isViewer ? "Viewers cannot delete documents" : ""}
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                                Delete Document
                            </Button>
                            <div className="flex gap-3">
                                <Button id="drawer-cancel-btn" variant="outline" className="bg-white dark:bg-slate-900 dark:border-slate-700 cursor-pointer rounded-xl active:scale-[0.98] transition-all" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                                <Button
                                    id="drawer-save-btn"
                                    className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white cursor-pointer rounded-xl active:scale-[0.98] transition-all"
                                    onClick={handleSave}
                                    disabled={isSubmitting || isViewer}
                                    title={isViewer ? "Viewers cannot edit documents" : "Cmd/Ctrl + Enter to Save"}
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    {document.status === "awaiting_payment" ? "Mark as Paid" : "Approve & Next"}
                                    <span className="ml-2 py-0.5 px-1.5 bg-indigo-800 text-indigo-100 rounded text-[10px] font-mono opacity-80 border border-indigo-900 shadow-inner tracking-wider">⌘↵</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
