// Assets & liabilities, accounts, fund transfers and the opening position (Phase 4, stage 5b): pure
// helpers that check form input before it is sent and label things for the screens. The database
// functions check everything again.
export type ItemKind = "fixed_asset" | "other_asset" | "liability"
export type ItemAction = "purchase" | "pay" | "return" | "receive" | "repay"
export type AccountType = "bank" | "cash" | "ewallet"

export const ITEM_KINDS: { value: ItemKind; label: string; help: string }[] = [
    { value: "fixed_asset", label: "Fixed asset", help: "Equipment, vehicles or furniture used for more than a year. Depreciated each month." },
    { value: "other_asset", label: "Other asset", help: "Money owed back to you that is not an invoice, such as a rental deposit." },
    { value: "liability", label: "Liability", help: "Money you owe that is not a bill, such as a loan." },
]

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
    { value: "bank", label: "Bank account" },
    { value: "cash", label: "Cash box" },
    { value: "ewallet", label: "E-wallet" },
]

// What can be recorded against each kind of item, and whether the money goes out or comes in
export const ITEM_ACTIONS: Record<ItemKind, { value: ItemAction; label: string; direction: "out" | "in" }[]> = {
    fixed_asset: [{ value: "purchase", label: "Record purchase", direction: "out" }],
    other_asset: [
        { value: "pay", label: "Money paid out (e.g. deposit paid)", direction: "out" },
        { value: "return", label: "Money returned to you", direction: "in" },
    ],
    liability: [
        { value: "receive", label: "Loan received", direction: "in" },
        { value: "repay", label: "Repayment", direction: "out" },
    ],
}

export function itemKindLabel(kind: string): string {
    return ITEM_KINDS.find((k) => k.value === kind)?.label ?? kind
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
    return t.length > max ? undefined : t || null
}
// An amount with at most two decimals; allowNegative for an overdrawn opening balance
export function parseMoney(v: unknown, { allowZero = false, allowNegative = false } = {}): number | null {
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(/,/g, "") : ""
    if (s === "" && allowZero) return 0
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null
    const n = Number(s)
    if (!Number.isFinite(n) || Math.abs(n) > 1e12) return null
    if (n < 0 && !allowNegative) return null
    if (n === 0 && !allowZero) return null
    return n
}

// The tracking start date: always the first day of a month
export function isMonthStart(v: unknown): v is string {
    const d = realDate(v)
    return !!d && d.endsWith("-01")
}

export interface AccountInput { id: string | null; name: string; account_type: AccountType; opening_balance: number; archived: boolean }
export function parseAccountInput(raw: unknown): Result<AccountInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = optionalUuid(r.id)
    if (id === undefined) return { ok: false, error: "That account could not be found" }
    const name = text(r.name, 100)
    if (!name) return { ok: false, error: "Enter a name of up to 100 characters" }
    const type = ACCOUNT_TYPES.find((t) => t.value === r.account_type)?.value
    if (!type) return { ok: false, error: "Choose bank, cash or e-wallet" }
    const opening = parseMoney(r.opening_balance ?? "", { allowZero: true, allowNegative: true })
    if (opening === null) return { ok: false, error: "Enter the opening balance as an amount with at most two decimals" }
    return { ok: true, value: { id, name, account_type: type, opening_balance: opening, archived: r.archived === true } }
}

export interface ItemInput {
    id: string | null; name: string; kind: ItemKind; classification: "current" | "non_current"; fund_id: string | null
    notes: string | null; archived: boolean; opening_balance: number; acquired_date: string | null
    opening_cost: number; opening_accumulated_depreciation: number; residual_value: number; useful_life_months: number | null
}
export function parseItemInput(raw: unknown): Result<ItemInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = optionalUuid(r.id)
    if (id === undefined) return { ok: false, error: "That item could not be found" }
    const name = text(r.name, 200)
    if (!name) return { ok: false, error: "Enter a name of up to 200 characters" }
    const kind = ITEM_KINDS.find((k) => k.value === r.kind)?.value
    if (!kind) return { ok: false, error: "Choose a fixed asset, another asset or a liability" }
    const classification = kind === "fixed_asset" ? "non_current" : r.classification === "non_current" ? "non_current" : "current"
    const fund_id = optionalUuid(r.fund_id)
    if (fund_id === undefined) return { ok: false, error: "Choose a valid fund" }
    const notes = text(r.notes, 500)
    if (notes === undefined) return { ok: false, error: "Notes can be at most 500 characters" }
    const zero = { allowZero: true }
    const opening_balance = kind === "fixed_asset" ? 0 : parseMoney(r.opening_balance ?? "", zero)
    const opening_cost = kind === "fixed_asset" ? parseMoney(r.opening_cost ?? "", zero) : 0
    const opening_accumulated_depreciation = kind === "fixed_asset" ? parseMoney(r.opening_accumulated_depreciation ?? "", zero) : 0
    const residual_value = kind === "fixed_asset" ? parseMoney(r.residual_value ?? "", zero) : 0
    if (opening_balance === null || opening_cost === null || opening_accumulated_depreciation === null || residual_value === null) {
        return { ok: false, error: "Amounts must be zero or more, with at most two decimals" }
    }
    let acquired_date: string | null = null
    let useful_life_months: number | null = null
    if (kind === "fixed_asset") {
        acquired_date = realDate(r.acquired_date)
        if (!acquired_date) return { ok: false, error: "Enter the date the asset was bought" }
        const life = Number(String(r.useful_life_months ?? "").trim())
        if (!Number.isInteger(life) || life < 1 || life > 1200) return { ok: false, error: "Enter the useful life in whole months (1 to 1200)" }
        useful_life_months = life
        if (opening_accumulated_depreciation + residual_value > Math.max(opening_cost, 0) && opening_cost > 0) {
            return { ok: false, error: "Depreciation to date plus residual value cannot be more than the cost" }
        }
    }
    return {
        ok: true,
        value: { id, name, kind, classification, fund_id, notes, archived: r.archived === true, opening_balance, acquired_date,
                 opening_cost, opening_accumulated_depreciation, residual_value, useful_life_months },
    }
}

