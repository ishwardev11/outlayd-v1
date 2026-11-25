import { test } from "node:test"
import assert from "node:assert/strict"
import { billsToPay } from "./dashboard"

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
