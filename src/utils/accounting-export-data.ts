import type { createClient } from "@/utils/supabase/server"
import type { ExportEntry, ExportLookups, ExportParams } from "@/utils/accounting-export"
import type { CategoryRow, IdName } from "@/utils/row-types"

type Supabase = Awaited<ReturnType<typeof createClient>>

const PAGE_SIZE = 1000
const IN_CHUNK = 200
// An accounting export must be complete, so a range with more entries than this is refused
// instead of being cut off silently.
export const EXPORT_MAX_ENTRIES = 20000

const COLUMNS =
    "id, tx_type, tx_date, payee_name, reference, remarks, source, document_id, is_refund, account_id, " +
    "lines:transaction_lines(line_no, amount, fund_id, category_id, invoice_id, item_id)"

async function inChunks<T>(ids: string[], read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const { data, error } = await read(ids.slice(i, i + IN_CHUNK))
        if (error) {
            console.error("Accounting export lookup failed:", error)
            throw new Error("Failed to load the export")
        }
        out.push(...(data ?? []))
    }
    return out
}

// Reads money in and money out from the cash book (transactions) through the user's own session, so
// row-level security limits it to their organisation. Dated by the date the money moved.
export async function loadExportData(
    supabase: Supabase,
    organizationId: string,
    params: ExportParams
): Promise<{ entries: ExportEntry[]; lookups: ExportLookups } | { tooMany: true }> {
    const entries: ExportEntry[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        if (from >= EXPORT_MAX_ENTRIES) return { tooMany: true }
        const { data, error } = await supabase
            .from("transactions")
            .select(COLUMNS)
            .eq("organization_id", organizationId)
            .in("tx_type", ["money_in", "money_out"])
            .gte("tx_date", params.from)
            .lte("tx_date", params.to)
            .order("tx_date", { ascending: true })
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
        if (error) {
            console.error("Accounting export query failed:", error)
            throw new Error("Failed to load the cash book")
        }
        const chunk = (data ?? []) as unknown as ExportEntry[]
        entries.push(...chunk)
        if (chunk.length < PAGE_SIZE) break
    }

    const invoiceIds = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.invoice_id)).filter((x): x is string => !!x))]
    const itemIds = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.item_id)).filter((x): x is string => !!x))]
    const documentIds = [...new Set(entries.map((e) => e.document_id).filter((x): x is string => !!x))]

    const [fundsRes, catsRes, accountsRes, invoices, items, documents] = await Promise.all([
        supabase.from("funds").select("id, name").eq("organization_id", organizationId),
        supabase.from("categories").select("id, name, account_code").eq("organization_id", organizationId),
        supabase.from("accounts").select("id, name").eq("organization_id", organizationId),
        inChunks<{ id: string; invoice_no: string | null; due_date: string | null; direction: string }>(invoiceIds, (ids) =>
            supabase.from("invoices").select("id, invoice_no, due_date, direction").eq("organization_id", organizationId).in("id", ids)),
        inChunks<{ id: string; name: string; kind: string }>(itemIds, (ids) =>
            supabase.from("items").select("id, name, kind").eq("organization_id", organizationId).in("id", ids)),
        inChunks<{ id: string; original_currency: string | null; original_amount: number | string | null; exchange_rate: number | string | null }>(documentIds, (ids) =>
            supabase.from("documents").select("id, original_currency, original_amount, exchange_rate").eq("organization_id", organizationId).in("id", ids)),
    ])
    for (const res of [fundsRes, catsRes, accountsRes]) {
        if (res.error) {
            console.error("Accounting export lookup failed:", res.error)
            throw new Error("Failed to load the export")
        }
    }

    const lookups: ExportLookups = {
        funds: new Map((fundsRes.data ?? []).map((f: IdName) => [f.id, { name: f.name }])),
        categories: new Map((catsRes.data ?? []).map((c: CategoryRow) => [c.id, { name: c.name, account_code: c.account_code ?? null }])),
        accounts: new Map((accountsRes.data ?? []).map((a: IdName) => [a.id, { name: a.name }])),
        invoices: new Map(invoices.map((i) => [i.id, {
            invoice_no: i.invoice_no, due_date: i.due_date, direction: i.direction === "receivable" ? "receivable" as const : "payable" as const,
        }])),
        items: new Map(items.map((i) => [i.id, {
            name: i.name, kind: (i.kind === "fixed_asset" || i.kind === "liability" ? i.kind : "other_asset") as "fixed_asset" | "other_asset" | "liability",
        }])),
        documents: new Map(documents.map((d) => [d.id, d])),
    }
    return { entries, lookups }
}
