// Turns the grouped change history (audit_changes in migration 20261128100000_assurance_screens.sql) into
// plain sentences for the Audit log page and the History panels: what record, what happened, and which
// values changed from what to what. Pure, so it is unit-tested.
import { formatDay } from "./lock"

export type AuditKind = "money" | "transfers" | "invoices" | "assets" | "reconciliations" | "settings"
export const AUDIT_KINDS: { value: AuditKind; label: string }[] = [
    { value: "money", label: "Money in and out" },
    { value: "invoices", label: "Invoices and bills" },
    { value: "assets", label: "Assets and loans" },
    { value: "transfers", label: "Transfers" },
    { value: "reconciliations", label: "Reconciliations" },
    { value: "settings", label: "Year end and opening balances" },
]

type Row = Record<string, unknown>

export interface AuditChange {
    root_entity: string
    root_id: string
    kind: AuditKind
    changed_at: string
    actor_email: string | null
    action: "insert" | "update" | "delete"
    reason: string | null
    before: Row | null
    after: Row | null
    snapshot: Row | null
    lines_before: Row[] | null
    lines_after: Row[] | null
}

export interface AuditLookups {
    categories: Map<string, string>
    funds: Map<string, string>
    accounts: Map<string, string>
    items: Map<string, string>
}

export interface DescribedChange {
    record: string
    action: string
    details: string[]
    reason: string | null
}

type Format = "money" | "day" | "text" | "fund" | "account" | "category" | "bool" | "set" | "count"
type Field = [key: string, label: string, format: Format]

const FIELDS: Record<string, Field[]> = {
    transactions: [
        ["tx_date", "Date", "day"], ["total", "Amount", "money"], ["payee_name", "Payee", "text"],
        ["account_id", "Account", "account"], ["to_account_id", "To account", "account"],
        ["from_fund_id", "From fund", "fund"], ["to_fund_id", "To fund", "fund"],
        ["reference", "Reference", "text"], ["remarks", "Remarks", "text"], ["is_refund", "Refund", "bool"],
        ["attachment_url", "Attached file", "set"],
    ],
    invoices: [
        ["invoice_no", "Number", "text"], ["payee_name", "Payee", "text"], ["issue_date", "Issue date", "day"],
        ["due_date", "Due date", "day"], ["total", "Total", "money"], ["status", "Status", "text"],
        ["void_reason", "Reason for voiding", "text"], ["reference", "Reference", "text"], ["remarks", "Remarks", "text"],
        ["attachment_url", "Attached file", "set"],
    ],
    items: [
        ["name", "Name", "text"], ["classification", "Classification", "text"], ["fund_id", "Fund", "fund"],
        ["opening_balance", "Opening balance", "money"], ["acquired_date", "Acquired", "day"],
        ["opening_cost", "Cost brought forward", "money"], ["opening_accumulated_depreciation", "Depreciation brought forward", "money"],
        ["residual_value", "Residual value", "money"], ["useful_life_months", "Useful life (months)", "count"],
        ["disposed_date", "Disposed", "day"], ["notes", "Notes", "text"], ["archived_at", "Archived", "set"],
    ],
    accounts: [["opening_balance", "Opening balance", "money"]],
    funds: [["opening_balance", "Opening balance", "money"], ["fund_type", "Type", "text"]],
    reconciliations: [
        ["period_end", "Month-end", "day"], ["account_id", "Account", "account"],
        ["statement_balance", "Statement balance", "money"], ["note", "Note", "text"],
    ],
    organizations: [
        ["lock_date", "Books locked up to", "day"], ["tracking_start_date", "Start date", "day"],
        ["opening_position_completed_at", "Opening position completed", "day"], ["statement_note", "Statement line", "text"],
    ],
}

const TX_TYPES: Record<string, string> = {
    money_in: "Money in", money_out: "Money out", fund_transfer: "Fund transfer", account_transfer: "Account transfer",
}
const ITEM_KINDS: Record<string, string> = { fixed_asset: "Fixed asset", other_asset: "Asset", liability: "Liability" }

function str(v: unknown): string | null {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s === "" ? null : s
}

export function moneyText(v: unknown, symbol: string): string {
    const n = Number(v)
    if (v === null || v === undefined || v === "" || Number.isNaN(n)) return "—"
    const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? `-${symbol}${abs}` : `${symbol}${abs}`
}

function value(v: unknown, format: Format, look: AuditLookups, symbol: string, field: string): string {
    if (format === "set") return v ? (field === "archived_at" ? "yes" : "added") : (field === "archived_at" ? "no" : "none")
    if (format === "bool") return v === true ? "yes" : "no"
    const s = str(v)
    if (s === null) return field === "lock_date" ? "not locked" : "—"
    switch (format) {
        case "money": return moneyText(s, symbol)
        case "day": return formatDay(s.slice(0, 10))
        case "fund": return look.funds.get(s) ?? "a removed fund"
        case "account": return look.accounts.get(s) ?? "a removed account"
        case "category": return look.categories.get(s) ?? "a removed category"
        default: return ["status", "classification", "fund_type"].includes(field) ? s.replace(/_/g, " ") : s
    }
}

