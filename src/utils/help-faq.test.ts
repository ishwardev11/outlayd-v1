import { test } from "node:test"
import assert from "node:assert/strict"
import { HELP_FAQ } from "./help-faq"
import { NAV_ITEMS } from "./nav"
import { SETTINGS_TABS } from "./settings-tabs"
import { reportSections } from "./report-hub"

const all = { statements: true, donorMemo: true, accountingExport: true }

test("every 'Screen → part' in Help points at a screen and a part that exist", () => {
    const navLabels = NAV_ITEMS.map((i) => i.label)
    const settingsTabs = SETTINGS_TABS.map((t) => t.label)
    const reports = reportSections("nonprofit", all).flatMap((s) => s.cards.map((c) => c.title))
    let checked = 0
    for (const { a } of HELP_FAQ) {
        // "Settings → Funds & Categories to add…" gives Settings and "Funds & Categories"
        for (const m of a.matchAll(/(\w+) → (.+?)(?=[.,;:]| to | and |$)/g)) {
            const [, screen, part] = m
            assert.ok(navLabels.includes(screen), `"${screen}" is not in the navigation`)
            if (screen === "Settings") assert.ok(settingsTabs.includes(part), `Settings has no "${part}" tab`)
            if (screen === "Reports") assert.ok(reports.includes(part), `Reports has no "${part}"`)
            checked++
        }
    }
    assert.ok(checked >= 4, `only ${checked} references found; the pattern may be broken`)
})

test("Help no longer names screens that were renamed or removed", () => {
    for (const { q, a } of HELP_FAQ) {
        for (const old of ["Settings > ", "Ledger", "Vendors", "Bank Statements", "Settings → Organization", "Settings → Categories", "AGM pack"]) {
            assert.ok(!`${q} ${a}`.includes(old), `"${old}" in: ${q}`)
        }
    }
})

test("Help answers the three questions the simplification added", () => {
    const qs = HELP_FAQ.map((f) => f.q)
    for (const q of ["What's the difference between a fund and a category?", "Where did my uploaded receipt go?", "How do I get ready for the AGM?"]) {
        assert.ok(qs.includes(q), q)
    }
})
