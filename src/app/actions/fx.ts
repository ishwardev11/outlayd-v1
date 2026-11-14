"use server"

import { getCurrentUserRole, getOrganizationCurrency } from "./document-utils"
import { fetchExchangeRate } from "@/utils/fx"

export type RateLookupResult =
    | { success: true; rate: number; rateDate: string; from: string; to: string }
    | { success: false; error: string }

// Look up the ECB rate for converting a document's currency into the organization's base currency.
export async function lookupExchangeRate(input: { from: string; date?: string | null }): Promise<RateLookupResult> {
    const role = await getCurrentUserRole()
    if (!role) return { success: false, error: "You do not have access to this organization." }

    const from = String(input?.from || "").trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(from)) return { success: false, error: "Choose a valid currency." }

    const to = (await getOrganizationCurrency()).toUpperCase()
    if (from === to) return { success: true, rate: 1, rateDate: new Date().toISOString().slice(0, 10), from, to }

    const fx = await fetchExchangeRate(from, to, input?.date)
    if (!fx) {
        return { success: false, error: `No rate was found for ${from} to ${to}. Enter the rate yourself, for example from your bank statement.` }
    }
    return { success: true, rate: fx.rate, rateDate: fx.rateDate, from, to }
}
