"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getCurrentUserRole, getOrganizationCurrency } from "./document-utils"
import {
    buildFundMemo, type FundMemoData, type MemoForeignInput, type MemoLedgerRow, type MemoPendingDocInput,
} from "@/utils/fund-memo"
import { featureAllowed, planGateMessage } from "@/utils/plan"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// "Since the beginning" when a fund has no grant start date
const EARLIEST_DATE = "1900-01-01"
const PAGE_SIZE = 1000
const MAX_PAGES = 20

export type FundMemoResult =
    | { success: true; data: FundMemoData }
    | { success: false; error: string; upgradeRequired?: boolean }

export async function getFundMemoData(input: {
    fundId: string
    periodStart: string
    periodEnd: string
}): Promise<FundMemoResult> {
    try {
        const { fundId, periodStart, periodEnd } = input ?? ({} as typeof input)

        if (!UUID_RE.test(fundId || "")) return { success: false, error: "Please choose a fund." }
        if (!ISO_DATE_RE.test(periodStart || "") || !ISO_DATE_RE.test(periodEnd || "")) {
            return { success: false, error: "Please choose a valid start and end date." }
        }
        if (periodStart > periodEnd) {
            return { success: false, error: "The start date must be on or before the end date." }
        }

        const role = await getCurrentUserRole()
        if (!role) return { success: false, error: "You do not have access to this organization." }

        const organizationId = await getOrganizationId()
        if (!organizationId) return { success: false, error: "No active organization found." }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // Paid plans, and organisations that have been on one (a memo of existing data)
        if (!(await featureAllowed(supabase, organizationId, "donor_memo", "read"))) {
            return { success: false, upgradeRequired: true, error: planGateMessage("donor_memo", "read") }
        }

        const { data: fund, error: fundError } = await supabase
            .from("funds")
            .select("*")
            .eq("id", fundId)
            .eq("organization_id", organizationId)
            .maybeSingle()
        if (fundError || !fund) return { success: false, error: "Fund not found." }

        const { data: org } = await supabase
            .from("organizations")
            .select("name, registration_id, base_currency")
            .eq("id", organizationId)
            .maybeSingle()

        // The ledger rows behind this fund's column of the Income & Expenditure statement. Read from the
        // grant start (when earlier than the period) so the award used is counted from the grant start.
        const grantStart = typeof fund.period_start === "string" && ISO_DATE_RE.test(fund.period_start.slice(0, 10))
            ? fund.period_start.slice(0, 10)
            : null
        const readFrom = grantStart === null ? EARLIEST_DATE : grantStart < periodStart ? grantStart : periodStart
        // Read every page so a large organisation is not silently cut off at 1000 rows
        const rows: MemoLedgerRow[] = []
        for (let page = 0; page < MAX_PAGES; page++) {
            const from = page * PAGE_SIZE
            const { data, error } = await supabase
                .rpc("fund_memo_lines", { p_org: organizationId, p_fund: fundId, p_from: readFrom, p_to: periodEnd })
                .order("row_date", { ascending: true })
                .order("row_kind", { ascending: true })
                .order("row_id", { ascending: true })
                .order("line_no", { ascending: true })
                .range(from, from + PAGE_SIZE - 1)
            if (error) {
                console.error("getFundMemoData: fund_memo_lines failed", error)
                return { success: false, error: "Could not load the ledger for this memo." }
            }
            rows.push(...((data ?? []) as MemoLedgerRow[]))
            if (!data || data.length < PAGE_SIZE) break
            if (page === MAX_PAGES - 1) {
                return { success: false, error: "This fund has too many entries for one memo. Choose a shorter period." }
            }
        }

        // Foreign-currency details of the uploads the entries came from (shown beside the amount)
        const documentIds = [...new Set(rows.map((r) => r.document_id).filter((x): x is string => !!x))]
        const foreign: Record<string, MemoForeignInput> = {}
        for (let i = 0; i < documentIds.length; i += 200) {
            const { data } = await supabase
                .from("documents")
                .select("id, original_currency, original_amount, exchange_rate, exchange_rate_source")
                .eq("organization_id", organizationId)
                .in("id", documentIds.slice(i, i + 200))
            for (const d of (data ?? []) as (MemoForeignInput & { id: string })[]) foreign[d.id] = d
        }

        // Uploads not in the ledger yet: counted in a note only, never in a figure
        const { data: pending, error: pendingError } = await supabase
            .from("documents")
            .select("id, document_date, amount, status, splits, fund_id")
            .eq("organization_id", organizationId)
            .not("status", "in", "(paid,awaiting_payment,rejected,error)")
            .limit(PAGE_SIZE * MAX_PAGES)
        if (pendingError) console.error("getFundMemoData: pending uploads query failed", pendingError)

        const currency = org?.base_currency || (await getOrganizationCurrency()) || "MYR"

        const memo = buildFundMemo({
            fund,
            rows,
            foreign,
            pendingDocs: (pending ?? []) as MemoPendingDocInput[],
            organization: { name: org?.name || "Organization", registrationId: org?.registration_id || null },
            currency,
            periodStart,
            periodEnd,
            generatedBy: user?.email || "Unknown user",
        })

        return { success: true, data: memo }
    } catch (e) {
        console.error("getFundMemoData failed", e)
        return { success: false, error: "Could not generate the memo. Please try again." }
    }
}
