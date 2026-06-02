import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KanbanFiltersProps {
    counts: {
        all: number;
        needsReview: number;
        awaitingPayment: number;
        paid: number;
    };
    selectedStatus: string;
    onStatusChange: (status: string) => void;
}

export function KanbanFilters({ counts, selectedStatus, onStatusChange }: KanbanFiltersProps) {
    const filters = [
        { id: "all", label: "All", count: counts.all, color: "text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-900" },
        { id: "needs_review", label: "Needs Review", count: counts.needsReview, color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30" },
        { id: "awaiting_payment", label: "Awaiting Payment", count: counts.awaitingPayment, color: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/30" },
        { id: "paid", label: "Paid", count: counts.paid, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30" },
    ];

    return (
        <div className="flex gap-4 overflow-x-auto pb-2">
            {filters.map((filter) => {
                const isActive = selectedStatus === filter.id;
                return (
                    <Card
                        id={`filter-card-${filter.id}`}
                        key={filter.id}
                        onClick={() => onStatusChange(filter.id)}
                        className={cn(
                            "min-w-[150px] transition-all duration-200 ease-in-out cursor-pointer rounded-xl active:scale-[0.98]",
                            isActive 
                                ? "border-2 border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-md"
                                : "bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 shadow-sm hover:border-indigo-300 dark:hover:border-slate-700 hover:shadow-md"
                        )}
                    >
                        <CardContent className="p-4 flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{filter.label}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">{filter.count}</span>
                                {filter.color && (
                                    <div className={cn("px-2 py-0.5 rounded-full text-xs font-medium", filter.color)}>
                                        {filter.count}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
