// The Inbox (simplification step 4): uploads that are still being read, waiting for review, or flagged
// as possible duplicates. Once approved, a receipt paid on the spot is in Transactions and an unpaid
// bill is in Bills & Invoices, so the Inbox never shows approved documents.
// Pure functions only, so they are easy to test.

export type InboxStatus = "all" | "extracting" | "needs_review" | "duplicate"

// Database statuses behind each filter. "verified" and "PENDING" are older statuses that were never
// approved, so they wait for review here too.
export const INBOX_DB_STATUSES: Record<Exclude<InboxStatus, "all">, string[]> = {
    extracting: ["extracting"],
    needs_review: ["needs_review", "verified", "PENDING"],
    duplicate: ["DUPLICATE_WARNING"],
}
export const ALL_INBOX_DB_STATUSES = Object.values(INBOX_DB_STATUSES).flat()

export const INBOX_PAGE_SIZE = 25

export interface InboxFilters {
    status: InboxStatus
    q: string
    page: number
}

export interface InboxCounts {
    all: number
    extracting: number
    needs_review: number
    duplicate: number
}

type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "")

export function parseInboxFilters(sp: SearchParams): InboxFilters {
    const status = first(sp.status)
    const page = Number.parseInt(first(sp.page), 10)
    return {
        status: status === "extracting" || status === "needs_review" || status === "duplicate" ? status : "all",
        q: first(sp.q).trim().replace(/^#/, "").slice(0, 80),
        page: Number.isFinite(page) && page > 0 ? page : 1,
    }
}

export function inboxDbStatuses(status: InboxStatus): string[] {
    return status === "all" ? ALL_INBOX_DB_STATUSES : INBOX_DB_STATUSES[status]
}

// Where an approved upload goes, for the approve toast: a receipt (paid on the spot) becomes money out
// in Transactions; anything else is a bill to pay in Bills & Invoices.
export function approvedDestination(documentType: string | null | undefined): { label: string; href: string; message: string } {
    return documentType === "receipt"
        ? { label: "Open Transactions", href: "/transactions?type=money_out", message: "Approved. It is now in Transactions as money out." }
        : { label: "Open Bills to pay", href: "/invoices?status=unpaid", message: "Approved. It is now in Bills & Invoices, under Bills to pay." }
}

// The Inbox search: the payee, the invoice number and the user's own remarks. Never `notes`, which holds
// the AI's extraction error messages and is not shown to users. Characters that mean something in a
// PostgREST filter (\ % _ , ( )) are escaped, so a search for "50%" or "a,b" matches literally.
export function inboxSearchFilter(q: string): string {
    const like = `%${q.replace(/[\\%_,()]/g, (c) => "\\" + c)}%`
    return `vendor_name.ilike.${like},invoice_number.ilike.${like},remarks.ilike.${like}`
}
