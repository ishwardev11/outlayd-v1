import { test } from "node:test"
import assert from "node:assert/strict"
import { buildExport, parseExportParams, toGenericCsv, type ExportEntry, type ExportLookups } from "./accounting-export"
import { parseCsv } from "../test/parse-csv"

// A small cash book: a bill payment, a refund, a split donation, an asset purchase, a receipt in
// another currency from an upload, and remarks that would be formulas in a spreadsheet.
const lookups: ExportLookups = {
    funds: new Map([["gen", { name: "General Fund" }], ["edu", { name: "Education Fund" }], ["bld", { name: "Building Fund" }]]),
    categories: new Map([
        ["c-print", { name: "Printing", account_code: "6100" }],
        ["c-rent", { name: "Rent", account_code: "" }],
        ["c-don", { name: "General donations", account_code: "4000" }],
    ]),
    accounts: new Map([["main", { name: "Main Bank" }]]),
    invoices: new Map([["inv-print", { invoice_no: "CJ-310", due_date: "2026-04-10", direction: "payable" as const }]]),
    items: new Map([["van", { name: "Van", kind: "fixed_asset" as const }]]),
    documents: new Map([["doc-rent", { original_currency: "USD", original_amount: 700, exchange_rate: 4.2857 }]]),
}

const entry = (over: Partial<ExportEntry>): ExportEntry => ({
    id: "t", tx_type: "money_out", tx_date: "2026-03-31", payee_name: "Cetak Jaya", reference: null, remarks: null,
    source: "manual", document_id: null, is_refund: false, account_id: "main", lines: [], ...over,
})

const entries: ExportEntry[] = [
    entry({ id: "t-pay", reference: "CJ-310", lines: [{ line_no: 1, amount: 800, fund_id: "edu", category_id: "c-print", invoice_id: "inv-print", item_id: null }] }),
    entry({ id: "t-refund", tx_type: "money_in", tx_date: "2026-06-15", reference: "CN-15", is_refund: true, remarks: "=SUM(A1:A9)",
        lines: [{ line_no: 1, amount: 250, fund_id: "edu", category_id: "c-print", invoice_id: null, item_id: null }] }),
    entry({ id: "t-don", tx_type: "money_in", tx_date: "2026-09-01", payee_name: "+Puan Aminah", remarks: "split, \"two\" funds\nline two",
        lines: [
            { line_no: 2, amount: 1000, fund_id: "edu", category_id: "c-don", invoice_id: null, item_id: null },
            { line_no: 1, amount: 3000, fund_id: "gen", category_id: "c-don", invoice_id: null, item_id: null },
        ] }),
    entry({ id: "t-van", tx_date: "2026-02-01", payee_name: "Toyota", lines: [{ line_no: 1, amount: 36000, fund_id: "bld", category_id: null, invoice_id: null, item_id: "van" }] }),
    entry({ id: "t-rent", tx_date: "2026-05-02", payee_name: "Landlord", source: "document", document_id: "doc-rent",
        lines: [{ line_no: 1, amount: 3000, fund_id: "gen", category_id: "c-rent", invoice_id: null, item_id: null }] }),
]

const { lines, summary } = buildExport(entries, lookups)
const csv = toGenericCsv(lines, "MYR")
const rows = parseCsv(csv)
const header = rows[0]
const col = (name: string) => header.indexOf(name)
const rowsOf = (id: string) => rows.slice(1).filter((r) => r[col("Transaction ID")] === id)

test("the first 19 columns keep their names and positions; new columns are added at the end", () => {
    assert.deepEqual(header.slice(0, 19), [
        "Date", "Due date", "Paid date", "Type", "Status", "Document no.", "Reference", "Vendor", "Description",
        "Category", "Account code", "Fund", "Amount (MYR)", "Original currency", "Original amount",
        "Exchange rate", "Line", "Document ID", "Remarks",
    ])
    assert.deepEqual(header.slice(19), ["Money in (MYR)", "Money out (MYR)", "Account", "Source", "Transaction ID"])
})

