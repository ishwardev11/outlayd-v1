// Matches bank lines to approved documents and to cash book entries. Pure functions, no database code.
//
// A line is only ever *suggested* against a candidate. A person confirms it, and nothing is marked
// paid by this file. Money going out can match a document or an entry going out; money coming in
// can match an entry coming in (step 3).

export interface MatchTransaction {
    id: string
    date: string            // YYYY-MM-DD
    description: string
    cents: number           // negative = money out
}

export interface MatchDocument {
    id: string
    vendor_name: string | null
    invoice_number: string | null
    reference_number: string | null
    status: string | null
    amount: number | string | null
    original_currency: string | null
    original_amount: number | string | null
    document_date: string | null
    due_date: string | null
    paid_date: string | null
}

// A cash book entry as offered for matching (money in, money out, or a transfer between accounts)
export interface MatchEntry {
    id: string
    direction: "in" | "out"  // seen from the statement's account
    payee: string | null
    reference: string | null
    cents: number           // the entry's total, in the organisation's currency
    date: string            // the day the money moved
}

// Anything a line can be matched to, in one shape for scoring. The id is "document:<uuid>" or
// "transaction:<uuid>", so documents and entries never collide.
export interface MatchCandidate {
    id: string
    direction: "in" | "out"
    payee: string | null
    references: (string | null)[]
    cents: number | null            // comparable with the line, or null when it cannot be compared
    issued: string | null
    due: string | null
    // The day it was paid, when it was paid (entries always are; documents when status is paid)
    paidOn: string | null
}

export function documentCandidate(doc: MatchDocument, opts: MatchOptions): MatchCandidate {
    return {
        id: `document:${doc.id}`,
        direction: "out",
        payee: doc.vendor_name,
        references: [doc.invoice_number, doc.reference_number],
        cents: comparableCents(doc, opts),
        issued: doc.document_date,
        due: doc.due_date,
        paidOn: doc.status === "paid" ? doc.paid_date : null,
    }
}

// Entries are recorded in the organisation's currency, so a statement in another currency is never
// compared with them by amount
export function entryCandidate(e: MatchEntry, opts: MatchOptions): MatchCandidate {
    const sameCurrency = (opts.statementCurrency ?? opts.baseCurrency) === opts.baseCurrency
    return {
        id: `transaction:${e.id}`,
        direction: e.direction,
        payee: e.payee,
        references: [e.reference],
        cents: sameCurrency ? e.cents : null,
        issued: e.date,
        due: e.date,
        paidOn: e.date,
    }
}

export interface MatchSuggestion {
    // The candidate's id ("document:<uuid>" or "transaction:<uuid>")
    documentId: string
    score: number
    strong: boolean         // safe enough for "confirm all strong matches"
    reasons: string[]
}

// ------------------------------------------------------------------ text

// Words that appear on bank lines but say nothing about who was paid
const NOISE = new Set([
    "sdn", "bhd", "berhad", "ltd", "limited", "pte", "inc", "llc", "llp", "plc", "corp", "company", "enterprise", "trading",
    "the", "and", "payment", "pymt", "transfer", "trf", "ibg", "giro", "duitnow", "fpx", "pos", "debit", "credit", "purchase",
    "ref", "reference", "inv", "invoice", "bill", "online", "banking", "ibanking", "instant", "interbank", "from", "for",
    "tt", "swift", "fee", "charge", "charges", "cash", "withdrawal", "cheque", "chq", "transaction", "txn", "card", "visa",
    "mastercard", "myr", "usd", "sgd", "eur", "gbp",
])

