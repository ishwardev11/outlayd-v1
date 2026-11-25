import { test } from "node:test"
import assert from "node:assert/strict"
import {
    checksStatus, defaultFinancialYear, financialYears, lockStatus, openingStatus, reconciliationStatus, type AccountReconciliation,
} from "./year-end"

test("financial years run from the one containing the start date to the current one, newest first", () => {
    const years = financialYears("2025-03-15", 1, "2026-11-25")
    assert.deepEqual(years.map((y) => [y.key, y.to, y.ended]), [["2026-01-01", "2026-12-31", false], ["2025-01-01", "2025-12-31", true]])
    assert.equal(years[0].label, "1 Jan 2026 to 31 Dec 2026")
    // a year starting in July
    assert.deepEqual(financialYears("2026-07-01", 7, "2026-11-25").map((y) => [y.from, y.to]), [["2026-07-01", "2027-06-30"]])
    // no start date yet: just the current year
    assert.equal(financialYears(null, 1, "2026-11-25").length, 1)
})

test("the year shown first is the most recent one that has ended, else the current one", () => {
    assert.equal(defaultFinancialYear(financialYears("2025-03-15", 1, "2026-11-25")).key, "2025-01-01")
    assert.equal(defaultFinancialYear(financialYears("2026-01-01", 1, "2026-11-25")).key, "2026-01-01")
})

test("opening position: done once completed; started but unfinished needs attention", () => {
    assert.equal(openingStatus("2026-01-01", "2026-01-05T10:00:00Z"), "done")
    assert.equal(openingStatus("2026-01-01", null), "attention")
    assert.equal(openingStatus(null, null), "not_started")
})

const acct = (over: Partial<AccountReconciliation>): AccountReconciliation => ({
    account_id: "a", account_name: "Main Bank", archived: false, outlayd_balance: 100, reconciliation_id: null, difference: null, note: null, ...over,
})

test("reconciliation: done when every account agrees or its difference is explained", () => {
    const done = reconciliationStatus([acct({ reconciliation_id: "r", difference: 0 }), acct({ account_name: "Petty Cash", reconciliation_id: "r2", difference: -5, note: "Bank fee" })], true)
    assert.equal(done.status, "done")
    assert.deepEqual(done.accounts.map((a) => a.detail), ["Agrees with the bank", "Difference explained"])
})

test("reconciliation: an unexplained difference or a missing account after the year end needs attention", () => {
    assert.equal(reconciliationStatus([acct({ reconciliation_id: "r", difference: 12 })], true).status, "attention")
    assert.equal(reconciliationStatus([acct({ reconciliation_id: "r", difference: 0 }), acct({ account_name: "Petty Cash" })], true).status, "attention")
    assert.equal(reconciliationStatus([acct({})], true).status, "attention")
    // before the year has ended nothing is due yet
    assert.equal(reconciliationStatus([acct({})], false).status, "not_started")
    // an archived account with nothing in it is not listed
    assert.equal(reconciliationStatus([acct({ archived: true, outlayd_balance: 0 })], true).accounts.length, 0)
})

test("integrity checks: a failing blocking check needs attention; warnings do not", () => {
    assert.equal(checksStatus([{ severity: "block", passed: true }, { severity: "warning", passed: false }]), "done")
    assert.equal(checksStatus([{ severity: "block", passed: false }]), "attention")
    assert.equal(checksStatus(null), "not_started")
})

test("lock: done when locked up to at least the year end", () => {
    assert.equal(lockStatus("2026-12-31", "2026-12-31", true), "done")
    assert.equal(lockStatus("2027-01-31", "2026-12-31", true), "done")
    assert.equal(lockStatus("2026-06-30", "2026-12-31", true), "attention")
    assert.equal(lockStatus(null, "2026-12-31", false), "not_started")
})
