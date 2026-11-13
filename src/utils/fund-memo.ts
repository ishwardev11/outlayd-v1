// Pure logic for the Donor & Audit Memo. No database or UI code here, so it is easy to test.
//
// Rules (also printed on the memo under "Basis of preparation"):
//  - Only documents with status "paid" (expenditure) or "awaiting_payment" (commitment) are counted.
//  - A document split across funds is allocated by its splits, not by its main fund_id.
//  - Documents are placed in a period by their document date.

export interface MemoFundInput {
    id: string
    name: string
    code?: string | null
    donor_name?: string | null
    grant_reference?: string | null
    purpose?: string | null
    award_amount?: number | string | null
    period_start?: string | null
    period_end?: string | null
}

export interface MemoDocInput {
    id: string
    vendor_name: string | null
    invoice_number: string | null
    reference_number: string | null
    document_type: string | null
    document_date: string | null
    amount: number | string | null
    status: string | null
    splits: unknown
    fund_id: string | null
    category_id: string | null
    image_url: string | null
}

export interface MemoTransaction {
    txnNo: string
    docId: string
    date: string
    vendor: string
    reference: string
    category: string
    status: "paid" | "committed"
    amount: number
    hasReceipt: boolean
}

export interface MemoCategoryRow {
    name: string
    paid: number
    committed: number
    total: number
    percent: number
}

export interface MemoException {
    code: string
    message: string
    txnNos: string[]
}

export interface FundMemoData {
    memoRef: string
    generatedAt: string
    generatedBy: string
    organization: { name: string; registrationId: string | null }
    currency: string
    fund: {
        name: string
        code: string | null
        donorName: string | null
        grantReference: string | null
        purpose: string | null
        awardAmount: number | null
        grantStart: string | null
        grantEnd: string | null
    }
    period: { start: string; end: string }
    totals: {
        periodPaid: number
        periodCommitted: number
        periodTotal: number
        transactionCount: number
        cumulativePaid: number
        cumulativeCommitted: number
        remaining: number | null
        percentOfAwardUsed: number | null
    }
    byCategory: MemoCategoryRow[]
    transactions: MemoTransaction[]
    exceptions: MemoException[]
    excluded: { pendingReviewCount: number; pendingReviewAmount: number; duplicateCount: number }
}

const toCents = (n: number) => Math.round(n * 100)
const fromCents = (c: number) => c / 100
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/

function normaliseDate(value: string | null | undefined): string | null {
    if (!value || typeof value !== "string") return null
    const head = value.trim().slice(0, 10)
    return ISO_DATE_RE.test(head) ? head : null
}

function toNumber(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : 0
}

interface Line {
    amountCents: number
    categoryId: string | null
}

// Which part of this document belongs to the fund? Uses the splits when the document has any.
function allocateToFund(doc: MemoDocInput, fundId: string): { lines: Line[]; splitMismatch: boolean } {
    const splits = Array.isArray(doc.splits) ? (doc.splits as any[]) : []
    const docCents = toCents(toNumber(doc.amount))

    if (splits.length > 0) {
        const splitTotal = splits.reduce((sum, s) => sum + toCents(toNumber(s?.amount)), 0)
        const lines: Line[] = splits
            .filter((s) => s && s.fund_id === fundId)
            .map((s) => ({
                amountCents: toCents(toNumber(s.amount)),
                categoryId: typeof s.category_id === "string" ? s.category_id : null,
            }))
        return { lines, splitMismatch: Math.abs(splitTotal - docCents) > 1 }
    }

    if (doc.fund_id === fundId) {
        return { lines: [{ amountCents: docCents, categoryId: doc.category_id }], splitMismatch: false }
    }
    return { lines: [], splitMismatch: false }
}

function listRefs(refs: string[], max = 8): string {
    if (refs.length <= max) return refs.join(", ")
    return `${refs.slice(0, max).join(", ")} and ${refs.length - max} more`
}

