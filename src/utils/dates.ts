/** Plain calendar-day helpers (YYYY-MM-DD strings, no timezone involved). */

/** Today's date as YYYY-MM-DD, taken from the server clock (UTC). */
export function todayIso(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10)
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDaysIso(iso: string, days: number): string {
    const [y, m, d] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** First and last day (YYYY-MM-DD) of the month containing the given date. */
export function monthBounds(iso: string): { start: string; end: string } {
    const [y, m] = iso.split("-").map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    return { start, end }
}

/** "Nov 16" style label for a YYYY-MM-DD string (never shifted by the viewer's timezone). */
export function formatShortDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    })
}
