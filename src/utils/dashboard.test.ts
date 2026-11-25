import { test } from "node:test"
import assert from "node:assert/strict"
import { billsToPay, pendingIncome } from "./dashboard"

test("Bills to pay adds up what is still owed on open bills, the same rows as Total you owe", () => {
    const r = billsToPay([
        { balance: "1200.00", ageing_bucket: "61_plus" }, // part-paid and overdue: only the 1,200 left counts
        { balance: 320, ageing_bucket: "current" },
        { balance: "0.00", ageing_bucket: null }, // paid
        { balance: 500, ageing_bucket: null }, // draft or void: not owed
    ])
    assert.deepEqual(r, { count: 2, total: 1520, overdueCount: 1, overdueTotal: 1200 })
})

test("every bucket past the due date counts as overdue, and cents do not drift", () => {
    const r = billsToPay([
        { balance: 0.1, ageing_bucket: "1_30" },
        { balance: 0.2, ageing_bucket: "31_60" },
        { balance: 0.3, ageing_bucket: "current" },
    ])
    assert.deepEqual(r, { count: 3, total: 0.6, overdueCount: 2, overdueTotal: 0.3 })
})

test("no bills: all zero", () => {
    assert.deepEqual(billsToPay([]), { count: 0, total: 0, overdueCount: 0, overdueTotal: 0 })
})

test("Pending income: what is still owed on invoices you issued, and how many lack a receipt", () => {
    const r = pendingIncome([
        { balance: "4000.00", ageing_bucket: "current", receipts_missing: 0 },   // part-paid after a deposit
        { balance: 1200.5, ageing_bucket: "31_60", receipts_missing: 1 },        // overdue, a payment without receipt
        { balance: 0, ageing_bucket: null, receipts_missing: 2 },                // paid, receipts missing: not owed
    ])
    assert.deepEqual(r, { count: 2, total: 5200.5, overdueCount: 1, overdueTotal: 1200.5, receiptsMissing: 2 })
    assert.deepEqual(pendingIncome([]), { count: 0, total: 0, overdueCount: 0, overdueTotal: 0, receiptsMissing: 0 })
})