export function buildFundMemo(input: {
    fund: MemoFundInput
    docs: MemoDocInput[]
    categoryNames: Record<string, string>
    organization: { name: string; registrationId: string | null }
    currency: string
    periodStart: string
    periodEnd: string
    generatedBy: string
    generatedAt?: Date
}): FundMemoData {
    const { fund, docs, categoryNames, organization, currency, periodStart, periodEnd } = input
    const generatedAt = input.generatedAt ?? new Date()

    const grantStart = normaliseDate(fund.period_start)
    const grantEnd = normaliseDate(fund.period_end)
    const awardRaw = fund.award_amount === null || fund.award_amount === undefined || fund.award_amount === ""
        ? null
        : toNumber(fund.award_amount)

    const periodLines: Array<{ doc: MemoDocInput; date: string; line: Line; kind: "paid" | "committed" }> = []
    let cumulativePaidC = 0
    let cumulativeCommittedC = 0
    let pendingReviewCount = 0
    let pendingReviewC = 0
    let duplicateCount = 0
    const undated: string[] = []
    const splitMismatchDocs = new Set<string>()
    let undatedCents = 0

    for (const doc of docs) {
        const { lines, splitMismatch } = allocateToFund(doc, fund.id)
        if (lines.length === 0) continue

        const date = normaliseDate(doc.document_date)
        const inPeriod = date !== null && date >= periodStart && date <= periodEnd
        const status = doc.status ?? ""

        if (status === "paid" || status === "awaiting_payment") {
            const kind = status === "paid" ? "paid" : "committed"

            if (date === null) {
                undated.push(doc.vendor_name || doc.id.slice(0, 8))
                for (const l of lines) undatedCents += l.amountCents
                continue
            }

            const afterGrantStart = grantStart === null || date >= grantStart
            if (date <= periodEnd && afterGrantStart) {
                for (const l of lines) {
                    if (kind === "paid") cumulativePaidC += l.amountCents
                    else cumulativeCommittedC += l.amountCents
                }
            }
            if (inPeriod) {
                if (splitMismatch) splitMismatchDocs.add(doc.id)
                for (const l of lines) periodLines.push({ doc, date, line: l, kind })
            }
        } else if (status === "DUPLICATE_WARNING") {
            if (date === null || inPeriod) duplicateCount += 1
        } else if (status !== "rejected" && status !== "error") {
            // needs_review, extracting, and any older statuses: not yet finalised
            if (date === null || inPeriod) {
                pendingReviewCount += 1
                for (const l of lines) pendingReviewC += l.amountCents
            }
        }
    }

    periodLines.sort((a, b) => a.date.localeCompare(b.date) || (a.doc.vendor_name || "").localeCompare(b.doc.vendor_name || ""))

    const transactions: MemoTransaction[] = periodLines.map((p, i) => ({
        txnNo: `T${String(i + 1).padStart(3, "0")}`,
        docId: p.doc.id,
        date: p.date,
        vendor: p.doc.vendor_name || "Unknown vendor",
        reference: p.doc.invoice_number || p.doc.reference_number || "",
        category: (p.line.categoryId && categoryNames[p.line.categoryId]) || "Uncategorized",
        status: p.kind,
        amount: fromCents(p.line.amountCents),
        hasReceipt: !!p.doc.image_url,
    }))

    // Category summary
    const catMap = new Map<string, { paid: number; committed: number }>()
    let periodPaidC = 0
    let periodCommittedC = 0
    periodLines.forEach((p) => {
        const name = (p.line.categoryId && categoryNames[p.line.categoryId]) || "Uncategorized"
        const row = catMap.get(name) || { paid: 0, committed: 0 }
        if (p.kind === "paid") {
            row.paid += p.line.amountCents
            periodPaidC += p.line.amountCents
        } else {
            row.committed += p.line.amountCents
            periodCommittedC += p.line.amountCents
        }
        catMap.set(name, row)
    })
    const periodTotalC = periodPaidC + periodCommittedC
    const byCategory: MemoCategoryRow[] = Array.from(catMap.entries())
        .map(([name, r]) => ({
            name,
            paid: fromCents(r.paid),
            committed: fromCents(r.committed),
            total: fromCents(r.paid + r.committed),
            percent: periodTotalC > 0 ? ((r.paid + r.committed) / periodTotalC) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total)

    // Exceptions (automated checks for the reviewer to look at before sending)
    const exceptions: MemoException[] = []
    const noReceipt = transactions.filter((t) => !t.hasReceipt).map((t) => t.txnNo)
    if (noReceipt.length) {
        exceptions.push({ code: "NO_RECEIPT", message: `${noReceipt.length} transaction(s) have no receipt or invoice file attached: ${listRefs(noReceipt)}.`, txnNos: noReceipt })
    }
    const noRef = transactions.filter((t) => !t.reference).map((t) => t.txnNo)
    if (noRef.length) {
        exceptions.push({ code: "NO_REFERENCE", message: `${noRef.length} transaction(s) have no invoice or reference number: ${listRefs(noRef)}.`, txnNos: noRef })
    }
    const noCat = transactions.filter((t) => t.category === "Uncategorized").map((t) => t.txnNo)
    if (noCat.length) {
        exceptions.push({ code: "NO_CATEGORY", message: `${noCat.length} transaction(s) have no expense category: ${listRefs(noCat)}.`, txnNos: noCat })
    }
    if (grantStart || grantEnd) {
        const outside = transactions
            .filter((t) => (grantStart && t.date < grantStart) || (grantEnd && t.date > grantEnd))
            .map((t) => t.txnNo)
        if (outside.length) {
            exceptions.push({ code: "OUTSIDE_GRANT_PERIOD", message: `${outside.length} transaction(s) are dated outside the grant period (${grantStart ?? "open"} to ${grantEnd ?? "open"}): ${listRefs(outside)}.`, txnNos: outside })
        }
    }
    if (splitMismatchDocs.size) {
        const refs = transactions.filter((t) => splitMismatchDocs.has(t.docId)).map((t) => t.txnNo)
        exceptions.push({ code: "SPLIT_MISMATCH", message: `${splitMismatchDocs.size} document(s) have fund splits that do not add up to the document total: ${listRefs(refs)}.`, txnNos: refs })
    }
    if (undated.length) {
        exceptions.push({ code: "UNDATED", message: `${undated.length} paid or committed document(s) allocated to this fund have no document date and are not in this memo (${currency} ${fromCents(undatedCents).toFixed(2)} in total).`, txnNos: [] })
    }
    const usedC = cumulativePaidC + cumulativeCommittedC
    if (awardRaw !== null && fromCents(usedC) > awardRaw + 0.005) {
        exceptions.push({ code: "OVER_AWARD", message: `Expenditure plus commitments (${currency} ${fromCents(usedC).toFixed(2)}) exceed the award (${currency} ${awardRaw.toFixed(2)}).`, txnNos: [] })
    }

    const codeOrSlug = (fund.code || fund.name).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "FUND"
    const memoRef = `FM-${codeOrSlug}-${periodEnd.replace(/-/g, "")}`

    return {
        memoRef,
        generatedAt: generatedAt.toISOString(),
        generatedBy: input.generatedBy,
        organization,
        currency,
        fund: {
            name: fund.name,
            code: fund.code ?? null,
            donorName: fund.donor_name ?? null,
            grantReference: fund.grant_reference ?? null,
            purpose: fund.purpose ?? null,
            awardAmount: awardRaw,
            grantStart,
            grantEnd,
        },
        period: { start: periodStart, end: periodEnd },
        totals: {
            periodPaid: fromCents(periodPaidC),
            periodCommitted: fromCents(periodCommittedC),
            periodTotal: fromCents(periodTotalC),
            transactionCount: transactions.length,
            cumulativePaid: fromCents(cumulativePaidC),
            cumulativeCommitted: fromCents(cumulativeCommittedC),
            remaining: awardRaw === null ? null : awardRaw - fromCents(usedC),
            percentOfAwardUsed: awardRaw && awardRaw > 0 ? (fromCents(usedC) / awardRaw) * 100 : null,
        },
        byCategory,
        transactions,
        exceptions,
        excluded: {
            pendingReviewCount,
            pendingReviewAmount: fromCents(pendingReviewC),
            duplicateCount,
        },
    }
}