export function tokens(text: string | null | undefined): string[] {
    return String(text ?? "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((t) => t.length >= 3 && !NOISE.has(t) && !/^\d+$/.test(t))
}

// Share of the vendor's name words found in the bank line. Bank lines cut names short
// ("ACME STATIO"), so a word also counts when one is the start of the other.
export function vendorSimilarity(vendor: string | null | undefined, description: string): number {
    const v = tokens(vendor)
    const d = tokens(description)
    if (v.length === 0 || d.length === 0) return 0
    let hits = 0
    for (const vt of v) {
        if (d.some((dt) => dt === vt || (Math.min(dt.length, vt.length) >= 4 && (dt.startsWith(vt) || vt.startsWith(dt))))) hits++
    }
    return hits / v.length
}

export function mentionsNumber(description: string, ref: string | null | undefined): boolean {
    const clean = String(ref ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    if (clean.length < 4) return false
    return description.toLowerCase().replace(/[^a-z0-9]/g, "").includes(clean)
}

// ------------------------------------------------------------------ dates

function dayNumber(iso: string | null | undefined): number | null {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
    const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
    return Number.isNaN(t) ? null : Math.round(t / 86_400_000)
}

// ------------------------------------------------------------------ matching

export interface MatchOptions {
    baseCurrency: string
    statementCurrency: string | null
}

function toCents(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n * 100) : null
}

// What amount on the document to compare with the payment. A payment in the organisation's own
// currency is compared with the document's amount; a payment in another currency only with a
// document that was issued in that same currency.
function comparableCents(doc: MatchDocument, opts: MatchOptions): number | null {
    const stmt = opts.statementCurrency ?? opts.baseCurrency
    if (stmt === opts.baseCurrency) return toCents(doc.amount)
    if (doc.original_currency === stmt) return toCents(doc.original_amount)
    return null
}

// Scores one line against one candidate (a document or an entry). Null when it does not fit at all.
export function scoreMatch(txn: MatchTransaction, c: MatchCandidate): MatchSuggestion | null {
    if (txn.cents === 0) return null
    if ((txn.cents < 0 ? "out" : "in") !== c.direction) return null   // the direction has to agree
    if (c.cents === null) return null
    if (Math.abs(Math.abs(txn.cents) - c.cents) > 1) return null       // the amount has to agree (to the cent)

    const reasons = ["Same amount"]
    let score = 60

    const sim = vendorSimilarity(c.payee, txn.description)
    const numberHit = c.references.some((r) => mentionsNumber(txn.description, r))
    if (numberHit) {
        score += 30
        reasons.push("Reference appears on the bank line")
    } else if (sim >= 0.99) {
        score += 25
        reasons.push("Payee name matches")
    } else if (sim >= 0.5) {
        score += 15
        reasons.push("Payee name partly matches")
    }

    // Dates: something already paid should have been paid about when the money moved; an unpaid
    // document is normally paid between its date (a few days early at most) and well after its due date.
    const t = dayNumber(txn.date)
    const paid = dayNumber(c.paidOn)
    const issued = dayNumber(c.issued)
    const due = dayNumber(c.due) ?? issued
    let dateOk = false
    if (t !== null) {
        if (paid !== null) {
            dateOk = Math.abs(t - paid) <= 3
            if (dateOk) {
                score += Math.abs(t - paid) <= 1 ? 10 : 6
                reasons.push("Payment date is close")
            }
        } else if (issued !== null && due !== null) {
            dateOk = t >= issued - 3 && t <= due + 45
            if (dateOk) {
                score += 6
                reasons.push("Date fits the invoice")
            }
        }
    }
    // An exact amount with a different date and no sign of the payee is too weak to suggest
    if (!dateOk && sim < 0.5 && !numberHit) return null

    return { documentId: c.id, score, strong: score >= 90 && (sim >= 0.99 || numberHit) && dateOk, reasons }
}

export interface MatchResult {
    transactionId: string
    suggestion: MatchSuggestion | null
    // Other documents that fit about as well, so the person can see the choice is not clear-cut
    alternatives: number
}

// Suggests at most one document per payment and one payment per document. The best pairs are
// assigned first, so two same-amount invoices are not both offered to the same payment.
// Candidates are documents and entries already turned into MatchCandidate (documentCandidate /
// entryCandidate); suggestion.documentId is the candidate id.
export function suggestMatches(txns: MatchTransaction[], candidates: MatchCandidate[]): Map<string, MatchResult> {
    type Pair = { txnId: string; suggestion: MatchSuggestion }
    const pairs: Pair[] = []
    const perTxn = new Map<string, MatchSuggestion[]>()
    for (const txn of txns) {
        const list: MatchSuggestion[] = []
        for (const cand of candidates) {
            const s = scoreMatch(txn, cand)
            if (s) {
                list.push(s)
                pairs.push({ txnId: txn.id, suggestion: s })
            }
        }
        perTxn.set(txn.id, list)
    }

    pairs.sort((a, b) => b.suggestion.score - a.suggestion.score || a.txnId.localeCompare(b.txnId) || a.suggestion.documentId.localeCompare(b.suggestion.documentId))
    const takenDocs = new Set<string>()
    const chosen = new Map<string, MatchSuggestion>()
    for (const p of pairs) {
        if (chosen.has(p.txnId) || takenDocs.has(p.suggestion.documentId)) continue
        chosen.set(p.txnId, p.suggestion)
        takenDocs.add(p.suggestion.documentId)
    }

    const out = new Map<string, MatchResult>()
    for (const txn of txns) {
        const pick = chosen.get(txn.id) ?? null
        const rivals = pick ? (perTxn.get(txn.id) ?? []).filter((s) => s.documentId !== pick.documentId && s.score >= pick.score - 10).length : 0
        // A near-tie is never "strong": the person has to look at it
        out.set(txn.id, {
            transactionId: txn.id,
            suggestion: pick ? { ...pick, strong: pick.strong && rivals === 0 } : null,
            alternatives: rivals,
        })
    }
    return out
}

// ------------------------------------------------------------------ fingerprints

export function normaliseDescription(description: string): string {
    return description.toLowerCase().replace(/\s+/g, " ").trim()
}
