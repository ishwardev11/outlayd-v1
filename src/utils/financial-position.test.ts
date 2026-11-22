import { test } from "node:test"
import assert from "node:assert/strict"
import { buildChangesInFunds, buildChangesInFundsCsv, buildFinancialPosition, buildFinancialPositionCsv, type BSRow, type CIFRow } from "./financial-position"
import { parseCsv } from "../test/parse-csv"

// The balance sheet of the stage 5a scenario on 30 June 2026 (worked by hand):
// van 30,000; Main 9,500; cash box 500; deposit 1,500; we owe 600; loan 19,000; net assets 21,900;
// funds General 19,500 + Building 2,400.
const rows: BSRow[] = [
    { section: "fixed_assets", ref_id: "van", label: "Van", amount: 30000 },
    { section: "fixed_assets", ref_id: "printer", label: "Printer", amount: 0 },
    { section: "cash", ref_id: "main", label: "Main Account", amount: 9500 },
    { section: "cash", ref_id: "box", label: "Cash box", amount: 500 },
    { section: "receivables", ref_id: null, label: "Owed to you (invoices)", amount: 0 },
    { section: "payables", ref_id: null, label: "You owe (bills)", amount: 600 },
    { section: "other_current_assets", ref_id: "dep", label: "Rental deposit", amount: 1500 },
    { section: "non_current_liabilities", ref_id: "loan", label: "Bank loan", amount: 19000 },
    { section: "funds", ref_id: "gen", label: "General Fund", amount: 19500 },
    { section: "funds", ref_id: "bld", label: "Building Fund", amount: 2400 },
]
const funds = [
    { id: "gen", name: "General Fund", fund_type: "unrestricted", is_default: true },
    { id: "bld", name: "Building Fund", fund_type: "restricted", is_default: false },
]

test("financial position: sections, totals and the balance check", () => {
    const prior = rows.map((r) => ({ ...r, amount: r.section === "funds" ? (r.ref_id === "gen" ? 25500 : 3000) : r.ref_id === "van" ? 36000 : r.ref_id === "main" ? 10000 : r.ref_id === "loan" ? 20000 : r.ref_id === "dep" ? 1500 : r.ref_id === "box" ? 500 : r.section === "payables" ? 300 : r.section === "receivables" ? 800 : 0 }))
    const s = buildFinancialPosition({ current: rows, prior, labels: { current: "30 Jun 2026", prior: "30 Jun 2025" }, funds })
    assert.deepEqual(s.nonCurrentAssets.lines.map((l) => l.label), ["Van"], "zero lines are left out")
    assert.deepEqual(s.currentAssets.lines.map((l) => l.label), ["Cash box", "Main Account", "Owed to you (invoices)", "Rental deposit"])
    assert.deepEqual(s.totalAssets, { current: 41500, prior: 48800 })
    assert.deepEqual(s.totalLiabilities, { current: 19600, prior: 20300 })
    assert.deepEqual(s.netAssets, { current: 21900, prior: 28500 })
    assert.deepEqual(s.restrictedFunds.lines.map((l) => l.label), ["Building Fund"])
    assert.deepEqual(s.totalFunds, { current: 21900, prior: 28500 })
    assert.equal(s.balanced, true)
    const off = buildFinancialPosition({ current: rows.map((r) => (r.ref_id === "box" ? { ...r, amount: 499.99 } : r)), prior: null, labels: { current: "x", prior: "" }, funds })
    assert.equal(off.balanced, false)
    assert.deepEqual(off.difference, { current: -0.01 })
})

test("financial position CSV", () => {
    const s = buildFinancialPosition({ current: rows, prior: null, labels: { current: "30 Jun 2026", prior: "" }, funds })
    const out = parseCsv(buildFinancialPositionCsv(s, { orgName: "=Harapan", heading: "As at 30 June 2026", currency: "MYR" }))
    assert.equal(out[0][0], "'=Harapan")
    assert.ok(out.some((r) => r[0] === "Net assets" && r[1] === "21900.00"))
    assert.deepEqual(out.at(-1), ["Total funds", "21900.00"])
})

const cif = (over: Partial<CIFRow>): CIFRow => ({ fund_id: "x", fund_name: "X", fund_type: "unrestricted", is_default: false, archived: false,
    opening: 0, income: 0, expense: 0, transfers_in: 0, transfers_out: 0, closing: 0, ...over })

test("changes in funds: groups, totals, transfers balance, empty funds hidden", () => {
    const s = buildChangesInFunds([
        cif({ fund_id: "gen", fund_name: "General Fund", is_default: true, opening: 25500, income: 2000, expense: 7500, transfers_out: 500, closing: 19500 }),
        cif({ fund_id: "bld", fund_name: "Building Fund", fund_type: "restricted", opening: 3000, expense: 1100, transfers_in: 500, closing: 2400 }),
        cif({ fund_id: "old", fund_name: "Old Fund" }),
    ])
    assert.deepEqual(s.groups.map((g) => g.title), ["Restricted funds", "Unrestricted funds"])
    assert.deepEqual(s.groups[1].rows.map((r) => r.fund_name), ["General Fund"], "a fund with nothing is left out")
    assert.equal(s.total.opening, 28500)
    assert.equal(s.total.closing, 21900)
    assert.equal(s.transfersBalance, true)
    const out = parseCsv(buildChangesInFundsCsv(s, { orgName: "H", heading: "1 Jan to 30 Jun 2026", currency: "MYR" }))
    assert.deepEqual(out.at(-1), ["Total funds", "28500.00", "2000.00", "8600.00", "500.00", "500.00", "21900.00"])
})
