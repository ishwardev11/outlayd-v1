import { test } from "node:test"
import assert from "node:assert/strict"
import { integrityFixHref, integrityMessage, periodPhrase } from "./integrity-messages"

const money = (n: number) => `RM${n.toFixed(2)}`
const fail = (code: string, affected: number | null = null, amount: number | null = null, monthEnd: string | null = null) =>
    ({ code, passed: false, affected, amount, monthEnd })

test("the period in words", () => {
    assert.equal(periodPhrase("2026-03-01", "2026-03-31"), "in March 2026")
    assert.equal(periodPhrase("2026-02-01", "2026-02-28"), "in February 2026")
    assert.equal(periodPhrase("2026-01-01", "2026-12-31"), "in 2026")
    assert.equal(periodPhrase("2026-01-03", "2026-03-31"), "between 3 Jan 2026 and 31 Mar 2026")
})

test("each failed check says what is wrong and how many, in plain words", () => {
    const m = (c: ReturnType<typeof fail>) => integrityMessage(c, "2026-03-01", "2026-03-31", money)
    assert.equal(m(fail("uncategorised", 3)), "3 entries in March 2026 have no category")
    assert.equal(m(fail("uncategorised", 1)), "1 entry in March 2026 has no category")
    assert.equal(m(fail("receipts_missing", 1)), "1 invoice you issued in March 2026 has a payment without its receipt")
    assert.equal(m(fail("lines_balanced", 2)), "2 entries in March 2026 do not add up, or have a line without a fund")
    assert.equal(m(fail("balance_check", null, -12.5)), "At 31 Mar 2026, assets less liabilities differ from the funds by RM12.50")
    assert.equal(m(fail("prior_year", null, 40)), "The funds at the end of the last period differ from this period's opening by RM40.00")
    assert.equal(m(fail("invoices", 1)), "1 invoice is overpaid, or has a payment while void")
    assert.equal(m(fail("reconciled", 2, null, "2026-03-31")), "2 accounts are not reconciled at 31 Mar 2026, or have a difference not explained")
    assert.equal(m(fail("restricted_negative", 1)), "1 restricted fund is below zero at 31 Mar 2026")
    assert.match(m(fail("opening_complete")) ?? "", /opening position/)
    assert.equal(integrityMessage({ ...fail("uncategorised", 3), passed: true }, "2026-03-01", "2026-03-31", money), null, "nothing when it passes")
    assert.equal(integrityMessage({ ...fail("balance_check"), passed: null }, "2026-03-01", "2026-03-31", money), null, "nothing when it does not apply")
})

test("Fix goes to exactly those records", () => {
    assert.equal(integrityFixHref("uncategorised", "2026-03-01", "2026-03-31", null), "/inbox?ufrom=2026-03-01&uto=2026-03-31#uncategorised")
    assert.equal(integrityFixHref("receipts_missing", "2026-03-01", "2026-03-31", null), "/invoices?tab=receivable&status=receipt_missing&from=2026-03-01&to=2026-03-31")
    assert.equal(integrityFixHref("lines_balanced", "2026-03-01", "2026-03-31", null), "/transactions?from=2026-03-01&to=2026-03-31&check=lines_balanced")
    assert.equal(integrityFixHref("invoices", "2026-03-01", "2026-03-31", null), "/invoices?check=invoices")
    assert.equal(integrityFixHref("reconciled", "2026-03-01", "2026-03-31", "2026-03-31"), "/bank?tab=reconciliation&month=2026-03-31")
    for (const code of ["uncategorised", "lines_balanced", "opening_complete", "balance_check", "prior_year", "invoices", "reconciled", "restricted_negative", "receipts_missing"]) {
        assert.ok(integrityFixHref(code, "2026-03-01", "2026-03-31", null), `${code} has a Fix link`)
    }
})
