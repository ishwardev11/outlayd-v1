import jsPDF, { GState } from "jspdf"
import { pdfSafeText } from "./pdf-text"
import { drawLetterheadImage } from "./donation-receipt-pdf"
import type { Signatory } from "./donation-receipt"
import { printAmount, type PrintRow, type PrintTable, type StatementPrint } from "./statement-print"

const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]
const INDIGO: [number, number, number] = [79, 70, 229]
const RULE: [number, number, number] = [203, 213, 225]

export interface StatementFrame {
    letterhead: string[]
    letterheadImage: string | null
    signatories: Signatory[]
    statementNote: string | null
    // true until every blocking check passes: "DRAFT" across every page
    draft: boolean
    preparedOn: string
}

// Builds a financial statement PDF (A4; landscape for wide statements): letterhead, title and period,
// the table (headings repeated on each page, negatives in brackets), notes, a signature block, the
// statement line and page numbers. Text the PDF font cannot draw is shown as "?", like the other PDFs.
export function buildStatementPdf(p: StatementPrint, f: StatementFrame): jsPDF {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: p.landscape ? "landscape" : "portrait" })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const M = 16
    const BOTTOM = H - 22
    const t = (s: string) => pdfSafeText(s).replace(/\n/g, " ")
    let y = 16

    // Letterhead: the uploaded image, otherwise the typed lines, centred
    const imageBottom = f.letterheadImage ? drawLetterheadImage(doc, f.letterheadImage, W, M) : null
    if (imageBottom !== null) {
        y = imageBottom + 7
    } else {
        doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(13)
        doc.text(t(f.letterhead[0] ?? ""), W / 2, y, { align: "center", maxWidth: W - 2 * M })
        y += 5.5
        doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
        for (const line of f.letterhead.slice(1)) {
            doc.text(t(line), W / 2, y, { align: "center", maxWidth: W - 2 * M })
            y += 4
        }
        y += 4
    }

    // Title, period, fund
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(14).text(t(p.title), W / 2, y, { align: "center" })
    y += 6
    doc.setFont("helvetica", "normal").setFontSize(10).text(t(p.heading), W / 2, y, { align: "center" })
    y += 5
    if (p.subheading) {
        doc.setFontSize(9).setTextColor(...MUTED).text(t(p.subheading), W / 2, y, { align: "center" })
        y += 5
    }
    y += 3

    for (const table of p.tables) y = drawTable(doc, table, p.currency, y, { W, M, BOTTOM, t })

    // Notes
    if (p.notes.length > 0) {
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
        for (const n of p.notes) {
            const wrapped = doc.splitTextToSize(t(n), W - 2 * M) as string[]
            if (y + wrapped.length * 3.8 > BOTTOM) { doc.addPage(); y = 20 }
            doc.text(wrapped, M, y)
            y += wrapped.length * 3.8 + 1.5
        }
    }

    // Signature block: the receipt signatories (up to three), otherwise two blank places
    const people = f.signatories.length > 0 ? f.signatories.slice(0, 3) : [{ name: "", title: "" }, { name: "", title: "" }]
    if (y + 34 > BOTTOM) { doc.addPage(); y = 20 }
    y += 8
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...INK)
    doc.text("Approved on behalf of the organisation:", M, y)
    y += 16
    const slot = (W - 2 * M) / people.length
    people.forEach((s, i) => {
        const x = M + i * slot
        const lineW = Math.min(60, slot - 8)
        doc.setDrawColor(...INK).setLineWidth(0.3).line(x, y, x + lineW, y)
        doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...INK).text(t(s.name || "Name:"), x, y + 4.5, { maxWidth: lineW })
        doc.setFont("helvetica", "normal").setTextColor(...MUTED).text(t(s.title || "Position:"), x, y + 8.5, { maxWidth: lineW })
        doc.text("Date:", x, y + 12.5)
    })

    // Every page: DRAFT mark, statement line, prepared date and page number
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        if (f.draft) {
            doc.saveGraphicsState()
            doc.setGState(new GState({ opacity: 0.18 }))
            doc.setTextColor(100, 116, 139).setFont("helvetica", "bold").setFontSize(100)
            doc.text("DRAFT", W / 2, H / 2 + 15, { align: "center", angle: 30 })
            doc.restoreGraphicsState()
            doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(220, 38, 38)
            doc.text("DRAFT: not all checks pass", W - M, 9, { align: "right" })
        }
        doc.setDrawColor(...RULE).setLineWidth(0.2).line(M, H - 13, W - M, H - 13)
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED)
        if (f.statementNote) doc.text(t(f.statementNote), M, H - 8.5, { maxWidth: W - 2 * M - 60 })
        doc.text(`Prepared ${f.preparedOn} · Page ${i} of ${pages}`, W - M, H - 8.5, { align: "right" })
    }
    return doc
}

