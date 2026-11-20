import { test } from "node:test"
import assert from "node:assert/strict"
import { buildFundMemo, type MemoDocInput } from "./fund-memo"

const FUND = "f1"
const doc = (over: Partial<MemoDocInput>): MemoDocInput => ({
    id: "d1", vendor_name: "TNB Berhad", invoice_number: "INV-1", reference_number: null, document_type: "invoice",
    document_date: "2026-10-05", amount: 100, status: "paid", splits: null, fund_id: FUND, category_id: "c1",
    image_url: "org/file.pdf", remarks: null, ...over,
})

const docs: MemoDocInput[] = [
    doc({ id: "d1", remarks: "Paid by cheque 4471, approved at the March committee" }),
    doc({ id: "d2", document_date: "2026-10-06", amount: 250, status: "awaiting_payment", remarks: "  Bayaran 款项 பணம் \n second line  " }),
    doc({ id: "d3", document_date: "2026-10-07", amount: 300, splits: [{ amount: 200, fund_id: FUND, category_id: "c1" }, { amount: 100, fund_id: "other", category_id: "c2" }], remarks: "split" }),
    doc({ id: "d4", document_date: "2026-10-08", amount: 40, remarks: null }),
    doc({ id: "d5", document_date: "2026-10-09", amount: 60, remarks: "" }),
]

const build = (input: MemoDocInput[]) => buildFundMemo({
    fund: { id: FUND, name: "Building Fund", award_amount: 10000 },
    docs: input,
    categoryNames: { c1: "Rent", c2: "Printing" },
    organization: { name: "Test Society", registrationId: null },
    currency: "MYR",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    generatedBy: "tester@example.com",
    generatedAt: new Date("2026-11-01T00:00:00Z"),
})

test("each transaction carries its remarks, trimmed, empty when none", () => {
    const memo = build(docs)
    const byDoc = new Map(memo.transactions.map((t) => [t.docId, t.remarks]))
    assert.equal(byDoc.get("d1"), "Paid by cheque 4471, approved at the March committee")
    assert.equal(byDoc.get("d2"), "Bayaran 款项 பணம் \n second line")
    assert.equal(byDoc.get("d3"), "split")
    assert.equal(byDoc.get("d4"), "")
    assert.equal(byDoc.get("d5"), "")
})

test("remarks do not change any total, category or exception", () => {
    const withRemarks = build(docs)
    const without = build(docs.map((d) => ({ ...d, remarks: null })))
    assert.deepEqual(withRemarks.totals, without.totals)
    assert.deepEqual(withRemarks.byCategory, without.byCategory)
    assert.deepEqual(withRemarks.exceptions, without.exceptions)
    assert.deepEqual(
        withRemarks.transactions.map(({ remarks: _r, ...rest }) => rest), // eslint-disable-line @typescript-eslint/no-unused-vars
        without.transactions.map(({ remarks: _r, ...rest }) => rest), // eslint-disable-line @typescript-eslint/no-unused-vars
    )
    assert.equal(withRemarks.totals.periodTotal, 100 + 250 + 200 + 40 + 60)
})

test("the AI error notes never reach the memo", () => {
    const withNotes = docs.map((d) => ({ ...d, notes: "AI Extraction Error: boom" }) as MemoDocInput)
    assert.ok(!JSON.stringify(build(withNotes)).includes("AI Extraction Error"))
})
