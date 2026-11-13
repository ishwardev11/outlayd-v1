import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"

// Subscription statuses that keep paid access. "past_due" means a card payment failed and
// Stripe is still retrying it: the customer keeps access during those retries. If every
// retry fails Stripe cancels the subscription, and that ends access. Everything else
// (canceled, unpaid, incomplete, incomplete_expired, paused) is treated as free.
const ACCESS_STATUSES: string[] = ["active", "trialing", "past_due"]

// Paid tiers an organization can be on. "nonprofit" is set by hand in the database
// (the checkout route always sends "growth"), so the webhook must never overwrite it.
const PAID_TIERS = ["growth", "nonprofit"]

// The part of the Stripe client this file needs (lets tests pass a simple fake).
export interface StripeLike {
    subscriptions: {
        list(params: Stripe.SubscriptionListParams): Promise<{ data: Stripe.Subscription[] }>
    }
}

export type SyncResult = "pro" | "free" | "skipped"

export function customerIdOf(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
    if (!customer) return null
    return typeof customer === "string" ? customer : customer.id
}

// Stripe moved current_period_end from the subscription onto its items (API 2025-03-31 and
// later). Read the item value first, fall back to the old top-level field, and return null
// (never throw) if neither exists, so a date problem can never block an access change.
export function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
    const candidates: number[] = []
    for (const item of subscription.items?.data ?? []) {
        const value = (item as { current_period_end?: unknown }).current_period_end
        if (typeof value === "number" && Number.isFinite(value)) candidates.push(value)
    }
    const legacy = (subscription as unknown as { current_period_end?: unknown }).current_period_end
    if (typeof legacy === "number" && Number.isFinite(legacy)) candidates.push(legacy)
    if (candidates.length === 0) return null
    return new Date(Math.max(...candidates) * 1000).toISOString()
}

// Find which organization a subscription belongs to. Throws on a database error so the
// caller can return 500 and let Stripe retry. Returns null if the org is simply unknown.
export async function findOrganizationId(
    supabase: SupabaseClient,
    metadataOrgId: string | undefined,
    customerId: string | null
): Promise<string | null> {
    if (metadataOrgId) return metadataOrgId
    if (!customerId) return null

    const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle()

    if (error) throw new Error(`Organization lookup failed: ${error.message}`)
    return data?.id ?? null
}

// Make the organization match what Stripe says RIGHT NOW. We re-read the customer's
// subscriptions instead of trusting the event body, so late, repeated or out-of-order
// events (Stripe does not guarantee order) can never leave the wrong plan behind.
export async function syncOrganizationFromStripe(args: {
    stripe: StripeLike
    supabase: SupabaseClient
    organizationId: string
    customerId: string
}): Promise<SyncResult> {
    const { stripe, supabase, organizationId, customerId } = args

    const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 })
    const live = list.data
        .filter((s) => ACCESS_STATUSES.includes(s.status))
        // prefer a healthy subscription over a past_due one, then the newest
        .sort((a, b) => Number(a.status === "past_due") - Number(b.status === "past_due") || b.created - a.created)[0]

    const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, subscription_tier")
        .eq("id", organizationId)
        .maybeSingle()

    if (orgError) throw new Error(`Organization read failed: ${orgError.message}`)
    if (!org) {
        console.warn(`Stripe sync: organization ${organizationId} not found, skipping`)
        return "skipped"
    }

    if (live) {
        // Keep a paid tier the org already has (growth or nonprofit). Only fall back to growth.
        const tier = PAID_TIERS.includes(org.subscription_tier) ? org.subscription_tier : "growth"
        const periodEnd = getSubscriptionPeriodEnd(live)

        const update: Record<string, unknown> = {
            subscription_status: "pro",
            subscription_tier: tier,
            cancel_at_period_end: !!live.cancel_at_period_end,
        }
        if (periodEnd) update.subscription_end_date = periodEnd

        const { error } = await supabase.from("organizations").update(update).eq("id", organizationId)
        if (error) throw new Error(`Organization update failed: ${error.message}`)

        console.log(`Stripe sync: org ${organizationId} is pro (${tier}, status: ${live.status}, cancelling: ${!!live.cancel_at_period_end})`)
        return "pro"
    }

    const { error } = await supabase
        .from("organizations")
        .update({
            subscription_status: "free",
            subscription_tier: "free",
            cancel_at_period_end: false,
            subscription_end_date: null,
        })
        .eq("id", organizationId)
    if (error) throw new Error(`Organization downgrade failed: ${error.message}`)

    console.log(`Stripe sync: org ${organizationId} has no active subscription, set to free`)
    return "free"
}

export async function handleSubscriptionChange(args: {
    stripe: StripeLike
    supabase: SupabaseClient
    subscription: Stripe.Subscription
}): Promise<SyncResult> {
    const { stripe, supabase, subscription } = args
    const customerId = customerIdOf(subscription.customer)
    const organizationId = await findOrganizationId(supabase, subscription.metadata?.organization_id, customerId)

    if (!organizationId || !customerId) {
        // Not one of ours (or not linked yet). Retrying will not help, so do not fail.
        console.warn(`Stripe sync: no organization for subscription ${subscription.id}, skipping`)
        return "skipped"
    }
    return syncOrganizationFromStripe({ stripe, supabase, organizationId, customerId })
}

export async function handleCheckoutCompleted(args: {
    supabase: SupabaseClient
    session: Stripe.Checkout.Session
}): Promise<SyncResult> {
    const { supabase, session } = args
    const organizationId = session.metadata?.organization_id
    if (!organizationId) {
        console.error(`Checkout ${session.id} completed without organization_id metadata; cannot upgrade`)
        return "skipped"
    }

    const customerId = customerIdOf(session.customer)
    const metaTier = session.metadata?.tier ?? ""
    const tier = PAID_TIERS.includes(metaTier) ? metaTier : "growth"

    const { error: rpcError } = await supabase.rpc("upgrade_org_to_pro", {
        org_id: organizationId,
        p_tier: tier,
        p_customer_id: customerId,
    })

    if (rpcError) {
        console.error("upgrade_org_to_pro failed, trying a direct update:", rpcError)
        const update: Record<string, unknown> = {
            subscription_status: "pro",
            subscription_tier: tier,
            cancel_at_period_end: false,
            subscription_end_date: null,
        }
        if (customerId) update.stripe_customer_id = customerId

        const { error } = await supabase.from("organizations").update(update).eq("id", organizationId)
        if (error) throw new Error(`Checkout upgrade failed: ${error.message}`)
    }

    console.log(`Checkout complete: org ${organizationId} upgraded to ${tier}`)
    return "pro"
}
