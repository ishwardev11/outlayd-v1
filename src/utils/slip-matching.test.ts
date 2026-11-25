import { test } from "node:test"
import assert from "node:assert/strict"
import { normaliseSlip, rankSlipMatches, scoreSlip, slipDirection, type OpenInvoice } from "./slip-matching"

const inv = (o: Partial<OpenInvoice> & { id: string }): OpenInvoice => ({
    invoice_no: null, payee_name: "Someone", total: 4000, paid: 0, balance: 4000, issue_date: "2026-11-01", due_date: "2026-12-01", ...o,
})

test("the slip is cleaned: amount, currency, real dates, no leading #", () => {
    const s = normaliseSlip({ amount: "RM 4,000.00", currency: "rm", date: "21/11/2026", invoice_number: "# INV-0042", payer_name: " Hangover  Club " }, "MYR")
    assert.equal(s.amount, 4000)
    assert.equal(s.currency, "MYR")
    assert.equal(s.date, null, "only YYYY-MM-DD dates are kept")
    assert.equal(s.invoiceNumber, "INV-0042")
    assert.equal(s.payerName, "Hangover Club")
    assert.equal(normaliseSlip({ amount: 0 }, "MYR").amount, null)
})

test("money in or out is worked out from who received it", () => {
    const org = ["Persatuan Belia Harmoni"]
    assert.equal(slipDirection(normaliseSlip({ payer_name: "Hangover Club", recipient_name: "PERSATUAN BELIA HARMONI" }, "MYR"), org), "receivable")
    assert.equal(slipDirection(normaliseSlip({ payer_name: "Persatuan Belia Harmoni", recipient_name: "TNB" }, "MYR"), org), "payable")
    assert.equal(slipDirection(normaliseSlip({ payer_name: "A", recipient_name: "B" }, "MYR"), org), null)
})

test("a RM4,000 slip referencing INV-0042 suggests that invoice first", () => {
    const slip = normaliseSlip({ amount: 4000, date: "2026-11-21", payer_name: "Hangover Club", recipient_reference: "Payment for INV-0042" }, "MYR")
    const list = rankSlipMatches(slip, [
        inv({ id: "a", invoice_no: "INV-0041", payee_name: "Hangover Club", balance: 4000 }),
        inv({ id: "b", invoice_no: "INV-0042", payee_name: "Hangover Club", total: 5000, paid: 1000, balance: 4000 }),
        inv({ id: "c", invoice_no: "INV-0050", payee_name: "Other Society", balance: 9000 }),
    ], slip.payerName)
    assert.equal(list[0].invoiceId, "b")
    assert.ok(list[0].reasons.some((r) => /INV-0042/.test(r)))
    assert.ok(list[0].full)
    assert.ok(!list.some((m) => m.invoiceId === "c"), "only the amount fitting, from someone else, is not suggested")
})

test("two same-amount invoices are both shown, ranked by name and date", () => {
    const slip = normaliseSlip({ amount: 500, date: "2026-11-20", payer_name: "Kelab Sukan Maju" }, "MYR")
    const list = rankSlipMatches(slip, [
        inv({ id: "far", payee_name: "Kelab Sukan Maju", balance: 500, issue_date: "2026-06-01", due_date: "2026-07-01" }),
        inv({ id: "near", payee_name: "Kelab Sukan Maju", balance: 500, issue_date: "2026-11-01", due_date: "2026-11-30" }),
        inv({ id: "other", payee_name: "Hangover Club", balance: 500, issue_date: "2026-11-01", due_date: "2026-11-30" }),
    ], slip.payerName)
    assert.deepEqual(list.map((m) => m.invoiceId), ["near", "far", "other"])
})

test("a deposit can match; more than the balance never does", () => {
    const deposit = normaliseSlip({ amount: 1000, payer_name: "Hangover Club" }, "MYR")
    const m = scoreSlip(deposit, inv({ id: "x", payee_name: "Hangover Club", total: 5000, balance: 5000 }), deposit.payerName)
    assert.ok(m && !m.full && m.reasons.includes("Could be a deposit or part-payment"))
    const over = normaliseSlip({ amount: 6000, invoice_number: "INV-1" }, "MYR")
    assert.equal(scoreSlip(over, inv({ id: "y", invoice_no: "INV-1", balance: 5000 }), null), null)
})
