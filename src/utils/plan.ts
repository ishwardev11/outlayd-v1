import type { createClient } from "@/utils/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

// The one answer to "may this organisation use feature X?". The rules live in the database
// function org_feature_allowed (migration 20261121100000_plan_flags.sql), which row-level security
// also uses, so the app and the database can never disagree. Summary:
//   use  = create or change       read = view existing data, or export it
//   funds, accounts, bank_statements, procurement, income, invoices, assets, period_lock, reconciliation
//        use: paid plan          read: everyone (a downgraded org keeps read-only access)
//   accounting_export, donor_memo, financial_statements
//        use: paid plan          read: paid plan, or an org that has been on one (exports of existing data)
//   audit_log: everyone
// Paid means status "pro" (which includes a failed card payment that Stripe is still retrying) or
// tier growth/nonprofit. Nothing is deleted on downgrade.

export type PlanFeature =
    | "funds"
    | "accounts"
    | "bank_statements"
    | "procurement"
    | "accounting_export"
    | "donor_memo"
    | "audit_log"
    | "income"
    | "invoices"
    | "assets"
    | "financial_statements"
    | "period_lock"
    | "reconciliation"

export type PlanAccess = "use" | "read"

export interface PlanState {
    paid: boolean
    hasBeenPaid: boolean
}

const FREE: PlanState = { paid: false, hasBeenPaid: false }

// Plan of the given organisation, read through the user's own session. A signed-in user only gets
// an answer for their active organisation. Any error counts as free (a gate never opens by mistake).
export async function getPlanState(supabase: Supabase, organizationId: string | null | undefined): Promise<PlanState> {
    if (!organizationId) return FREE
    const { data, error } = await supabase.rpc("org_plan_state", { p_org: organizationId })
    if (error) {
        console.error("getPlanState: failed to read the plan:", error)
        return FREE
    }
    const row = (Array.isArray(data) ? data[0] : data) as { paid?: boolean; has_been_paid?: boolean } | null
    return { paid: row?.paid === true, hasBeenPaid: row?.has_been_paid === true }
}

export async function featureAllowed(
    supabase: Supabase,
    organizationId: string | null | undefined,
    feature: PlanFeature,
    access: PlanAccess
): Promise<boolean> {
    if (!organizationId) return false
    const { data, error } = await supabase.rpc("org_feature_allowed", { p_org: organizationId, p_feature: feature, p_access: access })
    if (error) {
        console.error(`featureAllowed(${feature}, ${access}) failed:`, error)
        return false
    }
    return data === true
}

const FEATURE_NAMES: Record<PlanFeature, string> = {
    funds: "Creating and editing funds",
    accounts: "Accounts",
    bank_statements: "Bank statement import",
    procurement: "Procurement",
    accounting_export: "The Accounting Export",
    donor_memo: "The Donor & Audit Memo",
    audit_log: "The audit log",
    income: "Income and donation tracking",
    invoices: "Invoices",
    assets: "Assets and liabilities",
    financial_statements: "Financial statements",
    period_lock: "Period locks",
    reconciliation: "Reconciliation",
}

export function planGateMessage(feature: PlanFeature, access: PlanAccess = "use"): string {
    const name = FEATURE_NAMES[feature]
    return access === "use"
        ? `${name} is available on the Growth and Nonprofit plans. Your existing data stays available to view. Upgrade to make changes.`
        : `${name} is available on the Growth and Nonprofit plans. Please upgrade to use it.`
}

export class PlanError extends Error {
    readonly code = "PLAN_REQUIRED"
    constructor(readonly feature: PlanFeature, readonly access: PlanAccess) {
        super(planGateMessage(feature, access))
    }
}

// For server actions and routes: throws PlanError when the organisation's plan does not allow it
export async function requireFeature(
    supabase: Supabase,
    organizationId: string | null | undefined,
    feature: PlanFeature,
    access: PlanAccess
): Promise<void> {
    if (!(await featureAllowed(supabase, organizationId, feature, access))) throw new PlanError(feature, access)
}

// Kept for existing callers: true when the organisation is on a paid plan right now
export async function organizationIsPro(supabase: Supabase, organizationId: string): Promise<boolean> {
    return (await getPlanState(supabase, organizationId)).paid
}
