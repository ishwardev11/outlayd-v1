// The questions in Help & Support (profile menu > Help & Support). Pure, so a test checks that every
// "Settings → …" and "Reports → …" an answer sends people to is a tab or report that exists.
// Screens are named the way the navigation names them (simplification step 8).

export interface Faq {
    q: string
    a: string
}

export const HELP_FAQ: Faq[] = [
    {
        q: "What's the difference between a fund and a category?",
        a: "A fund says whose money it is: the pot it belongs to, such as the General Fund or a grant for one project. A category says what the money was for, such as Rent, Printing or Donations. Every entry has both. Most organisations only need the General Fund; add another fund when a donor or grant says the money must be kept for a purpose. Both are set up in Settings → Funds & Categories.",
    },
    {
        q: "Where did my uploaded receipt go?",
        a: "A new upload waits in the Inbox while it is read and checked. When you approve it, a receipt you have already paid moves to Transactions. A bill you still have to pay moves to Bills & Invoices, and appears in Transactions once you record the payment. Possible duplicates stay in the Inbox until you decide.",
    },
    {
        q: "How do I get ready for the AGM?",
        a: "Open Reports → Year end. It lists the steps to close a financial year, in order: your opening position, reconciling each bank account at the year end, the integrity checks, locking the books, and the statements, which you can print as PDFs.",
    },
    {
        q: "How do I change categories?",
        a: "Go to Settings → Funds & Categories to add or rename a category, or archive one you no longer use. Archived categories stay on the entries that already use them.",
    },
    {
        q: "How do I invite team members?",
        a: "Go to Settings → Team and invite them by email with a role: Admin (everything, including settings), Editor (records and edits entries) or Viewer (can see everything but change nothing).",
    },
    {
        q: "What do the extraction check scores mean?",
        a: "After the AI reads a document, Outlayd checks the result for problems: a missing total, vendor or date, figures that do not add up, line items that do not match, or an amount in a different currency. The score starts at 100 and drops for each problem found, and the problems are listed when you open the document. 90% or more means no significant problems were found. It is not a measure of how sure the AI is, so always check the key fields before approving.",
    },
]
