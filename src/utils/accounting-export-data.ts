import type { createClient } from "@/utils/supabase/server"
import type { ExportDocument, ExportLookups, ExportParams } from "@/utils/accounting-export"

type Supabase = Awaited<ReturnType<typeof createClient>>

const PAGE_SIZE = 1000
// An accounting export must be complete, so a range with more documents than this is refused
// instead of being cut off silently.
export const EXPORT_MAX_DOCUMENTS = 20000

const COLUMNS =
    "id, vendor_name, amount, document_date, due_date, paid_date, document_type, status, fund_id, category_id, splits, invoice_number, reference_number, original_currency, original_amount, exchange_rate"

// Reads approved documents for the export through the user's own session, so row-level security
// limits it to their organisation.
export async function loadExportData(
    supabase: Supabase,
    organizationId: string,
    params: ExportParams
): Promise<{ docs: ExportDocument[]; lookups: ExportLookups } | { tooMany: true }> {
    const statuses = params.scope === "paid" ? ["paid"] : ["awaiting_payment", "paid"]

    const docs: ExportDocument[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        if (from >= EXPORT_MAX_DOCUMENTS) return { tooMany: true }
        const { data, error } = await supabase
            .from("documents")
            .select(COLUMNS)
            .eq("organization_id", organizationId)
            .in("status", statuses)
            .gte(params.dateField, params.from)
            .lte(params.dateField, params.to)
            .order(params.dateField, { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
        if (error) {
            console.error("Accounting export query failed:", error)
            throw new Error("Failed to load documents")
        }
        const chunk = (data ?? []) as ExportDocument[]
        docs.push(...chunk)
        if (chunk.length < PAGE_SIZE) break
    }

    const [fundsRes, catsRes] = await Promise.all([
        supabase.from("funds").select("id, name").eq("organization_id", organizationId),
        supabase.from("categories").select("id, name, account_code").eq("organization_id", organizationId),
    ])
    const lookups: ExportLookups = {
        funds: new Map((fundsRes.data ?? []).map((f: any) => [f.id, { name: f.name }])),
        categories: new Map((catsRes.data ?? []).map((c: any) => [c.id, { name: c.name, account_code: c.account_code ?? null }])),
    }
    return { docs, lookups }
}
