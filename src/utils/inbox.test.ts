import { test } from "node:test"
import assert from "node:assert/strict"
import { ALL_INBOX_DB_STATUSES, approvedDestination, inboxDbStatuses, inboxSearchFilter, parseInboxFilters } from "./inbox"

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

// Replaces the SQL test on the old ledger_page function (removed in simplification step 9): searching
// uploads finds the user's remarks and never looks at `notes`, the AI's extraction error messages.
test("the Inbox search covers payee, invoice number and remarks, never the notes column", () => {
    const f = inboxSearchFilter("committee")
    assert.equal(f, "vendor_name.ilike.%committee%,invoice_number.ilike.%committee%,remarks.ilike.%committee%")
    assert.ok(!/notes/.test(f), "must not search notes")
})

test("filter characters in a search are matched literally", () => {
    const f = inboxSearchFilter("50%,a(b)")
    assert.ok(f.startsWith(String.raw`vendor_name.ilike.%50\%\,a\(b\)%,`), f)
})
