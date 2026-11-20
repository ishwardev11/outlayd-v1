import { BASE_CURRENCY_CODES, isBaseCurrencyCode } from "./currency"
import type { SupabaseClient } from "@supabase/supabase-js"

// Every amount is stored in the base currency. Changing it after money has been recorded would
// silently change what every existing amount means, so a change is only allowed on an empty
// organization, and only to a supported currency. Returns a message if blocked, otherwise null.
// Keeping the current value is always allowed, even if it is an older, no-longer-offered currency.
export async function baseCurrencyChangeBlocked(supabase: SupabaseClient, organizationId: string, newCurrency: string): Promise<string | null> {
    const next = String(newCurrency || "").trim().toUpperCase()

    const { data: org, error } = await supabase
        .from("organizations")
        .select("base_currency")
        .eq("id", organizationId)
        .maybeSingle()
    if (error) {
        console.error("Could not read current base currency:", error)
        return "Could not check your current base currency. Please try again."
    }

    const current = String(org?.base_currency || "").toUpperCase()
    if (next === current) return null

    if (!isBaseCurrencyCode(next)) {
        return `Choose one of the supported base currencies: ${BASE_CURRENCY_CODES.join(", ")}.`
    }
    if (!current) return null // a brand-new organization with no currency set yet

    const [docs, awards] = await Promise.all([
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabase.from("funds").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).not("award_amount", "is", null),
    ])
    if (docs.error || awards.error) {
        console.error("Could not check existing records:", docs.error || awards.error)
        return "Could not check your existing records. Please try again."
    }

    if ((docs.count ?? 0) > 0 || (awards.count ?? 0) > 0) {
        return `Your base currency can't be changed after you have recorded documents or fund awards. Every amount is stored in ${current}, and changing it would silently change what all of them mean. Contact us if you need to move to a different currency.`
    }
    return null
}
