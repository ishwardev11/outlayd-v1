// The Reports integrity checks in plain words (invoices and AI plan, step 9): what is wrong, how many
// records, and a Fix link to exactly those records. Fixed templates, no AI. Pure, so it is tested.
import { formatDay } from "./lock"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function lastDayOfMonth(y: number, m: number): number {
    return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// "in March 2026", "in 2026", or "between 3 Jan 2026 and 31 Mar 2026"
export function periodPhrase(from: string, to: string): string {
    const [fy, fm, fd] = from.split("-").map(Number)
    const [ty, tm, td] = to.split("-").map(Number)
    if (fy === ty && fm === tm && fd === 1 && td === lastDayOfMonth(ty, tm)) return `in ${MONTHS[fm - 1]} ${fy}`
    if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return `in ${fy}`
    return `between ${formatDay(from)} and ${formatDay(to)}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export interface CheckFacts {
    code: string
    passed: boolean | null
    affected: number | null
    amount: number | null
    // The month-end the reconciliation check looks at
    monthEnd: string | null
}

// What is wrong, in plain words, or null when the check passes or does not apply
export function integrityMessage(c: CheckFacts, from: string, to: string, money: (n: number) => string): string | null {
    if (c.passed !== false) return null
    const n = c.affected ?? 0
    const period = periodPhrase(from, to)
    const diff = money(Math.abs(c.amount ?? 0))
    switch (c.code) {
        case "uncategorised":
            return `${plural(n, "entry", "entries")} ${period} ${n === 1 ? "has" : "have"} no category`
        case "lines_balanced":
            return `${plural(n, "entry", "entries")} ${period} ${n === 1 ? "does" : "do"} not add up, or ${n === 1 ? "has" : "have"} a line without a fund`
        case "opening_complete":
            return "Your opening position (the balances you started Outlayd with) is not complete yet"
        case "balance_check":
            return `At ${formatDay(to)}, assets less liabilities differ from the funds by ${diff}`
        case "prior_year":
            return `The funds at the end of the last period differ from this period's opening by ${diff}`
        case "invoices":
            return `${plural(n, "invoice is", "invoices are")} overpaid, or ${n === 1 ? "has" : "have"} a payment while void`
        case "reconciled":
            return `${plural(n, "account is", "accounts are")} not reconciled at ${formatDay(c.monthEnd ?? to)}, or ${n === 1 ? "has" : "have"} a difference not explained`
        case "restricted_negative":
            return `${plural(n, "restricted fund is", "restricted funds are")} below zero at ${formatDay(to)}`
        case "receipts_missing":
            return `${plural(n, "invoice", "invoices")} you issued ${period} ${n === 1 ? "has" : "have"} a payment without its receipt`
        default:
            return null
    }
}

// Where Fix goes: the list of exactly the records concerned, or the screen where it is put right
export function integrityFixHref(code: string, from: string, to: string, monthEnd: string | null): string | null {
    const range = `from=${from}&to=${to}`
    switch (code) {
        case "uncategorised": return `/inbox?ufrom=${from}&uto=${to}#uncategorised`
        case "lines_balanced": return `/transactions?${range}&check=lines_balanced`
        case "opening_complete": return "/settings/opening-position"
        case "balance_check": return "/reports/financial-position"
        case "prior_year": return "/reports/changes-in-funds"
        case "invoices": return "/invoices?check=invoices"
        case "reconciled": return `/bank?tab=reconciliation${monthEnd ? `&month=${monthEnd}` : ""}`
        case "restricted_negative": return "/reports/changes-in-funds"
        case "receipts_missing": return `/invoices?tab=receivable&status=receipt_missing&${range}`
        default: return null
    }
}

// The banner on a list opened from a Fix link
export const CHECK_FILTER_LABELS = {
    lines_balanced: "Entries that do not add up or have a line without a fund",
    invoices: "Invoices that are overpaid or paid while void",
} as const
export type CheckFilter = keyof typeof CHECK_FILTER_LABELS
