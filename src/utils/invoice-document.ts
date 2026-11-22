// The printable invoice (spec 3.8: receivable invoices get a PDF with the letterhead and the payment
// details typed into settings). Pure: turns the stored invoice into what the PDF prints, so the layout
// data can be tested without a PDF library.
import { letterheadLines, type ReceiptOrg } from "./donation-receipt"
import type { DerivedStatus } from "./invoices"

export interface InvoicePrintRecord {
    invoice_no: string | null
    status: "draft" | "open" | "void"
    derived_status: DerivedStatus
    issue_date: string
    due_date: string | null
    reference: string | null
    remarks: string | null
    total: number
    paid: number
    balance: number
    void_reason: string | null
    lines: { description: string | null; category_name: string; amount: number }[]
    bill_to: { name: string; address: string | null; email: string | null }
}

export interface InvoicePrintOrg extends ReceiptOrg {
    payment_details: string | null
}

export interface InvoiceContent {
    letterhead: string[]
    letterheadImage: string | null
    title: string
    meta: [string, string][]
    billTo: string[]
    items: { description: string; amount: string }[]
    totals: [string, string, boolean][] // label, amount, emphasised
    paymentDetails: string[]
    notes: string | null
    stamp: { text: "VOID" | "DRAFT" | "PAID"; colour: [number, number, number] } | null
    footer: string | null
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const lines = (s: string | null | undefined) => (s ? s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [])

export function buildInvoiceContent(inv: InvoicePrintRecord, org: InvoicePrintOrg): InvoiceContent {
    const cur = org.currency
    const meta: [string, string][] = [
        ["Invoice no.", inv.invoice_no ?? "Draft (not yet numbered)"],
        ["Invoice date", inv.issue_date],
    ]
    if (inv.due_date) meta.push(["Due date", inv.due_date])
    if (inv.reference) meta.push(["Reference", inv.reference])

    const totals: [string, string, boolean][] = [["Total", `${cur} ${money(inv.total)}`, inv.paid === 0]]
    if (inv.paid > 0) {
        totals.push(["Amount paid", `${cur} ${money(inv.paid)}`, false])
        totals.push(["Balance due", `${cur} ${money(inv.balance)}`, true])
    }

    let stamp: InvoiceContent["stamp"] = null
    if (inv.status === "void") stamp = { text: "VOID", colour: [220, 38, 38] }
    else if (inv.status === "draft") stamp = { text: "DRAFT", colour: [100, 116, 139] }
    else if (inv.derived_status === "paid") stamp = { text: "PAID", colour: [5, 150, 105] }

    return {
        letterhead: letterheadLines(org),
        letterheadImage: org.letterheadImage || null,
        title: "INVOICE",
        meta,
        billTo: [inv.bill_to.name, ...lines(inv.bill_to.address), ...(inv.bill_to.email ? [inv.bill_to.email] : [])],
        items: inv.lines.map((l) => ({ description: l.description?.trim() || l.category_name, amount: money(l.amount) })),
        totals,
        // How to pay only matters while something is still owed
        paymentDetails: inv.status === "open" && inv.balance > 0 ? lines(org.payment_details) : [],
        notes: inv.remarks?.trim() || null,
        stamp,
        footer: inv.status === "void" ? `This invoice was voided${inv.void_reason ? `: ${inv.void_reason}` : ""}.` : null,
    }
}
