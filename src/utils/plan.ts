import type { createClient } from "@/utils/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

// The one rule for "is this organisation on a paid plan". It is the same rule Procurement and the
// Donor & Audit Memo use: the Pro status, or the Growth tier (the Nonprofit plan sets Pro).
export function isProPlan(
    org: { subscription_status?: string | null; subscription_tier?: string | null } | null | undefined
): boolean {
    return org?.subscription_status === "pro" || org?.subscription_tier === "growth"
}

// Server-side check. Pages use it to show the locked screen, and routes and actions use it so a
// free organisation cannot reach a paid feature by calling it directly.
export async function organizationIsPro(supabase: Supabase, organizationId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("organizations")
        .select("subscription_status, subscription_tier")
        .eq("id", organizationId)
        .maybeSingle()
    if (error) {
        console.error("organizationIsPro: failed to read the plan:", error)
        return false
    }
    return isProPlan(data)
}
