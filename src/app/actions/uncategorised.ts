"use server"

// The Uncategorised queue (invoices and AI plan, step 8), shown on the Inbox page. Lists what is in the
// books as Uncategorised (the same lines integrity check 1 counts), suggests a category for each, and
// saves the categories a person accepts. Suggestions: the contact's default category, then the one its
// entries used most (free, no AI); for the rest, on request, the AI picks from the organisation's own
// categories (paid plans, within the monthly AI limit). The database checks every save again
// (set_item_category: role, plan, kind of category, period lock).
import { revalidatePath } from "next/cache"
import { SchemaType, type GenerationConfig } from "@google/generative-ai"
import { createClient } from "@/utils/supabase/server"
import { checkWriteAccess, getOrganizationId } from "./document-utils"
import { getPlanState } from "@/utils/plan"
import { aiConfigured, generateFromText } from "@/lib/ai/gemini"
import { AiUserError, runAiAssist } from "@/lib/ai/usage"
import { ruleSuggestion, type CategoryOption, type CategorySuggestion } from "@/utils/category-suggest"

export type QueueKind = "document" | "transaction" | "invoice"

export interface QueueItem {
    key: string
    kind: QueueKind
    recordId: string
    lineId: string | null
    date: string
    direction: "in" | "out"
    // The kind of category it needs
    categoryKind: "income" | "expense"
    payeeId: string | null
    payeeName: string | null
    description: string | null
    amount: number
    suggestion: CategorySuggestion | null
}

export interface UncategorisedQueue {
    items: QueueItem[]
    categories: CategoryOption[]
    canWrite: boolean
    canUseAi: boolean
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AI_ITEMS = 25
type Supabase = Awaited<ReturnType<typeof createClient>>

const itemKey = (kind: string, record: string, line: string | null) => `${kind}:${record}:${line ?? ""}`

async function loadQueue(supabase: Supabase, organizationId: string, from: string | null, to: string | null) {
    const [items, cats, usage, payees] = await Promise.all([
        supabase.rpc("uncategorised_items", { p_org: organizationId, p_from: from, p_to: to }),
        supabase.from("categories").select("id, name, kind, archived_at, is_system").eq("organization_id", organizationId).order("name"),
        supabase.rpc("payee_category_usage", { p_org: organizationId }),
        supabase.from("vendors").select("id, default_category_id").eq("organization_id", organizationId).not("default_category_id", "is", null).limit(10000),
    ])
    if (items.error) throw new Error(items.error.message)
    const categories: CategoryOption[] = ((cats.data ?? []) as { id: string; name: string; kind: string; archived_at: string | null; is_system: boolean | null }[])
        .filter((c) => !c.archived_at && !c.is_system && (c.kind === "income" || c.kind === "expense"))
        .map((c) => ({ id: c.id, name: c.name, kind: c.kind as "income" | "expense" }))
    const usageMap = new Map<string, Map<string, number>>()
    for (const u of (usage.data ?? []) as { payee_id: string; category_id: string; uses: number }[]) {
        if (!usageMap.has(u.payee_id)) usageMap.set(u.payee_id, new Map())
        usageMap.get(u.payee_id)!.set(u.category_id, Number(u.uses))
    }
    const defaults = new Map(((payees.data ?? []) as { id: string; default_category_id: string | null }[]).map((p) => [p.id, p.default_category_id]))
    const ctx = { defaults, usage: usageMap, categories }

    const list: QueueItem[] = ((items.data ?? []) as Record<string, unknown>[]).map((r) => {
        const kind = r.kind as QueueKind
        const direction = r.direction === "in" ? "in" : "out"
        const categoryKind: "income" | "expense" = direction === "in" ? "income" : "expense"
        const payeeId = (r.payee_id as string | null) ?? null
        const payeeName = (r.payee_name as string | null) ?? null
        return {
            key: itemKey(kind, String(r.record_id), (r.line_id as string | null) ?? null),
            kind, recordId: String(r.record_id), lineId: (r.line_id as string | null) ?? null,
            date: String(r.item_date), direction, categoryKind, payeeId, payeeName,
            description: (r.description as string | null) ?? null, amount: Number(r.amount),
            suggestion: ruleSuggestion({ payeeId, payeeName, kind: categoryKind }, ctx),
        }
    })
    return { items: list, categories }
}

// from / to: limit the queue to a period (the Fix link of the integrity check), or both empty
export async function getUncategorisedQueue(from?: string | null, to?: string | null): Promise<UncategorisedQueue | null> {
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const supabase = await createClient()
    const f = from && ISO_RE.test(from) ? from : null
    const t = to && ISO_RE.test(to) ? to : null
    try {
        const [{ items, categories }, plan, canWrite] = await Promise.all([
            loadQueue(supabase, organizationId, f, t),
            getPlanState(supabase, organizationId),
            checkWriteAccess().then(() => true, () => false),
        ])
        return { items, categories, canWrite, canUseAi: canWrite && plan.paid && aiConfigured() }
    } catch (e) {
        console.error("getUncategorisedQueue failed:", e)
        return null
    }
}

const AI_PROMPT = `You help a small Malaysian organisation (a society, club, nonprofit or small business) put entries in its books into categories.
For each entry, choose the best category ONLY from the list given for that entry's kind (income or expense), using the payee name and description.
Return the category's id exactly as given. If none fits well, return null for that entry. Never invent a category.
Give a short reason (under 12 words), for example "Grab is a ride-hailing service".`

const aiSchema: GenerationConfig["responseSchema"] = {
    type: SchemaType.OBJECT,
    properties: {
        suggestions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    key: { type: SchemaType.STRING },
                    category_id: { type: SchemaType.STRING, nullable: true },
                    reason: { type: SchemaType.STRING, nullable: true },
                },
                required: ["key"],
            },
        },
    },
    required: ["suggestions"],
}

