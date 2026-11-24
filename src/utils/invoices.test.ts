import { test } from "node:test"
import assert from "node:assert/strict"
import { ageingSummary, buildInvoicesCsv, parseInvoiceFilters, parseInvoiceInput, parsePaymentInput, statusLabel, type InvoiceRow } from "./invoices"
import { parseCsv } from "../test/parse-csv"

const P = "00000000-0000-4000-8000-000000000001"
const C = "00000000-0000-4000-8000-000000000002"
const F = "00000000-0000-4000-8000-000000000003"

test("filters: bad values fall back, a uuid opens an invoice", () => {
    const none = { from: "", to: "", category: "", fund: "" }
    assert.deepEqual(parseInvoiceFilters({}), { tab: "payable", status: "all", q: "", page: 1, open: "", ...none })
    assert.deepEqual(parseInvoiceFilters({ tab: "receivable", status: "overdue", q: "  Dewan ", page: "3", open: P }),
        { tab: "receivable", status: "overdue", q: "Dewan", page: 3, open: P, ...none })
    assert.deepEqual(parseInvoiceFilters({ tab: "x", status: "bogus", page: "-2", open: "1; drop" }), { tab: "payable", status: "all", q: "", page: 1, open: "", ...none })
    // From a statement line
    assert.deepEqual(parseInvoiceFilters({ from: "2026-01-01", to: "2026-12-31", category: C, fund: F }), { tab: "payable", status: "all", q: "", page: 1, open: "", from: "2026-01-01", to: "2026-12-31", category: C, fund: F })
    assert.deepEqual(parseInvoiceFilters({ from: "2026-02-30", to: "x", category: "c", fund: "f" }), { tab: "payable", status: "all", q: "", page: 1, open: "", ...none })
    assert.equal(statusLabel("part_paid"), "Part-paid")
})

test("ageing: outstanding balances by age, in whole cents", () => {
    const s = ageingSummary([
        { balance: 0.1, ageing_bucket: "current" }, { balance: 0.2, ageing_bucket: "current" },
        { balance: 100, ageing_bucket: "1_30" }, { balance: 50.5, ageing_bucket: "61_plus" },
        { balance: 999, ageing_bucket: null }, // paid, draft or void: not outstanding
    ])
    assert.deepEqual(s, { current: 0.3, "1_30": 100, "31_60": 0, "61_plus": 50.5, total: 150.8 })
})

const good = { direction: "payable", payee_id: P, issue_date: "2026-11-01", due_date: "2026-12-01", invoice_no: " SUP-1 ",
    lines: [{ amount: "1,200.50", category_id: C, fund_id: F, description: " Hall " }, { amount: 99, category_id: C }] }

test("invoice input: cleaned, checked, bills keep the supplier number", () => {
    const r = parseInvoiceInput(good)
    assert.ok(r.ok)
    assert.equal(r.value.status, "open")
    assert.equal(r.value.invoice_no, "SUP-1")
    assert.deepEqual(r.value.lines[0], { description: "Hall", amount: 1200.5, fund_id: F, category_id: C })
    assert.equal(r.value.lines[1].fund_id, null)
    const rec = parseInvoiceInput({ ...good, direction: "receivable", status: "draft" })
    assert.ok(rec.ok && rec.value.invoice_no === null && rec.value.status === "draft", "an issued invoice gets its number from the database")
})

test("invoice input: refusals", () => {
    const err = (over: object) => { const r = parseInvoiceInput({ ...good, ...over }); return r.ok ? "" : r.error }
    assert.match(err({ direction: "x" }), /bill or an invoice/)
    assert.match(err({ payee_id: "" }), /supplier/)
    assert.match(err({ issue_date: "2026-02-30" }), /invoice date/)
    assert.match(err({ due_date: "2026-10-01" }), /cannot be before/)
    assert.match(err({ lines: [] }), /at least one line/)
    assert.match(err({ lines: [{ amount: "-5", category_id: C }] }), /above zero/)
    assert.match(err({ lines: [{ amount: "1.005", category_id: C }] }), /two decimals/)
    assert.match(err({ lines: [{ amount: "5" }] }), /category for every line/)
    assert.match(err({ status: "void" }), /draft or as open/)
    assert.match(err({ remarks: "x".repeat(501) }), /500/)
})

test("payment input", () => {
    const r = parsePaymentInput({ invoice_id: P, amount: "250", tx_date: "2026-11-20", reference: " FPX-1 " })
    assert.ok(r.ok && r.value.amount === 250 && r.value.reference === "FPX-1" && r.value.account_id === null)
    const e = parsePaymentInput({ invoice_id: P, amount: "0", tx_date: "2026-11-20" })
    assert.ok(!e.ok && /above zero/.test(e.error))
    const d = parsePaymentInput({ invoice_id: P, amount: "1", tx_date: "yesterday" })
    assert.ok(!d.ok && /payment date/.test(d.error))
})

test("CSV: every invoice, formula-safe", () => {
    const row: InvoiceRow = {
        id: P, direction: "payable", invoice_no: "=1+1", payee_id: null, payee_name: 'Kedai "Maju"', issue_date: "2026-10-01",
        due_date: "2026-10-31", reference: null, remarks: "x", total: 500, paid: 200, balance: 300, status: "open",
        derived_status: "overdue", days_overdue: 22, ageing_bucket: "1_30", is_opening_balance: false, source: "document",
        document_id: C, has_attachment: false, void_reason: null,
    }
    const rows = parseCsv(buildInvoicesCsv([row], "MYR"))
    assert.equal(rows[0][5], "Total (MYR)")
    assert.deepEqual(rows[1].slice(0, 11), ["'=1+1", "Bill", 'Kedai "Maju"', "2026-10-01", "2026-10-31", "500.00", "200.00", "300.00", "Overdue", "22", ""])
    assert.equal(rows[1][11], "Uploaded bill")
})

test("\"Still to pay\" (unpaid) is a status filter: what the old Ledger called Awaiting payment", () => {
    assert.equal(parseInvoiceFilters({ status: "unpaid" }).status, "unpaid")
})