test("one row per line; money in and money out totals add up to the cash book", () => {
    assert.equal(summary.entries, 5)
    assert.equal(summary.lines, 6)
    assert.equal(summary.moneyInCents, 425000)   // refund 250 + donation 4,000
    assert.equal(summary.moneyOutCents, 3980000) // bill 800 + van 36,000 + rent 3,000
    const sum = (name: string) => rows.slice(1).reduce((s, r) => s + Math.round(Number(r[col(name)] || 0) * 100), 0)
    assert.equal(sum("Money in (MYR)"), summary.moneyInCents)
    assert.equal(sum("Money out (MYR)"), summary.moneyOutCents)
    assert.equal(sum("Amount (MYR)"), summary.moneyInCents + summary.moneyOutCents)
})

test("a bill payment carries the bill number and due date, labelled like the cash book", () => {
    const [r] = rowsOf("t-pay")
    assert.equal(r[col("Type")], "Bill payment")
    assert.equal(r[col("Status")], "Paid")
    assert.equal(r[col("Document no.")], "CJ-310")
    assert.equal(r[col("Due date")], "2026-04-10")
    assert.equal(r[col("Paid date")], "2026-03-31")
    assert.equal(r[col("Description")], "Cetak Jaya - CJ-310")
    assert.equal(r[col("Account code")], "6100")
    assert.equal(r[col("Money out (MYR)")], "800.00")
    assert.equal(r[col("Money in (MYR)")], "")
})

test("a refund is money in, labelled Refund received, under the expense it refunds", () => {
    const [r] = rowsOf("t-refund")
    assert.deepEqual([r[col("Type")], r[col("Status")], r[col("Category")], r[col("Money in (MYR)")]], ["Refund received", "Received", "Printing", "250.00"])
})

test("a split entry has one row per line in line order, repeating its remarks", () => {
    const split = rowsOf("t-don")
    assert.deepEqual(split.map((r) => [r[col("Line")], r[col("Fund")], r[col("Amount (MYR)")]]), [["1", "General Fund", "3000.00"], ["2", "Education Fund", "1000.00"]])
    for (const r of split) assert.equal(r[col("Remarks")], "split, \"two\" funds\nline two")
})

test("an asset purchase is labelled and shows the asset in the category column", () => {
    const [r] = rowsOf("t-van")
    assert.deepEqual([r[col("Type")], r[col("Category")], r[col("Account code")]], ["Asset purchase", "Van", ""])
})

test("an entry from an upload links to it and carries its original currency", () => {
    const [r] = rowsOf("t-rent")
    assert.deepEqual(
        [r[col("Document ID")], r[col("Source")], r[col("Original currency")], r[col("Original amount")], r[col("Exchange rate")]],
        ["doc-rent", "Document", "USD", "700.00", "4.2857"],
    )
    assert.equal(r[col("Account")], "Main Bank")
})

test("text that a spreadsheet would run as a formula is neutralised", () => {
    assert.equal(rowsOf("t-refund")[0][col("Remarks")], "'=SUM(A1:A9)")
    assert.equal(rowsOf("t-don")[0][col("Vendor")], "'+Puan Aminah")
})

test("lines with a category but no account code are counted for the warning", () => {
    assert.equal(summary.linesWithoutAccountCode, 1)
    assert.deepEqual(summary.categoriesWithoutAccountCode, ["Rent"])
})

test("the AI error notes never appear", () => {
    const withNotes = entries.map((e) => ({ ...e, notes: "AI Extraction Error: secret" }) as ExportEntry)
    assert.ok(!toGenericCsv(buildExport(withNotes, lookups).lines, "MYR").includes("AI Extraction Error"))
})

test("only the generic format is accepted; old document options are ignored, bad dates refused", () => {
    const q = (extra: string) => new URLSearchParams(`from=2026-11-01&to=2026-11-30${extra}`)
    assert.deepEqual(parseExportParams(q("")), { ok: true, value: { format: "generic", from: "2026-11-01", to: "2026-11-30" } })
    assert.deepEqual(parseExportParams(q("&scope=approved&dateField=paid_date")), { ok: true, value: { format: "generic", from: "2026-11-01", to: "2026-11-30" } })
    assert.deepEqual(parseExportParams(q("&format=xero_bills")), { ok: false, error: "Unknown export format" })
    assert.equal(parseExportParams(new URLSearchParams("from=2026-02-30&to=2026-03-01")).ok, false)
    assert.equal(parseExportParams(new URLSearchParams("from=2026-03-02&to=2026-03-01")).ok, false)
})
