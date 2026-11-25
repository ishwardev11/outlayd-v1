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
    {
        q: "How do I record a deposit on an invoice I issue?",
        a: "When you create a new invoice on the Receivable tab of Bills & Invoices, choose Yes under Deposit received?, enter the amount and date, and attach the receipt. The invoice shows as part-paid with the remaining balance, which also appears as Pending income on the Dashboard. Record the rest later with Record payment, again with its receipt. Invoices and deposits are part of the Growth and Nonprofit plans.",
    },
    {
        q: "Why does an invoice say Paid · receipt missing?",
        a: "Every payment received for an invoice you issue needs its receipt, so an invoice is only closed when each payment has one. Open the invoice and choose Add receipt on the payment without one. The Receipt missing filter on the Receivable tab lists every such invoice, and the Dashboard shows a reminder.",
    },
    {
        q: "How do I record a payment from a payment slip?",
        a: "On Bills & Invoices, choose Upload payment slip. The AI reads the amount, date, payer and any invoice number, and suggests the open invoices it could pay, with the reasons. Choose one and Record payment opens filled in, with the slip attached as the receipt; check it and press Save payment. Inside an invoice, Upload payment slip skips the matching. This is part of the Growth and Nonprofit plans.",
    },
    {
        q: "How do I clear Uncategorised entries?",
        a: "Entries in your books without a real category are listed at the top of the Inbox, each with a category suggested from that contact's history. Accept a suggestion, pick a different category, or use Accept all suggestions. On the Growth and Nonprofit plans, Suggest with AI covers contacts with no history yet. Year-end statements stay in draft until these are cleared.",
    },
    {
        q: "How much AI can we use?",
        a: "Reading uploaded receipts and bills: 5 a month on Free, unlimited on Growth and Nonprofit. AI help (filling in an invoice you issued, matching payment slips and suggesting categories) is on Growth and Nonprofit, up to 300 times a month in total. If you reach the limit you see a message and can carry on by hand; it resets on the 1st of the month.",
    },
    {
        q: "What does Fix mean on the Reports checks?",
        a: "Before you present statements, Outlayd checks that everything adds up. Each check that fails says what is wrong and how many records, for example 3 entries in March 2026 have no category, and Fix opens exactly those records so you can put them right.",
    },
    {
        q: "Who reads my documents when the AI is used?",
        a: "Outlayd uses Google's Gemini API as its AI provider. When you upload a receipt, bill, invoice, payment slip or bank statement, the file is sent to Gemini so the details can be read and filled in for you. Only what the feature needs is sent, never full bank account numbers, and your documents are not used to train AI models. The AI only suggests: nothing is saved to your records until you check it and press Save or Confirm. This is how we process your data under the PDPA; see the Privacy Policy for the details.",
    },
]