function drawTable(doc: jsPDF, table: PrintTable, currency: string, startY: number,
    g: { W: number; M: number; BOTTOM: number; t: (s: string) => string }): number {
    const { W, M, BOTTOM, t } = g
    const usable = W - 2 * M
    const n = table.columns.length
    const valW = Math.min(32, Math.max(20, (usable - 60) / Math.max(n, 1)))
    const labelW = usable - n * valW
    const colRight = (i: number) => M + labelW + (i + 1) * valW
    let y = startY

    const header = (continued: boolean) => {
        if (table.title) {
            doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...INK)
            doc.text(t(table.title + (continued ? " (continued)" : "")), M, y)
            y += 6
        }
        doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED)
        doc.text(currency, M, y)
        let lines = 1
        table.columns.forEach((c, i) => {
            const wrapped = (doc.splitTextToSize(t(c), valW - 2) as string[]).slice(0, 2)
            lines = Math.max(lines, wrapped.length)
            doc.text(wrapped, colRight(i) - 1, y, { align: "right" })
        })
        y += 3.5 * lines
        doc.setDrawColor(...RULE).setLineWidth(0.3).line(M, y - 1.5, W - M, y - 1.5)
        y += 3.5
    }
    if (y + 20 > BOTTOM) { doc.addPage(); y = 20 }
    header(false)

    const rule = (yy: number, double = false) => {
        doc.setDrawColor(...INK).setLineWidth(0.25)
        doc.line(M + labelW + 2, yy, W - M, yy)
        if (double) doc.line(M + labelW + 2, yy + 0.8, W - M, yy + 0.8)
    }

    for (const r of table.rows) {
        const style = r.style
        const indent = style === "line" || style === "subtotal" || style === "note" ? 4 : 0
        const before = style === "section" ? 3 : style === "group" ? 1.5 : style === "grand" ? 2 : style === "total" ? 1 : 0
        doc.setFontSize(style === "section" ? 8.5 : 9)
        const label = style === "section" ? r.label.toUpperCase() : r.label
        const wrapped = doc.splitTextToSize(t(label), labelW - indent - 2) as string[]
        const h = 4.6 * wrapped.length + 0.8
        if (y + before + h > BOTTOM) {
            doc.addPage()
            y = 20
            header(true)
        }
        y += before
        if (style === "subtotal" || style === "total") rule(y - 3.6)
        if (style === "grand") rule(y - 3.8, true)
        doc.setFont("helvetica", style === "line" || style === "note" ? "normal" : "bold")
        doc.setTextColor(...(style === "section" ? INDIGO : style === "subtotal" || style === "note" ? MUTED : INK))
        if (style === "note") doc.setFont("helvetica", "italic")
        doc.text(wrapped, M + indent, y)
        doc.setFont("helvetica", style === "line" ? "normal" : "bold").setTextColor(...INK)
        rowCells(doc, r, colRight, y)
        y += h
    }
    return y + 6
}

function rowCells(doc: jsPDF, r: PrintRow, colRight: (i: number) => number, y: number) {
    r.cells.forEach((c, i) => {
        const s = printAmount(c)
        if (s) doc.text(s, colRight(i) - 1, y, { align: "right" })
    })
}
