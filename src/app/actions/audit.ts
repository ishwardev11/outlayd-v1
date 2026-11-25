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
