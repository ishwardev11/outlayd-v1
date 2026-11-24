import { test } from "node:test"
import assert from "node:assert/strict"
import { buildFundMemo, type MemoLedgerRow } from "./fund-memo"

// Rows as the database function fund_memo_lines returns them, for the demo society's Education Fund
// (spec section 11) plus a few edge cases. Amounts are signed as in Income & Expenditure.
const row = (over: Partial<MemoLedgerRow>): MemoLedgerRow => ({
    row_kind: "transaction", row_id: "t1", line_no: 1, row_date: "2026-01-15", kind: "income",
    category_id: "c-grant", category_name: "Government grants", description: null, amount: 12000,
    payee: "Kementerian Pendidikan", reference: "GRANT-26", remarks: null, tx_type: "money_in", is_refund: false,
    document_id: null, attachment_url: null, document_file: null, invoice_total: null, invoice_paid: null,
    item_id: null, item_name: null, ...over,
})

const grant = row({})
// The printing bill: 2,000 on 10 Mar, 800 paid by the end of the period, from an upload with a file
const bill = row({
    row_kind: "invoice", row_id: "inv-print", row_date: "2026-03-10", kind: "expense", category_id: "c-print",
    category_name: "Printing", amount: 2000, payee: "Cetak Jaya", reference: "CJ-310", tx_type: "money_out",
    document_id: "doc-print", document_file: "org/print.jpg", invoice_total: 2000, invoice_paid: 800,
})
// The supplier refund: money in against an expense category reduces the expense
const refund = row({
    row_id: "t-refund", row_date: "2026-06-15", kind: "expense", category_id: "c-print", category_name: "Printing",
    amount: -250, payee: "Cetak Jaya", reference: "CN-15", is_refund: true, attachment_url: "org/cn15.pdf",
})
const rows: MemoLedgerRow[] = [grant, bill, refund]

const build = (input: MemoLedgerRow[], over: Partial<Parameters<typeof buildFundMemo>[0]> = {}) => buildFundMemo({
    fund: { id: "edu", name: "Education Fund" },
    rows: input,
    organization: { name: "Harapan Demo Society", registrationId: null },
    currency: "MYR",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    generatedBy: "tester@example.com",
    generatedAt: new Date("2027-01-05T00:00:00Z"),
    ...over,
})

test("totals follow Income & Expenditure: grant 12,000; printing 2,000 less the 250 refund", () => {
    const memo = build(rows)
    assert.equal(memo.totals.income, 12000)
    assert.equal(memo.totals.expenditure, 1750)
    assert.equal(memo.totals.net, 10250)
    assert.deepEqual(memo.incomeByCategory.map((c) => [c.name, c.total]), [["Government grants", 12000]])
    assert.deepEqual(memo.byCategory.map((c) => [c.name, c.total]), [["Printing", 1750]])
})

test("a part-paid bill is one row, split into paid and unpaid; its payment is not a second row", () => {
    const memo = build(rows)
    const billRow = memo.transactions.find((t) => t.rowId === "inv-print")!
    assert.equal(billRow.amount, 2000)
    assert.equal(billRow.paid, 800)
    assert.equal(billRow.unpaid, 1200)
    assert.equal(billRow.statusLabel, "Part-paid (MYR 800.00 paid)")
    assert.equal(memo.transactions.filter((t) => t.reference === "CJ-310").length, 1)
    // paid: 800 of the bill less the 250 refund received; unpaid: 1,200
    assert.equal(memo.totals.expenditurePaid, 550)
    assert.equal(memo.totals.expenditureUnpaid, 1200)
})

test("a bill fully paid by the period end shows Paid; unpaid shows Unpaid", () => {
    const paid = build([{ ...bill, invoice_paid: 2000 }]).transactions[0]
    assert.equal(paid.statusLabel, "Paid")
    assert.deepEqual([paid.paid, paid.unpaid], [2000, 0])
    const unpaid = build([{ ...bill, invoice_paid: 0 }]).transactions[0]
    assert.equal(unpaid.statusLabel, "Unpaid")
    assert.deepEqual([unpaid.paid, unpaid.unpaid], [0, 2000])
})

