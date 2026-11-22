import { test } from "node:test"
import assert from "node:assert/strict"
import { buildStatement, buildStatementCsv, columnLabel, financialYear, formatAmount, parseIEFilters, periodHeading, shiftYear, type IERow } from "./income-expenditure"
import { parseCsv } from "../test/parse-csv"

const GF = "00000000-0000-4000-8000-000000000001"
const BF = "00000000-0000-4000-8000-000000000002"
const r = (kind: IERow["kind"], name: string, amount: number, extra: Partial<IERow> = {}): IERow => ({
    kind, nature: null, group_name: null, category_id: `cat-${name}`, category_name: name, category_sort: 0,
    fund_id: GF, fund_name: "General Fund", amount, ...extra,
})

test("financial year from the start month", () => {
    assert.deepEqual(financialYear(1, "2026-11-21"), { from: "2026-01-01", to: "2026-12-31" })
    assert.deepEqual(financialYear(1, "2026-11-21", -1), { from: "2025-01-01", to: "2025-12-31" })
    assert.deepEqual(financialYear(7, "2026-03-10"), { from: "2025-07-01", to: "2026-06-30" })
    assert.deepEqual(financialYear(7, "2026-07-01"), { from: "2026-07-01", to: "2027-06-30" })
    assert.deepEqual(financialYear(3, "2027-05-01"), { from: "2027-03-01", to: "2028-02-29" }) // leap year
    assert.deepEqual(financialYear(0, "2026-11-21"), { from: "2026-01-01", to: "2026-12-31" }) // bad setting -> January
})

test("shifting a year keeps month-ends", () => {
    assert.equal(shiftYear("2028-02-29", -1), "2027-02-28")
    assert.equal(shiftYear("2025-02-28", -1), "2024-02-29")
    assert.equal(shiftYear("2026-03-15", -1), "2025-03-15")
})

test("headings and column labels", () => {
    assert.equal(periodHeading("2026-01-01", "2026-12-31", 1), "For the year ended 31 December 2026")
    assert.equal(periodHeading("2026-03-01", "2026-08-31", 1), "For the period 1 March 2026 to 31 August 2026")
    assert.equal(columnLabel("2026-01-01", "2026-12-31", 1), "2026")
    assert.equal(columnLabel("2025-07-01", "2026-06-30", 7), "2025/26")
})

