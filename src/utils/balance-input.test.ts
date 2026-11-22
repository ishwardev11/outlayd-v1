import { test } from "node:test"
import assert from "node:assert/strict"
import { isMonthStart, parseAccountInput, parseDisposalInput, parseFundTransferInput, parseItemInput, parseItemTxInput, parseMoney } from "./balance-input"

const A = "00000000-0000-4000-8000-000000000001"
const B = "00000000-0000-4000-8000-000000000002"

test("money: two decimals, zero and negatives only when allowed", () => {
    assert.equal(parseMoney("1,234.50"), 1234.5)
    assert.equal(parseMoney("0"), null)
    assert.equal(parseMoney("0", { allowZero: true }), 0)
    assert.equal(parseMoney("", { allowZero: true }), 0)
    assert.equal(parseMoney("-50"), null)
    assert.equal(parseMoney("-50", { allowNegative: true }), -50)
    assert.equal(parseMoney("1.005"), null)
    assert.equal(isMonthStart("2026-01-01"), true)
    assert.equal(isMonthStart("2026-01-15"), false)
    assert.equal(isMonthStart("2026-02-30"), false)
})

test("account input", () => {
    const ok = parseAccountInput({ name: " Petty cash ", account_type: "cash", opening_balance: "250" })
    assert.ok(ok.ok && ok.value.name === "Petty cash" && ok.value.opening_balance === 250 && ok.value.id === null)
    const overdrawn = parseAccountInput({ name: "Current", account_type: "bank", opening_balance: "-120.50" })
    assert.ok(overdrawn.ok && overdrawn.value.opening_balance === -120.5, "an overdrawn bank account can start negative")
    const bad = parseAccountInput({ name: "", account_type: "bank" })
    assert.ok(!bad.ok && /name/.test(bad.error))
    const type = parseAccountInput({ name: "X", account_type: "crypto" })
    assert.ok(!type.ok && /bank, cash or e-wallet/.test(type.error))
})

test("item input: fixed asset needs a date and a life; other kinds ignore asset fields", () => {
    const van = parseItemInput({ name: "Van", kind: "fixed_asset", acquired_date: "2024-01-15", useful_life_months: "60", opening_cost: "60000", opening_accumulated_depreciation: "24000", classification: "current" })
    assert.ok(van.ok && van.value.classification === "non_current" && van.value.useful_life_months === 60 && van.value.opening_cost === 60000)
    const noLife = parseItemInput({ name: "Van", kind: "fixed_asset", acquired_date: "2024-01-15" })
    assert.ok(!noLife.ok && /useful life/.test(noLife.error))
    const tooMuch = parseItemInput({ name: "Van", kind: "fixed_asset", acquired_date: "2024-01-15", useful_life_months: 60, opening_cost: 100, opening_accumulated_depreciation: 90, residual_value: 20 })
    assert.ok(!tooMuch.ok && /cannot be more than the cost/.test(tooMuch.error))
    const loan = parseItemInput({ name: "Loan", kind: "liability", classification: "non_current", opening_balance: "20000", opening_cost: "999", useful_life_months: 5 })
    assert.ok(loan.ok && loan.value.opening_cost === 0 && loan.value.useful_life_months === null && loan.value.acquired_date === null && loan.value.opening_balance === 20000)
    const kind = parseItemInput({ name: "X", kind: "shares" })
    assert.ok(!kind.ok)
})

test("item entries, disposals and fund transfers", () => {
    const tx = parseItemTxInput({ item_id: A, action: "repay", amount: "1000", tx_date: "2026-04-01", reference: " LOAN-1 " })
    assert.ok(tx.ok && tx.value.reference === "LOAN-1" && tx.value.account_id === null)
    assert.ok(!parseItemTxInput({ item_id: A, action: "steal", amount: "1", tx_date: "2026-04-01" }).ok)
    assert.ok(!parseItemTxInput({ item_id: A, action: "repay", amount: "0", tx_date: "2026-04-01" }).ok)
    const sale = parseDisposalInput({ item_id: A, disposed_date: "2026-06-30", proceeds: "" })
    assert.ok(sale.ok && sale.value.proceeds === 0, "a write-off has no proceeds")
    assert.ok(!parseDisposalInput({ item_id: A, disposed_date: "x" }).ok)
    const tr = parseFundTransferInput({ from_fund_id: A, to_fund_id: B, amount: "500", tx_date: "2026-04-10", remarks: "Top up" })
    assert.ok(tr.ok && tr.value.amount === 500)
    const same = parseFundTransferInput({ from_fund_id: A, to_fund_id: A, amount: "5", tx_date: "2026-04-10" })
    assert.ok(!same.ok && /two different funds/.test(same.error))
})
