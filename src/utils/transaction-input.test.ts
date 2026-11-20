import { test } from "node:test"
import assert from "node:assert/strict"
import { linesTotal, parseAmount, parseMoneyInInput, parseMoneyOutInput } from "./transaction-input"

const CAT = "11111111-1111-4111-8111-111111111111"
const FUND = "22222222-2222-4222-8222-222222222222"

test("amounts: above zero, at most two decimals, typed or numeric", () => {
    assert.equal(parseAmount("100"), 100)
    assert.equal(parseAmount("1,250.50"), 1250.5)
    assert.equal(parseAmount(12.3), 12.3)
    for (const bad of ["0", "-5", "1.005", "abc", "", null, undefined, "1e3", "=1+1"]) assert.equal(parseAmount(bad), null, String(bad))
})

test("money in: a valid entry is normalised", () => {
    const r = parseMoneyInInput({ tx_date: "2026-11-20", payee_name: "  Puan Aminah ", remarks: "", lines: [{ amount: "100", category_id: CAT }, { amount: 50, fund_id: FUND, category_id: CAT }] })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.payee_name, "Puan Aminah")
    assert.equal(r.value.remarks, null)
    assert.equal(r.value.is_refund, false)
    assert.deepEqual(r.value.lines, [{ amount: 100, fund_id: null, category_id: CAT }, { amount: 50, fund_id: FUND, category_id: CAT }])
})

test("money in: each problem gets a clear message", () => {
    const base = { tx_date: "2026-11-20", lines: [{ amount: 10, category_id: CAT }] }
    const err = (over: object) => { const r = parseMoneyInInput({ ...base, ...over }); return r.ok ? "" : r.error }
    assert.match(err({ tx_date: "2026-02-30" }), /date/)
    assert.match(err({ lines: [] }), /at least one line/)
    assert.match(err({ lines: [{ amount: 10 }] }), /choose a category/)
    assert.match(err({ lines: [{ amount: -1, category_id: CAT }] }), /above zero/)
    assert.match(err({ lines: [{ amount: 1, category_id: CAT, fund_id: "nope" }] }), /valid fund/)
    assert.match(err({ remarks: "x".repeat(501) }), /500/)
    assert.match(err({ payee_id: "not-a-uuid" }), /valid payee/)
    assert.match(err({ lines: Array.from({ length: 51 }, () => ({ amount: 1, category_id: CAT })) }), /at most 50/)
})

test("money in: the refund flag is only true when sent as true", () => {
    const r = parseMoneyInInput({ tx_date: "2026-11-20", is_refund: "true", lines: [{ amount: 1, category_id: CAT }] })
    assert.ok(r.ok && r.value.is_refund === false)
})

test("money out: who was paid is required", () => {
    const r = parseMoneyOutInput({ tx_date: "2026-11-20", payee_name: " ", lines: [{ amount: 1, category_id: CAT }] })
    assert.ok(!r.ok && /who was paid/.test(r.error))
    assert.ok(parseMoneyOutInput({ tx_date: "2026-11-20", payee_name: "TNB", lines: [{ amount: 1, category_id: CAT }] }).ok)
})

test("totals add up exactly in cents", () => {
    assert.equal(linesTotal([{ amount: 0.1 }, { amount: 0.2 }]), 0.3)
    assert.equal(linesTotal([{ amount: 100 }, { amount: 50.55 }]), 150.55)
})
