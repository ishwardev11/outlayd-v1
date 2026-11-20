import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildExport, parseExportParams, toGenericCsv, type ExportDocument } from "./accounting-export"
import { parseCsv } from "../test/parse-csv"
import { docs as fixtureDocs, lookups } from "../test/fixtures/export-docs"

const docs = fixtureDocs as unknown as ExportDocument[]
const fixture = (name: string) => readFileSync(join(__dirname, "../test/fixtures", name), "utf8")
const { lines, summary } = buildExport(docs, lookups)
const generic = toGenericCsv(lines, "MYR")
const genericRows = parseCsv(generic)
const header = genericRows[0]
const remarksCol = header.indexOf("Remarks")

test("generic CSV: Remarks is the last column", () => {
    assert.equal(remarksCol, header.length - 1)
    assert.equal(header.length, 19)
})

test("generic CSV: every existing column is byte-for-byte what it was before remarks were added", () => {
    const before = parseCsv(fixture("accounting-generic-before-remarks.csv"))
    const withoutRemarks = genericRows.map((r) => r.slice(0, -1))
    assert.deepEqual(withoutRemarks, before)
})

test("generic CSV: totals and line count are unchanged", () => {
    assert.equal(summary.lines, 14)
    assert.equal(summary.totalCents, 141100)
})

test("generic CSV: remarks come out exactly, with formulas neutralised", () => {
    const byDoc = new Map(genericRows.slice(1).map((r) => [r[header.indexOf("Document ID")], r[remarksCol]]))
    const remarkOf = (i: number) => byDoc.get(`0000000${i}-aaaa-bbbb-cccc-dddddddddddd`)
    assert.equal(remarkOf(0), "Paid by cheque 4471, approved at the March committee") // comma
    assert.equal(remarkOf(1), 'He said "ok"')                                        // quotes
    assert.equal(remarkOf(2), "line one\nline two")                                   // line break
    assert.equal(remarkOf(3), "'=SUM(A1:A9)")                                         // formula
    assert.equal(remarkOf(4), "'+60123456789")
    assert.equal(remarkOf(5), "'-refund")
    assert.equal(remarkOf(6), "'@admin")
    assert.equal(remarkOf(7), "Bayaran 款项 பணம் café")                                // non-English
    assert.equal(remarkOf(8), "")                                                     // empty
    assert.equal(remarkOf(9), "")                                                     // missing
    assert.equal(remarkOf(10), "padded")                                              // trimmed like other text
    assert.equal(remarkOf(11), "tab")                                                 // whitespace-only start trimmed
})

test("generic CSV: a split document repeats its remarks on every line", () => {
    const splitRows = genericRows.slice(1).filter((r) => r[header.indexOf("Document ID")].startsWith("split000"))
    assert.equal(splitRows.length, 2)
    for (const r of splitRows) assert.equal(r[remarksCol], "split remark")
})

test("generic CSV: the AI error notes never appear", () => {
    assert.ok(!generic.includes("AI Extraction Error"))
    assert.ok(!generic.includes("secret"))
})

test("only the generic format is accepted; the removed Xero format is refused", () => {
    const q = (extra: string) => new URLSearchParams(`from=2026-11-01&to=2026-11-30${extra}`)
    const def = parseExportParams(q(""))
    assert.ok(def.ok && def.value.format === "generic")
    const generic = parseExportParams(q("&format=generic"))
    assert.ok(generic.ok && generic.value.format === "generic")
    assert.deepEqual(parseExportParams(q("&format=xero_bills")), { ok: false, error: "Unknown export format" })
})