test("filters: bad input falls back to the current financial year", () => {
    const today = "2026-11-21"
    assert.deepEqual(parseIEFilters({}, 1, today), { period: "current", from: "2026-01-01", to: "2026-12-31", fund: "", compare: true, layout: "total" })
    assert.equal(parseIEFilters({ period: "previous" }, 1, today).from, "2025-01-01")
    const custom = parseIEFilters({ period: "custom", from: "2026-03-01", to: "2026-08-31", fund: BF, compare: "0", layout: "by_fund" }, 1, today)
    assert.deepEqual(custom, { period: "custom", from: "2026-03-01", to: "2026-08-31", fund: BF, compare: false, layout: "by_fund" })
    for (const bad of [{ from: "2026-08-31", to: "2026-03-01" }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2010-01-01", to: "2026-01-01" }, { from: "x", to: "y" }]) {
        assert.equal(parseIEFilters({ period: "custom", ...bad }, 1, today).period, "current")
    }
    assert.equal(parseIEFilters({ fund: "'; drop table" }, 1, today).fund, "")
})

// Hand-worked: income 1,000 + 200 + 500 = 1,700. Expenditure 250 (rent 300 less a 50 refund, netted by
// the database) + 400 + 100 + 50 = 800. Surplus 900. Last year: income 800, expenditure 300, surplus 500.
const current: IERow[] = [
    r("income", "General donations", 1000, { nature: "donation", category_sort: 100 }),
    r("income", "General donations", 200, { nature: "donation", category_sort: 100, fund_id: BF, fund_name: "Building Fund" }),
    r("income", "Government grants", 500, { nature: "grant", category_sort: 200, fund_id: BF, fund_name: "Building Fund" }),
    r("expense", "Rent", 250, { group_name: "Administration" }),
    r("expense", "Staff salaries", 400, { group_name: "Staff" }),
    r("expense", "Depreciation", 100, { group_name: "System" }),
    r("expense", "Uncategorised", 50, { group_name: "System" }),
    r("expense", "Printing", 0, { group_name: "Administration" }), // nets to nothing: not shown
]
const prior: IERow[] = [
    r("income", "General donations", 800, { nature: "donation", category_sort: 100 }),
    r("expense", "Rent", 300, { group_name: "Administration" }),
]

test("statement: groups, totals, surplus and last year", () => {
    const s = buildStatement({ orgType: "nonprofit", current, prior, layout: "total", labels: { current: "2026", prior: "2025" } })
    assert.equal(s.title, "Statement of Income and Expenditure")
    assert.deepEqual(s.columns.map((c) => c.label), ["2026", "2025"])
    assert.deepEqual(s.income.map((g) => g.label), ["Donations", "Grants"])
    assert.deepEqual(s.income[0].lines[0].values, { current: 1200, prior: 800 })
    assert.deepEqual(s.expense.map((g) => g.label), ["Staff", "Administration", "Depreciation", "Other expenses"])
    assert.deepEqual(s.expense[1].lines.map((l) => l.name), ["Rent"]) // Printing nets to zero
    assert.deepEqual(s.totalIncome, { current: 1700, prior: 800 })
    assert.deepEqual(s.totalExpense, { current: 800, prior: 300 })
    assert.deepEqual(s.surplus, { current: 900, prior: 500 })
})

test("statement: by fund, one column per fund plus a total that matches", () => {
    const s = buildStatement({ orgType: "nonprofit", current, prior: null, layout: "by_fund", labels: { current: "2026", prior: "" } })
    assert.deepEqual(s.columns.map((c) => c.label), ["Building Fund", "General Fund", "Total"])
    assert.deepEqual(s.totalIncome, { [`fund:${BF}`]: 700, [`fund:${GF}`]: 1000, total: 1700 })
    assert.deepEqual(s.surplus, { [`fund:${BF}`]: 700, [`fund:${GF}`]: 200, total: 900 })
})

test("statement: small business labels and cents never drift", () => {
    const rows = [0.1, 0.2, 0.3].map((a) => r("income", "Sales", a, { group_name: "Revenue" }))
    const s = buildStatement({ orgType: "small_business", current: rows, prior: null, layout: "total", labels: { current: "2026", prior: "" } })
    assert.equal(s.title, "Profit and Loss")
    assert.equal(s.surplusLabel, "Net profit / (loss)")
    assert.equal(s.income[0].label, "Revenue")
    assert.equal(s.totalIncome.current, 0.6)
    assert.equal(buildStatement({ orgType: "nonprofit", current: [], prior: null, layout: "total", labels: { current: "", prior: "" } }).empty, true)
})

test("amount format: brackets for negatives, dash for zero", () => {
    assert.equal(formatAmount(1234.5), "1,234.50")
    assert.equal(formatAmount(-900), "(900.00)")
    assert.equal(formatAmount(0), "-")
})

test("CSV: header block, every line, totals and surplus", () => {
    const s = buildStatement({ orgType: "nonprofit", current, prior, layout: "total", labels: { current: "2026", prior: "2025" } })
    const csv = buildStatementCsv(s, { orgName: "=Harapan", heading: "For the year ended 31 December 2026", fundName: null, currency: "MYR" })
    assert.ok(csv.startsWith("﻿"))
    assert.ok(csv.includes("Bills and invoices by invoice date"))
    const rows = parseCsv(csv)
    assert.equal(rows[0][0], "'=Harapan") // formula-safe
    assert.deepEqual(rows[6], ["Line", "2026", "2025"])
    assert.ok(rows.some((x) => x[0] === "  General donations" && x[1] === "1200.00" && x[2] === "800.00"))
    assert.ok(rows.some((x) => x[0] === "Total expenditure" && x[1] === "800.00"))
    assert.deepEqual(rows.at(-1), ["Surplus / (deficit)", "900.00", "500.00"])
})
