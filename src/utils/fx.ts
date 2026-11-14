// Exchange-rate helpers for documents printed in a currency other than the organization's base.

export interface FxRate {
    rate: number // base-currency units per 1 unit of `from`
    rateDate: string // the date the rate is actually for (weekends snap to the previous working day)
    source: "ecb"
}

const CODE_RE = /^[A-Z]{3}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const convertAmount = (amount: number, rate: number): number => Math.round(amount * rate * 100) / 100

// Free, key-less ECB reference rates (about 30 major currencies, daily, history back to 1999).
// Returns null for ANY problem (unsupported currency, outage, timeout, odd response): callers
// then ask the user to type the rate instead of guessing one.
export async function fetchExchangeRate(from: string, to: string, isoDate: string | null | undefined): Promise<FxRate | null> {
    const base = (from || "").trim().toUpperCase()
    const quote = (to || "").trim().toUpperCase()
    if (!CODE_RE.test(base) || !CODE_RE.test(quote)) return null
    if (base === quote) return { rate: 1, rateDate: isoDate && ISO_DATE_RE.test(isoDate) ? isoDate : new Date().toISOString().slice(0, 10), source: "ecb" }

    const today = new Date().toISOString().slice(0, 10)
    // A missing, malformed or future date uses the latest published rate
    const path = isoDate && ISO_DATE_RE.test(isoDate) && isoDate <= today ? isoDate : "latest"

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
        const res = await fetch(`https://api.frankfurter.dev/v1/${path}?base=${base}&symbols=${quote}`, {
            signal: controller.signal,
            // A past date's rate never changes, so it is safe to cache for a day
            next: { revalidate: 86400 },
        } as RequestInit)
        if (!res.ok) return null
        const json = (await res.json()) as { date?: unknown; rates?: Record<string, unknown> }
        const rate = json?.rates?.[quote]
        if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 1e6 || rate < 1e-6) return null
        const rateDate = typeof json.date === "string" && ISO_DATE_RE.test(json.date) ? json.date : today
        return { rate: Number(rate.toFixed(8)), rateDate, source: "ecb" }
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

// Is it safe to approve this document? Returns a message if not, otherwise null.
// `merged` is the stored document with the pending changes applied on top.
export function foreignApprovalProblem(
    merged: { amount?: unknown; original_currency?: unknown; original_amount?: unknown; exchange_rate?: unknown },
    baseCurrency: string
): string | null {
    const cur = typeof merged.original_currency === "string" ? merged.original_currency.trim().toUpperCase() : ""
    const base = baseCurrency.trim().toUpperCase()
    if (!cur || cur === base) return null

    const rate = Number(merged.exchange_rate)
    if (!(rate > 0)) {
        return `This document is in ${cur}. Enter the exchange rate to ${base} before approving it, so its amount is not counted as ${base}.`
    }
    const original = Number(merged.original_amount)
    const amount = Number(merged.amount)
    if (Number.isFinite(original) && original > 0 && Number.isFinite(amount)) {
        if (Math.abs(amount - original * rate) > Math.max(0.02, Math.abs(amount) * 0.0001)) {
            return `The ${base} amount does not match ${cur} ${original.toFixed(2)} at the rate ${rate}. Update the rate or the amount so they agree.`
        }
    }
    return null
}
