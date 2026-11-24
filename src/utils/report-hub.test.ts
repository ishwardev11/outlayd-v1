import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { reportSections, type ReportAccess } from "./report-hub"

const paid: ReportAccess = { statements: true, donorMemo: true, accountingExport: true }
const free: ReportAccess = { statements: false, donorMemo: false, accountingExport: false }
const cards = (orgType: string | null, access: ReportAccess) => reportSections(orgType, access).flatMap((s) => s.cards)
const card = (orgType: string | null, access: ReportAccess, key: string) => cards(orgType, access).find((c) => c.key === key)!

test("the hub lists the five statements, the memo, both exports and year end, in that order", () => {
    assert.deepEqual(reportSections("nonprofit", paid).map((s) => [s.key, s.cards.map((c) => c.key)]), [
        ["statements", ["income_expenditure", "financial_position", "receipts_payments", "changes_in_funds", "schedules"]],
        ["memo", ["donor_memo"]],
        ["exports", ["accounting_export", "cash_book_csv"]],
        ["year_end", ["year_end"]],
    ])
})

test("a small business sees Profit & Loss; a nonprofit (or an unknown type) sees Income & Expenditure", () => {
    assert.equal(card("small_business", paid, "income_expenditure").title, "Profit & Loss")
    assert.equal(card("nonprofit", paid, "income_expenditure").title, "Income & Expenditure")
    assert.equal(card(null, paid, "income_expenditure").title, "Income & Expenditure")
    assert.equal(card("small_business", paid, "income_expenditure").href, "/reports/income-expenditure")
})

test("every card says what it is for in one line, and none promises an AGM pack", () => {
    for (const orgType of ["nonprofit", "small_business"]) {
        for (const c of cards(orgType, paid)) {
            assert.ok(c.description.length > 20 && c.description.length < 160, `${c.key}: one short line`)
            assert.ok(!/\n/.test(c.description), `${c.key}: a single line`)
            assert.ok(!/AGM pack/i.test(c.description), `${c.key}: no AGM pack`)
        }
    }
})

test("plan badges: a paid organisation sees none", () => {
    assert.deepEqual(cards("nonprofit", paid).filter((c) => c.lock !== null).map((c) => c.key), [])
})

test("plan badges: free statements open a sample; the memo and the export need an upgrade; the cash book is free", () => {
    const locks = Object.fromEntries(cards("nonprofit", free).map((c) => [c.key, c.lock]))
    assert.deepEqual(locks, {
        income_expenditure: "sample", financial_position: "sample", receipts_payments: "sample",
        changes_in_funds: "sample", schedules: "sample",
        donor_memo: "upgrade", accounting_export: "upgrade", cash_book_csv: null, year_end: null,
    })
})

test("a downgraded organisation keeps read access, so its cards are not locked", () => {
    const downgraded: ReportAccess = { statements: true, donorMemo: true, accountingExport: true }
    assert.ok(cards("nonprofit", downgraded).every((c) => c.lock === null))
})

test("every card and year-end link points at a page that exists", () => {
    const appDir = join(__dirname, "..", "app", "(dashboard)")
    const hrefs = cards("nonprofit", paid).flatMap((c) => [c.href, ...(c.links ?? []).map((l) => l.href)])
    for (const href of hrefs) {
        const path = href.split("?")[0]
        assert.ok(existsSync(join(appDir, ...path.split("/").filter(Boolean), "page.tsx")), `${href} has a page`)
    }
})
