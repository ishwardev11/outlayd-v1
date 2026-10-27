import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-6 w-72" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Skeleton className="h-75 w-full rounded-xl" />
          <div className="pt-2">
            <Skeleton className="h-7 w-40 mb-4" />
            <Skeleton className="h-100 w-full rounded-xl" />
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6 flex flex-col">
          <div className="h-48 shrink-0">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-125 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
