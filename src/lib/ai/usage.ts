// AI usage, plan gating and monthly limits (migration 20261206100000_ai_usage.sql). The rules live in
// the database function claim_ai_call, so they hold however the server code is reached; it is called
// with the server key, so people cannot change their own counts. Server only.
import { createAdminClient } from "@/utils/supabase/admin"
import { safeErrorText } from "./retry"
import { AI_GATE_MESSAGES, type AiAssistFeature, type AiFeature } from "./messages"

if (typeof window !== "undefined") {
    throw new Error("src/lib/ai is server-only")
}

export type AiClaim = "ok" | "plan" | "limit" | "error"

// Counts one AI call. For the AI assistants it is also the gate: "plan" or "limit" means do not call
// the AI. "error" means the count could not be checked, and an assistant must not run then (a gate
// never opens by mistake). Never throws.
export async function claimAiCall(organizationId: string, feature: AiFeature): Promise<AiClaim> {
    try {
        const { data, error } = await createAdminClient().rpc("claim_ai_call", { p_org: organizationId, p_feature: feature })
        if (error) {
            console.error(`claim_ai_call(${feature}) failed:`, error.message)
            return "error"
        }
        return data === "ok" || data === "plan" || data === "limit" ? data : "error"
    } catch (e) {
        console.error(`claim_ai_call(${feature}) failed:`, safeErrorText(e))
        return "error"
    }
}

// Records that a counted call worked. Never throws.
export async function finishAiCall(organizationId: string, feature: AiFeature, success: boolean): Promise<void> {
    if (!success) return
    try {
        const { error } = await createAdminClient().rpc("finish_ai_call", { p_org: organizationId, p_feature: feature, p_success: true })
        if (error) console.error(`finish_ai_call(${feature}) failed:`, error.message)
    } catch (e) {
        console.error(`finish_ai_call(${feature}) failed:`, safeErrorText(e))
    }
}

export type AiAssistResult<T> = { ok: true; value: T } | { ok: false; code: "plan" | "limit" | "failed"; error: string }

// Runs one AI assistant call: checks the plan and the monthly limit, counts it, runs it, records
// whether it worked. Any failure becomes a friendly message (never an error page), and only the
// error's own text is logged. `fn` may throw an AiUserError to show its message to the person.
export async function runAiAssist<T>(organizationId: string, feature: AiAssistFeature, fn: () => Promise<T>): Promise<AiAssistResult<T>> {
    const claim = await claimAiCall(organizationId, feature)
    if (claim === "plan") return { ok: false, code: "plan", error: AI_GATE_MESSAGES.plan }
    if (claim === "limit") return { ok: false, code: "limit", error: AI_GATE_MESSAGES.limit }
    if (claim === "error") return { ok: false, code: "failed", error: AI_GATE_MESSAGES.failed }
    try {
        const value = await fn()
        await finishAiCall(organizationId, feature, true)
        return { ok: true, value }
    } catch (e) {
        console.error(`AI ${feature} failed:`, safeErrorText(e))
        return { ok: false, code: "failed", error: e instanceof AiUserError ? e.message : AI_GATE_MESSAGES.failed }
    }
}

// A failure whose message is meant for the person (for example "This looks like a bill you received")
export class AiUserError extends Error {}
