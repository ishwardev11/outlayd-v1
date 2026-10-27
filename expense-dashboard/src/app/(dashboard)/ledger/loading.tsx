import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-6 w-96" />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Skeleton className="h-10 w-full sm:w-64" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
        <Skeleton className="h-8 w-20 rounded-full ml-auto" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-150 w-full rounded-xl" />
      </div>
    </div>
  );
}
