// The Year end hub (simplification step 5): the steps to close a financial year, each with a status.
// Pure functions only, so the statuses are easy to test.
import { financialYear } from "./income-expenditure"

export type StepStatus = "done" | "attention" | "not_started"

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
    done: "Done",
    attention: "Needs attention",
    not_started: "Not started",
}

export interface FinancialYearOption {
    key: string        // the year's first day, YYYY-MM-DD (used in the URL)
    from: string
    to: string
    label: string      // "1 Jan 2026 to 31 Dec 2026"
    ended: boolean     // the last day is before today
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number)
    return `${d} ${MONTHS[m - 1]} ${y}`
}

// Every financial year from the one containing the tracking start date (or this year, without one) up
// to the current one, newest first
export function financialYears(startDate: string | null, fiscalYearStart: number, today: string): FinancialYearOption[] {
    const current = financialYear(fiscalYearStart, today)
    const first = startDate && startDate <= today ? financialYear(fiscalYearStart, startDate) : current
    const out: FinancialYearOption[] = []
    for (let offset = 0; offset < 50; offset++) {
        const fy = financialYear(fiscalYearStart, today, -offset)
        out.push({ key: fy.from, from: fy.from, to: fy.to, label: `${day(fy.from)} to ${day(fy.to)}`, ended: fy.to < today })
        if (fy.from <= first.from) break
    }
    return out
}

// The year to show when none is chosen: the most recent one that has ended (that is the one being
// closed), or the current year if none has ended since tracking began
export function defaultFinancialYear(years: FinancialYearOption[]): FinancialYearOption {
    return years.find((y) => y.ended) ?? years[0]
}

// Step 1: the opening position (where things stood on the tracking start date)
export function openingStatus(startDate: string | null, completedAt: string | null): StepStatus {
    if (completedAt) return "done"
    return startDate ? "attention" : "not_started"
}

export interface AccountReconciliation {
    account_id: string
    account_name: string
    archived: boolean
    outlayd_balance: number
    reconciliation_id: string | null
    difference: number | null
    note: string | null
}

export type AccountStatus = { account: string; status: StepStatus; detail: string }

// Step 2: each account reconciled at the year end. A difference counts as done once it is explained
// in the note (the same rule as the integrity checks).
export function reconciliationStatus(rows: AccountReconciliation[], yearEnded: boolean): { status: StepStatus; accounts: AccountStatus[] } {
    const accounts: AccountStatus[] = rows
        .filter((r) => !r.archived || r.reconciliation_id !== null || r.outlayd_balance !== 0)
        .map((r) => {
            if (!r.reconciliation_id) return { account: r.account_name, status: yearEnded ? "attention" : "not_started", detail: "Not reconciled yet" }
            if ((r.difference ?? 0) !== 0 && !(r.note ?? "").trim()) return { account: r.account_name, status: "attention", detail: "A difference is not explained" }
            return { account: r.account_name, status: "done", detail: (r.difference ?? 0) === 0 ? "Agrees with the bank" : "Difference explained" }
        })
    const status: StepStatus = accounts.length > 0 && accounts.every((a) => a.status === "done") ? "done"
        : accounts.some((a) => a.status === "attention") ? "attention"
        : accounts.some((a) => a.status === "done") ? "attention"
        : "not_started"
    return { status, accounts }
}

// Step 3: the integrity checks for the year (blocking checks must pass; warnings may stay)
export function checksStatus(checks: { severity: "block" | "warning"; passed: boolean | null }[] | null): StepStatus {
    if (!checks || checks.length === 0) return "not_started"
    return checks.some((c) => c.severity === "block" && c.passed === false) ? "attention" : "done"
}

// Step 4: the books locked up to (at least) the year end
export function lockStatus(lockDate: string | null, yearEnd: string, yearEnded: boolean): StepStatus {
    if (lockDate && lockDate >= yearEnd) return "done"
    return yearEnded ? "attention" : "not_started"
}
