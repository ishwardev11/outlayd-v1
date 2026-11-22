import { getReconciliationPage } from "@/app/actions/assurance"
import { ReconciliationsClient } from "@/components/reconciliations/ReconciliationsClient"

export const dynamic = "force-dynamic"

// Reconciliations (spec 3.9): each account against its bank statement at a month-end. Everyone in the
// organisation can see them; recording needs Admin or Editor on a paid plan, checked again in the database.
export default async function ReconciliationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams
    const month = Array.isArray(params.month) ? params.month[0] : params.month
    const data = await getReconciliationPage(month ?? null)
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
            {data ? <ReconciliationsClient data={data} /> : <p className="text-slate-500">No active organisation.</p>}
        </div>
    )
}
