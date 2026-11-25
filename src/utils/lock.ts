// Period locks (spec 3.9): the shared rules the screens use to show what is locked. The database enforces
// the lock itself (migration 20261127100000_assurance.sql); these only decide what is shown, so a screen
// can never let through what the database refuses. Dates are ISO days (YYYY-MM-DD).

// The error code the database raises for a change in a locked period
export const LOCK_ERROR_CODE = "OL001"

export function isLockError(error: { code?: string } | null | undefined): boolean {
    return error?.code === LOCK_ERROR_CODE
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function isIsoDay(value: unknown): value is string {
    if (typeof value !== "string" || !ISO_DAY.test(value)) return false
    const d = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

// 2026-01-31 -> 31 Jan 2026 (the way the lock messages from the database write it)
export function formatDay(iso: string | null | undefined): string {
    if (!iso || !isIsoDay(iso.slice(0, 10))) return iso ?? ""
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
    return `${d} ${MONTHS[m - 1]} ${y}`
}

function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

// Is something dated `date` inside the locked period?
export function isLockedDate(date: string | null | undefined, lockDate: string | null | undefined): boolean {
    if (!date || !lockDate) return false
    return date.slice(0, 10) <= lockDate
}

// The opening position is frozen once the lock reaches the day before the start date
export function isOpeningLocked(lockDate: string | null | undefined, startDate: string | null | undefined): boolean {
    if (!lockDate) return false
    if (!startDate) return true
    return lockDate >= addDays(startDate, -1)
}

// Is what an asset or loan is worth fixed by the lock? (bought or sold in a locked period, or part of a
// locked opening position). Its name and notes can always change.
export function itemValuesLocked(
    item: { acquired_date: string | null; disposed_date: string | null; opening_balance: number; opening_cost: number },
    lock: { isLocked: (d: string | null | undefined) => boolean; openingLocked: boolean },
): boolean {
    return lock.isLocked(item.acquired_date) || lock.isLocked(item.disposed_date)
        || (lock.openingLocked && (item.opening_balance > 0 || item.opening_cost > 0))
}

// What the lock means for an uploaded document, through the entries it feeds (its payment and its bill):
//   open           nothing locked
//   locked         paid, and its payment or bill is in the locked period: it cannot change or be deleted
//   pay_only       an unpaid bill dated in the locked period: it can still be marked paid (dated after the
//                  lock), but not changed or deleted
//   review_locked  not approved yet, dated in the locked period: approving it would be refused
export type DocumentLockState = "open" | "locked" | "pay_only" | "review_locked"

export function documentLockState(
    doc: { status?: string | null; document_type?: string | null; document_date?: string | null; paid_date?: string | null },
    lockDate: string | null | undefined,
): DocumentLockState {
    if (!lockDate) return "open"
    const dated = isLockedDate(doc.document_date, lockDate)
    if (doc.status === "paid") {
        const paidOn = doc.paid_date ?? doc.document_date
        return isLockedDate(paidOn, lockDate) || (doc.document_type === "invoice" && dated) ? "locked" : "open"
    }
    if (doc.status === "awaiting_payment") return dated ? "pay_only" : "open"
    return dated ? "review_locked" : "open"
}

export function lockedMessage(lockDate: string): string {
    return `The books are locked up to ${formatDay(lockDate)}. An Admin can unlock the period on the Year end page (Reports, Year end).`
}

// Last day of the month of an ISO day
export function monthEndOf(iso: string): string {
    const [y, m] = iso.slice(0, 10).split("-").map(Number)
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export function isMonthEnd(iso: unknown): iso is string {
    return isIsoDay(iso) && monthEndOf(iso) === iso
}

// The month-ends before today, newest first (today's own month is not over yet)
export function pastMonthEnds(today: string, count: number): string[] {
    const out: string[] = []
    let [y, m] = today.slice(0, 10).split("-").map(Number)
    for (let i = 0; i < count; i++) {
        m -= 1
        if (m === 0) { m = 12; y -= 1 }
        out.push(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10))
    }
    return out
}

export type LockInput = { date: string | null; reason: string | null }

// What an Admin entered on the Year end page. Moving the lock back, or removing it, needs a reason.
export function parseLockInput(
    raw: unknown, current: string | null, today: string,
): { ok: true; value: LockInput } | { ok: false; error: string } {
    const r = (raw ?? {}) as { date?: unknown; reason?: unknown }
    const date = r.date === null || r.date === undefined || r.date === "" ? null : r.date
    if (date !== null && !isIsoDay(date)) return { ok: false, error: "Enter a valid date" }
    if (date !== null && date > today) return { ok: false, error: "A period can only be locked up to today" }
    const reason = typeof r.reason === "string" ? r.reason.trim() : ""
    if (reason.length > 500) return { ok: false, error: "Keep the reason to 500 characters" }
    const unlocking = current !== null && (date === null || date < current)
    if (unlocking && !reason) return { ok: false, error: "Give a reason for unlocking" }
    if (date === current) return { ok: false, error: date ? `The books are already locked up to ${formatDay(date)}` : "The books are not locked" }
    return { ok: true, value: { date: date as string | null, reason: reason || null } }
}
