import { redirect } from "next/navigation";

// The Ledger was split in simplification step 4: the review queue is /inbox, the cash book is
// /transactions, and unpaid bills are in /invoices. next.config.ts redirects every old address
// permanently (keeping the query string); this file is only a fallback and is removed in step 9.
export default async function OldLedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const sp = await searchParams;
    const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const view = first(sp.view);
    const status = first(sp.status);
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
        if (k === "view" || k === "status") continue;
        const value = first(v);
        if (value) rest.set(k, value);
    }
    const qs = rest.toString();
    if (view === "cash") redirect(`/transactions${qs ? `?${qs}` : ""}`);
    if (status === "awaiting_payment") redirect("/invoices?status=unpaid");
    if (status === "paid") redirect("/transactions?type=money_out");
    redirect("/inbox");
}
