import { test } from "node:test"
import assert from "node:assert/strict"
import { buildReceiptsPayments, buildReceiptsPaymentsCsv, type RPRow } from "./receipts-payments"
import { parseCsv } from "../test/parse-csv"

const r = (section: RPRow["section"], kind: RPRow["kind"], name: string, amount: number, extra: Partial<RPRow> = {}): RPRow => ({
    section, kind, nature: null, group_name: null, category_id: `cat-${name}`, category_name: name, category_sort: 0,
    fund_id: "f1", fund_name: "General Fund", amount, ...extra,
})

// Hand-worked: opening 1,000. Receipts: donations 500 + course fees 300 + a supplier refund 20 = 820.
// Payments: rent 400 (incl. a 150 invoice payment) + salaries 250 + a donation returned 30 = 680.
// Closing = 1,000 + 820 - 680 = 1,140.
const rows: RPRow[] = [
    r("receipts", "income", "General donations", 500, { nature: "donation" }),
    r("receipts", "income", "Programme and course fees", 300, { nature: "programme_income" }),
    r("receipts", "expense", "Rent", 20, { group_name: "Administration" }),
    r("payments", "expense", "Rent", 400, { group_name: "Administration" }),
    r("payments", "expense", "Salaries", 250, { group_name: "Staff" }),
    r("payments", "income", "General donations", 30, { nature: "donation" }),
]

test("receipts and payments: groups, totals and cash that agrees", () => {
    const s = buildReceiptsPayments({
        orgType: "nonprofit", current: rows, prior: [r("receipts", "income", "General donations", 90, { nature: "donation" })],
        labels: { current: "2026", prior: "2025" },
        cash: { current: { opening: 1000, closing: 1140 }, prior: { opening: 910, closing: 1000 } },
    })
    assert.equal(s.title, "Receipts and Payments")
    assert.deepEqual(s.receipts.map((g) => g.label), ["Donations", "Programme income", "Refunds and recoveries"])
    assert.deepEqual(s.payments.map((g) => g.label), ["Staff", "Administration", "Income returned"])
    assert.deepEqual(s.totalReceipts, { current: 820, prior: 90 })
    assert.deepEqual(s.totalPayments, { current: 680, prior: 0 })
    assert.deepEqual(s.net, { current: 140, prior: 90 })
    assert.deepEqual(s.opening, { current: 1000, prior: 910 })
    assert.equal(s.balanced, true)
})

test("receipts and payments: a mismatch is reported, a fund view has no cash", () => {
    const bad = buildReceiptsPayments({ orgType: "nonprofit", current: rows, prior: null, labels: { current: "2026", prior: "" }, cash: { current: { opening: 1000, closing: 1139.99 }, prior: null } })
    assert.equal(bad.balanced, false)
    const fund = buildReceiptsPayments({ orgType: "nonprofit", current: rows, prior: null, labels: { current: "2026", prior: "" }, cash: null })
    assert.equal(fund.opening, null)
    assert.equal(fund.balanced, null)
    assert.equal(buildReceiptsPayments({ orgType: "nonprofit", current: [], prior: null, labels: { current: "", prior: "" }, cash: null }).empty, true)
})

test("receipts and payments: asset and loan cash has its own lines", () => {
    const item = (section: RPRow["section"], group: string, name: string, amount: number): RPRow =>
        r(section, "item", name, amount, { group_name: group, category_id: `item-${name}` })
    const s = buildReceiptsPayments({
        orgType: "nonprofit",
        current: [...rows, item("receipts", "Loans received", "Bank loan", 5000), item("payments", "Purchase of fixed assets", "Van", 3600),
                  item("payments", "Loan repayments", "Bank loan", 1000)],
        prior: null, labels: { current: "2026", prior: "" },
        cash: { current: { opening: 1000, closing: 1000 + 820 + 5000 - 680 - 3600 - 1000 }, prior: null },
    })
    assert.deepEqual(s.receipts.map((g) => g.label), ["Donations", "Programme income", "Refunds and recoveries", "Loans received"])
    assert.deepEqual(s.payments.map((g) => g.label).slice(-2), ["Loan repayments", "Purchase of fixed assets"])
    assert.deepEqual(s.totalReceipts, { current: 5820 })
    assert.deepEqual(s.totalPayments, { current: 5280 })
    assert.equal(s.balanced, true)
})

test("receipts and payments CSV", () => {
    const s = buildReceiptsPayments({ orgType: "nonprofit", current: rows, prior: null, labels: { current: "2026", prior: "" }, cash: { current: { opening: 1000, closing: 1140 }, prior: null } })
    const out = parseCsv(buildReceiptsPaymentsCsv(s, { orgName: "Harapan", heading: "For the year ended 31 December 2026", fundName: null, currency: "MYR" }))
    assert.deepEqual(out[6], ["Line", "2026"])
    assert.deepEqual(out[7], ["Opening cash and bank", "1000.00"])
    assert.ok(out.some((x) => x[0] === "Total receipts" && x[1] === "820.00"))
    assert.ok(out.some((x) => x[0] === "Total payments" && x[1] === "680.00"))
    assert.deepEqual(out.at(-1), ["Closing cash and bank", "1140.00"])
})
