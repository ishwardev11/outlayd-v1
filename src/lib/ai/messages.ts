// AI features and the messages people see when one cannot run. Pure, so the client may import it.

// Every AI feature counted in ai_usage (the database checks this list too)
export type AiFeature = "receipt_extraction" | "bank_statement" | "issued_invoice" | "payment_slip" | "categorise"

// The AI assistants: paid plans only, within the monthly limit. Receipt and bank statement reading
// keep their own existing rules and are only counted.
export type AiAssistFeature = Extract<AiFeature, "issued_invoice" | "payment_slip" | "categorise">

export const AI_ASSIST_FEATURES: readonly AiAssistFeature[] = ["issued_invoice", "payment_slip", "categorise"]

// Calls allowed per calendar month for all AI assistants together (same number as ai_monthly_limit
// in the database)
export const AI_MONTHLY_LIMIT_PAID = 300

export const AI_GATE_MESSAGES = {
    plan: "AI help is available on the Growth and Nonprofit plans. You can still enter the details by hand.",
    limit: "AI limit reached for this month. You can still enter the details by hand, and the limit resets on the 1st.",
    failed: "The AI could not help with this one. Please enter the details by hand, or try again in a moment.",
} as const
