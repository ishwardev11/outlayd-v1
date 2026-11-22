import { test } from "node:test"
import assert from "node:assert/strict"
import { SAMPLE_FUND_ROWS, sampleStatement, type SampleKind } from "./sample-statements"
import type { StatementPrint } from "./statement-print"

const cell = (p: StatementPrint, label: string, col = 0) => p.tables[0].rows.find((r) => r.label === label)?.cells[col]
const KINDS: SampleKind[] = ["income_expenditure", "receipts_payments", "financial_position", "changes_in_funds", "schedules"]

test("the sample society's statements agree with each other", () => {
    const ie = sampleStatement("income_expenditure", false)
    assert.equal(cell(ie, "Total income"), 46300)
    assert.equal(cell(ie, "Total expenditure"), 38490)
    assert.equal(cell(ie, "Surplus / (deficit)"), 7810)
    assert.equal(cell(ie, "Surplus / (deficit)", 1), -2300, "last year a deficit")

    // Funds move by the surplus, and equal net assets
    const fp = sampleStatement("financial_position", false)
    const cif = sampleStatement("changes_in_funds", false)
    const opening = SAMPLE_FUND_ROWS.reduce((s, r) => s + r.opening, 0)
    assert.equal(opening + 7810, cell(cif, "Total funds", 5))
    assert.equal(cell(fp, "Net assets"), 33310)
    assert.equal(cell(fp, "Total funds"), 33310)
    assert.equal(cell(fp, "Net assets", 1), opening, "last year's net assets are this year's opening funds")
    for (const r of SAMPLE_FUND_ROWS) assert.equal(r.opening + r.income - r.expense + r.transfers_in - r.transfers_out, r.closing, r.fund_name)

    // Cash: opening + receipts - payments = closing
    const rp = sampleStatement("receipts_payments", false)
    assert.equal((cell(rp, "Opening cash and bank") as number) + (cell(rp, "Receipts less payments") as number), cell(rp, "Closing cash and bank"))
    assert.equal(cell(rp, "Closing cash and bank"), 9360 + 500)
})

test("every sample builds, and a business sees Profit and Loss", () => {
    for (const k of KINDS) assert.ok(sampleStatement(k, false).tables[0].rows.length > 0, k)
    const pl = sampleStatement("income_expenditure", true)
    assert.equal(pl.title, "Profit and Loss")
    assert.equal(cell(pl, "Net profit / (loss)"), 7810)
})
