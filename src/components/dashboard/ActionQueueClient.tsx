"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Eye, Loader2, Info } from "lucide-react";
import { updateDocument } from "@/app/actions/ledger";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export function ActionQueueClient({ initialQueue }: { initialQueue: any[] }) {
    const [queue, setQueue] = useState(initialQueue);
    const [isMarking, setIsMarking] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<any | null>(null);

    const handleMarkPaid = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setIsMarking(id);
        try {
            await updateDocument(id, { status: "paid" });
            setQueue(q => q.filter(doc => doc.id !== id));
        } catch (error) {
            console.error("Failed to mark paid", error);
        } finally {
            setIsMarking(null);
        }
    };

    if (queue.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in zoom-in-95 duration-300">
                <div className="h-16 w-16 mb-4 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center border-4 border-indigo-50 dark:border-indigo-900/20 shadow-sm">
                    <Check className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">All caught up!</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[250px]">
                    Drag and drop receipts here to keep the momentum going.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="divide-y divide-border dark:divide-slate-800">
                {queue.map((item: any) => (
                    <div key={item.id} className="group flex items-center justify-between p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors relative">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-300 shrink-0 uppercase">
                                {item.vendor_name ? item.vendor_name.charAt(0) : "?"}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium leading-none text-gray-900 dark:text-white truncate">{item.vendor_name || "Unknown Vendor"}</p>
                                <p className="text-sm font-semibold text-gray-500 dark:text-slate-400 mt-1 truncate">{item.amount ? `$${item.amount.toFixed(2)}` : "—"}</p>
                            </div>
                        </div>

                        {/* Default Badges - Hide on Hover */}
                        <div className="flex items-center gap-3 shrink-0 group-hover:opacity-0 transition-opacity duration-200">
                            {item.amount && item.amount >= 1000 && <Badge variant="destructive" className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-900/60">Urgent</Badge>}
                            {item.status === "DUPLICATE_WARNING" && <Badge variant="destructive" className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-900/60">Duplicate</Badge>}
                            <Badge variant={item.status === "needs_review" ? "outline" : item.status === "DUPLICATE_WARNING" ? "destructive" : "secondary"} className={item.status === "needs_review" ? "bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-medium" : item.status === "DUPLICATE_WARNING" ? "bg-transparent border-rose-500 text-rose-500" : ""}>
                                {item.status === "needs_review" ? "Needs Review" : item.status === "DUPLICATE_WARNING" ? "Flagged" : item.status === "awaiting_payment" ? "Awaiting Payment" : item.status}
                            </Badge>
                        </div>

                        {/* Quick Actions - Reveal on Hover */}
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pl-4 py-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                onClick={() => setPreviewDoc(item)}
                                title="Quick Preview"
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                onClick={(e) => handleMarkPaid(e, item.id)}
                                disabled={isMarking === item.id}
                                title="Mark as Paid"
                            >
                                {isMarking === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Preview Modal */}
            <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="w-5 h-5 text-blue-500" />
                            Document Preview
                        </DialogTitle>
                    </DialogHeader>
                    {previewDoc && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Vendor</p>
                                    <p className="font-semibold text-slate-900 dark:text-white">{previewDoc.vendor_name || "Unknown"}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Amount</p>
                                    <p className="font-semibold text-slate-900 dark:text-white">${previewDoc.amount?.toFixed(2) || "0.00"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Date</p>
                                    <p className="font-medium text-slate-700 dark:text-slate-300">{previewDoc.document_date || "—"}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Status</p>
                                    <Badge variant="secondary" className="mt-1">{previewDoc.status.replace("_", " ")}</Badge>
                                </div>
                            </div>
                            {previewDoc.image_url && (
                                <div className="mt-4 pt-4 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 w-full mb-2 uppercase font-medium tracking-wider">Original Document</p>
                                    {previewDoc.image_url.toLowerCase().endsWith('.pdf') ? (
                                        <div className="w-full h-32 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex flex-col items-center justify-center p-4 text-center">
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">PDF Document</p>
                                            <a href={previewDoc.image_url} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md transition-colors">
                                                Click here to view PDF
                                            </a>
                                        </div>
                                    ) : (
                                        <div className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden flex items-center justify-center p-2">
                                            <img src={previewDoc.image_url} alt="Original Document" className="w-full max-h-64 object-contain rounded-md" />
                                        </div>
                                    )}
                                </div>
                            )}
                            {previewDoc.confidence_score !== undefined && (
                                <div className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    AI Extraction Confidence: {previewDoc.confidence_score}%
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
