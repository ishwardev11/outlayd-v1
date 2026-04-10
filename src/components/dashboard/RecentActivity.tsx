import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export function RecentActivity({ documents }: { documents: any[] }) {
    // Sort by updated_at if available, else created_at. Take top 3.
    const recentDocs = [...documents]
        .sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at).getTime();
            const dateB = new Date(b.updated_at || b.created_at).getTime();
            return dateB - dateA;
        })
        .slice(0, 3);

    const getActivityMessage = (doc: any) => {
        const vendor = doc.vendor_name || "A document";
        if (doc.status === 'paid') return `${vendor} was marked as paid.`;
        if (doc.status === 'awaiting_payment') return `${vendor} was approved and is awaiting payment.`;
        if (doc.status === 'needs_review') return `${vendor} was uploaded and needs review.`;
        if (doc.status === 'DUPLICATE_WARNING') return `Warning: Potential duplicate detected for ${vendor}.`;
        return `${vendor} was updated.`;
    };

    return (
        <Card className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold tracking-tight uppercase text-slate-500 dark:text-slate-400">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
                {recentDocs.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">No recent activity.</p>
                ) : (
                    <div className="relative border-l border-slate-200 dark:border-slate-700 ml-3 space-y-6">
                        {recentDocs.map((doc, idx) => {
                            const dateObj = new Date(doc.updated_at || doc.created_at);
                            let timeAgo = "Just now";
                            try {
                                timeAgo = formatDistanceToNow(dateObj, { addSuffix: true });
                            } catch (e) {
                                // Fallback if date is invalid
                            }

                            return (
                                <div key={doc.id} className="relative pl-5 animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${idx * 100}ms` }}>
                                    <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-slate-800" />
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-tight">
                                        {getActivityMessage(doc)}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{timeAgo}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
