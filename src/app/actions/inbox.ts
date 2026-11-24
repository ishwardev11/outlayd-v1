"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId } from "./document-utils"
import { INBOX_DB_STATUSES, INBOX_PAGE_SIZE, inboxDbStatuses, type InboxCounts, type InboxFilters } from "@/utils/inbox"
import type { DocumentRow, IdName } from "@/utils/row-types"

// The Inbox (simplification step 4): one page of uploads still being read, waiting for review or
// flagged as possible duplicates, read through the user's own session (row-level security). Approved
// documents live in Transactions (paid) and Bills & Invoices (unpaid), never here.

export async function getInboxPage(filters: InboxFilters): Promise<{ documents: DocumentRow[]; total: number; page: number; pageSize: number }> {
    const supabase = await createClient()
    const orgId = await getOrganizationId()
    if (!orgId) return { documents: [], total: 0, page: 1, pageSize: INBOX_PAGE_SIZE }

    const run = (page: number) => {
        let q = supabase.from("documents").select("*", { count: "exact" })
            .eq("organization_id", orgId)
            .in("status", inboxDbStatuses(filters.status))
        if (filters.q) {
            const like = `%${filters.q.replace(/[\\%_,()]/g, (c) => "\\" + c)}%`
            q = q.or(`vendor_name.ilike.${like},invoice_number.ilike.${like},remarks.ilike.${like}`)
        }
        return q.order("created_at", { ascending: false }).order("id", { ascending: false })
            .range((page - 1) * INBOX_PAGE_SIZE, page * INBOX_PAGE_SIZE - 1)
    }

    let page = Math.max(1, filters.page)
    let res = await run(page)
    // A page past the end (e.g. after approving the last row of the last page): back to page 1
    if (res.error?.code === "PGRST103" && page > 1) {
        page = 1
        res = await run(page)
    }
    if (res.error) {
        console.error("getInboxPage failed:", res.error)
        throw new Error("Failed to load the inbox")
    }

    const [fundsRes, catsRes] = await Promise.all([
        supabase.from("funds").select("id, name").eq("organization_id", orgId),
        supabase.from("categories").select("id, name").eq("organization_id", orgId),
    ])
    const fundNames = new Map<string, string>(((fundsRes.data ?? []) as IdName[]).map((f) => [f.id, f.name]))
    const catNames = new Map<string, string>(((catsRes.data ?? []) as IdName[]).map((c) => [c.id, c.name]))
    const documents = ((res.data ?? []) as DocumentRow[]).map((d) => {
        const fundName = d.fund_id ? fundNames.get(d.fund_id) : undefined
        const catName = d.category_id ? catNames.get(d.category_id) : undefined
        return {
            ...d,
            funds: d.fund_id && fundName !== undefined ? { id: d.fund_id, name: fundName } : null,
            categories: d.category_id && catName !== undefined ? { id: d.category_id, name: catName } : null,
        }
    })
    return { documents, total: res.count ?? documents.length, page, pageSize: INBOX_PAGE_SIZE }
}

export async function getInboxCounts(): Promise<InboxCounts> {
    const supabase = await createClient()
    const orgId = await getOrganizationId()
    const zero: InboxCounts = { all: 0, extracting: 0, needs_review: 0, duplicate: 0 }
    if (!orgId) return zero
    const count = async (statuses: string[]) => {
        const { count: n, error } = await supabase.from("documents").select("id", { count: "exact", head: true })
            .eq("organization_id", orgId).in("status", statuses)
        if (error) console.error("getInboxCounts failed:", error)
        return n ?? 0
    }
    const [extracting, needs_review, duplicate] = await Promise.all([
        count(INBOX_DB_STATUSES.extracting), count(INBOX_DB_STATUSES.needs_review), count(INBOX_DB_STATUSES.duplicate),
    ])
    return { all: extracting + needs_review + duplicate, extracting, needs_review, duplicate }
}
