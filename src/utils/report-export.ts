// Builds the Reports page "Export report" files. Pure functions (no browser or database code), so
// they are easy to test. The button component only fetches the rows and downloads the result.
import { CSV_BOM, csvNumber, csvRow, csvText } from "@/utils/csv"
import { pdfSafeText } from "@/utils/pdf-text"

// One exported row (a documents row from report_rows, with its fund and category names attached).
// The database sends the numeric amount column as a JSON number.
export interface ReportExportRow {
    id: string
    vendor_name: string | null
    document_date?: string | null
    created_at?: string | null
    funds?: { name?: string } | null
    categories?: { name?: string } | null
    amount: number | null
    status: string | null
    original_currency?: string | null
    original_amount?: number | string | null
    exchange_rate?: number | string | null
    // What a person wrote about the entry. documents.notes (AI error messages) is never exported.
    remarks?: string | null
}

const remarksOf = (row: ReportExportRow) => (row.remarks ?? "").trim()

// CSV. Columns and values are the same as before; Remarks is added as the last column so anything
// that reads the existing columns by position is unaffected. Every text cell goes through csvText,
// so a comma, quote or line break can no longer break a row and a formula cannot run.
export function buildReportCsv(rows: ReportExportRow[], symbol: string): string {
    const headers = ["ID", "Vendor", "Date", "Fund", "Category", `Amount (${symbol})`, "Status", "Original Currency", "Original Amount", "Exchange Rate", "Remarks"]
    const body = rows.map((doc) => csvRow([
        csvText(doc.id),
        csvText(doc.vendor_name || "Unknown"),
        csvText(doc.document_date || doc.created_at || ""),
        csvText(doc.funds?.name || "Unassigned"),
        csvText(doc.categories?.name || "Uncategorized"),
        csvNumber(doc.amount || 0),
        csvText(doc.status || "Unknown"),
        csvText(doc.original_currency || ""),
        doc.original_currency ? csvNumber(doc.original_amount ?? "") : "",
        doc.original_currency ? csvNumber(doc.exchange_rate ?? "") : "",
        csvText(remarksOf(doc)),
    ]))
    return CSV_BOM + [csvRow(headers.map(csvText)), ...body].join("\n")
}

// PDF table: the same rows and order as before, with Remarks as the last column. The PDF's built-in
// font only has Latin letters, so remarks pass through pdfSafeText (other scripts become "?").
export function buildReportPdfTable(rows: ReportExportRow[], symbol: string): { head: string[][]; body: string[][] } {
    const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const sorted = [...rows].sort((a, b) => (b.amount || 0) - (a.amount || 0))
    return {
        head: [["Vendor / Payee", "Date", "Fund", "Category", `Amount (${symbol})`, "Remarks"]],
        body: sorted.map((d) => [
            d.vendor_name || "Unknown",
            d.document_date || "—",
            d.funds?.name || "—",
            d.categories?.name || "—",
            money(d.amount || 0),
            pdfSafeText(remarksOf(d)),
        ]),
    }
}
