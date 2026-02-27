import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface ProcessingDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    documentId?: string;
}

export function ProcessingDrawer({ isOpen, onClose, documentId }: ProcessingDrawerProps) {
    if (!documentId) return null;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[90vw] sm:max-w-4xl p-0 flex flex-col h-full bg-slate-50">
                <SheetHeader className="px-6 py-4 border-b bg-white shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle>Review Document: {documentId}</SheetTitle>
                        <Badge variant="outline" className="text-amber-500 bg-amber-50 border-amber-200">
                            Needs Review
                        </Badge>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-hidden grid grid-cols-2">
                    {/* Left Pane - Document Viewer */}
                    <div className="border-r bg-slate-100 flex flex-col">
                        <div className="p-4 border-b bg-white text-xs font-medium text-slate-500 flex justify-between">
                            <span>Original Document</span>
                            <span>1 of 1 pages</span>
                        </div>
                        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                            {/* Placeholder for actual image/pdf viewer */}
                            <div className="w-full h-full max-w-sm max-h-[600px] bg-white shadow-sm border border-slate-200 rounded flex flex-col items-center justify-center text-slate-400">
                                <div className="w-32 h-4 bg-slate-200 rounded mb-8"></div>
                                <div className="w-64 h-2 bg-slate-200 rounded mb-4"></div>
                                <div className="w-48 h-2 bg-slate-200 rounded mb-4"></div>
                                <div className="w-56 h-2 bg-slate-200 rounded mb-12"></div>
                                <div className="w-full flex justify-between px-8 border-t pt-4">
                                    <div className="w-20 h-4 bg-slate-200 rounded"></div>
                                    <div className="w-20 h-4 bg-slate-200 rounded"></div>
                                </div>
                                <span className="mt-8 text-xs font-mono bg-slate-100 px-2 py-1 rounded">Document Image Preview</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Pane - Form Data */}
                    <ScrollArea className="h-full">
                        <div className="p-6 space-y-8 bg-white min-h-full">

                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-800">Extracted Data</h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="vendor">Vendor</Label>
                                        <Input id="vendor" defaultValue="AWS Services" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="date">Date</Label>
                                        <Input id="date" defaultValue="2026-02-27" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Total Amount</Label>
                                        <Input id="amount" defaultValue="$840.00" className="text-lg font-semibold" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="type">Document Type</Label>
                                        <Select defaultValue="invoice">
                                            <SelectTrigger>
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

                            <div className="space-y-4 pt-6 border-t">
                                <h3 className="text-sm font-semibold text-slate-800">Accounting Assignment</h3>

                                <div className="space-y-2">
                                    <Label htmlFor="fund">Fund Tag*</Label>
                                    <Select>
                                        <SelectTrigger className="border-emerald-200 bg-emerald-50">
                                            <SelectValue placeholder="Select a fund..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="general">General Admin</SelectItem>
                                            <SelectItem value="summer">Summer Youth Program</SelectItem>
                                            <SelectItem value="board">Board Meetings</SelectItem>
                                            <SelectItem value="uncategorized">Uncategorized</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">Required for accurate reporting.</p>
                                </div>

                                <div className="space-y-2 mt-4">
                                    <Label htmlFor="category">GL Category</Label>
                                    <Select defaultValue="software">
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="software">Software Subscriptions</SelectItem>
                                            <SelectItem value="office">Office Supplies</SelectItem>
                                            <SelectItem value="travel">Travel & Meals</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="pt-8 flex gap-3 pb-8">
                                <Button variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
                                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">Approve & Next</Button>
                            </div>

                        </div>
                    </ScrollArea>
                </div>
            </SheetContent>
        </Sheet>
    );
}
