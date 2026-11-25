// Category suggestions from a contact's own history (invoices and AI plan, step 8). Pure, so it is
// tested. Used by the Contacts page ("suggested category") and the Uncategorised queue. Rules first,
// no AI: the contact's default category, then the category its entries used most. The AI is only
// asked about what these cannot answer (src/app/actions/uncategorised.ts).
import type { SplitRow } from "./row-types"

// How often each category appears on these records (a record's own category and each of its splits)
export function countCategories(records: { category_id?: string | null; splits?: (SplitRow | null)[] | null }[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const r of records) {
        if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1)
        if (Array.isArray(r.splits)) {
            for (const s of r.splits) if (s?.category_id) counts.set(s.category_id, (counts.get(s.category_id) ?? 0) + 1)
        }
    }
    return counts
}

// The category used most (the first one seen wins a tie), or null
export function mostUsed(counts: Map<string, number>, allowed?: (id: string) => boolean): { id: string; count: number } | null {
    let best: { id: string; count: number } | null = null
    for (const [id, count] of counts) {
        if (allowed && !allowed(id)) continue
        if (!best || count > best.count) best = { id, count }
    }
    return best
}

export interface CategoryOption { id: string; name: string; kind: "income" | "expense" }

export interface CategorySuggestion {
    categoryId: string
    reason: string
    source: "default" | "history" | "ai"
}

// A suggestion for one entry from its contact: the default category (when it is of the right kind),
// otherwise the one its entries used most. Null when there is no history to go on.
export function ruleSuggestion(
    item: { payeeId: string | null; payeeName: string | null; kind: "income" | "expense" },
    ctx: { defaults: Map<string, string | null>; usage: Map<string, Map<string, number>>; categories: CategoryOption[] },
): CategorySuggestion | null {
    if (!item.payeeId) return null
    const byId = new Map(ctx.categories.map((c) => [c.id, c]))
    const fits = (id: string) => byId.get(id)?.kind === item.kind
    const name = item.payeeName?.trim() || "this contact"

    const def = ctx.defaults.get(item.payeeId)
    if (def && fits(def)) return { categoryId: def, reason: `Default category for ${name}`, source: "default" }

    const top = mostUsed(ctx.usage.get(item.payeeId) ?? new Map(), fits)
    if (top) return { categoryId: top.id, reason: `Used for ${name} ${top.count} ${top.count === 1 ? "time" : "times"}`, source: "history" }
    return null
}
