/**
 * Calendar-day helpers that work in an organisation's timezone instead of UTC.
 *
 * Why: `new Date().toISOString().slice(0, 10)` is the UTC date. For an organisation in Malaysia
 * (UTC+8) that is still "yesterday" between 00:00 and 08:00 local time, which shifted the
 * cash-flow chart, "Paid this month" and the recorded payment date by a day.
 */

export const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur"

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
    { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (UTC+8)" },
    { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
    { value: "Asia/Jakarta", label: "Jakarta (UTC+7)" },
    { value: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
    { value: "Asia/Manila", label: "Manila (UTC+8)" },
    { value: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)" },
    { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
    { value: "Asia/Kolkata", label: "India (UTC+5:30)" },
    { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
    { value: "Europe/London", label: "London" },
    { value: "Europe/Berlin", label: "Berlin / Central Europe" },
    { value: "America/New_York", label: "New York" },
    { value: "America/Chicago", label: "Chicago" },
    { value: "America/Los_Angeles", label: "Los Angeles" },
    { value: "Australia/Sydney", label: "Sydney" },
    { value: "UTC", label: "UTC" },
]

export function isValidTimezone(tz: unknown): tz is string {
    if (typeof tz !== "string" || tz === "") return false
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz })
        return true
    } catch {
        return false
    }
}

/** Today's calendar date as YYYY-MM-DD in the given timezone. */
export function todayInTimezone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
    const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE
    // The en-CA locale formats dates as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now)
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. Pure calendar maths, no timezone involved. */
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

// How far ahead of UTC the timezone is at a given moment, in milliseconds
function offsetMs(instantMs: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(new Date(instantMs))
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
    const wallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
    return wallClockAsUtc - Math.floor(instantMs / 1000) * 1000
}

/** The exact moment (ISO, UTC) that the current month began in the given timezone. */
export function startOfMonthInstant(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
    const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE
    const { start } = monthBounds(todayInTimezone(zone, now))
    const [y, m, d] = start.split("-").map(Number)
    const wallClockAsUtc = Date.UTC(y, m - 1, d)
    // Work out the offset, then once more at the result so a daylight-saving change can't throw it off
    let instant = wallClockAsUtc - offsetMs(wallClockAsUtc, zone)
    instant = wallClockAsUtc - offsetMs(instant, zone)
    return new Date(instant).toISOString()
}
