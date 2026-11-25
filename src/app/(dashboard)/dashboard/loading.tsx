import { Skeleton } from "@/components/ui/skeleton";

// Matches the dashboard's working layout: greeting with buttons, four KPI cards (the first tinted), cash
// flow beside Needs attention, then fund balances and recent activity. The Getting started card is left
// out because whether it shows is only known once the data has loaded.
const panel = "rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500" aria-busy="true" aria-label="Loading the dashboard">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-56 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`${i === 1 ? "rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/40" : panel} p-4 sm:p-5 space-y-3`}>
            <div className="flex items-center gap-2.5"><Skeleton className="h-8 w-8 rounded-lg" /><Skeleton className="h-3 w-24" /></div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${panel} p-5 lg:col-span-2 space-y-4`}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-60 w-full rounded-lg" />
        </div>
        <div className={`${panel} p-5 space-y-3`}>
          <Skeleton className="h-5 w-36" />
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className={`${panel} p-5 space-y-3`}>
            <Skeleton className="h-5 w-36" />
            {[1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-9 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
