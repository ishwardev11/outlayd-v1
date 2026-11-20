import { test } from "node:test"
import assert from "node:assert/strict"
import { buildReportCsv, buildReportPdfTable, type ReportExportRow } from "./report-export"
import { parseCsv } from "../test/parse-csv"

// The CSV builder exactly as it was in ReportsExportButton before remarks were added, kept here as
// the reference that the existing columns must still match.
function legacyCsv(filteredDocuments: ReportExportRow[], symbol: string): string {
    const headers = ["ID", "Vendor", "Date", "Fund", "Category", `Amount (${symbol})`, "Status", "Original Currency", "Original Amount", "Exchange Rate"];
    const rows = filteredDocuments.map(doc => [
        `"${doc.id}"`,
        `"${doc.vendor_name || "Unknown"}"`,
        `"${doc.document_date || doc.created_at || ""}"`,
        `"${doc.funds?.name || "Unassigned"}"`,
        `"${doc.categories?.name || "Uncategorized"}"`,
        `"${doc.amount || 0}"`,
        `"${doc.status || "Unknown"}"`,
        `"${doc.original_currency || ""}"`,
        `"${doc.original_currency ? (doc.original_amount ?? "") : ""}"`,
        `"${doc.original_currency ? (doc.exchange_rate ?? "") : ""}"`
    ]);
    return [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
}

const row = (over: Partial<ReportExportRow>): ReportExportRow => ({
    id: "d1", vendor_name: "TNB Berhad", document_date: "2026-11-01", created_at: "2026-11-01T02:00:00+00:00",
    funds: { name: "Building Fund" }, categories: { name: "Utilities" }, amount: 1234.56, status: "paid",
    original_currency: null, original_amount: null, exchange_rate: null, remarks: null, ...over,
})

// Ordinary rows: nothing unusual in them, so the old builder produced a valid file
const normalRows: ReportExportRow[] = [
    row({}),
    row({ id: "d2", vendor_name: null, document_date: null, funds: null, categories: null, amount: null, status: null }),
    row({ id: "d3", amount: -50, status: "awaiting_payment", remarks: "credit note" }),
    row({ id: "d4", amount: 46.7, original_currency: "USD", original_amount: 10, exchange_rate: 4.67 }),
    row({ id: "d5", vendor_name: "Café Ãngel", amount: 0 }),
]

test("existing columns show the same values as before for ordinary rows", () => {
    const before = parseCsv(legacyCsv(normalRows, "RM"))
    const after = parseCsv(buildReportCsv(normalRows, "RM"))
    assert.deepEqual(after.map((r) => r.slice(0, -1)), before)
})

test("Remarks is the last column, empty when a document has none", () => {
    const rows = parseCsv(buildReportCsv(normalRows, "RM"))
    assert.equal(rows[0][rows[0].length - 1], "Remarks")
    assert.equal(rows[0].length, 11)
    assert.deepEqual(rows.slice(1).map((r) => r[10]), ["", "", "credit note", "", ""])
})

test("a negative amount stays a number (no formula apostrophe)", () => {
    const rows = parseCsv(buildReportCsv([row({ amount: -50 })], "RM"))
    assert.equal(rows[1][5], "-50")
})

test("remarks with commas, quotes, line breaks, formulas and other scripts come out exactly", () => {
    const tricky = [
        "Paid by cheque 4471, approved", 'He said "ok"', "line one\nline two", "=SUM(A1:A9)", "+601", "-x", "@admin",
        "Bayaran 款项 பணம்",
    ]
    const rows = parseCsv(buildReportCsv(tricky.map((r, i) => row({ id: `t${i}`, remarks: r })), "RM"))
    assert.equal(rows.length, tricky.length + 1) // no row was split or merged
    assert.deepEqual(rows.slice(1).map((r) => r[10]), [
        "Paid by cheque 4471, approved", 'He said "ok"', "line one\nline two", "'=SUM(A1:A9)", "'+601", "'-x", "'@admin",
        "Bayaran 款项 பணம்",
    ])
})

test("a vendor name with a quote no longer breaks the row (it did before)", () => {
    const rows = [row({ vendor_name: 'Kedai "Maju", Sdn Bhd' })]
    assert.throws(() => parseCsv(legacyCsv(rows, "RM"))) // the old file was malformed
    assert.equal(parseCsv(buildReportCsv(rows, "RM"))[1][1], 'Kedai "Maju", Sdn Bhd')
})

test("the CSV starts with the UTF-8 marker so Excel shows non-English text", () => {
    assert.ok(buildReportCsv(normalRows, "RM").startsWith("﻿"))
})

test("the AI error notes are never exported", () => {
    const withNotes = { ...row({ remarks: "real remark" }), notes: "AI Extraction Error: boom" } as ReportExportRow
    const csv = buildReportCsv([withNotes], "RM")
    const pdf = JSON.stringify(buildReportPdfTable([withNotes], "RM"))
    for (const out of [csv, pdf]) {
        assert.ok(!out.includes("AI Extraction Error"))
        assert.ok(out.includes("real remark"))
    }
})

test("PDF table: same rows and order as before, Remarks last, other scripts made printable", () => {
    const { head, body } = buildReportPdfTable([
        row({ id: "a", amount: 10, remarks: "small" }),
        row({ id: "b", amount: 500, remarks: "Bayaran 款项 café" }),
        row({ id: "c", amount: null, remarks: null }),
    ], "RM")
    assert.deepEqual(head, [["Vendor / Payee", "Date", "Fund", "Category", "Amount (RM)", "Remarks"]])
    assert.deepEqual(body.map((r) => r[5]), ["Bayaran ?? café", "small", ""])
    assert.equal(body[0][4], `RM${(500).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
})
