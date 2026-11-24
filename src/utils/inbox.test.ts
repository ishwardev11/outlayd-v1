import { test } from "node:test"
import assert from "node:assert/strict"
import { ALL_INBOX_DB_STATUSES, approvedDestination, inboxDbStatuses, parseInboxFilters } from "./inbox"

test("the Inbox filters are Extracting, Needs review and Possible duplicate; anything else means all of them", () => {
    assert.deepEqual(parseInboxFilters({}), { status: "all", q: "", page: 1 })
    assert.equal(parseInboxFilters({ status: "needs_review" }).status, "needs_review")
    assert.equal(parseInboxFilters({ status: "duplicate" }).status, "duplicate")
    assert.equal(parseInboxFilters({ status: "extracting" }).status, "extracting")
    // the old Ledger filters do not exist here
    assert.equal(parseInboxFilters({ status: "paid" }).status, "all")
    assert.equal(parseInboxFilters({ status: "awaiting_payment" }).status, "all")
})

test("search drops a leading # (as the Ledger did) and the page must be a positive number", () => {
    assert.equal(parseInboxFilters({ q: "  #INV-12 " }).q, "INV-12")
    assert.equal(parseInboxFilters({ page: "3" }).page, 3)
    assert.equal(parseInboxFilters({ page: "-1" }).page, 1)
    assert.equal(parseInboxFilters({ page: "abc" }).page, 1)
})

test("only uploads still to do are in the Inbox: never approved, awaiting payment or paid", () => {
    assert.deepEqual(inboxDbStatuses("extracting"), ["extracting"])
    assert.deepEqual(inboxDbStatuses("duplicate"), ["DUPLICATE_WARNING"])
    assert.ok(inboxDbStatuses("needs_review").includes("needs_review"))
    for (const s of ["awaiting_payment", "paid"]) assert.ok(!ALL_INBOX_DB_STATUSES.includes(s), `${s} is not in the Inbox`)
    assert.deepEqual(inboxDbStatuses("all"), ALL_INBOX_DB_STATUSES)
})

test("the approve message says where the document went, with a link", () => {
    assert.deepEqual(approvedDestination("receipt"), {
        label: "Open Transactions", href: "/transactions?type=money_out", message: "Approved. It is now in Transactions as money out.",
    })
    assert.equal(approvedDestination("invoice").href, "/invoices?status=unpaid")
    assert.match(approvedDestination(null).message, /Bills & Invoices/)
})
