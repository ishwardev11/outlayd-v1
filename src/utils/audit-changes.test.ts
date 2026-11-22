import { test } from "node:test"
import assert from "node:assert/strict"
import { describeChange, type AuditChange, type AuditLookups } from "./audit-changes"

const look: AuditLookups = {
    categories: new Map([["c-don", "General donations"], ["c-rent", "Rent"]]),
    funds: new Map([["f-gen", "General Fund"], ["f-bld", "Building Fund"]]),
    accounts: new Map([["a-main", "Main account"]]),
    items: new Map([["i-van", "Van"]]),
}

const base: AuditChange = {
    root_entity: "transactions", root_id: "t1", kind: "money", changed_at: "2026-02-01T10:00:00Z", actor_email: "a@example.com",
    action: "insert", reason: null, before: null, after: null, snapshot: null, lines_before: null, lines_after: null,
}

test("a new donation: what it is, when, who from, and its lines", () => {
    const tx = { tx_type: "money_in", tx_date: "2026-01-10", payee_name: "Dewan", total: 500, account_id: "a-main" }
    const d = describeChange({ ...base, after: tx, snapshot: tx, lines_after: [{ line_no: 1, amount: 500, category_id: "c-don", fund_id: "f-gen" }] }, look, "RM")
    assert.equal(d.record, "Money in · 10 Jan 2026 · Dewan")
    assert.equal(d.action, "Created")
    assert.ok(d.details.includes("Amount: RM500.00"))
    assert.ok(d.details.includes("Account: Main account"))
    assert.ok(d.details.includes("Lines: RM500.00 General donations · General Fund"))
})

test("a change lists only what changed, from and to", () => {
    const before = { tx_type: "money_in", tx_date: "2026-01-10", total: "500.00", payee_name: "Dewan", remarks: null, attachment_url: null }
    const after = { ...before, total: 501, remarks: "corrected", attachment_url: "org/x.pdf" }
    const d = describeChange({
        ...base, action: "update", before, after, snapshot: after,
        lines_before: [{ line_no: 1, amount: "500.00", category_id: "c-don", fund_id: "f-gen" }],
        lines_after: [{ line_no: 1, amount: 501, category_id: "c-don", fund_id: "f-gen" }],
    }, look, "RM")
    assert.equal(d.action, "Changed")
    assert.deepEqual(d.details, [
        "Amount: RM500.00 → RM501.00",
        "Remarks: — → corrected",
        "Attached file: none → added",
        "Lines: RM500.00 General donations · General Fund → RM501.00 General donations · General Fund",
    ])
})

test("lines rewritten with the same figures are not reported as a change", () => {
    const tx = { tx_type: "money_in", tx_date: "2026-01-10", total: 500 }
    const d = describeChange({
        ...base, action: "update", snapshot: tx,
        lines_before: [{ amount: "500.00", category_id: "c-don", fund_id: "f-gen", id: "l1" }],
        lines_after: [{ amount: 500, category_id: "c-don", fund_id: "f-gen", id: "l2" }],
    }, look, "RM")
    assert.deepEqual(d.details, ["Saved with no change to the figures"])
})

test("asset entries and transfers are named by what they are", () => {
    const tx = { tx_type: "money_out", tx_date: "2026-02-01", total: 3600 }
    const asset = describeChange({ ...base, kind: "assets", after: tx, snapshot: tx, lines_after: [{ amount: 3600, item_id: "i-van", fund_id: "f-gen" }] }, look, "RM")
    assert.equal(asset.record, "Money out · 1 Feb 2026 · Van")
    const tr = { tx_type: "fund_transfer", tx_date: "2026-04-10", total: 500, from_fund_id: "f-gen", to_fund_id: "f-bld" }
    assert.equal(describeChange({ ...base, kind: "transfers", after: tr, snapshot: tr }, look, "RM").record,
        "Fund transfer · 10 Apr 2026 · General Fund → Building Fund")
})

