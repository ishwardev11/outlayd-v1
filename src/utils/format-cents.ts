// "-MYR 1,234.50" from cents. No Node-only imports, so client components can use it.
export function formatCents(cents: number, currency: string | null): string {
    const sign = cents < 0 ? "-" : ""
    const abs = Math.abs(cents)
    const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    return `${sign}${currency ? currency + " " : ""}${whole}.${String(abs % 100).padStart(2, "0")}`
}
