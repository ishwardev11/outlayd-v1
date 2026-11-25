import { test } from "node:test"
import assert from "node:assert/strict"
import { NAV_ITEMS, activeNav, showLockBadge } from "./nav"

test("the navigation is exactly the table in the simplification brief, in order", () => {
    assert.deepEqual(NAV_ITEMS.map((i) => [i.label, i.href]), [
        ["Dashboard", "/dashboard"],
        ["Inbox", "/inbox"],
        ["Transactions", "/transactions"],
        ["Bills & Invoices", "/invoices"],
        ["Contacts", "/contacts"],
        ["Reports", "/reports"],
        ["Bank", "/bank"],
        ["Settings", "/settings"],
    ])
})

test("each page lights up the item it belongs to", () => {
    const cases: [string, string | null][] = [
        ["/dashboard", "dashboard"],
        ["/inbox", "inbox"],
        ["/transactions", "transactions"],
        ["/invoices", "invoices"],
        ["/contacts", "contacts"],
        ["/reports", "reports"],
        ["/reports/donor-memo", "reports"],
        ["/reports/year-end", "reports"],
        ["/audit-log", "reports"],
        ["/bank", "bank"],
        ["/bank/123", "bank"],
        ["/settings", "settings"],
        ["/settings/opening-position", "settings"],
        ["/onboarding", null],
        ["/bankruptcy", null], // a different page that only starts with the same letters
    ]
    for (const [path, id] of cases) assert.equal(activeNav(path), id, path)
})

test("the lock badge shows only for a free organisation that has never paid, once the plan is known", () => {
    const bank = NAV_ITEMS.find((i) => i.id === "bank")!
    const reports = NAV_ITEMS.find((i) => i.id === "reports")!
    assert.equal(showLockBadge(bank, { paid: false, hasBeenPaid: false }), true)
    assert.equal(showLockBadge(bank, { paid: false, hasBeenPaid: true }), false) // downgraded: read-only access
    assert.equal(showLockBadge(bank, { paid: true, hasBeenPaid: true }), false)
    assert.equal(showLockBadge(bank, { paid: null, hasBeenPaid: false }), false) // still loading
    assert.equal(showLockBadge(reports, { paid: false, hasBeenPaid: false }), false)
})
