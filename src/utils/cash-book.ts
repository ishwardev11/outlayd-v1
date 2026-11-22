// The cash book: every movement of cash, read from transactions (paid documents arrive through the
// database mirror, money in is entered directly). Pure functions only, so they are easy to test.
import { CSV_BOM, csvRow, csvText } from "@/utils/csv"

export type CashBookType = "money_in" | "money_out" | "account_transfer" | "fund_transfer"

export interface CashBookLine {
    amount: number
    fundId: string
    fundName: string
    categoryId: string | null
    categoryName: string
}

export interface CashBookRow {
    id: string
    date: string
    dateEstimated: boolean
    type: CashBookType
    total: number
    payee: string
    reference: string
    remarks: string
    source: "manual" | "ai_extraction" | "import" | "document"
    documentId: string | null
    isRefund: boolean
    hasAttachment: boolean
    accountId: string
    accountName: string
    lines: CashBookLine[]
    balance: number | null
    // Money in with at least one donation line (a donation receipt can be issued for it)
    donation: boolean
    // The receipt in force, or else the most recent voided one
    receipt: { id: string; number: string; voided: boolean } | null
    // The invoice this entry pays, if any (payments of invoices are changed on the Invoices page)
    invoice: { id: string; direction: "payable" | "receivable"; label: string } | null
    // The asset or liability this entry is for, if any (changed on the Assets & Liabilities page)
    item?: { id: string; name: string; kind: "fixed_asset" | "other_asset" | "liability" } | null
    // A fund transfer: the two funds
    transfer?: { from: string; to: string } | null
}

export interface CashBookFilters {
    from: string
    to: string
    type: "all" | "money_in" | "money_out"
    fund: string
    category: string
    payee: string
    account: string
    q: string
    page: number
}

export const CASH_BOOK_PAGE_SIZE = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

// Reads the cash book filters from the URL. Anything unexpected is dropped, never guessed.
export function parseCashBookFilters(sp: SearchParams): CashBookFilters {
    const id = (v: string) => (UUID_RE.test(v) ? v : "")
    const date = (v: string) => (ISO_DATE_RE.test(v) ? v : "")
    const type = first(sp.type)
    const page = Number.parseInt(first(sp.page), 10)
    return {
        from: date(first(sp.from)),
        to: date(first(sp.to)),
        type: type === "money_in" || type === "money_out" ? type : "all",
        fund: id(first(sp.fund)),
        category: id(first(sp.category)),
        payee: id(first(sp.payee)),
        account: id(first(sp.account)),
        q: first(sp.q).trim().slice(0, 60),
        page: Number.isFinite(page) && page > 0 ? page : 1,
    }
}

// "Refund received" is money in that reduces an expense: entered as a refund, or a credit note or
// refund document that the mirror turned into money in.
export function typeLabel(row: Pick<CashBookRow, "type" | "isRefund" | "source"> & { invoice?: CashBookRow["invoice"]; item?: CashBookRow["item"] }): string {
    if (row.item) {
        const out = row.type === "money_out"
        if (row.item.kind === "fixed_asset") return out ? "Asset purchase" : "Asset sale"
        if (row.item.kind === "liability") return out ? "Loan repayment" : "Loan received"
        return out ? "Deposit paid" : "Deposit returned"
    }
    if (row.invoice) return row.type === "money_out" ? "Bill payment" : "Invoice payment received"
    if (row.type === "money_in") return row.isRefund || row.source === "document" ? "Refund received" : "Money in"
    if (row.type === "money_out") return "Money out"
    if (row.type === "account_transfer") return "Account transfer"
    return "Fund transfer"
}

export function sourceLabel(source: CashBookRow["source"]): string {
    return source === "document" ? "Document" : source === "manual" ? "Entered" : source === "import" ? "Import" : "AI"
}

// One summary for the Category and Fund columns: the single value, or "Split (n)"
export function summarise(values: string[]): string {
    const unique = [...new Set(values)]
    return unique.length === 1 ? unique[0] : `Split (${unique.length})`
}

const money = (n: number) => n.toFixed(2)

// CSV: one row per line, so a split entry shows each fund and category with its own amount.
export function buildCashBookCsv(rows: CashBookRow[], currency: string): string {
    const header = [
        "Date", "Type", "Payee", "Category", "Fund", "Account", `Money in (${currency})`, `Money out (${currency})`,
        "Reference", "Remarks", "Source", "Date estimated", "Line", "Entry ID",
    ]
    const body: string[] = []
    for (const r of rows) {
        const lines = r.lines.length > 0 ? r.lines : [{ amount: r.total, fundId: "", fundName: "", categoryId: null, categoryName: "" }]
        lines.forEach((l, i) => {
            const isIn = r.type === "money_in"
            body.push(csvRow([
                r.date, csvText(typeLabel(r)), csvText(r.payee), csvText(l.categoryName), csvText(l.fundName), csvText(r.accountName),
                isIn ? money(l.amount) : "", isIn ? "" : money(l.amount),
                csvText(r.reference), csvText(r.remarks), sourceLabel(r.source), r.dateEstimated ? "Yes" : "No",
                String(i + 1), r.id,
            ]))
        })
    }
    return CSV_BOM + [csvRow(header.map(csvText)), ...body].join("\r\n") + "\r\n"
}

// Totals of the rows shown, for the footer
export function cashBookTotals(rows: CashBookRow[]): { moneyIn: number; moneyOut: number } {
    let inC = 0
    let outC = 0
    for (const r of rows) {
        if (r.type === "money_in") inC += Math.round(r.total * 100)
        else if (r.type === "money_out") outC += Math.round(r.total * 100)
    }
    return { moneyIn: inC / 100, moneyOut: outC / 100 }
}