test("a part-paid bill with several lines shares the payment in proportion, to the cent", () => {
    const a = { ...bill, line_no: 1, amount: 1000.01, invoice_total: 3000, invoice_paid: 1000 }
    const b = { ...bill, line_no: 2, amount: 1999.99, invoice_total: 3000, invoice_paid: 1000 }
    const memo = build([a, b])
    const [x, y] = memo.transactions
    const cents = (n: number) => Math.round(n * 100)
    assert.equal(cents(x.paid) + cents(x.unpaid), 100001)
    assert.equal(cents(y.paid) + cents(y.unpaid), 199999)
    assert.equal(Math.round((x.paid + y.paid) * 100), 100000)
})

test("a refund is a negative expense labelled Refund received", () => {
    const r = build(rows).transactions.find((t) => t.rowId === "t-refund")!
    assert.equal(r.amount, -250)
    assert.equal(r.statusLabel, "Refund received")
    assert.equal(r.kind, "expense")
})

test("income is listed before spending; numbering follows that order", () => {
    const memo = build([refund, bill, grant])
    assert.deepEqual(memo.transactions.map((t) => [t.txnNo, t.rowId]), [["T001", "t1"], ["T002", "inv-print"], ["T003", "t-refund"]])
})

test("files: the entry's own attachment, else the upload it came from; links use the files route kinds", () => {
    const memo = build(rows)
    const by = new Map(memo.transactions.map((t) => [t.rowId, t.attachment]))
    assert.deepEqual(by.get("inv-print"), { kind: "document", id: "doc-print" })
    assert.deepEqual(by.get("t-refund"), { kind: "transaction", id: "t-refund" })
    assert.equal(by.get("t1"), null)
    const own = build([{ ...bill, attachment_url: "org/bill.pdf" }]).transactions[0]
    assert.deepEqual(own.attachment, { kind: "invoice", id: "inv-print" })
})

test("checks: missing receipts and references are flagged for spending only, never for income or depreciation", () => {
    const noFile = row({ row_id: "t-rent", row_date: "2026-05-02", kind: "expense", category_name: "Rent", amount: 3000, payee: "Landlord", reference: null, tx_type: "money_out" })
    const dep = row({ row_kind: "depreciation", row_id: "van", line_no: null, row_date: "2026-02-01", kind: "expense", category_name: "Depreciation", amount: 750, payee: null, reference: null, tx_type: null, item_id: "van", item_name: "Van" })
    const memo = build([grant, noFile, dep])
    const rent = memo.transactions.find((t) => t.rowId === "t-rent")!
    const byCode = new Map(memo.exceptions.map((e) => [e.code, e.txnNos]))
    assert.deepEqual(byCode.get("NO_RECEIPT"), [rent.txnNo])
    assert.deepEqual(byCode.get("NO_REFERENCE"), [rent.txnNo])
})

test("depreciation is non-cash, one row per asset for the period", () => {
    const months = [2, 3, 4].map((m) => row({
        row_kind: "depreciation", row_id: "van", line_no: null, row_date: `2026-0${m}-01`, kind: "expense",
        category_name: "Depreciation", amount: 750, payee: null, reference: null, tx_type: null, item_id: "van", item_name: "Van",
    }))
    const memo = build(months)
    assert.equal(memo.transactions.length, 1)
    const d = memo.transactions[0]
    assert.deepEqual([d.payee, d.amount, d.nonCash, d.paid, d.unpaid, d.date], ["Van", 2250, 2250, 0, 0, "2026-02-01"])
    assert.equal(d.statusLabel, "Non-cash")
    assert.equal(memo.totals.expenditureNonCash, 2250)
    assert.equal(memo.totals.expenditure, 2250)
})

