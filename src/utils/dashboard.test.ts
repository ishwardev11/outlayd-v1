import { test } from "node:test"
import assert from "node:assert/strict"
import { attentionItems, monthLabel, parseDashboardOverview, usesFunds } from "./dashboard"

const today = "2026-11-25"

test("an empty answer (brand-new organisation) gives zeros, not errors", () => {
    const o = parseDashboardOverview(null, today)
    assert.equal(o.cash.setUp, false)
    assert.equal(o.month.moneyIn, 0)
    assert.equal(o.month.from, "2026-11-01")
    assert.deepEqual(o.cashFlow, [])
    assert.deepEqual(attentionItems(o, { canReconcile: true }), [])
})

test("the database's figures are read as numbers, and a split entry is labelled Split", () => {
    const o = parseDashboardOverview({
        today,
        opening_complete: true,
        cash: { set_up: true, balance: "13700.00", last_reconciled: "2026-01-31" },
        month: { money_in: "5400.00", money_out: 1500, from: "2026-11-01", to: "2026-11-30" },
        payable: { count: 2, total: "700.00", overdue_count: 1, overdue_total: "500.00" },
        receivable: { count: 1, total: 600, overdue_count: 1, overdue_total: 600, receipts_missing: 1 },
        inbox: { to_review: 2, extracting: 1, failed: 1 },
        unreconciled: { count: 9, first: "2026-02-28" },
        cash_flow: [{ date: "2026-11-25", money_in: "10.50", money_out: 0 }],
        recent: [
            { id: "a", date: "2026-11-20", type: "money_in", total: "2000", payee: "Kementerian", lines: 1, fund: "Education Fund", category: "Grants" },
            { id: "b", date: "2026-11-19", type: "money_out", total: 90, payee: "", lines: 2, fund: "General Fund", category: null },
        ],
        funds: [{ id: "f", name: "Education Fund", restricted: true, is_default: false, balance: "1600", budget: "5000", spent: "400" }],
    }, today)
    assert.equal(o.cash.balance, 13700)
    assert.equal(o.payable.total, 700)
    assert.equal(o.cashFlow[0].moneyIn, 10.5)
    assert.equal(o.recent[0].allocation, "Education Fund · Grants")
    assert.equal(o.recent[1].allocation, "Split")
    assert.equal(o.recent[1].payee, "No payee")
    assert.equal(o.funds[0].balance, 1600)
    assert.equal(o.funds[0].budget, 5000)

    const items = attentionItems(o, { canReconcile: true })
    assert.deepEqual(items.map((i) => [i.key, i.count]), [
        ["bills_overdue", 1], ["invoices_overdue", 1], ["review", 2], ["unreconciled", 9], ["receipts_missing", 1], ["extracting", 2],
    ])
    assert.equal(items.find((i) => i.key === "unreconciled")?.href, "/bank?tab=reconciliation&month=2026-02-28")
    // Without the reconciliation feature, unreconciled months are not listed
    assert.ok(!attentionItems(o, { canReconcile: false }).some((i) => i.key === "unreconciled"))
})

test("an organisation uses funds once it has more than the default fund or a budget", () => {
    const general = { id: "g", name: "General Fund", restricted: false, isDefault: true, balance: 0, budget: null, spent: 0 }
    assert.equal(usesFunds([general]), false)
    assert.equal(usesFunds([{ ...general, budget: 1000 }]), true)
    assert.equal(usesFunds([general, { ...general, id: "e", isDefault: false }]), true)
})

test("month labels are never shifted by the viewer's timezone", () => {
    assert.equal(monthLabel("2026-01-31"), "Jan 2026")
    assert.equal(monthLabel("2026-12-01"), "Dec 2026")
})

test("new mode: fewer than 3 steps done and nothing paid in or out in 30 days", async () => {
    const { dashboardMode } = await import("./dashboard")
    const quiet = [{ date: "2026-11-25", moneyIn: 0, moneyOut: 0 }]
    const busy = [{ date: "2026-11-25", moneyIn: 0, moneyOut: 12 }]
    assert.equal(dashboardMode(0, quiet), "new")
    assert.equal(dashboardMode(2, quiet), "new")
    assert.equal(dashboardMode(3, quiet), "working")
    assert.equal(dashboardMode(1, busy), "working")
})

test("greeting, month labels and fund colours", async () => {
    const { greeting, hourInTimezone, monthYearLabel, previousMonth, fundDotClass, FUND_DOT_CLASSES } = await import("./dashboard")
    assert.equal(greeting(8), "Good morning")
    assert.equal(greeting(14), "Good afternoon")
    assert.equal(greeting(20), "Good evening")
    assert.equal(greeting(2), "Good evening")
    // 12:00 UTC is 8 pm in Kuala Lumpur
    assert.equal(hourInTimezone("Asia/Kuala_Lumpur", new Date("2026-11-25T12:00:00Z")), 20)
    assert.equal(monthYearLabel("2026-11-25"), "November 2026")
    assert.deepEqual(previousMonth("2026-01-15"), { name: "December", end: "2025-12-31" })
    assert.equal(fundDotClass("abc"), fundDotClass("abc"))
    assert.ok((FUND_DOT_CLASSES as readonly string[]).includes(fundDotClass("f1")))
})
