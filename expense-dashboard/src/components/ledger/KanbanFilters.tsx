import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const filters = [
    { label: "All", count: 142, active: true },
    { label: "Extracting", count: 4, active: false, color: "text-blue-500 bg-blue-50" },
    { label: "Needs Review", count: 14, active: false, color: "text-amber-500 bg-amber-50" },
    { label: "Awaiting Payment", count: 8, active: false, color: "text-emerald-500 bg-emerald-50" },
    { label: "Paid", count: 116, active: false, color: "text-slate-500 bg-slate-50" },
];

export function KanbanFilters() {
    return (
        <div className="flex gap-4 overflow-x-auto pb-2">
            {filters.map((filter) => (
                <Card
                    key={filter.label}
                    className={cn(
                        "min-w-[150px] cursor-pointer transition-all hover:border-slate-400",
                        filter.active ? "border-slate-800 ring-1 ring-slate-800" : "border-slate-200"
                    )}
                >
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500">{filter.label}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold">{filter.count}</span>
                            {filter.color && (
                                <div className={cn("px-2 py-0.5 rounded-full text-xs font-medium", filter.color)}>
                                    {filter.count}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
