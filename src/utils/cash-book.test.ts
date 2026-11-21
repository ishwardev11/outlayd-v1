import { test } from "node:test"
import assert from "node:assert/strict"
import { buildCashBookCsv, cashBookTotals, summarise, typeLabel, type CashBookRow } from "./cash-book"
import { parseCsv } from "../test/parse-csv"

const row = (over: Partial<CashBookRow>): CashBookRow => ({
    id: "t1", date: "2026-11-20", dateEstimated: false, type: "money_in", total: 150, payee: "Puan Aminah", reference: "BANK-1",
    remarks: "", source: "manual", documentId: null, isRefund: false, hasAttachment: false, accountId: "a1", accountName: "Main Account",
    lines: [
        { amount: 100, fundId: "f1", fundName: "General Fund", categoryId: "c1", categoryName: "General donations" },
        { amount: 50, fundId: "f2", fundName: "Building Fund", categoryId: "c2", categoryName: "Government grants" },
    ],
    balance: null, donation: true, receipt: null, ...over,
})

test("type labels follow the spec sign rule", () => {
    assert.equal(typeLabel({ type: "money_in", isRefund: false, source: "manual" }), "Money in")
    assert.equal(typeLabel({ type: "money_in", isRefund: true, source: "manual" }), "Refund received")
    assert.equal(typeLabel({ type: "money_in", isRefund: false, source: "document" }), "Refund received") // a credit note
    assert.equal(typeLabel({ type: "money_out", isRefund: false, source: "document" }), "Money out")
})

test("summary shows one value or the number of distinct values", () => {
    assert.equal(summarise(["General Fund"]), "General Fund")
    assert.equal(summarise(["General Fund", "General Fund"]), "General Fund")
    assert.equal(summarise(["General Fund", "Building Fund"]), "Split (2)")
})

test("CSV: one row per line, money in and out in separate columns", () => {
    const csv = buildCashBookCsv([
        row({}),
        row({ id: "t2", type: "money_out", total: 200, payee: 'Kedai "Maju", Sdn Bhd', source: "document", remarks: "=SUM(A1)",
              lines: [{ amount: 200, fundId: "f1", fundName: "General Fund", categoryId: "c3", categoryName: "Rent" }] }),
    ], "MYR")
    assert.ok(csv.startsWith("﻿"))
    const rows = parseCsv(csv)
    assert.deepEqual(rows[0].slice(0, 8), ["Date", "Type", "Payee", "Category", "Fund", "Account", "Money in (MYR)", "Money out (MYR)"])
    assert.equal(rows.length, 4)
    assert.deepEqual([rows[1][6], rows[1][7], rows[1][3]], ["100.00", "", "General donations"])
    assert.deepEqual([rows[2][6], rows[2][4]], ["50.00", "Building Fund"])
    assert.deepEqual([rows[3][2], rows[3][6], rows[3][7], rows[3][9], rows[3][10]], ['Kedai "Maju", Sdn Bhd', "", "200.00", "'=SUM(A1)", "Document"])
})

test("totals count money in and money out separately", () => {
    assert.deepEqual(cashBookTotals([row({}), row({ type: "money_out", total: 0.3 }), row({ type: "money_out", total: 0.1 })]), { moneyIn: 150, moneyOut: 0.4 })
})
