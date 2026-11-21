import jsPDF, { GState } from "jspdf"
import { pdfSafeText } from "./pdf-text"
import type { ReceiptContent } from "./donation-receipt"

const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]
const INDIGO: [number, number, number] = [79, 70, 229]

const LETTERHEAD_MAX_HEIGHT = 35 // mm

// Draws the letterhead image centred at the top, as wide as the text area but never taller than
// 35 mm, keeping its proportions. Returns where it ends, or null if the image could not be read
// (the receipt then falls back to the typed letterhead rather than failing).
function drawLetterheadImage(doc: jsPDF, dataUrl: string, W: number, M: number): number | null {
    try {
        const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG"
        const { width, height } = doc.getImageProperties(dataUrl)
        if (!width || !height) return null
        let w = W - 2 * M
        let h = (w * height) / width
        if (h > LETTERHEAD_MAX_HEIGHT) {
            h = LETTERHEAD_MAX_HEIGHT
            w = (h * width) / height
        }
        const top = 8
        doc.addImage(dataUrl, format, (W - w) / 2, top, w, h)
        return top + h
    } catch {
        return null
    }
}

// Builds the receipt PDF (A5 portrait). Text the PDF font cannot draw (for example Chinese or Tamil)
// is shown as "?", like the other PDFs in Outlayd.
export function buildDonationReceiptPdf(c: ReceiptContent): jsPDF {
    const doc = new jsPDF({ unit: "mm", format: "a5" })
    const W = doc.internal.pageSize.getWidth()
    const M = 12
    const t = (s: string) => pdfSafeText(s).replace(/\n/g, " ")
    let y = 16

    // Letterhead: the organisation's uploaded image if it has one, otherwise the typed lines
    const imageBottom = c.letterheadImage ? drawLetterheadImage(doc, c.letterheadImage, W, M) : null
    if (imageBottom !== null) {
        y = imageBottom + 3
    } else {
        doc.setTextColor(...INK)
        doc.setFont("helvetica", "bold").setFontSize(13)
        doc.text(t(c.letterhead[0] ?? ""), W / 2, y, { align: "center", maxWidth: W - 2 * M })
        y += 5.5
        doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
        for (const line of c.letterhead.slice(1)) {
            doc.text(t(line), W / 2, y, { align: "center", maxWidth: W - 2 * M })
            y += 4
        }
        y += 2
    }
    doc.setDrawColor(...INDIGO).setLineWidth(0.6).line(M, y, W - M, y)
    y += 9

    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...INDIGO)
    doc.text(c.title, W / 2, y, { align: "center" })
    y += 10

    // Fields
    doc.setFontSize(9.5).setTextColor(...INK)
    for (const [label, value] of c.fields) {
        doc.setFont("helvetica", "bold").text(label, M, y)
        doc.setFont("helvetica", "normal")
        const lines = doc.splitTextToSize(t(value), W - M - 52) as string[]
        doc.text(lines, M + 38, y)
        y += 6 * Math.max(1, lines.length)
    }
    y += 2

    // Amount in words and in figures
    doc.setFont("helvetica", "bold").text("The sum of", M, y)
    doc.setFont("helvetica", "normal")
    const words = doc.splitTextToSize(t(c.amountWords), W - M - 52) as string[]
    doc.text(words, M + 38, y)
    y += 5.5 * words.length + 4
    doc.setDrawColor(...INK).setLineWidth(0.3).rect(M, y - 5, 50, 9)
    doc.setFont("helvetica", "bold").setFontSize(11).text(t(c.amountFigure), M + 3, y + 1)
    y += 12

    doc.setFont("helvetica", "normal").setFontSize(9.5)
    const purpose = doc.splitTextToSize(t(c.purpose), W - 2 * M) as string[]
    doc.text(purpose, M, y)
    y += 5.5 * purpose.length + 2
    if (c.taxStatement) {
        doc.setFont("helvetica", "bold")
        const tax = doc.splitTextToSize(t(c.taxStatement), W - 2 * M) as string[]
        doc.text(tax, M, y)
        y += 5.5 * tax.length
    }

    // Signature block
    const sy = Math.max(y + 18, 160)
    doc.setDrawColor(...MUTED).setLineWidth(0.3).line(W - M - 55, sy, W - M, sy)
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
    if (c.signatory) {
        doc.setTextColor(...INK).text(t(c.signatory.name), W - M - 55, sy + 4.5)
        doc.setTextColor(...MUTED).text(t(c.signatory.title || "Authorised signatory"), W - M - 55, sy + 8.5)
    } else {
        doc.text("Authorised signatory", W - M - 55, sy + 4.5)
    }
    doc.setFontSize(7.5).text("Thank you for your support.", M, sy + 4.5)

    // VOID: a voided receipt keeps its number, so a printout must say clearly that it is void
    if (c.void) {
        doc.setTextColor(220, 38, 38).setFont("helvetica", "bold").setFontSize(64)
        // Semi-transparent so the receipt underneath stays readable for audit
        doc.saveGraphicsState()
        doc.setGState(new GState({ opacity: 0.3 }))
        doc.text("VOID", W / 2, 120, { align: "center", angle: 30 })
        doc.restoreGraphicsState()
        doc.setFontSize(9).text(t(`Voided on ${c.void.on}: ${c.void.reason}`), W / 2, doc.internal.pageSize.getHeight() - 10, { align: "center", maxWidth: W - 2 * M })
    }
    return doc
}