// The AI's suggestions for queue items that have no suggestion from the rules. Only the payee name,
// description and kind of each entry, and the organisation's own category names, are sent.
export async function suggestUncategorisedWithAi(keys: string[], from?: string | null, to?: string | null): Promise<{ success: true; data: Record<string, CategorySuggestion> } | { success: false; error: string }> {
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can change categories." }
    }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    if (!aiConfigured()) return { success: false, error: "AI suggestions are not set up yet. Choose the categories by hand." }
    const supabase = await createClient()
    const wanted = new Set((Array.isArray(keys) ? keys : []).map(String))
    let queue
    try {
        queue = await loadQueue(supabase, organizationId, from && ISO_RE.test(from) ? from : null, to && ISO_RE.test(to) ? to : null)
    } catch {
        return { success: false, error: "The queue could not be loaded. Please try again." }
    }
    // Read again from the database: what is sent never comes from the browser
    const items = queue.items.filter((i) => wanted.has(i.key) && !i.suggestion).slice(0, MAX_AI_ITEMS)
    if (items.length === 0) return { success: true, data: {} }
    const byKind = (k: "income" | "expense") => queue.categories.filter((c) => c.kind === k)
    if (byKind("expense").length === 0 && byKind("income").length === 0) return { success: false, error: "Add some categories first, in Settings → Funds & Categories." }

    const payload = {
        categories: {
            expense: byKind("expense").map((c) => ({ id: c.id, name: c.name })),
            income: byKind("income").map((c) => ({ id: c.id, name: c.name })),
        },
        entries: items.map((i) => ({ key: i.key, kind: i.categoryKind, payee: i.payeeName ?? "", description: (i.description ?? "").slice(0, 200) })),
    }
    const res = await runAiAssist(organizationId, "categorise", async () => {
        const result = await generateFromText({
            prompt: `${AI_PROMPT}\n\n${JSON.stringify(payload)}`,
            schema: aiSchema,
            temperature: 0,
            timeoutMs: 30_000,
            retries: 1,
            retryDelayMs: () => 1000,
        })
        try {
            return JSON.parse(result.response.text()) as { suggestions?: { key?: string; category_id?: string | null; reason?: string | null }[] }
        } catch {
            throw new AiUserError("The AI could not suggest categories this time. Please choose them by hand.")
        }
    })
    if (!res.ok) return { success: false, error: res.error }

    const out: Record<string, CategorySuggestion> = {}
    const byKey = new Map(items.map((i) => [i.key, i]))
    for (const s of res.value.suggestions ?? []) {
        const item = s.key ? byKey.get(s.key) : undefined
        // Only one of the organisation's own categories, of the right kind: anything else is dropped
        const cat = item && s.category_id ? queue.categories.find((c) => c.id === s.category_id && c.kind === item.categoryKind) : undefined
        if (!item || !cat) continue
        const why = (s.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 100)
        out[item.key] = { categoryId: cat.id, reason: why ? `AI: ${why}` : "Suggested by the AI", source: "ai" }
    }
    return { success: true, data: out }
}

export interface AcceptChoice {
    kind: QueueKind
    recordId: string
    lineId: string | null
    categoryId: string
    // "Always use this category for <payee>": also set it as the contact's default (expenses only)
    alwaysForPayeeId?: string | null
}

// Saves the categories the person accepted, one by one. Each is checked again by the database; the
// ones it refuses (for example in a locked period) are reported and the rest are saved.
export async function acceptCategories(choices: AcceptChoice[]): Promise<{ success: true; data: { saved: number; failed: { key: string; error: string }[] } } | { success: false; error: string }> {
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can change categories." }
    }
    if (!Array.isArray(choices) || choices.length === 0) return { success: false, error: "Nothing to save" }
    if (choices.length > 500) return { success: false, error: "At most 500 at a time" }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const supabase = await createClient()
    const { data: catRows } = await supabase.from("categories").select("id, kind").eq("organization_id", organizationId)
    const kindOf = new Map(((catRows ?? []) as { id: string; kind: string }[]).map((c) => [c.id, c.kind]))

    let saved = 0
    const failed: { key: string; error: string }[] = []
    const defaults = new Map<string, string>()
    for (const c of choices) {
        const key = itemKey(String(c?.kind), String(c?.recordId), c?.lineId ?? null)
        if (!["document", "transaction", "invoice"].includes(c?.kind) || !UUID_RE.test(c?.recordId ?? "") || !UUID_RE.test(c?.categoryId ?? "")
            || (c.lineId !== null && c.lineId !== undefined && !UUID_RE.test(c.lineId))) {
            failed.push({ key, error: "That entry could not be read" })
            continue
        }
        const { error } = await supabase.rpc("set_item_category", { p_kind: c.kind, p_record: c.recordId, p_line: c.lineId ?? null, p_category: c.categoryId })
        if (error) {
            failed.push({ key, error: error.message.replace(/ An Admin can unlock it in Settings\.?$/, "") || "Could not save" })
            continue
        }
        saved++
        if (c.alwaysForPayeeId && UUID_RE.test(c.alwaysForPayeeId) && kindOf.get(c.categoryId) === "expense") defaults.set(c.alwaysForPayeeId, c.categoryId)
    }
    for (const [payeeId, categoryId] of defaults) {
        const { error } = await supabase.from("vendors").update({ default_category_id: categoryId }).eq("id", payeeId).eq("organization_id", organizationId)
        if (error) console.error("Could not set a default category:", error.message)
    }
    revalidatePath("/inbox")
    revalidatePath("/transactions")
    revalidatePath("/invoices")
    revalidatePath("/reports")
    revalidatePath("/contacts")
    return { success: true, data: { saved, failed } }
}
