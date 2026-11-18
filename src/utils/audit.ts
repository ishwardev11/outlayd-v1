// Shared types and wording for the document audit log (see the document_audit_log table).

export interface AuditEntry {
    id: string
    document_id: string
    action: string
    from_status: string | null
    to_status: string | null
    actor_email: string | null
    actor_name: string | null
    actor_role: string | null
    details: {
        vendor_name?: string | null
        invoice_number?: string | null
        document_type?: string | null
        document_date?: string | null
        amount?: number | string | null
        original_currency?: string | null
        original_amount?: number | string | null
    } | null
    created_at: string
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
    approved: "Approved",
    approved_and_paid: "Approved and marked paid",
    paid: "Marked as paid",
    marked_unpaid: "Moved back to awaiting payment",
    returned_to_review: "Sent back for review",
    deleted: "Deleted",
}

export function auditActionLabel(action: string): string {
    return AUDIT_ACTION_LABELS[action] ?? action
}

// A person's name if we have one, otherwise their email. No person means a system change.
export function auditActorLabel(entry: Pick<AuditEntry, "actor_name" | "actor_email">): string {
    return entry.actor_name?.trim() || entry.actor_email || "System"
}
