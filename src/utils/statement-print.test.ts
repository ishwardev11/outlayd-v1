import { test } from "node:test"
import assert from "node:assert/strict"
import { buildStatement } from "./income-expenditure"
import { buildFinancialPosition, buildChangesInFunds } from "./financial-position"
import { buildReceiptsPayments } from "./receipts-payments"
import { printAmount, printChangesInFunds, printFinancialPosition, printIncomeExpenditure, printReceiptsPayments, printSchedules } from "./statement-print"
import { buildStatementPdf } from "./statement-pdf"

const ie = (kind: "income" | "expense", name: string, amount: number, extra: Partial<{ nature: string; group_name: string }> = {}) => ({
    kind, nature: extra.nature ?? null, group_name: extra.group_name ?? null, category_id: name, category_name: name, category_sort: 0,
    fund_id: "f1", fund_name: "General Fund", amount,
})

test("amounts: thousands, negatives in brackets, zero as a dash, text as it is", () => {
    assert.equal(printAmount(1234.5), "1,234.50")
    assert.equal(printAmount(-60), "(60.00)")
    assert.equal(printAmount(0), "-")
    assert.equal(printAmount(null), "")
    assert.equal(printAmount("3"), "3")
})

test("Income and Expenditure prints the same lines and totals as the screen", () => {
    const s = buildStatement({
        orgType: "nonprofit", layout: "total", labels: { current: "2026", prior: "2025" }, prior: null,
        current: [ie("income", "General donations", 2000, { nature: "donation" }), ie("expense", "Rent", 500, { group_name: "Administration" })],
    })
    const p = printIncomeExpenditure(s, { heading: "For the year ended 31 December 2026", fundName: null, currency: "MYR", from: "2026-01-01", to: "2026-12-31" })
    const rows = p.tables[0].rows
    assert.deepEqual(p.tables[0].columns, ["2026"])
    assert.equal(p.subheading, "All funds")
    assert.deepEqual(rows.find((r) => r.label === "General donations"), { label: "General donations", cells: [2000], style: "line" })
    assert.deepEqual(rows.find((r) => r.label === "Total income")?.cells, [2000])
    assert.deepEqual(rows.find((r) => r.label === "Total expenditure")?.cells, [500])
    assert.deepEqual(rows[rows.length - 1], { label: "Surplus / (deficit)", cells: [1500], style: "grand" })
    assert.equal(rows[0].style, "section")
    assert.equal(p.fileName, "statement-of-income-and-expenditure-2026-01-01-to-2026-12-31.pdf")
})

test("Receipts and Payments starts and ends with cash", () => {
    const s = buildReceiptsPayments({
        orgType: "nonprofit", labels: { current: "2026", prior: "2025" }, prior: null,
        current: [{ ...ie("income", "General donations", 300, { nature: "donation" }), section: "receipts" }],
        cash: { current: { opening: 100, closing: 400 }, prior: null },
    })
    const rows = printReceiptsPayments(s, { heading: "h", fundName: "Building Fund", currency: "MYR", from: "a", to: "b" }).tables[0].rows
    assert.equal(rows[0].label, "Opening cash and bank")
    assert.deepEqual(rows[rows.length - 1], { label: "Closing cash and bank", cells: [400], style: "grand" })
})

test("Financial Position and Changes in Funds", () => {
    const bs = buildFinancialPosition({
        current: [{ section: "cash", ref_id: "a", label: "Main account", amount: 1000 }, { section: "funds", ref_id: "f1", label: "General Fund", amount: 1000 }],
        prior: null, labels: { current: "31 Dec 2026", prior: "" }, funds: [{ id: "f1", name: "General Fund", fund_type: "unrestricted", is_default: true }],
    })
    const fp = printFinancialPosition(bs, { heading: "As at 31 December 2026", currency: "MYR", asAt: "2026-12-31" })
    const rows = fp.tables[0].rows
    assert.ok(rows.some((r) => r.label === "None" && r.style === "note"), "no liabilities says None")
    assert.deepEqual(rows.find((r) => r.label === "Net assets")?.cells, [1000])
    assert.deepEqual(rows[rows.length - 1].cells, [1000])

    const cif = buildChangesInFunds([{ fund_id: "f1", fund_name: "General Fund", fund_type: "unrestricted", is_default: true, archived: false,
        opening: 100, income: 50, expense: 20, transfers_in: 0, transfers_out: 10, closing: 120 }])
    const c = printChangesInFunds(cif, { heading: "h", currency: "MYR", from: "a", to: "b" })
    assert.equal(c.tables[0].columns.length, 6)
    assert.equal(c.landscape, true)
    assert.deepEqual(c.tables[0].rows.find((r) => r.label === "General Fund")?.cells, [100, 50, 20, 0, 10, 120])
})

test("Schedules: disposals shown as reductions, totals, donor list only when asked", () => {
    const p = printSchedules({
        fixedAssets: [{ name: "Van", fund: "General Fund", cost_open: 60000, additions: 0, disposals_cost: 0, cost_close: 60000, dep_open: 24000, dep_charge: 6000, dep_disposals: 0, dep_close: 30000, nbv_close: 30000 },
            { name: "Laptop", fund: "", cost_open: 0, additions: 3600, disposals_cost: 3600, cost_close: 0, dep_open: 0, dep_charge: 400, dep_disposals: 400, dep_close: 0, nbv_close: 0 }],
        ageing: [{ direction: "payable", bucket: "1_30", amount: 300 }],
        byFund: [], donors: null,
    }, { heading: "h", currency: "MYR", from: "a", to: "b" })
    assert.equal(p.tables.length, 3)
    assert.deepEqual(p.tables[0].rows[1].cells.slice(0, 3), [0, 3600, -3600])
    assert.deepEqual(p.tables[0].rows[2], { label: "Total", cells: [60000, 3600, -3600, 60000, 24000, 6400, -400, 30000, 30000], style: "grand" })
    assert.deepEqual(p.tables[1].rows[1].cells, [0, 300, 0, 0])
    assert.equal(p.tables[2].rows[0].style, "note")
})

test("the PDF builds, with a DRAFT mark and long statements running onto more pages", () => {
    const lines = Array.from({ length: 120 }, (_, i) => ie("expense", `Category ${i}`, i + 1, { group_name: "Administration" }))
    const s = buildStatement({ orgType: "nonprofit", layout: "total", labels: { current: "2026", prior: "2025" }, prior: null, current: lines })
    const p = printIncomeExpenditure(s, { heading: "h", fundName: null, currency: "MYR", from: "a", to: "b" })
    const frame = { letterhead: ["Persatuan Contoh", "1 Jalan Satu"], letterheadImage: null, signatories: [{ name: "Aminah", title: "Treasurer" }], statementNote: "Unaudited", preparedOn: "22 Nov 2026" }
    const draft = buildStatementPdf(p, { ...frame, draft: true })
    assert.ok(draft.getNumberOfPages() >= 3)
    const out = draft.output()
    assert.ok(out.includes("DRAFT"), "draft mark")
    assert.ok(out.includes("Page 1 of"), "page numbers")
    assert.ok(out.includes("Unaudited"), "statement line")
    assert.ok(out.includes("Aminah"), "signatory")
    assert.ok(!buildStatementPdf(p, { ...frame, draft: false }).output().includes("DRAFT"), "final has no draft mark")
})
