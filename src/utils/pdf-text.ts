// jsPDF's built-in fonts only cover Latin characters (including accented letters such as é).
// Anything else (Chinese, Tamil, emoji) would print as garbage, so it is replaced with "?" and
// typographic quotes and dashes become their plain equivalents.
export function pdfSafeText(value: string | null | undefined): string {
    return (value ?? "")
        .normalize("NFC")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/[^\x20-\x7E -ÿ\n]/g, "?")
}
