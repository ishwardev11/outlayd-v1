import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { FileText, ExternalLink, Calendar, DollarSign, CreditCard } from "lucide-react"
import { Bid } from "./ProjectDashboard"

export function QuoteDetailDialog({ bid, children }: { bid: Bid, children: React.ReactNode }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl">{bid.vendorName}</DialogTitle>
                    <DialogDescription>
                        Quote details and evaluation information
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Key Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3"/> Upload Date</span>
                            <p className="text-sm font-medium">{bid.date}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Status</span>
                            <div>
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 capitalize">
                                    {bid.status}
                                </Badge>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3"/> Amount</span>
                            <p className="text-sm font-medium">${bid.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="w-3 h-3"/> Payment Terms</span>
                            <p className="text-sm font-medium">{bid.paymentTerms || "—"}</p>
                        </div>
                    </div>

                    {/* File Link */}
                    {bid.fileUrl && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-foreground">Source Document</h4>
                            <a href={bid.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                                <FileText className="w-5 h-5 text-primary" />
                                <span className="text-sm font-medium text-primary flex-1 truncate">View Quote Document</span>
                                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                            </a>
                        </div>
                    )}

                    {/* Notes Section */}
                    {bid.notes && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-foreground">Manual Notes</h4>
                            <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bid.notes}</p>
                            </div>
                        </div>
                    )}

                    {/* AI Evaluation Section */}
                    {bid.aiRecommendationStatus && (
                        <div className="space-y-2 pt-4 border-t border-border">
                            <h4 className="text-sm font-medium text-foreground">AI Evaluation</h4>
                            <div className="space-y-3">
                                <div>
                                    <span className="text-xs text-muted-foreground mb-1 block">Recommendation</span>
                                    <Badge variant="secondary">{bid.aiRecommendationStatus}</Badge>
                                </div>
                                {bid.aiRationale && (
                                    <div>
                                        <span className="text-xs text-muted-foreground mb-1 block">Rationale</span>
                                        <p className="text-sm text-foreground">{bid.aiRationale}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
