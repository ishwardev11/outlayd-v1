// Cleans up what the AI read from a bank statement PDF and checks it. Pure functions.
// The AI output is untrusted: every value is checked before it is stored.
import { createHash } from "node:crypto"
import { normaliseDescription } from "@/utils/bank-matching"
import { formatCents } from "@/utils/format-cents"

export { formatCents }

export const MAX_STATEMENT_ROWS = 3000

export interface RawStatement {
    bank_name?: unknown
    account_last4?: unknown
    currency?: unknown
    period_start?: unknown
    period_end?: unknown
    opening_balance?: unknown
    closing_balance?: unknown
    transactions?: unknown
}

export interface ParsedTransaction {
    date: string
    description: string
    cents: number              // negative = money out
    balanceCents: number | null
    fingerprint: string
}

export interface ParsedStatement {
    bankName: string | null
    accountLast4: string | null
    currency: string | null
    periodStart: string | null
    periodEnd: string | null
    openingCents: number | null
    closingCents: number | null
    transactions: ParsedTransaction[]
    skippedRows: number
    warning: string | null
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function validDate(v: unknown): string | null {
    if (typeof v !== "string" || !ISO.test(v)) return null
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

function money(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null
    const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""))
    return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) : null
}

function text(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null
    const t = v.replace(/\s+/g, " ").trim()
    return t ? t.slice(0, max) : null
}

export function parseStatement(raw: RawStatement): ParsedStatement {
    const currencyRaw = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : ""
    const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : null
    // Only the last four characters of the account number are ever kept
    const acct = typeof raw.account_last4 === "string" ? raw.account_last4.replace(/[^0-9A-Za-z]/g, "").slice(-4) : ""
    const accountLast4 = acct || null
    const bankName = text(raw.bank_name, 80)

    const rows = Array.isArray(raw.transactions) ? raw.transactions.slice(0, MAX_STATEMENT_ROWS) : []
    let skippedRows = Array.isArray(raw.transactions) ? Math.max(0, raw.transactions.length - rows.length) : 0

    const seen = new Map<string, number>()
    const transactions: ParsedTransaction[] = []
    for (const r of rows as any[]) {
        const date = validDate(r?.date)
        const debit = money(r?.debit)
        const credit = money(r?.credit)
        const net = (credit ?? 0) - (debit ?? 0)
        if (!date || net === 0 || (debit === null && credit === null)) {
            skippedRows++
            continue
        }
        const description = text(r?.description, 300) ?? ""
        const key = [accountLast4 ?? bankName ?? "", currency ?? "", date, net, normaliseDescription(description)].join("|")
        const n = (seen.get(key) ?? 0) + 1
        seen.set(key, n)
        transactions.push({
            date,
            description,
            cents: net,
            balanceCents: money(r?.balance),
            fingerprint: createHash("sha256").update(`${key}|${n}`).digest("hex"),
        })
    }

    const openingCents = money(raw.opening_balance)
    const closingCents = money(raw.closing_balance)
    let warning: string | null = null
    if (transactions.length === 0) {
        warning = "No transactions could be read from this statement."
    } else if (openingCents !== null && closingCents !== null) {
        const read = transactions.reduce((sum, t) => sum + t.cents, 0)
        const expected = closingCents - openingCents
        if (Math.abs(expected - read) > 1) {
            warning =
                `The transactions read from this statement add up to ${formatCents(read, currency)}, ` +
                `but the opening and closing balances differ by ${formatCents(expected, currency)}. ` +
                `Some rows may be missing or misread, so check them against the PDF.`
        }
    }
    if (skippedRows > 0 && !warning) {
        warning = `${skippedRows} row${skippedRows === 1 ? "" : "s"} could not be read and ${skippedRows === 1 ? "was" : "were"} left out. Check the statement PDF.`
    }

    return {
        bankName,
        accountLast4,
        currency,
        periodStart: validDate(raw.period_start),
        periodEnd: validDate(raw.period_end),
        openingCents,
        closingCents,
        transactions,
        skippedRows,
        warning,
    }
}
