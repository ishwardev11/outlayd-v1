"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId } from "./document-utils"
import type { AuditEntry } from "@/utils/audit"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const COLUMNS =
    "id, document_id, action, from_status, to_status, actor_email, actor_name, actor_role, details, created_at"

// The history of one document, newest first. Entries are written by database triggers and can only
// be read here (row-level security limits them to the user's own organisation).
export async function getDocumentAuditLog(documentId: string): Promise<AuditEntry[]> {
    if (typeof documentId !== "string" || !UUID_RE.test(documentId)) return []
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    if (!organization_id) return []

    const { data, error } = await supabase
        .from("document_audit_log")
        .select(COLUMNS)
        .eq("organization_id", organization_id)
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(50)

    if (error) {
        console.error("Supabase Error (getDocumentAuditLog):", error)
        return []
    }
    return (data ?? []) as AuditEntry[]
}

// One page of the organisation-wide audit log, newest first.
export async function getAuditLog(page = 1, pageSize = 50): Promise<{ entries: AuditEntry[]; total: number }> {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    if (!organization_id) return { entries: [], total: 0 }

    const safePage = Number.isInteger(page) && page > 0 ? page : 1
    const from = (safePage - 1) * pageSize

    const { data, count, error } = await supabase
        .from("document_audit_log")
        .select(COLUMNS, { count: "exact" })
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1)

    if (error) {
        console.error("Supabase Error (getAuditLog):", error)
        return { entries: [], total: 0 }
    }
    return { entries: (data ?? []) as AuditEntry[], total: count ?? 0 }
}
