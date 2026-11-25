import { test } from "node:test"
import assert from "node:assert/strict"
import { formLinesFor, linesMatchTotal, normaliseIssuedInvoice, sameName, termsToDays } from "./issued-invoice-extract"

const ctx = { orgNames: ["Persatuan Belia Harmoni", "Belia Harmoni Society"], baseCurrency: "MYR", now: new Date("2026-11-25T00:00:00Z") }

test("payment terms become a due date; nothing is guessed", () => {
    assert.equal(termsToDays("Net 30"), 30)
    assert.equal(termsToDays("NET30"), 30)
    assert.equal(termsToDays("Payment within 14 days"), 14)
    assert.equal(termsToDays("Due on receipt"), 0)
    assert.equal(termsToDays("COD"), 0)
    assert.equal(termsToDays("Upon agreement"), null)
    assert.equal(termsToDays(null), null)

    const d = normaliseIssuedInvoice({ issue_date: "2026-11-01", payment_terms: "Net 30", total_amount: 100, customer: { name: "Hangover Club" } }, ctx)
    assert.equal(d.dueDate, "2026-12-01")
    assert.equal(d.dueDateFrom, "terms")
    const printed = normaliseIssuedInvoice({ issue_date: "2026-11-01", due_date: "2026-11-20", payment_terms: "Net 30", total_amount: 100 }, ctx)
    assert.equal(printed.dueDate, "2026-11-20", "a printed due date wins")
    const none = normaliseIssuedInvoice({ issue_date: "30/11/2026", due_date: "N/A", total_amount: 100 }, ctx)
    assert.equal(none.issueDate, null, "only real YYYY-MM-DD dates are kept")
    assert.equal(none.dueDate, null)
})

test("the customer is read from Bill to, and an invoice to ourselves is flagged as a bill received", () => {
    const d = normaliseIssuedInvoice({ issuer_name: "Persatuan Belia Harmoni", customer: { name: " The Hangover Club Sdn Bhd ", email: "a@b.my" }, total_amount: 5000 }, ctx)
    assert.equal(d.customer.name, "The Hangover Club Sdn Bhd")
    assert.equal(d.customerIsOwnOrg, false)

    const bill = normaliseIssuedInvoice({ issuer_name: "TNB", customer: { name: "PERSATUAN BELIA HARMONI" }, total_amount: 120 }, ctx)
    assert.equal(bill.customerIsOwnOrg, true)
    assert.equal(bill.customer.name, null, "the payee is left empty")
    assert.equal(bill.flags[0].code, "CUSTOMER_IS_ORG")
    assert.match(bill.flags[0].message, /bill you received/)

    assert.ok(sameName("Hangover Club", "The Hangover Club Kuala Lumpur"))
    assert.ok(!sameName("ABC", "ABC Trading"), "short names must match exactly")
})

test("amounts, currency, deposit and invoice number are cleaned", () => {
    const d = normaliseIssuedInvoice({
        invoice_number: "# INV-0042", currency: "usd", total_amount: "5,000.00", subtotal: 4716.98, tax_amount: 283.02,
        line_items: [{ description: "Hall rental", amount: 4716.98 }, { description: "", amount: 0 }],
        deposit_paid: { amount: 1000, date: "2026-11-02" }, customer: { name: "Hangover Club" }, issue_date: "2026-11-01",
    }, ctx)
    assert.equal(d.invoiceNumber, "INV-0042")
    assert.equal(d.currency, "USD")
    assert.equal(d.total, 5000)
    assert.deepEqual(d.lines, [{ description: "Hall rental", amount: 4716.98 }])
    assert.deepEqual(d.deposit, { amount: 1000, date: "2026-11-02" })
    assert.deepEqual(formLinesFor(d), [{ description: "Hall rental", amount: 4716.98 }, { description: "Tax", amount: 283.02 }])
    assert.ok(linesMatchTotal(formLinesFor(d).map((l) => l.amount), d.total))

    const over = normaliseIssuedInvoice({ total_amount: 100, deposit_paid: { amount: 150 } }, ctx)
    assert.equal(over.deposit, null, "a deposit above the total is ignored")
    assert.equal(normaliseIssuedInvoice({ currency: "ringgit", total_amount: 1 }, ctx).currency, "MYR")
})

test("lines: one line for the total when none were read; the total must match before saving", () => {
    assert.deepEqual(formLinesFor({ lines: [], tax: null, total: 250 }), [{ description: "", amount: 250 }])
    assert.deepEqual(formLinesFor({ lines: [], tax: null, total: null }), [])
    assert.ok(!linesMatchTotal([100, 50], 150.01))
    assert.ok(linesMatchTotal([0.1, 0.2], 0.3))
    assert.ok(linesMatchTotal([1], null))
})

test("checks reuse the receipt scoring, worded for a customer", () => {
    const d = normaliseIssuedInvoice({ total_amount: 100, issue_date: "2026-11-01" }, ctx)
    const missing = d.flags.find((f) => f.code === "VENDOR_MISSING")
    assert.ok(missing && /customer/.test(missing.message))
    assert.ok(d.score < 100)
})
