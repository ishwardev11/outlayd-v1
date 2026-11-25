// Pure helpers for the AI module (tested in retry.test.ts)
import { errorMessage, errorProp } from "@/utils/row-types"

// 429 (rate limited) or 503 (overloaded): worth trying again after a short wait
export function isBusyError(error: unknown): boolean {
    const status = errorProp(error, "status") || errorProp(errorProp(error, "response"), "status")
    return status === 503 || status === 429 || /503|429/.test(String(errorMessage(error) ?? ""))
}

// A failure as it may be logged: the error's name and message only, cut short. Never the document
// or the AI's answer.
export function safeErrorText(error: unknown): string {
    const name = String(errorProp(error, "name") ?? "Error")
    const message = String(errorMessage(error) ?? "").replace(/\s+/g, " ").slice(0, 300)
    return `${name}: ${message}`
}
