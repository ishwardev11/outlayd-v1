// Safe CSV cells, shared by every CSV export. Pure functions with no imports, so they are easy to test.

// Lets Excel open a CSV as UTF-8, so Malay, Chinese or Tamil text and names like "Café" survive.
export const CSV_BOM = "﻿"

// A cell that starts with = + - @ (or a tab, carriage return or line break, which some spreadsheets
// strip before reading a formula) is run as a formula by Excel and Google Sheets. Text typed by a
// person or read from a receipt is untrusted, so such a cell gets a leading apostrophe, which
// spreadsheets show as plain text. The line break is included because carriage returns are turned
// into line breaks first; without it a leading carriage return slipped through.
const FORMULA_START = /^[=+\-@\t\r\n]/

// A text cell: neutralises formulas, keeps line breaks, and quotes the cell (doubling any quote
// characters inside it) when it contains a comma, quote, line break or leading/trailing spaces.
export function csvText(value: string | null | undefined): string {
    let s = String(value ?? "").replace(/\r\n|\r/g, "\n")
    if (FORMULA_START.test(s)) s = `'${s}`
    return /[",\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s
}

// A number cell (amount, rate). Numbers are written as they are, so a negative amount such as a
// credit note stays a number instead of being turned into text by the formula rule above.
// Anything that is not a finite number is written as text, so it still cannot run as a formula.
export function csvNumber(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === "") return ""
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? String(n) : csvText(String(value))
}

export function csvRow(cells: string[]): string {
    return cells.join(",")
}
