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
}

export interface BankStatementListItem extends BankStatement {
    money_out: number
    matched: number
    needs_attention: number
}

export interface DocSummary {
    id: string
    vendor: string
    invoiceNumber: string | null
    cents: number            // in the organisation's currency
    date: string | null
    status: string | null
}

export interface BankTransactionView {
    id: string
    date: string
    description: string
    cents: number            // negative = money out
    balanceCents: number | null
    status: "unmatched" | "matched" | "ignored"
    ignoreReason: string | null
    matchedDoc: DocSummary | null
    suggestion: { doc: DocSummary; score: number; strong: boolean; reasons: string[]; alternatives: number } | null
}

export interface StatementDetail {
    statement: BankStatement
    baseCurrency: string
    transactions: BankTransactionView[]
}

export type ActionResult = { ok: true } | { ok: false; error: string }
