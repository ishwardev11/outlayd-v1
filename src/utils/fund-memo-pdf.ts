import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { FundMemoData } from "./fund-memo"

const INDIGO: [number, number, number] = [79, 70, 229]
const SLATE: [number, number, number] = [51, 65, 85]
const LIGHT: [number, number, number] = [241, 245, 249]
const MARGIN = 14

// jsPDF's built-in fonts only cover Latin characters. Replace anything else so the PDF never shows garbage.
function t(value: string | null | undefined): string {
    return (value ?? "")
        .normalize("NFC")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?")
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
    const lastTableY = () => (doc as any).lastAutoTable?.finalY ?? y
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
    doc.text("Fund Expenditure Memo", MARGIN, 14)
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
        ["Paid expenditure in this period", money(cur, s.periodPaid)],
        ["Committed (approved, not yet paid) in this period", money(cur, s.periodCommitted)],
        ["Total for this period", money(cur, s.periodTotal)],
        ["Cumulative paid expenditure to period end", money(cur, s.cumulativePaid)],
        ["Cumulative commitments to period end", money(cur, s.cumulativeCommitted)],
    ]
    if (s.remaining !== null) {
        summaryRows.push(["Award remaining after paid and committed", money(cur, s.remaining)])
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
    heading("3. Expenditure by category (this period)")
    if (memo.byCategory.length === 0) {
        doc.setFontSize(9)
        doc.text("No paid or committed transactions in this period.", MARGIN, y)
        y += 8
    } else {
        autoTable(doc, {
            startY: y,
            head: [["Category", "Paid", "Committed", "Total", "% of total"]],
            body: memo.byCategory.map((c) => [
                t(c.name), numberFormat.format(c.paid), numberFormat.format(c.committed),
                numberFormat.format(c.total), `${c.percent.toFixed(1)}%`,
            ]),
            foot: [["Total", numberFormat.format(s.periodPaid), numberFormat.format(s.periodCommitted), numberFormat.format(s.periodTotal), "100%"]],
            showFoot: "lastPage",
            theme: "grid",
            headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 9 },
            footStyles: { fillColor: LIGHT, textColor: SLATE, fontStyle: "bold", fontSize: 9 },
            styles: { fontSize: 9, cellPadding: 2, textColor: SLATE },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
            didParseCell: (data) => {
                if (data.column.index >= 1 && (data.section === "head" || data.section === "foot")) {
                    data.cell.styles.halign = "right"
                }
            },
            margin: { left: MARGIN, right: MARGIN },
        })
        y = lastTableY() + 8
    }

    // ---- Transaction schedule ----
    heading(`4. Transaction schedule (${memo.totals.transactionCount})`)
    if (memo.transactions.length === 0) {
        doc.setFontSize(9)
        doc.text("No transactions to list.", MARGIN, y)
        y += 8
    } else {
        autoTable(doc, {
            startY: y,
            head: [["No.", "Date", "Vendor", "Invoice / ref", "Category", "Status", "Receipt", `Amount (${cur})`]],
            body: memo.transactions.map((x) => [
                x.txnNo, x.date, t(x.vendor), t(x.reference) || "-", t(x.category),
                x.status === "paid" ? "Paid" : "Committed", x.hasReceipt ? "Yes" : "No",
                numberFormat.format(x.amount),
            ]),
            foot: [["", "", "", "", "", "", "Total", numberFormat.format(s.periodTotal)]],
            showFoot: "lastPage",
            theme: "grid",
            headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 8 },
            footStyles: { fillColor: LIGHT, textColor: SLATE, fontStyle: "bold", fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 1.8, textColor: SLATE, overflow: "linebreak" },
            columnStyles: {
                0: { cellWidth: 12 }, 1: { cellWidth: 21 }, 2: { cellWidth: 34 }, 3: { cellWidth: 25 },
                4: { cellWidth: 28 }, 5: { cellWidth: 19 }, 6: { cellWidth: 14 }, 7: { halign: "right" },
            },
            didParseCell: (data) => {
                if (data.section !== "body" && data.column.index >= 6) {
                    data.cell.styles.halign = data.column.index === 7 ? "right" : "left"
                }
                if (data.section === "body" && data.column.index === 6 && data.cell.raw === "No") {
                    data.cell.styles.textColor = [185, 28, 28]
                    data.cell.styles.fontStyle = "bold"
                }
            },
            margin: { left: MARGIN, right: MARGIN },
        })
        y = lastTableY() + 8
    }

    // ---- Exceptions ----
    heading("5. Exceptions for reviewer attention")
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
    heading("6. Basis of preparation")
    const basis: string[] = [
        `All amounts are in ${cur}, the organization's base currency, as recorded in Outlayd.`,
        "Only documents with status Paid (expenditure) or Awaiting payment (commitment) are included. Transactions are placed in the period by document date.",
        "Documents split across several funds are allocated by their recorded splits, so only the portion assigned to this fund appears here.",
        "The award remaining figure is calculated from the grant start date (if recorded) to the end of the reporting period.",
    ]
    const foreign = memo.transactions.filter((x) => x.foreign)
    if (foreign.length > 0) {
        basis.push(`${foreign.length} transaction(s) were in another currency and are shown converted into ${cur} at the rate recorded on each document.`)
        const shown = foreign.slice(0, 10).map((x) => {
            const f = x.foreign!
            return `${x.txnNo}: ${f.currency} ${numberFormat.format(f.originalAmount)} at ${Number(f.rate.toFixed(6))} (${f.source === "manual" ? "rate entered manually" : "ECB reference rate for the document date"})`
        })
        basis.push(`Foreign currency detail: ${shown.join("; ")}${foreign.length > shown.length ? `; and ${foreign.length - shown.length} more` : ""}.`)
    }
    if (memo.excluded.pendingReviewCount > 0) {
        basis.push(`Not included: ${memo.excluded.pendingReviewCount} document(s) allocated to this fund that are still awaiting review (${money(cur, memo.excluded.pendingReviewAmount)}).`)
    }
    if (memo.excluded.duplicateCount > 0) {
        basis.push(`Not included: ${memo.excluded.duplicateCount} document(s) flagged as possible duplicates.`)
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
    heading("7. Review and approval")
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
