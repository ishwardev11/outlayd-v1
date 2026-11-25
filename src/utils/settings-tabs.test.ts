import { test } from "node:test"
import assert from "node:assert/strict"
import { SETTINGS_TABS, settingsTab } from "./settings-tabs"

test("Settings tabs, in order: Organisation, Funds & Categories, Accounts, Assets & Loans, Letterhead & numbering, Team, Billing", () => {
    assert.deepEqual(SETTINGS_TABS.map((t) => t.label), [
        "Organisation", "Funds & Categories", "Accounts", "Assets & Loans", "Letterhead & numbering", "Team", "Billing",
    ])
})

test("old tab links keep working; the General tab and anything unknown open Organisation", () => {
    assert.equal(settingsTab("financial"), "financial")
    assert.equal(settingsTab("accounts"), "accounts")
    assert.equal(settingsTab("assets"), "assets")
    assert.equal(settingsTab("letterhead"), "letterhead")
    assert.equal(settingsTab("general"), "organization")
    assert.equal(settingsTab("year-end"), "organization")
    assert.equal(settingsTab(null), "organization")
})
