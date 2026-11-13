"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getCurrentUserRole, getOrganizationCurrency } from "./document-utils"
import { buildFundMemo, type FundMemoData, type MemoDocInput } from "@/utils/fund-memo"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
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

        // Paid plans only (same rule as Procurement)
        const { data: plan } = await supabase
            .from("organizations")
            .select("subscription_status, subscription_tier")
            .eq("id", organizationId)
            .maybeSingle()
        const isPro = plan?.subscription_status === "pro" || plan?.subscription_tier === "growth"
        if (!isPro) {
            return {
                success: false,
                upgradeRequired: true,
                error: "The Donor & Audit Memo is available on the Growth and Nonprofit plans. Please upgrade to use it.",
            }
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

        const { data: categories } = await supabase
            .from("categories")
            .select("id, name")
            .eq("organization_id", organizationId)
        const categoryNames: Record<string, string> = {}
        for (const c of categories ?? []) categoryNames[c.id] = c.name

        // Read every page so a large organisation is not silently cut off at 1000 rows
        const docs: MemoDocInput[] = []
        for (let page = 0; page < MAX_PAGES; page++) {
            const from = page * PAGE_SIZE
            const { data, error } = await supabase
                .from("documents")
                .select("id, vendor_name, invoice_number, reference_number, document_type, document_date, amount, status, splits, fund_id, category_id, image_url")
                .eq("organization_id", organizationId)
                .order("created_at", { ascending: true })
                .order("id", { ascending: true })
                .range(from, from + PAGE_SIZE - 1)
            if (error) {
                console.error("getFundMemoData: documents query failed", error)
                return { success: false, error: "Could not load documents for this memo." }
            }
            docs.push(...((data ?? []) as MemoDocInput[]))
            if (!data || data.length < PAGE_SIZE) break
        }

        const currency = org?.base_currency || (await getOrganizationCurrency()) || "MYR"

        const memo = buildFundMemo({
            fund,
            docs,
            categoryNames,
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
