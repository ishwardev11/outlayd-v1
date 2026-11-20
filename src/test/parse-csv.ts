// Test helper: reads a CSV the way a spreadsheet does (RFC 4180), so tests can check the values a
// person will actually see. Strict: an unterminated or malformed quoted cell throws.
export function parseCsv(text: string): string[][] {
    const src = text.startsWith("﻿") ? text.slice(1) : text
    const rows: string[][] = []
    let row: string[] = []
    let cell = ""
    let i = 0
    let quoted = false
    while (i < src.length) {
        const ch = src[i]
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i += 2; continue }
                quoted = false
                i++
                const next = src[i]
                if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") {
                    throw new Error(`Malformed CSV: text after a closing quote at position ${i}`)
                }
                continue
            }
            cell += ch
            i++
            continue
        }
        if (ch === '"') {
            if (cell !== "") throw new Error(`Malformed CSV: quote inside an unquoted cell at position ${i}`)
            quoted = true
            i++
        } else if (ch === ",") {
            row.push(cell); cell = ""; i++
        } else if (ch === "\r" && src[i + 1] === "\n") {
            row.push(cell); rows.push(row); row = []; cell = ""; i += 2
        } else if (ch === "\n") {
            row.push(cell); rows.push(row); row = []; cell = ""; i++
        } else {
            cell += ch; i++
        }
    }
    if (quoted) throw new Error("Malformed CSV: unterminated quoted cell")
    if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row) }
    return rows
}
