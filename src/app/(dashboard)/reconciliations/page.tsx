import { redirect } from "next/navigation"

// Moved to /bank?tab=reconciliation (simplification step 3). next.config.ts redirects this address
// permanently, keeping ?month=; this file is only a fallback and is removed in step 9.
export default async function OldReconciliationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams
    const month = Array.isArray(params.month) ? params.month[0] : params.month
    redirect(`/bank?tab=reconciliation${month ? `&month=${encodeURIComponent(month)}` : ""}`)
}
