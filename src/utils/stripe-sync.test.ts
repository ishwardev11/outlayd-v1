import { test } from "node:test"
import assert from "node:assert/strict"
import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { syncOrganizationFromStripe, type StripeLike } from "./stripe-sync"

// A fake Stripe that returns the given subscriptions, and a fake database that records updates.
const stripeWith = (subs: Array<{ status: Stripe.Subscription.Status; created?: number }>): StripeLike => ({
    subscriptions: {
        list: async () => ({
            data: subs.map((s, i) => ({ id: `sub_${i}`, status: s.status, created: s.created ?? i, cancel_at_period_end: false, items: { data: [] } }) as unknown as Stripe.Subscription),
        }),
    },
})

function fakeDb(tier: string) {
    const updates: Record<string, unknown>[] = []
    const db = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "org1", subscription_tier: tier }, error: null }) }) }),
            update: (u: Record<string, unknown>) => { updates.push(u); return { eq: async () => ({ error: null }) } },
        }),
    }
    return { supabase: db as unknown as SupabaseClient, updates }
}

const sync = (subs: Parameters<typeof stripeWith>[0], tier = "free") => {
    const { supabase, updates } = fakeDb(tier)
    return syncOrganizationFromStripe({ stripe: stripeWith(subs), supabase, organizationId: "org1", customerId: "cus_1" })
        .then((result) => ({ result, update: updates[0] }))
}

test("an active subscription is paid", async () => {
    const { result, update } = await sync([{ status: "active" }])
    assert.equal(result, "pro")
    assert.equal(update.subscription_status, "pro")
    assert.equal(update.subscription_tier, "growth")
})

test("a failed payment Stripe is still retrying (past_due) keeps paid access", async () => {
    const { result, update } = await sync([{ status: "past_due" }])
    assert.equal(result, "pro")
    assert.equal(update.subscription_status, "pro")
})

test("a cancelled subscription downgrades to free", async () => {
    const { result, update } = await sync([{ status: "canceled" }])
    assert.equal(result, "free")
    assert.deepEqual(update, { subscription_status: "free", subscription_tier: "free", cancel_at_period_end: false, subscription_end_date: null })
})

test("unpaid, incomplete and paused subscriptions do not give paid access", async () => {
    for (const status of ["unpaid", "incomplete", "incomplete_expired", "paused"] as const) {
        assert.equal((await sync([{ status }])).result, "free", status)
    }
})

test("the nonprofit tier is kept when the subscription is live", async () => {
    const { update } = await sync([{ status: "active" }], "nonprofit")
    assert.equal(update.subscription_tier, "nonprofit")
})

test("an old cancelled subscription next to a new active one stays paid", async () => {
    assert.equal((await sync([{ status: "canceled", created: 1 }, { status: "active", created: 2 }])).result, "pro")
})
