import jsPDF, { GState } from "jspdf"
import { pdfSafeText } from "./pdf-text"
import { drawLetterheadImage } from "./donation-receipt-pdf"
import type { InvoiceContent } from "./invoice-document"

const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]
const INDIGO: [number, number, number] = [79, 70, 229]
const RULE: [number, number, number] = [226, 232, 240]

// Builds the invoice PDF (A4 portrait). Long invoices continue on further pages, with the column
// headings repeated. Text the PDF font cannot draw (for example Chinese or Tamil) is shown as "?",
// like the other PDFs in Outlayd.
export function buildInvoicePdf(c: InvoiceContent): jsPDF {
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const M = 16
    const t = (s: string) => pdfSafeText(s).replace(/\n/g, " ")
    let y = 18

    // Letterhead: the uploaded image, otherwise the typed lines (left aligned)
    const imageBottom = c.letterheadImage ? drawLetterheadImage(doc, c.letterheadImage, W, M) : null
    if (imageBottom !== null) {
        y = imageBottom + 6
    } else {
        doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(14)
        doc.text(t(c.letterhead[0] ?? ""), M, y, { maxWidth: W / 2 })
        y += 6
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
        for (const line of c.letterhead.slice(1)) {
            doc.text(t(line), M, y, { maxWidth: W / 2 })
            y += 4.5
        }
        y += 2
    }

    // Title and invoice details on the right, bill-to on the left
    const top = y
    doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...INDIGO)
    doc.text(c.title, W - M, top, { align: "right" })
    doc.setFontSize(9).setTextColor(...INK)
    let my = top + 8
    for (const [label, value] of c.meta) {
        doc.setFont("helvetica", "bold").text(label, W - M - 45, my, { align: "right" })
        doc.setFont("helvetica", "normal").text(t(value), W - M, my, { align: "right" })
        my += 5
    }
    let by = top + 8
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED).text("BILL TO", M, by)
    by += 5
    doc.setTextColor(...INK)
    c.billTo.forEach((line, i) => {
        doc.setFont("helvetica", i === 0 ? "bold" : "normal")
        doc.text(t(line), M, by, { maxWidth: W / 2 - M })
        by += 5
    })
    y = Math.max(my, by) + 6

    // Lines
    const header = () => {
        doc.setFillColor(248, 250, 252).rect(M, y - 5, W - 2 * M, 8, "F")
        doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED)
        doc.text("Description", M + 2, y)
        doc.text("Amount", W - M - 2, y, { align: "right" })
        y += 7
        doc.setTextColor(...INK).setFont("helvetica", "normal")
    }
    header()
    for (const item of c.items) {
        const wrapped = doc.splitTextToSize(t(item.description), W - 2 * M - 45) as string[]
        const h = 5 * wrapped.length + 2
        if (y + h > H - 30) {
            doc.addPage()
            y = 20
            header()
        }
        doc.text(wrapped, M + 2, y)
        doc.text(item.amount, W - M - 2, y, { align: "right" })
        y += h
        doc.setDrawColor(...RULE).setLineWidth(0.2).line(M, y - 3, W - M, y - 3)
    }

    // Totals
    y += 3
    if (y > H - 60) { doc.addPage(); y = 20 }
    for (const [label, value, strong] of c.totals) {
        doc.setFont("helvetica", strong ? "bold" : "normal").setFontSize(strong ? 11 : 9.5)
        doc.text(label, W - M - 50, y, { align: "right" })
        doc.text(value, W - M - 2, y, { align: "right" })
        y += strong ? 7 : 5.5
    }

    // Payment details and notes
    y += 4
    doc.setFontSize(9)
    if (c.paymentDetails.length > 0) {
        if (y > H - 40) { doc.addPage(); y = 20 }
        doc.setFont("helvetica", "bold").setTextColor(...MUTED).text("HOW TO PAY", M, y)
        y += 5
        doc.setFont("helvetica", "normal").setTextColor(...INK)
        for (const line of c.paymentDetails) {
            doc.text(t(line), M, y, { maxWidth: W - 2 * M })
            y += 4.5
        }
        y += 3
    }
    if (c.notes) {
        if (y > H - 30) { doc.addPage(); y = 20 }
        doc.setFont("helvetica", "bold").setTextColor(...MUTED).text("NOTES", M, y)
        y += 5
        doc.setFont("helvetica", "normal").setTextColor(...INK)
        const wrapped = doc.splitTextToSize(t(c.notes), W - 2 * M) as string[]
        doc.text(wrapped, M, y)
    }

    // Stamp (VOID, DRAFT or PAID) on every page, see-through so the invoice stays readable
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        if (c.stamp) {
            doc.saveGraphicsState()
            doc.setGState(new GState({ opacity: 0.25 }))
            doc.setTextColor(...c.stamp.colour).setFont("helvetica", "bold").setFontSize(90)
            doc.text(c.stamp.text, W / 2, H / 2, { align: "center", angle: 30 })
            doc.restoreGraphicsState()
        }
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
        if (c.footer) doc.setTextColor(220, 38, 38).text(t(c.footer), W / 2, H - 14, { align: "center", maxWidth: W - 2 * M })
        doc.setTextColor(...MUTED).text(`Page ${i} of ${pages}`, W - M, H - 8, { align: "right" })
    }
    return doc
}
