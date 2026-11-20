// Checks what the Money in and Money out forms send, before anything reaches the database.
// Pure functions (no database code), so they are easy to test. The database checks again.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_LINES = 50

export interface EntryLineInput {
    amount: number
    fund_id: string | null
    category_id: string
}

export interface MoneyInInput {
    id: string | null
    tx_date: string
    account_id: string | null
    payee_id: string | null
    payee_name: string | null
    reference: string | null
    remarks: string | null
    is_refund: boolean
    lines: EntryLineInput[]
}

export interface MoneyOutInput {
    tx_date: string
    payee_id: string | null
    payee_name: string
    reference: string | null
    remarks: string | null
    lines: EntryLineInput[]
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

function realDate(v: unknown): string | null {
    if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return null
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

function optionalUuid(v: unknown): string | null | undefined {
    if (v === null || v === undefined || v === "") return null
    return typeof v === "string" && UUID_RE.test(v) ? v : undefined
}

function text(v: unknown, max: number): string | null | undefined {
    if (v === null || v === undefined) return null
    if (typeof v !== "string") return undefined
    const t = v.trim()
    if (t.length > max) return undefined
    return t === "" ? null : t
}

// An amount above zero with at most two decimals, from a number or a typed string
export function parseAmount(v: unknown): number | null {
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(/,/g, "") : ""
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
    const n = Number(s)
    return n > 0 && Number.isFinite(n) ? n : null
}

function parseLines(raw: unknown): Result<EntryLineInput[]> {
    if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Add at least one line" }
    if (raw.length > MAX_LINES) return { ok: false, error: `An entry can have at most ${MAX_LINES} lines` }
    const lines: EntryLineInput[] = []
    for (const [i, l] of raw.entries()) {
        const line = (l ?? {}) as Record<string, unknown>
        const amount = parseAmount(line.amount)
        if (amount === null) return { ok: false, error: `Line ${i + 1}: enter an amount above zero (at most two decimals)` }
        const category = optionalUuid(line.category_id)
        if (!category) return { ok: false, error: `Line ${i + 1}: choose a category` }
        const fund = optionalUuid(line.fund_id)
        if (fund === undefined) return { ok: false, error: `Line ${i + 1}: choose a valid fund` }
        lines.push({ amount, fund_id: fund, category_id: category })
    }
    return { ok: true, value: lines }
}

export function parseMoneyInInput(raw: unknown): Result<MoneyInInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = optionalUuid(r.id)
    if (id === undefined) return { ok: false, error: "That entry could not be found" }
    const tx_date = realDate(r.tx_date)
    if (!tx_date) return { ok: false, error: "Enter the date the money was received" }
    const account_id = optionalUuid(r.account_id)
    if (account_id === undefined) return { ok: false, error: "Choose a valid account" }
    const payee_id = optionalUuid(r.payee_id)
    if (payee_id === undefined) return { ok: false, error: "Choose a valid payee" }
    const payee_name = text(r.payee_name, 255)
    if (payee_name === undefined) return { ok: false, error: "The payee name is too long" }
    const reference = text(r.reference, 100)
    if (reference === undefined) return { ok: false, error: "The reference can be at most 100 characters" }
    const remarks = text(r.remarks, 500)
    if (remarks === undefined) return { ok: false, error: "Remarks can be at most 500 characters" }
    const lines = parseLines(r.lines)
    if (!lines.ok) return lines
    return {
        ok: true,
        value: { id, tx_date, account_id, payee_id, payee_name, reference, remarks, is_refund: r.is_refund === true, lines: lines.value },
    }
}

export function parseMoneyOutInput(raw: unknown): Result<MoneyOutInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const tx_date = realDate(r.tx_date)
    if (!tx_date) return { ok: false, error: "Enter the date the money was paid" }
    const payee_id = optionalUuid(r.payee_id)
    if (payee_id === undefined) return { ok: false, error: "Choose a valid payee" }
    const payee_name = text(r.payee_name, 255)
    if (payee_name === undefined) return { ok: false, error: "The payee name is too long" }
    if (!payee_name) return { ok: false, error: "Enter who was paid" }
    const reference = text(r.reference, 100)
    if (reference === undefined) return { ok: false, error: "The reference can be at most 100 characters" }
    const remarks = text(r.remarks, 500)
    if (remarks === undefined) return { ok: false, error: "Remarks can be at most 500 characters" }
    const lines = parseLines(r.lines)
    if (!lines.ok) return lines
    return { ok: true, value: { tx_date, payee_id, payee_name, reference, remarks, lines: lines.value } }
}

// Total in cents, so 0.1 + 0.2 adds up exactly
export function linesTotal(lines: { amount: number }[]): number {
    return lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0) / 100
}
