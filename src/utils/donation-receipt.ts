// Donation receipts: the settings form check and the receipt's content. Pure functions (no database or
// browser code), so they are easy to test. The PDF is drawn from buildReceiptContent().

// ------------------------------------------------------------------ amount in words

const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

function under1000(n: number): string {
    const parts: string[] = []
    const h = Math.floor(n / 100), r = n % 100
    if (h) parts.push(`${ONES[h]} Hundred`)
    if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""))
    return parts.join(" ")
}

// Whole numbers up to 999,999,999,999 in English words ("One Thousand Two Hundred")
export function numberToWords(n: number): string {
    if (!Number.isInteger(n) || n < 0 || n >= 1e12) throw new Error("Amount out of range")
    if (n === 0) return "Zero"
    const scales: [number, string][] = [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"], [1, ""]]
    const parts: string[] = []
    let rest = n
    for (const [size, name] of scales) {
        const chunk = Math.floor(rest / size)
        rest %= size
        if (chunk) parts.push(name ? `${under1000(chunk)} ${name}` : under1000(chunk))
    }
    return parts.join(" ")
}

const CURRENCY_WORDS: Record<string, [string, string]> = {
    MYR: ["Ringgit Malaysia", "Sen"],
    SGD: ["Singapore Dollars", "Cents"],
    USD: ["US Dollars", "Cents"],
    EUR: ["Euros", "Cents"],
    GBP: ["Pounds Sterling", "Pence"],
    AUD: ["Australian Dollars", "Cents"],
}

// "Ringgit Malaysia One Hundred Twenty and Fifty Sen Only"
export function amountInWords(amount: number, currency: string): string {
    const cents = Math.round(amount * 100)
    if (!Number.isFinite(cents) || cents < 0) throw new Error("Invalid amount")
    const [major, minor] = CURRENCY_WORDS[currency?.toUpperCase()] ?? [currency?.toUpperCase() || "", "Cents"]
    const whole = Math.floor(cents / 100), part = cents % 100
    const words = `${major} ${numberToWords(whole)}`.trim()
    return part ? `${words} and ${numberToWords(part)} ${minor} Only` : `${words} Only`
}

// ------------------------------------------------------------------ settings form

export interface Signatory { name: string; title: string }

export interface ReceiptSettings {
    legal_name: string | null
    address: string | null
    signatories: Signatory[]
    receipt_prefix: string
    receipt_next_number: number
    tax_exempt_receipts: boolean
    tax_exempt_reference: string | null
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const optText = (v: unknown, max: number): string | null | undefined => {
    if (v === null || v === undefined) return null
    if (typeof v !== "string") return undefined
    const t = v.trim()
    return t.length > max ? undefined : t || null
}

export function parseReceiptSettings(raw: unknown): Result<ReceiptSettings> {
    const r = (raw ?? {}) as Record<string, unknown>
    const legal_name = optText(r.legal_name, 200)
    if (legal_name === undefined) return { ok: false, error: "The legal name can be at most 200 characters" }
    const address = optText(r.address, 500)
    if (address === undefined) return { ok: false, error: "The address can be at most 500 characters" }

    const list = Array.isArray(r.signatories) ? r.signatories : []
    const signatories: Signatory[] = []
    for (const s of list) {
        const row = (s ?? {}) as Record<string, unknown>
        const name = optText(row.name, 100), title = optText(row.title, 100)
        if (name === undefined || title === undefined) return { ok: false, error: "Signatory names and titles can be at most 100 characters" }
        if (!name && !title) continue
        if (!name) return { ok: false, error: "Every signatory needs a name" }
        signatories.push({ name, title: title ?? "" })
    }
    if (signatories.length > 3) return { ok: false, error: "Add at most three signatories" }

    const prefix = typeof r.receipt_prefix === "string" ? r.receipt_prefix.trim() : ""
    if (prefix.length > 20 || !/^[A-Za-z0-9\-/_. ]*$/.test(prefix)) {
        return { ok: false, error: "The receipt prefix can have up to 20 letters, numbers, dashes or slashes" }
    }
    const next = typeof r.receipt_next_number === "number" ? r.receipt_next_number : Number(String(r.receipt_next_number ?? "").trim())
    if (!Number.isInteger(next) || next < 1 || next > 999999999) return { ok: false, error: "The next receipt number must be a whole number from 1" }

    const tax_exempt_receipts = r.tax_exempt_receipts === true
    const tax_exempt_reference = optText(r.tax_exempt_reference, 200)
    if (tax_exempt_reference === undefined) return { ok: false, error: "The approval reference can be at most 200 characters" }
    if (tax_exempt_receipts && !tax_exempt_reference) return { ok: false, error: "Enter the approval reference for tax-exempt receipts" }

    return { ok: true, value: { legal_name, address, signatories, receipt_prefix: prefix, receipt_next_number: next, tax_exempt_receipts, tax_exempt_reference } }
}

// ------------------------------------------------------------------ letterhead image

export const LETTERHEAD_MAX_BYTES = 1024 * 1024

// The file's real type from its first bytes (never trust the name or the browser's type).
// Only PNG and JPEG: the two image types the PDF library can draw.
export function letterheadImageType(bytes: Uint8Array): "png" | "jpeg" | null {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "png"
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
    return null
}

// ------------------------------------------------------------------ the receipt's content

export interface ReceiptRecord {
    receipt_no: string
    issued_at: string
    donation_date: string
    donor_name: string
    amount: number
    details: { lines?: { category: string; fund: string; amount: number }[]; reference?: string | null }
    tax_exempt: boolean
    tax_exempt_reference: string | null
    voided_at: string | null
    void_reason: string | null
}

export interface ReceiptOrg {
    name: string
    legal_name: string | null
    address: string | null
    registration_id: string | null
    signatories: Signatory[]
    currency: string
    // The uploaded letterhead as a data URL (PNG or JPEG), when the organisation has one
    letterheadImage?: string | null
}

export interface ReceiptContent {
    letterhead: string[]
    // When set, printed across the top in place of the typed letterhead lines
    letterheadImage: string | null
    title: string
    fields: [string, string][]
    amountWords: string
    amountFigure: string
    purpose: string
    taxStatement: string | null
    signatory: Signatory | null
    void: { on: string; reason: string } | null
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function buildReceiptContent(r: ReceiptRecord, org: ReceiptOrg): ReceiptContent {
    const funds = [...new Set((r.details.lines ?? []).map((l) => l.fund).filter(Boolean))]
    const letterhead = [org.legal_name || org.name, ...(org.legal_name && org.legal_name !== org.name ? [org.name] : []),
        ...(org.address ? org.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []),
        ...(org.registration_id ? [`Registration no. ${org.registration_id}`] : [])]
    const fields: [string, string][] = [
        ["Receipt no.", r.receipt_no],
        ["Date of donation", r.donation_date],
        ["Date issued", r.issued_at.slice(0, 10)],
        ["Received from", r.donor_name?.trim() || "Anonymous donor"],
    ]
    if (r.details.reference) fields.push(["Reference", r.details.reference])
    return {
        letterhead,
        letterheadImage: org.letterheadImage || null,
        title: "DONATION RECEIPT",
        fields,
        amountWords: amountInWords(r.amount, org.currency),
        amountFigure: `${org.currency} ${money(r.amount)}`,
        purpose: funds.length ? `Being a donation to: ${funds.join(", ")}` : "Being a donation",
        // Only when the organisation turned tax-exempt receipts on (copied onto the receipt when issued)
        taxStatement: r.tax_exempt && r.tax_exempt_reference ? `Tax-exempt receipt. Approval reference: ${r.tax_exempt_reference}` : null,
        signatory: org.signatories[0] ?? null,
        void: r.voided_at ? { on: r.voided_at.slice(0, 10), reason: r.void_reason ?? "" } : null,
    }
}