function lineText(l: Row, look: AuditLookups, symbol: string): string {
    const parts = [moneyText(l.amount, symbol)]
    const item = str(l.item_id)
    const cat = str(l.category_id)
    if (item) parts.push(look.items.get(item) ?? "an asset or loan")
    else if (cat) parts.push(look.categories.get(cat) ?? "a removed category")
    if (str(l.invoice_id)) parts.push("(invoice payment)")
    const fund = str(l.fund_id)
    if (fund) parts.push(`· ${look.funds.get(fund) ?? "a removed fund"}`)
    return parts.join(" ")
}

function linesText(lines: Row[] | null, look: AuditLookups, symbol: string): string {
    return (lines ?? []).map((l) => lineText(l, look, symbol)).join("; ") || "none"
}

function recordLabel(c: AuditChange, look: AuditLookups): string {
    const s = c.snapshot ?? {}
    switch (c.root_entity) {
        case "transactions": {
            const type = TX_TYPES[String(s.tx_type)] ?? "Entry"
            const day = formatDay(str(s.tx_date))
            if (s.tx_type === "fund_transfer") {
                return `${type} · ${day} · ${look.funds.get(String(s.from_fund_id)) ?? "?"} → ${look.funds.get(String(s.to_fund_id)) ?? "?"}`
            }
            if (s.tx_type === "account_transfer") {
                return `${type} · ${day} · ${look.accounts.get(String(s.account_id)) ?? "?"} → ${look.accounts.get(String(s.to_account_id)) ?? "?"}`
            }
            const itemId = [...(c.lines_after ?? []), ...(c.lines_before ?? [])].map((l) => str(l.item_id)).find(Boolean)
            const who = itemId ? look.items.get(itemId) ?? "an asset or loan" : str(s.payee_name)
            return [type, day, who].filter(Boolean).join(" · ")
        }
        case "invoices": {
            const type = s.direction === "receivable" ? "Invoice" : "Bill"
            return [type, str(s.invoice_no), str(s.payee_name), formatDay(str(s.issue_date))].filter(Boolean).join(" · ")
        }
        case "items": return `${ITEM_KINDS[String(s.kind)] ?? "Item"} · ${str(s.name) ?? ""}`
        case "accounts": return `Account · ${str(s.name) ?? look.accounts.get(c.root_id) ?? ""}`
        case "funds": return `Fund · ${str(s.name) ?? look.funds.get(c.root_id) ?? ""}`
        case "reconciliations":
            return `Reconciliation · ${look.accounts.get(String(s.account_id)) ?? "an account"} · ${formatDay(str(s.period_end))}`
        case "organizations": return "Year end settings"
        default: return c.root_entity
    }
}

function actionLabel(c: AuditChange): string {
    if (c.root_entity === "organizations") {
        const b = c.before ?? {}
        const a = c.after ?? {}
        if (b.lock_date !== a.lock_date) {
            if (!a.lock_date) return "Unlocked"
            if (b.lock_date && String(a.lock_date) < String(b.lock_date)) return "Unlocked in part"
            return "Locked"
        }
        return "Changed"
    }
    if (c.action === "insert") return "Created"
    if (c.action === "delete") return "Deleted"
    return "Changed"
}

// Lines are compared on what matters (amount, category or item, fund, invoice), not their ids
function sameLines(a: Row[] | null, b: Row[] | null): boolean {
    const key = (rows: Row[] | null) => JSON.stringify((rows ?? []).map((l) => [Number(l.amount), l.category_id ?? null, l.item_id ?? null, l.fund_id ?? null, l.invoice_id ?? null]))
    return key(a) === key(b)
}

export function describeChange(c: AuditChange, look: AuditLookups, symbol: string): DescribedChange {
    const fields = FIELDS[c.root_entity] ?? []
    const details: string[] = []
    if (c.action === "update" && c.before && c.after) {
        for (const [key, label, format] of fields) {
            const from = c.before[key] ?? null
            const to = c.after[key] ?? null
            if (format === "set" ? !!from === !!to : JSON.stringify(from) === JSON.stringify(to)) continue
            if (format === "money" && from !== null && to !== null && Number(from) === Number(to)) continue
            const a = value(from, format, look, symbol, key)
            const b = value(to, format, look, symbol, key)
            if (a === b) continue // e.g. a time of day that changed while the day did not
            details.push(`${label}: ${a} → ${b}`)
        }
    } else if (c.action !== "update") {
        const row = (c.action === "delete" ? c.before : c.after) ?? {}
        for (const [key, label, format] of fields) {
            if (format === "set" || format === "bool") continue
            if (str(row[key]) === null) continue
            if (["remarks", "notes", "note", "reference", "payee_name", "name", "invoice_no", "status"].includes(key)) continue
            details.push(`${label}: ${value(row[key], format, look, symbol, key)}`)
        }
    }
    const hasLines = (c.lines_before?.length ?? 0) + (c.lines_after?.length ?? 0) > 0
    if (hasLines) {
        if (c.action === "insert") details.push(`Lines: ${linesText(c.lines_after, look, symbol)}`)
        else if (c.action === "delete") details.push(`Lines: ${linesText(c.lines_before, look, symbol)}`)
        else if (!sameLines(c.lines_before, c.lines_after)) {
            details.push(`Lines: ${linesText(c.lines_before, look, symbol)} → ${linesText(c.lines_after, look, symbol)}`)
        }
    }
    if (details.length === 0 && c.action === "update") details.push("Saved with no change to the figures")
    return { record: recordLabel(c, look), action: actionLabel(c), details, reason: c.reason }
}
