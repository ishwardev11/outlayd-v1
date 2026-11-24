export interface BankStatement {
    id: string
    file_name: string | null
    status: "extracting" | "ready" | "failed"
    error_message: string | null
    warning: string | null
    bank_name: string | null
    account_last4: string | null
    currency: string | null
    period_start: string | null
    period_end: string | null
    opening_balance: number | string | null
    closing_balance: number | string | null
    transaction_count: number
    duplicate_count: number
    created_at: string
    // The account the statement belongs to (step 3); set to the main account when it was imported earlier
    account_id: string | null
}

export interface BankStatementListItem extends BankStatement {
    account_name: string | null
    line_count: number
    matched: number
    needs_attention: number
}

// Something a bank line can be matched to: an approved document (an upload or a money-out entry saved
// as a paid document) or a cash book entry (money in, money out, a transfer between accounts)
export interface MatchTarget {
    kind: "document" | "transaction"
    id: string
    payee: string
    reference: string | null
    cents: number            // in the organisation's currency
    date: string | null
    // What it is, in words: "Awaiting payment", "Paid", "Money in", "Transfer to Petty Cash", ...
    label: string
    // Documents only: an unpaid bill is marked paid when it is matched
    unpaid: boolean
}

export interface BankTransactionView {
    id: string
    date: string
    description: string
    cents: number            // negative = money out
    balanceCents: number | null
    status: "unmatched" | "matched" | "ignored"
    ignoreReason: string | null
    matched: MatchTarget | null
    suggestion: { target: MatchTarget; score: number; strong: boolean; reasons: string[]; alternatives: number } | null
}

export interface StatementDetail {
    statement: BankStatement
    accountName: string | null
    // Uploads and money out are recorded in the main account, so only its statements can use them
    isMainAccount: boolean
    baseCurrency: string
    transactions: BankTransactionView[]
}

export type ActionResult = { ok: true } | { ok: false; error: string }