export interface ItemTxInput { item_id: string; action: ItemAction; amount: number; tx_date: string; account_id: string | null; payee_name: string | null; reference: string | null; remarks: string | null }
export function parseItemTxInput(raw: unknown): Result<ItemTxInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const item_id = optionalUuid(r.item_id)
    if (!item_id) return { ok: false, error: "That item could not be found" }
    const action = (["purchase", "pay", "return", "receive", "repay"] as const).find((a) => a === r.action)
    if (!action) return { ok: false, error: "Choose what to record" }
    const amount = parseMoney(r.amount)
    if (amount === null) return { ok: false, error: "Enter an amount above zero with at most two decimals" }
    const tx_date = realDate(r.tx_date)
    if (!tx_date) return { ok: false, error: "Enter the date" }
    const account_id = optionalUuid(r.account_id)
    if (account_id === undefined) return { ok: false, error: "Choose a valid account" }
    const payee_name = text(r.payee_name, 255), reference = text(r.reference, 100), remarks = text(r.remarks, 500)
    if (payee_name === undefined || reference === undefined || remarks === undefined) return { ok: false, error: "Some text is too long" }
    return { ok: true, value: { item_id, action, amount, tx_date, account_id, payee_name, reference, remarks } }
}

export interface DisposalInput { item_id: string; disposed_date: string; proceeds: number; account_id: string | null; remarks: string | null }
export function parseDisposalInput(raw: unknown): Result<DisposalInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const item_id = optionalUuid(r.item_id)
    if (!item_id) return { ok: false, error: "That asset could not be found" }
    const disposed_date = realDate(r.disposed_date)
    if (!disposed_date) return { ok: false, error: "Enter the date it was sold or written off" }
    const proceeds = parseMoney(r.proceeds ?? "", { allowZero: true })
    if (proceeds === null) return { ok: false, error: "Enter the amount received (0 for a write-off)" }
    const account_id = optionalUuid(r.account_id)
    if (account_id === undefined) return { ok: false, error: "Choose a valid account" }
    const remarks = text(r.remarks, 500)
    if (remarks === undefined) return { ok: false, error: "Remarks can be at most 500 characters" }
    return { ok: true, value: { item_id, disposed_date, proceeds, account_id, remarks } }
}

export interface FundTransferInput { id: string | null; from_fund_id: string; to_fund_id: string; amount: number; tx_date: string; remarks: string | null }
export function parseFundTransferInput(raw: unknown): Result<FundTransferInput> {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = optionalUuid(r.id)
    if (id === undefined) return { ok: false, error: "That transfer could not be found" }
    const from_fund_id = optionalUuid(r.from_fund_id), to_fund_id = optionalUuid(r.to_fund_id)
    if (!from_fund_id || !to_fund_id) return { ok: false, error: "Choose both funds" }
    if (from_fund_id === to_fund_id) return { ok: false, error: "Choose two different funds" }
    const amount = parseMoney(r.amount)
    if (amount === null) return { ok: false, error: "Enter an amount above zero with at most two decimals" }
    const tx_date = realDate(r.tx_date)
    if (!tx_date) return { ok: false, error: "Enter the date" }
    const remarks = text(r.remarks, 500)
    if (remarks === undefined) return { ok: false, error: "The reason can be at most 500 characters" }
    return { ok: true, value: { id, from_fund_id, to_fund_id, amount, tx_date, remarks } }
}
