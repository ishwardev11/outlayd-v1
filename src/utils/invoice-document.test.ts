import { test } from "node:test"
import assert from "node:assert/strict"
import { buildInvoiceContent, type InvoicePrintRecord } from "./invoice-document"

const org = {
    name: "Harapan", legal_name: "Persatuan Kebajikan Harapan", address: "12 Jalan Damai\nKuala Lumpur", registration_id: "PPM-001",
    signatories: [], currency: "MYR", payment_details: "Maybank, Persatuan Kebajikan Harapan\nAccount no. 5123 4567 8901\n",
}
const inv = (over: Partial<InvoicePrintRecord> = {}): InvoicePrintRecord => ({
    invoice_no: "INV-7", status: "open", derived_status: "open", issue_date: "2026-11-01", due_date: "2026-11-30",
    reference: "PO-55", remarks: "Thank you", total: 1250.5, paid: 0, balance: 1250.5, void_reason: null,
    lines: [{ description: "Course fees, term 1", category_name: "Programme and course fees", amount: 1000 },
            { description: "  ", category_name: "Rental income", amount: 250.5 }],
    bill_to: { name: "Sekolah ABC", address: "1 Jalan Sekolah\nPetaling Jaya", email: "bursar@abc.edu.my" },
    ...over,
})

test("invoice: letterhead, bill-to, details, lines and payment details", () => {
    const c = buildInvoiceContent(inv(), org)
    assert.deepEqual(c.letterhead, ["Persatuan Kebajikan Harapan", "Harapan", "12 Jalan Damai", "Kuala Lumpur", "Registration no. PPM-001"])
    assert.equal(c.title, "INVOICE")
    assert.deepEqual(c.meta, [["Invoice no.", "INV-7"], ["Invoice date", "2026-11-01"], ["Due date", "2026-11-30"], ["Reference", "PO-55"]])
    assert.deepEqual(c.billTo, ["Sekolah ABC", "1 Jalan Sekolah", "Petaling Jaya", "bursar@abc.edu.my"])
    assert.deepEqual(c.items, [{ description: "Course fees, term 1", amount: "1,000.00" }, { description: "Rental income", amount: "250.50" }],
        "a line without a description shows its category")
    assert.deepEqual(c.totals, [["Total", "MYR 1,250.50", true]])
    assert.deepEqual(c.paymentDetails, ["Maybank, Persatuan Kebajikan Harapan", "Account no. 5123 4567 8901"])
    assert.equal(c.notes, "Thank you")
    assert.equal(c.stamp, null)
})

test("invoice: part-paid shows the balance due", () => {
    const c = buildInvoiceContent(inv({ paid: 250.5, balance: 1000, derived_status: "part_paid" }), org)
    assert.deepEqual(c.totals, [["Total", "MYR 1,250.50", false], ["Amount paid", "MYR 250.50", false], ["Balance due", "MYR 1,000.00", true]])
    assert.equal(c.paymentDetails.length, 2)
})

test("invoice: paid, draft and void are stamped; payment details only while owed", () => {
    const paid = buildInvoiceContent(inv({ paid: 1250.5, balance: 0, derived_status: "paid" }), org)
    assert.equal(paid.stamp?.text, "PAID")
    assert.deepEqual(paid.paymentDetails, [])
    const draft = buildInvoiceContent(inv({ invoice_no: null, status: "draft", derived_status: "draft" }), org)
    assert.equal(draft.stamp?.text, "DRAFT")
    assert.equal(draft.meta[0][1], "Draft (not yet numbered)")
    const v = buildInvoiceContent(inv({ status: "void", derived_status: "void", void_reason: "Wrong school" }), org)
    assert.equal(v.stamp?.text, "VOID")
    assert.equal(v.footer, "This invoice was voided: Wrong school.")
    assert.deepEqual(v.paymentDetails, [])
    const noDue = buildInvoiceContent(inv({ due_date: null, reference: null }), { ...org, payment_details: null })
    assert.deepEqual(noDue.meta.map((m) => m[0]), ["Invoice no.", "Invoice date"])
    assert.deepEqual(noDue.paymentDetails, [])
})
