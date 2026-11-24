import jsPDF from "jspdf"
import autoTable, { type RowInput } from "jspdf-autotable"
import type { FundMemoData } from "./fund-memo"
// Sections: 1 fund details, 2 summary, 3 by category, 4 schedule, 5 assets bought, 6 exceptions,
// 7 basis of preparation, 8 sign-off
import { pdfSafeText } from "./pdf-text"

const INDIGO: [number, number, number] = [79, 70, 229]
const SLATE: [number, number, number] = [51, 65, 85]
const LIGHT: [number, number, number] = [241, 245, 249]
const MARGIN = 14

// jsPDF's built-in fonts only cover Latin characters. Replace anything else so the PDF never shows
// garbage. Single-line fields also turn a line break into "?", as they always have.
function t(value: string | null | undefined): string {
    return pdfSafeText(value).replace(/\n/g, "?")
}

const numberFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (code: string, n: number) => `${code} ${numberFormat.format(n)}`

function longDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    })
}

export function generateFundMemoPdf(memo: FundMemoData): void {
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const contentW = pageW - MARGIN * 2
    const cur = memo.currency
    let y = 0

    const ensureSpace = (needed: number) => {
        if (y + needed > pageH - 22) {
            doc.addPage()
            y = 20
        }
    }
    const lastTableY = () => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
    const heading = (text: string) => {
        ensureSpace(14)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(12)
        doc.setTextColor(...INDIGO)
        doc.text(text, MARGIN, y)
        doc.setDrawColor(...INDIGO)
        doc.setLineWidth(0.4)
        doc.line(MARGIN, y + 1.5, pageW - MARGIN, y + 1.5)
        y += 7
        doc.setFont("helvetica", "normal")
        doc.setTextColor(...SLATE)
    }

    // ---- Title block ----
    doc.setFillColor(...INDIGO)
    doc.rect(0, 0, pageW, 30, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(18)
    doc.text("Fund Income and Expenditure Memo", MARGIN, 14)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(t(memo.organization.name), MARGIN, 21)
    if (memo.organization.registrationId) {
        doc.text(`Registration no: ${t(memo.organization.registrationId)}`, MARGIN, 26)
    }
    doc.setFontSize(9)
    doc.text(`Memo ref: ${memo.memoRef}`, pageW - MARGIN, 14, { align: "right" })
    doc.text(`Prepared: ${longDate(memo.generatedAt.slice(0, 10))}`, pageW - MARGIN, 20, { align: "right" })
    doc.text(`By: ${t(memo.generatedBy)}`, pageW - MARGIN, 26, { align: "right" })
    y = 40

    // ---- Fund details ----
    heading("1. Fund and grant details")
    const detailRows: string[][] = [
        ["Fund", t(memo.fund.name) + (memo.fund.code ? ` (${t(memo.fund.code)})` : "")],
        ["Donor / grantor", t(memo.fund.donorName) || "Not recorded"],
        ["Grant reference", t(memo.fund.grantReference) || "Not recorded"],
        ["Purpose / restrictions", t(memo.fund.purpose) || "Not recorded"],
        ["Grant period", memo.fund.grantStart || memo.fund.grantEnd
            ? `${memo.fund.grantStart ? longDate(memo.fund.grantStart) : "Open"} to ${memo.fund.grantEnd ? longDate(memo.fund.grantEnd) : "Open"}`
            : "Not recorded"],
        ["Reporting period", `${longDate(memo.period.start)} to ${longDate(memo.period.end)}`],
        ["Award amount", memo.fund.awardAmount !== null ? money(cur, memo.fund.awardAmount) : "Not recorded"],
    ]
    autoTable(doc, {
        startY: y,
        body: detailRows,
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 1.6, textColor: SLATE, overflow: "linebreak" },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 }, 1: { cellWidth: contentW - 45 } },
        margin: { left: MARGIN, right: MARGIN },
    })
    y = lastTableY() + 8

    // ---- Financial summary ----
    heading("2. Financial summary")
    const s = memo.totals
    const summaryRows: string[][] = [
        ["Income in this period", money(cur, s.income)],
        ["   of which still owed to the organisation", money(cur, s.incomeOwed)],
        ["Expenditure in this period", money(cur, s.expenditure)],
        ["   of which paid", money(cur, s.expenditurePaid)],
        ["   of which bills not yet paid", money(cur, s.expenditureUnpaid)],
        ["   of which non-cash (depreciation and disposals)", money(cur, s.expenditureNonCash)],
        ["Income less expenditure", money(cur, s.net)],
        ["Expenditure from the grant start (or the beginning) to period end", money(cur, s.cumulativeExpenditure)],
    ]
    if (s.remaining !== null) {
        summaryRows.push(["Award remaining", money(cur, s.remaining)])
    }
    if (s.assetsBought !== 0) {
        summaryRows.push(["Assets bought in this period (not in expenditure, see section 5)", money(cur, s.assetsBought)])
    }
    if (s.percentOfAwardUsed !== null) {
        summaryRows.push(["Share of award used", `${s.percentOfAwardUsed.toFixed(1)}%`])
    }
    autoTable(doc, {
        startY: y,
        body: summaryRows,
        theme: "striped",
        styles: { fontSize: 9, cellPadding: 2, textColor: SLATE },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: { 0: { cellWidth: contentW - 55 }, 1: { halign: "right", fontStyle: "bold", cellWidth: 55 } },
        margin: { left: MARGIN, right: MARGIN },
    })
    y = lastTableY() + 8

    // ---- By category ----
    const categoryTable = (rows: FundMemoData["byCategory"], paidLabel: string, unpaidLabel: string, total: number, empty: string) => {
        if (rows.length === 0) {
            doc.setFontSize(9)
            doc.text(empty, MARGIN, y)
            y += 8
            return
        }
        const sum = (f: (c: FundMemoData["byCategory"][number]) => number) => numberFormat.format(rows.reduce((acc, c) => acc + f(c), 0))
        autoTable(doc, {
            startY: y,
            head: [["Category", paidLabel, unpaidLabel, "Non-cash", "Total", "% of total"]],
            body: rows.map((c) => [
                t(c.name), numberFormat.format(c.paid), numberFormat.format(c.unpaid), numberFormat.format(c.nonCash),
                numberFormat.format(c.total), `${c.percent.toFixed(1)}%`,
            ]),
            foot: [["Total", sum((c) => c.paid), sum((c) => c.unpaid), sum((c) => c.nonCash), numberFormat.format(total), "100%"]],
            showFoot: "lastPage",
            theme: "grid",
            headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 9 },
            footStyles: { fillColor: LIGHT, textColor: SLATE, fontStyle: "bold", fontSize: 9 },
            styles: { fontSize: 9, cellPadding: 2, textColor: SLATE },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
            didParseCell: (data) => {
                if (data.column.index >= 1 && (data.section === "head" || data.section === "foot")) {
                    data.cell.styles.halign = "right"
                }
            },
            margin: { left: MARGIN, right: MARGIN },
        })
        y = lastTableY() + 8
    }
    heading("3. Income and expenditure by category (this period)")
    categoryTable(memo.incomeByCategory, "Received", "Owed", s.income, "No income in this period.")
    categoryTable(memo.byCategory, "Paid", "Unpaid", s.expenditure, "No expenditure in this period.")

    // ---- Transaction schedule ----
    heading(`4. Schedule of entries (${memo.totals.transactionCount})`)
    if (memo.transactions.length === 0) {
        doc.setFontSize(9)
        doc.text("No transactions to list.", MARGIN, y)
        y += 8
    } else {
        autoTable(doc, {
            startY: y,
            head: [["No.", "Date", "Payee", "Invoice / ref", "Category", "Status", "Receipt", `Amount (${cur})`]],
            // A transaction with remarks gets a full-width line underneath it, so the existing columns
            // keep their widths and long remarks can wrap
            body: memo.transactions.flatMap((x): RowInput[] => {
                const rowCells: RowInput = [
                    x.txnNo, x.date, t(x.payee), t(x.reference) || "-",
                    `${t(x.category)}${x.kind === "income" ? " (income)" : ""}`,
                    t(x.statusLabel), x.hasReceipt ? "Yes" : x.needsEvidence ? "No" : "-",
                    numberFormat.format(x.amount),
                ]
                if (!x.remarks) return [rowCells]
                return [rowCells, [{
                    content: `Remarks: ${pdfSafeText(x.remarks)}`,
                    colSpan: 8,
                    styles: { fontStyle: "italic", fontSize: 7.5, textColor: [100, 116, 139], cellPadding: { top: 0.6, bottom: 1.8, left: 1.8, right: 1.8 } },
                }]]
            }),
            foot: [
                [{ content: "Total income", colSpan: 7, styles: { halign: "right" } }, numberFormat.format(s.income)],
                [{ content: "Total expenditure", colSpan: 7, styles: { halign: "right" } }, numberFormat.format(s.expenditure)],
            ],
            showFoot: "lastPage",
            theme: "grid",
            headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 8 },
            footStyles: { fillColor: LIGHT, textColor: SLATE, fontStyle: "bold", fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 1.8, textColor: SLATE, overflow: "linebreak" },
            columnStyles: {
                0: { cellWidth: 12 }, 1: { cellWidth: 21 }, 2: { cellWidth: 31 }, 3: { cellWidth: 24 },
                4: { cellWidth: 27 }, 5: { cellWidth: 25 }, 6: { cellWidth: 14 }, 7: { halign: "right" },
            },
            didParseCell: (data) => {
                if (data.section === "head" && data.column.index >= 6) {
                    data.cell.styles.halign = data.column.index === 7 ? "right" : "left"
                }
                if (data.section === "foot") data.cell.styles.halign = "right"
                if (data.section === "body" && data.column.index === 6 && data.cell.raw === "No") {
                    data.cell.styles.textColor = [185, 28, 28]
                    data.cell.styles.fontStyle = "bold"
                }
            },
            margin: { left: MARGIN, right: MARGIN },
        })
        y = lastTableY() + 8
    }

    // ---- Assets bought (listed only; their cost reaches expenditure as depreciation) ----
    heading(`5. Assets bought from this fund (${memo.assetsBought.length})`)
    if (memo.assetsBought.length === 0) {
        doc.setFontSize(9)
        doc.text("No assets were bought from this fund in this period.", MARGIN, y)
        y += 8
    } else {
        autoTable(doc, {
            startY: y,
            head: [["Date", "Asset", "Payee", "Ref", `Amount (${cur})`]],
            body: memo.assetsBought.map((a) => [a.date, t(a.item), t(a.payee) || "-", t(a.reference) || "-", numberFormat.format(a.amount)]),
            foot: [["", "", "", "Total", numberFormat.format(s.assetsBought)]],
            showFoot: "lastPage",
            theme: "grid",
            headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 8 },
            footStyles: { fillColor: LIGHT, textColor: SLATE, fontStyle: "bold", fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 1.8, textColor: SLATE, overflow: "linebreak" },
            columnStyles: { 4: { halign: "right" } },
            didParseCell: (data) => {
                if (data.section !== "body" && data.column.index === 4) data.cell.styles.halign = "right"
            },
            margin: { left: MARGIN, right: MARGIN },
        })
        y = lastTableY() + 3
        doc.setFontSize(8)
        const note = doc.splitTextToSize("These purchases are not in the expenditure above. Their cost is spread over each asset's useful life as depreciation.", contentW) as string[]
        ensureSpace(note.length * 4 + 2)
        doc.text(note, MARGIN, y + 3)
        y += note.length * 4 + 6
    }

    // ---- Exceptions ----
    heading("6. Exceptions for reviewer attention")
    doc.setFontSize(9)
    if (memo.exceptions.length === 0) {
        doc.text("No exceptions were identified by the automated checks.", MARGIN, y)
        y += 8
    } else {
        memo.exceptions.forEach((e, i) => {
            const lines = doc.splitTextToSize(`${i + 1}. ${t(e.message)}`, contentW) as string[]
            ensureSpace(lines.length * 4.5 + 2)
            doc.text(lines, MARGIN, y)
            y += lines.length * 4.5 + 1.5
        })
        y += 3
    }

    // ---- Basis of preparation ----
    heading("7. Basis of preparation")
    const basis: string[] = [
        `All amounts are in ${cur}, the organization's base currency, as recorded in Outlayd.`,
        "Income and expenditure follow the Statement of Income and Expenditure for this fund and period: money received and paid counts on the date it moved; bills and invoices count on their invoice date, whether paid yet or not, and their payments are not counted again; refunds reduce the expense they refund; depreciation of the fund's assets is a non-cash expense.",
        "Entries split across several funds are shown only for the portion assigned to this fund.",
        "Paid and unpaid parts of bills use the payments dated on or before the end of the reporting period.",
        "The award remaining figure is the award less expenditure from the grant start date (if recorded) to the end of the reporting period.",
    ]
    const foreign = memo.transactions.filter((x) => x.foreign)
    if (foreign.length > 0) {
        basis.push(`${foreign.length} entr${foreign.length === 1 ? "y was" : "ies were"} in another currency and ${foreign.length === 1 ? "is" : "are"} shown converted into ${cur} at the rate recorded on the uploaded document.`)
        const shown = foreign.slice(0, 10).map((x) => {
            const f = x.foreign!
            return `${x.txnNo}: ${f.currency} ${numberFormat.format(f.originalAmount)} at ${Number(f.rate.toFixed(6))} (${f.source === "manual" ? "rate entered manually" : "ECB reference rate for the document date"})`
        })
        basis.push(`Foreign currency detail: ${shown.join("; ")}${foreign.length > shown.length ? `; and ${foreign.length - shown.length} more` : ""}.`)
    }
    if (memo.excluded.pendingReviewCount > 0) {
        basis.push(`Not included: ${memo.excluded.pendingReviewCount} uploaded document(s) allocated to this fund that are still awaiting review (${money(cur, memo.excluded.pendingReviewAmount)}).`)
    }
    if (memo.excluded.duplicateCount > 0) {
        basis.push(`Not included: ${memo.excluded.duplicateCount} uploaded document(s) flagged as possible duplicates.`)
    }
    doc.setFontSize(9)
    basis.forEach((b) => {
        const lines = doc.splitTextToSize(`- ${b}`, contentW) as string[]
        ensureSpace(lines.length * 4.5 + 2)
        doc.text(lines, MARGIN, y)
        y += lines.length * 4.5 + 1.5
    })
    y += 6

    // ---- Sign-off ----
    ensureSpace(48)
    heading("8. Review and approval")
    const colW = (contentW - 12) / 3
    const roles = ["Prepared by", "Reviewed by (Treasurer)", "Approved by"]
    y += 14
    roles.forEach((role, i) => {
        const x = MARGIN + i * (colW + 6)
        doc.setDrawColor(...SLATE)
        doc.setLineWidth(0.3)
        doc.line(x, y, x + colW, y)
        doc.setFontSize(8)
        doc.text(role, x, y + 4)
        doc.text("Name / date", x, y + 8)
    })

    // ---- Footer on every page ----
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.setTextColor(120, 130, 145)
        doc.text(`${memo.memoRef}  |  ${t(memo.fund.name)}  |  Generated by Outlayd`, MARGIN, pageH - 8)
        doc.text(`Page ${i} of ${pages}`, pageW - MARGIN, pageH - 8, { align: "right" })
    }

    const safeName = memo.fund.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "fund"
    doc.save(`${memo.memoRef}-${safeName}.pdf`)
}
