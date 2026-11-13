// Allowlists for fields the browser may change on documents and vendors.
// Anything not listed here (organization_id, image_url, file_hash, created_at, ...) is dropped.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DOCUMENT_STATUSES = [
    "extracting",
    "needs_review",
    "awaiting_payment",
    "paid",
    "DUPLICATE_WARNING",
    "rejected",
    "error",
] as const

const DOCUMENT_TEXT_FIELDS: Record<string, number> = {
    vendor_name: 255,
    invoice_number: 255,
    reference_number: 255,
    document_type: 50,
    vendor_branch_or_location: 255,
    notes: 5000,
}
const DOCUMENT_DATE_FIELDS = ["document_date", "due_date"]
const DOCUMENT_NUMBER_FIELDS = ["amount", "subtotal", "tax_amount", "confidence_score"]
const DOCUMENT_ID_FIELDS = ["vendor_id", "fund_id", "category_id"]
const DOCUMENT_ARRAY_FIELDS = ["splits", "line_items"]

const MAX_ARRAY_ITEMS = 200
const MAX_JSON_CHARS = 200_000

export class UpdateValidationError extends Error { }

function cleanText(key: string, value: unknown, max: number): string | null {
    if (value === null || value === undefined) return null
    // AI extraction sometimes returns numbers for invoice / reference numbers
    if (typeof value === "number" && Number.isFinite(value)) value = String(value)
    if (typeof value !== "string") throw new UpdateValidationError(`${key} must be text`)
    return value.length > max ? value.slice(0, max) : value
}

function cleanNumber(key: string, value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null
    const n = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new UpdateValidationError(`${key} must be a valid number`)
    return n
}

function cleanId(key: string, value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null
    if (typeof value !== "string" || !UUID_RE.test(value)) throw new UpdateValidationError(`${key} is not valid`)
    return value
}

export function sanitizeDocumentUpdates(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new UpdateValidationError("Invalid update")
    }
    const src = input as Record<string, unknown>
    const out: Record<string, unknown> = {}

    for (const key of Object.keys(src)) {
        const value = src[key]
        if (value === undefined) continue // undefined means "leave unchanged"
        if (key in DOCUMENT_TEXT_FIELDS) {
            out[key] = cleanText(key, value, DOCUMENT_TEXT_FIELDS[key])
        } else if (DOCUMENT_DATE_FIELDS.includes(key)) {
            out[key] = cleanText(key, value, 40) || null
        } else if (DOCUMENT_NUMBER_FIELDS.includes(key)) {
            out[key] = cleanNumber(key, value)
        } else if (DOCUMENT_ID_FIELDS.includes(key)) {
            out[key] = cleanId(key, value)
        } else if (DOCUMENT_ARRAY_FIELDS.includes(key)) {
            if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS || JSON.stringify(value).length > MAX_JSON_CHARS) {
                throw new UpdateValidationError(`${key} is not valid`)
            }
            out[key] = value
        } else if (key === "status") {
            if (!(DOCUMENT_STATUSES as readonly string[]).includes(value as string)) {
                throw new UpdateValidationError("status is not valid")
            }
            out[key] = value
        } else {
            console.warn(`updateDocument: ignoring field "${key}"`)
        }
    }
    return out
}

export function sanitizeVendorUpdates(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new UpdateValidationError("Invalid update")
    }
    const src = input as Record<string, unknown>
    const out: Record<string, unknown> = {}

    for (const key of Object.keys(src)) {
        const value = src[key]
        if (value === undefined) continue
        if (key === "name") {
            const name = cleanText(key, value, 255)?.trim()
            if (!name) throw new UpdateValidationError("name is required")
            out[key] = name
        } else if (key === "default_category_id" || key === "default_fund_id") {
            out[key] = cleanId(key, value)
        } else {
            console.warn(`updateVendor: ignoring field "${key}"`)
        }
    }
    return out
}

// Every referenced id must belong to the caller's organisation. Reads go through the user's
// own session, so row-level security only returns rows from their active organisation.
export async function assertOwnedIds(
    supabase: { from: (table: string) => any },
    table: "funds" | "categories" | "vendors",
    ids: unknown[]
) {
    const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && x !== ""))]
    if (unique.length === 0) return
    const { data, error } = await supabase.from(table).select("id").in("id", unique)
    if (error || !data || data.length !== unique.length) {
        throw new UpdateValidationError(`Invalid ${table.slice(0, -1)} reference`)
    }
}
// --- Fund (grant) details used by the Donor & Audit Memo ---

const FUND_TEXT_FIELDS: Record<string, number> = {
    donor_name: 255,
    grant_reference: 100,
    purpose: 2000,
}
const FUND_DATE_FIELDS = ["period_start", "period_end"]
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function cleanIsoDate(key: string, value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null
    if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
        throw new UpdateValidationError(`${key} must be a date (YYYY-MM-DD)`)
    }
    const d = new Date(`${value}T00:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        throw new UpdateValidationError(`${key} is not a valid date`)
    }
    return value
}

export function sanitizeFundDetails(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new UpdateValidationError("Invalid update")
    }
    const src = input as Record<string, unknown>
    const out: Record<string, unknown> = {}

    for (const key of Object.keys(src)) {
        const value = src[key]
        if (value === undefined) continue
        if (key in FUND_TEXT_FIELDS) {
            out[key] = cleanText(key, value, FUND_TEXT_FIELDS[key])?.trim() || null
        } else if (key === "award_amount") {
            const n = cleanNumber(key, value)
            if (n !== null && n < 0) throw new UpdateValidationError("award_amount cannot be negative")
            out[key] = n
        } else if (FUND_DATE_FIELDS.includes(key)) {
            out[key] = cleanIsoDate(key, value)
        } else {
            console.warn(`updateFundDetails: ignoring field "${key}"`)
        }
    }

    const start = out.period_start as string | null | undefined
    const end = out.period_end as string | null | undefined
    if (start && end && start > end) {
        throw new UpdateValidationError("Grant period start must be on or before the end date")
    }
    return out
}
