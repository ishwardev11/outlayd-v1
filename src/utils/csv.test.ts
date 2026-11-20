import { test } from "node:test"
import assert from "node:assert/strict"
import { csvNumber, csvRow, csvText, CSV_BOM } from "./csv"
import { parseCsv } from "../test/parse-csv"

// What a spreadsheet shows for one cell written by csvText
const seen = (value: string | null | undefined) => parseCsv(csvRow([csvText(value), "end"]))[0][0]

test("plain text is written unchanged and unquoted", () => {
    assert.equal(csvText("Paid by cheque"), "Paid by cheque")
    assert.equal(csvText("Rent 6100"), "Rent 6100")
})

test("empty and missing values give an empty cell", () => {
    assert.equal(csvText(""), "")
    assert.equal(csvText(null), "")
    assert.equal(csvText(undefined), "")
})

test("commas, quotes and line breaks survive a round trip", () => {
    for (const v of ["a, b, c", 'He said "ok"', 'only "', "line one\nline two", 'mix, "of", all\nthree']) {
        assert.equal(seen(v), v)
    }
})

test("Windows and old Mac line breaks become a single line break", () => {
    assert.equal(seen("one\r\ntwo\rthree"), "one\ntwo\nthree")
})

test("formula characters are neutralised with a leading apostrophe", () => {
    for (const v of ["=SUM(A1:A9)", "+60123456789", "-refund", "@admin", "\ttab", "\rcr", "\r=cmd", "\n=cmd", "\r\n=cmd"]) {
        const cell = seen(v)
        assert.ok(cell.startsWith("'"), `${JSON.stringify(v)} should start with an apostrophe, got ${JSON.stringify(cell)}`)
    }
    assert.equal(seen("=1+1"), "'=1+1")
    assert.equal(seen("-refund"), "'-refund")
})

test("a formula character in the middle is left alone", () => {
    assert.equal(seen("a=b"), "a=b")
    assert.equal(seen("total -5"), "total -5")
})

test("non-English text is kept exactly", () => {
    for (const v of ["Bayaran yuran", "款项已付", "பணம் செலுத்தப்பட்டது", "café", "😀 done"]) {
        assert.equal(seen(v), v)
    }
})

test("leading and trailing spaces are kept by quoting", () => {
    assert.equal(seen("  padded  "), "  padded  ")
})

test("numbers stay numbers, including negatives", () => {
    assert.equal(csvNumber(100), "100")
    assert.equal(csvNumber(-50), "-50")
    assert.equal(csvNumber(4.6875), "4.6875")
    assert.equal(csvNumber("12.5"), "12.5")
    assert.equal(csvNumber(0), "0")
    assert.equal(csvNumber(null), "")
    assert.equal(csvNumber(undefined), "")
    assert.equal(csvNumber(""), "")
})

test("a non-number passed as a number is written as safe text", () => {
    assert.equal(csvNumber("=HACK()"), "'=HACK()")
})

test("the BOM is the UTF-8 byte order mark", () => {
    assert.equal(CSV_BOM, "﻿")
})
