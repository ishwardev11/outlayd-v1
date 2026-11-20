// Shared types for values the app reads without generated database types, plus safe helpers for
// errors caught as `unknown`. These describe the fields the code actually uses; they do not change
// what is selected from the database.

// ------------------------------------------------------------------ errors

// The message of anything thrown, or "" when it has none (so `errorMessage(e) || "fallback"` works)
export function errorMessage(e: unknown): string {
    if (e instanceof Error) return e.message
    if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message
    return ""
}

// One property of anything thrown (for example `status`, `code` or `name`), or undefined
export function errorProp(e: unknown, key: string): unknown {
    return e && typeof e === "object" ? (e as Record<string, unknown>)[key] : undefined
}

// ------------------------------------------------------------------ rows

export type Money = number | string | null

export interface IdName {
    id: string
    name: string
}

export interface ExtractionFlagRow {
    code: string
    message: string
}

export interface SplitRow {
    amount?: Money
    fund_id?: string | null
    category_id?: string | null
}

export interface LineItemRow {
    description?: string
    quantity?: number
    unit_price?: number
    total?: number
    amount?: number
}

export interface FundRow extends IdName {
    archived_at?: string | null
    is_archived?: boolean | null
    is_default?: boolean
}

export interface CategoryRow extends IdName {
    account_code?: string | null
    archived_at?: string | null
}

export interface DocumentRow {
    id: string
    organization_id?: string | null
    status: string | null
    vendor_name: string | null
    vendor_id?: string | null
    amount: Money
    subtotal?: Money
    tax_amount?: Money
    document_date?: string | null
    due_date?: string | null
    paid_date?: string | null
    document_type?: string | null
    invoice_number?: string | null
    reference_number?: string | null
    image_url?: string | null
    notes?: string | null
    remarks?: string | null
    fund_id?: string | null
    category_id?: string | null
    splits?: SplitRow[] | null
    line_items?: LineItemRow[] | null
    extraction_flags?: ExtractionFlagRow[] | null
    confidence_score?: number | null
    original_currency?: string | null
    original_amount?: Money
    exchange_rate?: Money
    exchange_rate_source?: "ecb" | "manual" | null
    created_at?: string
    updated_at?: string | null
    extraction_started_at?: string | null
    funds?: { name: string } | null
    categories?: { name: string } | null
}
