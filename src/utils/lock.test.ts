import { test } from "node:test"
import assert from "node:assert/strict"
import { documentLockState, formatDay, isLockError, isLockedDate, isMonthEnd, isOpeningLocked, monthEndOf, parseLockInput, pastMonthEnds } from "./lock"

test("a date on or before the lock date is locked, after it is not", () => {
    assert.equal(isLockedDate("2026-01-31", "2026-01-31"), true)
    assert.equal(isLockedDate("2026-01-01", "2026-01-31"), true)
    assert.equal(isLockedDate("2026-02-01", "2026-01-31"), false)
    assert.equal(isLockedDate("2026-01-15T10:00:00Z", "2026-01-31"), true)
    assert.equal(isLockedDate("2026-01-15", null), false)
    assert.equal(isLockedDate(null, "2026-01-31"), false)
})

test("the opening position is frozen once the lock reaches the day before the start date", () => {
    assert.equal(isOpeningLocked("2025-12-31", "2026-01-01"), true)
    assert.equal(isOpeningLocked("2025-12-30", "2026-01-01"), false)
    assert.equal(isOpeningLocked("2026-03-31", "2026-01-01"), true)
    assert.equal(isOpeningLocked(null, "2026-01-01"), false)
    assert.equal(isOpeningLocked("2026-01-31", null), true)
})

test("dates are written the way people write them", () => {
    assert.equal(formatDay("2026-01-31"), "31 Jan 2026")
    assert.equal(formatDay("2026-12-01"), "1 Dec 2026")
    assert.equal(formatDay(null), "")
})

test("month-ends", () => {
    assert.equal(monthEndOf("2024-02-10"), "2024-02-29")
    assert.equal(monthEndOf("2026-12-05"), "2026-12-31")
    assert.equal(isMonthEnd("2026-02-28"), true)
    assert.equal(isMonthEnd("2026-02-27"), false)
    assert.equal(isMonthEnd("2026-02-30"), false)
    assert.deepEqual(pastMonthEnds("2026-01-15", 3), ["2025-12-31", "2025-11-30", "2025-10-31"])
    assert.deepEqual(pastMonthEnds("2026-03-31", 1), ["2026-02-28"])
})

test("an uploaded document is locked through what it feeds", () => {
    const lock = "2026-01-31"
    assert.equal(documentLockState({ status: "paid", document_type: "receipt", document_date: "2026-01-10", paid_date: "2026-01-10" }, lock), "locked")
    assert.equal(documentLockState({ status: "paid", document_type: "invoice", document_date: "2026-01-10", paid_date: "2026-02-10" }, lock), "locked")
    assert.equal(documentLockState({ status: "paid", document_type: "receipt", document_date: "2026-01-10", paid_date: "2026-02-10" }, lock), "open")
    assert.equal(documentLockState({ status: "awaiting_payment", document_type: "invoice", document_date: "2026-01-20" }, lock), "pay_only")
    assert.equal(documentLockState({ status: "needs_review", document_date: "2026-01-20" }, lock), "review_locked")
    assert.equal(documentLockState({ status: "needs_review", document_date: "2026-02-20" }, lock), "open")
    assert.equal(documentLockState({ status: "paid", document_date: "2026-01-10", paid_date: "2026-01-10" }, null), "open")
})

test("the lock error is recognised by its code only", () => {
    assert.equal(isLockError({ code: "OL001" }), true)
    assert.equal(isLockError({ code: "P0001" }), false)
    assert.equal(isLockError(null), false)
})

test("locking forward needs no reason; moving back or removing the lock does", () => {
    const today = "2026-06-15"
    assert.deepEqual(parseLockInput({ date: "2026-03-31" }, null, today), { ok: true, value: { date: "2026-03-31", reason: null } })
    assert.deepEqual(parseLockInput({ date: "2026-04-30" }, "2026-03-31", today), { ok: true, value: { date: "2026-04-30", reason: null } })
    assert.equal(parseLockInput({ date: "2026-02-28" }, "2026-03-31", today).ok, false)
    assert.equal(parseLockInput({ date: "2026-02-28", reason: "   " }, "2026-03-31", today).ok, false)
    assert.deepEqual(parseLockInput({ date: "2026-02-28", reason: " Late invoice " }, "2026-03-31", today),
        { ok: true, value: { date: "2026-02-28", reason: "Late invoice" } })
    assert.equal(parseLockInput({ date: null }, "2026-03-31", today).ok, false)
    assert.deepEqual(parseLockInput({ date: "", reason: "Audit adjustments" }, "2026-03-31", today), { ok: true, value: { date: null, reason: "Audit adjustments" } })
})

test("lock input that cannot be used is refused", () => {
    const today = "2026-06-15"
    assert.equal(parseLockInput({ date: "2026-06-16" }, null, today).ok, false)
    assert.equal(parseLockInput({ date: "2026-02-30" }, null, today).ok, false)
    assert.equal(parseLockInput({ date: "31/03/2026" }, null, today).ok, false)
    assert.equal(parseLockInput({ date: "2026-03-31" }, "2026-03-31", today).ok, false)
    assert.equal(parseLockInput({ date: null }, null, today).ok, false)
    assert.equal(parseLockInput({ date: "2026-01-31", reason: "x".repeat(501) }, "2026-03-31", today).ok, false)
})