test("a deleted bill, a voided invoice and an asset rename", () => {
    const bill = { direction: "payable", invoice_no: "EL-1", payee_name: "Electric Co", issue_date: "2026-01-20", total: 300, status: "open" }
    const del = describeChange({ ...base, root_entity: "invoices", kind: "invoices", action: "delete", before: bill, snapshot: bill }, look, "RM")
    assert.equal(del.record, "Bill · EL-1 · Electric Co · 20 Jan 2026")
    assert.equal(del.action, "Deleted")
    assert.ok(del.details.includes("Total: RM300.00"))

    const voided = { ...bill, direction: "receivable", status: "void", void_reason: "Raised twice" }
    const v = describeChange({ ...base, root_entity: "invoices", kind: "invoices", action: "update", before: { ...bill, direction: "receivable" }, after: voided, snapshot: voided }, look, "RM")
    assert.equal(v.record, "Invoice · EL-1 · Electric Co · 20 Jan 2026")
    assert.deepEqual(v.details, ["Status: open → void", "Reason for voiding: — → Raised twice"])

    const item = { kind: "other_asset", name: "Hall deposit", opening_balance: 150 }
    const r = describeChange({ ...base, root_entity: "items", kind: "assets", action: "update",
        before: { ...item, name: "Rental deposit", opening_balance: 100 }, after: item, snapshot: item }, look, "RM")
    assert.equal(r.record, "Asset · Hall deposit")
    assert.deepEqual(r.details, ["Name: Rental deposit → Hall deposit", "Opening balance: RM100.00 → RM150.00"])
})

test("locking and unlocking the books, with the reason", () => {
    const org = (lock: string | null) => ({ lock_date: lock, tracking_start_date: "2026-01-01", opening_position_completed_at: null, statement_note: null })
    const lock = describeChange({ ...base, root_entity: "organizations", kind: "settings", action: "update", before: org(null), after: org("2026-01-31"), snapshot: org("2026-01-31") }, look, "RM")
    assert.equal(lock.record, "Year end settings")
    assert.equal(lock.action, "Locked")
    assert.deepEqual(lock.details, ["Books locked up to: not locked → 31 Jan 2026"])
    const back = describeChange({ ...base, root_entity: "organizations", kind: "settings", action: "update", reason: "Missing donation",
        before: org("2026-01-31"), after: org("2025-12-31"), snapshot: org("2025-12-31") }, look, "RM")
    assert.equal(back.action, "Unlocked in part")
    assert.equal(back.reason, "Missing donation")
    const off = describeChange({ ...base, root_entity: "organizations", kind: "settings", action: "update", reason: "x",
        before: org("2026-01-31"), after: org(null), snapshot: org(null) }, look, "RM")
    assert.equal(off.action, "Unlocked")
})

test("a change that reads the same before and after is not listed", () => {
    const org = (at: string) => ({ lock_date: null, tracking_start_date: "2026-10-01", opening_position_completed_at: at, statement_note: null })
    const d = describeChange({ ...base, root_entity: "organizations", kind: "settings", action: "update",
        before: org("2026-11-22T09:00:00Z"), after: org("2026-11-22T15:00:00Z"), snapshot: null }, look, "RM")
    assert.deepEqual(d.details, ["Saved with no change to the figures"])
})

test("reconciliations and removed references", () => {
    const rec = { account_id: "a-main", period_end: "2026-02-28", statement_balance: 1045, note: null }
    const d = describeChange({ ...base, root_entity: "reconciliations", kind: "reconciliations", action: "update",
        before: rec, after: { ...rec, note: "Bank fee" }, snapshot: rec }, look, "RM")
    assert.equal(d.record, "Reconciliation · Main account · 28 Feb 2026")
    assert.deepEqual(d.details, ["Note: — → Bank fee"])
    const gone = describeChange({ ...base, action: "update", snapshot: { tx_type: "money_in", tx_date: "2026-01-10" },
        lines_before: [{ amount: 5, category_id: "c-x", fund_id: "f-x" }], lines_after: [] }, look, "RM")
    assert.deepEqual(gone.details, ["Lines: RM5.00 a removed category · a removed fund → none"])
})
