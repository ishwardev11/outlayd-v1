import { redirect } from "next/navigation"

// Moved to /bank/[id] (simplification step 3). next.config.ts redirects this address permanently;
// this file is only a fallback and is removed in step 9.
export default async function OldBankStatementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    redirect(`/bank/${encodeURIComponent(id)}`)
}
