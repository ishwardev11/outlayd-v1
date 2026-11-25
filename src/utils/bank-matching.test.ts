import { test } from "node:test"
import assert from "node:assert/strict"
import {
    documentCandidate, entryCandidate, scoreMatch, suggestMatches,
    type MatchDocument, type MatchEntry, type MatchOptions, type MatchTransaction,
} from "./bank-matching"

const opts: MatchOptions = { baseCurrency: "MYR", statementCurrency: "MYR" }
const line = (over: Partial<MatchTransaction>): MatchTransaction => ({ id: "l1", date: "2026-01-20", description: "IBG LANDLORD SDN BHD RENT", cents: -30000, ...over })
const doc = (over: Partial<MatchDocument>): MatchDocument => ({
    id: "d1", vendor_name: "Landlord Sdn Bhd", invoice_number: null, reference_number: null, status: "paid", amount: 300,
    original_currency: null, original_amount: null, document_date: "2026-01-20", due_date: null, paid_date: "2026-01-20", ...over,
})
const entry = (over: Partial<MatchEntry>): MatchEntry => ({ id: "t1", direction: "in", payee: "Puan Aminah", reference: null, cents: 50000, date: "2026-01-10", ...over })

test("documents score as before: same amount, payee and date make a strong match", () => {
    const s = scoreMatch(line({}), documentCandidate(doc({}), opts))!
    assert.equal(s.documentId, "document:d1") // candidate ids say what they are, as suggestMatches returns them
    assert.ok(s.strong)
    assert.deepEqual(s.reasons, ["Same amount", "Payee name matches", "Payment date is close"])
})

test("money in matches an entry coming in; never a document or an entry going out", () => {
    const moneyIn = line({ id: "in", description: "DUITNOW FROM PUAN AMINAH", cents: 50000, date: "2026-01-10" })
    const s = scoreMatch(moneyIn, entryCandidate(entry({}), opts))!
    assert.equal(s.documentId, "transaction:t1")
    assert.ok(s.strong)
    assert.equal(scoreMatch(moneyIn, documentCandidate(doc({ amount: 500 }), opts)), null, "documents are money out only")
    assert.equal(scoreMatch(moneyIn, entryCandidate(entry({ direction: "out" }), opts)), null, "direction must agree")
})

test("money out matches an entry going out (a manual payment or a transfer out)", () => {
    const transfer = entry({ id: "tr", direction: "out", payee: null, reference: "PETTY", cents: 9000, date: "2026-02-05" })
    const s = scoreMatch(line({ description: "TRF TO PETTY CASH", cents: -9000, date: "2026-02-05" }), entryCandidate(transfer, opts))!
    assert.equal(s.documentId, "transaction:tr")
    assert.ok(s.reasons.includes("Reference appears on the bank line"))
})

test("the amount must agree to the cent, and a statement in another currency is not compared with entries", () => {
    assert.equal(scoreMatch(line({ cents: 50001 + 2 }), entryCandidate(entry({}), opts)), null)
    assert.equal(scoreMatch(line({ cents: 50000 }), entryCandidate(entry({}), { baseCurrency: "MYR", statementCurrency: "USD" })), null)
})

test("an exact amount on a far-off date with no sign of the payee is too weak to suggest", () => {
    const far = entry({ payee: "Someone Else", date: "2026-03-30" })
    assert.equal(scoreMatch(line({ description: "CASH DEPOSIT", cents: 50000, date: "2026-01-10" }), entryCandidate(far, opts)), null)
})

test("suggestions mix documents and entries, one each, best pairs first, with prefixed ids", () => {
    const out = line({ id: "out" })
    const inn = line({ id: "in", description: "DUITNOW FROM PUAN AMINAH", cents: 50000, date: "2026-01-10" })
    const result = suggestMatches([out, inn], [documentCandidate(doc({}), opts), entryCandidate(entry({}), opts)])
    assert.equal(result.get("out")!.suggestion!.documentId, "document:d1")
    assert.equal(result.get("in")!.suggestion!.documentId, "transaction:t1")
})

test("two equally good candidates: one is suggested, never strong, with the rival counted", () => {
    const inn = line({ id: "in", description: "DUITNOW FROM PUAN AMINAH", cents: 50000, date: "2026-01-10" })
    const result = suggestMatches([inn], [entryCandidate(entry({ id: "a" }), opts), entryCandidate(entry({ id: "b" }), opts)]).get("in")!
    assert.ok(result.suggestion)
    assert.equal(result.suggestion!.strong, false)
    assert.equal(result.alternatives, 1)
})
