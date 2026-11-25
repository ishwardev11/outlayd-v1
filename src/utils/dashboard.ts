// The dashboard's "Bills to pay" card (simplification step 7). Pure, so it is tested.
//
// It is worked out from the same rows as "Total you owe" on Bills & Invoices: every bill still open
// with something left to pay (the view invoice_summary gives those an ageing bucket; drafts, void and
// paid bills have none). So the card and that page always show the same total. The old "Awaiting
// payment" card added up approved unpaid documents instead, at their full amount, so a part-paid bill
// counted in full there.

export type BillAgeing = "current" | "1_30" | "31_60" | "61_plus"

export interface BillsToPay {
    count: number
    total: number
    overdueCount: number
    overdueTotal: number
}

export function billsToPay(rows: { balance: number | string; ageing_bucket: BillAgeing | null }[]): BillsToPay {
    let count = 0, cents = 0, overdueCount = 0, overdueCents = 0
    for (const r of rows) {
        if (r.ageing_bucket === null) continue
        const c = Math.round(Number(r.balance) * 100)
        count++
        cents += c
        // Anything past its due date (any bucket other than "current") is overdue
        if (r.ageing_bucket !== "current") {
            overdueCount++
            overdueCents += c
        }
    }
    return { count, total: cents / 100, overdueCount, overdueTotal: overdueCents / 100 }
}

// The dashboard's "Pending income" card and "Receipts missing" notice (invoices and AI plan, step 4).
// Pending income is worked out exactly like "Bills to pay", from invoices you issued: every one still
// open with something left to collect (it has an ageing bucket), so it matches the total owed to you on
// the Receivable tab. receiptsMissing counts invoices you issued with a payment that has no receipt.
export interface PendingIncome extends BillsToPay {
    receiptsMissing: number
}

export function pendingIncome(rows: { balance: number | string; ageing_bucket: BillAgeing | null; receipts_missing: number | string | null }[]): PendingIncome {
    return {
        ...billsToPay(rows),
        receiptsMissing: rows.filter((r) => Number(r.receipts_missing ?? 0) > 0).length,
    }
}