test("assets bought are listed, not counted in the totals", () => {
    const van = row({ row_kind: "asset_purchase", row_id: "t-van", row_date: "2026-02-01", kind: null, category_id: null, category_name: null, amount: 36000, payee: "Toyota", reference: null, tx_type: "money_out", item_id: "van", item_name: "Van" })
    const memo = build([grant, van])
    assert.equal(memo.totals.assetsBought, 36000)
    assert.deepEqual(memo.assetsBought.map((a) => [a.item, a.payee, a.amount]), [["Van", "Toyota", 36000]])
    assert.equal(memo.totals.expenditure, 0)
    assert.equal(memo.transactions.length, 1)
})

test("rows before the period count towards the award used, not towards the period", () => {
    const early = { ...bill, row_date: "2025-12-10", invoice_paid: 2000 }
    const memo = build([early, refund], {
        fund: { id: "edu", name: "Education Fund", award_amount: 1500, period_start: "2025-12-01" },
    })
    assert.equal(memo.totals.expenditure, -250)
    assert.equal(memo.totals.cumulativeExpenditure, 1750)
    assert.equal(memo.totals.remaining, -250)
    assert.ok(memo.exceptions.some((e) => e.code === "OVER_AWARD"))
})

test("entries outside the grant period are flagged", () => {
    const memo = build(rows, { fund: { id: "edu", name: "Education Fund", period_start: "2026-02-01", period_end: "2026-12-31" } })
    const outside = memo.exceptions.find((e) => e.code === "OUTSIDE_GRANT_PERIOD")!
    assert.deepEqual(outside.txnNos, [memo.transactions.find((t) => t.rowId === "t1")!.txnNo])
})

test("uploads not yet approved are counted in a note only, allocated by their splits", () => {
    const memo = build(rows, {
        pendingDocs: [
            { id: "p1", document_date: "2026-04-01", amount: 90, status: "needs_review", splits: null, fund_id: "edu" },
            { id: "p2", document_date: null, amount: 300, status: "extracting", splits: [{ amount: 100, fund_id: "edu", category_id: null }, { amount: 200, fund_id: "gen", category_id: null }], fund_id: null },
            { id: "p3", document_date: "2026-04-01", amount: 50, status: "DUPLICATE_WARNING", splits: null, fund_id: "edu" },
            { id: "p4", document_date: "2026-04-01", amount: 70, status: "needs_review", splits: null, fund_id: "gen" },
            { id: "p5", document_date: "2025-04-01", amount: 70, status: "needs_review", splits: null, fund_id: "edu" },
        ],
    })
    assert.deepEqual(memo.excluded, { pendingReviewCount: 2, pendingReviewAmount: 190, duplicateCount: 1 })
    assert.equal(memo.totals.expenditure, 1750)
})

test("each entry carries its remarks, trimmed, and remarks never change a figure", () => {
    const withRemarks = build([{ ...refund, remarks: "  Credit note, Bayaran 款项 \n second line  " }, bill, grant])
    const without = build([refund, bill, grant])
    assert.equal(withRemarks.transactions.find((t) => t.rowId === "t-refund")!.remarks, "Credit note, Bayaran 款项 \n second line")
    assert.deepEqual(withRemarks.totals, without.totals)
    assert.deepEqual(withRemarks.exceptions, without.exceptions)
})

test("foreign currency details come from the upload the entry came from", () => {
    const memo = build(rows, { foreign: { "doc-print": { original_currency: "usd", original_amount: 450, exchange_rate: 4.4444, exchange_rate_source: "ecb" } } })
    assert.deepEqual(memo.transactions.find((t) => t.rowId === "inv-print")!.foreign, { currency: "USD", originalAmount: 450, rate: 4.4444, source: "ecb" })
})

test("the AI error notes never reach the memo", () => {
    const withNotes = rows.map((r) => ({ ...r, notes: "AI Extraction Error: boom" }) as MemoLedgerRow)
    assert.ok(!JSON.stringify(build(withNotes)).includes("AI Extraction Error"))
})
