// The one place Outlayd talks to the AI provider (Google Gemini). Server only: it reads the API key,
// so it must never be imported from a "use client" file or exported from a "use server" file (a
// "use server" export can be called directly by any signed-in browser).
//
// Rules for every AI feature that uses this module:
//   * Send only what the feature needs: the one document, or the few fields being classified. Never
//     bank account numbers, never anything from another organisation.
//   * Check the plan and the monthly limit first, with runAiAssist (./usage), or count the call with
//     claimAiCall / finishAiCall for features that have their own limits.
//   * Log failures without document contents: the error message, never the document or the AI's answer.
//   * AI suggests, a person confirms: nothing it returns is saved to the books without Save or Confirm.
import { GoogleGenerativeAI, type GenerationConfig, type GenerateContentResult } from "@google/generative-ai"
import { isBusyError } from "./retry"

if (typeof window !== "undefined") {
    throw new Error("src/lib/ai is server-only")
}

export const AI_MODEL = "gemini-2.5-flash"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export function aiConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY
}

export interface DocumentRequest {
    prompt: string
    // The document, base64, sent inline
    file: { data: string; mimeType: string }
    // JSON schema of the answer (Gemini's response schema)
    schema: GenerationConfig["responseSchema"]
    temperature: number
    // Each attempt is given this long
    timeoutMs: number
    // How many times a "busy" answer (429 or 503) is tried again, and how long to wait before each
    retries: number
    retryDelayMs: (attempt: number) => number
    maxOutputTokens?: number
}

// Sends one document with a prompt and asks for JSON in the given schema. "Busy" errors are retried;
// anything else (including a timed-out request, which already used its time) is thrown at once.
// Returns the raw result, so each feature reads the answer and its finish reason the way it needs.
export async function generateFromDocument(req: DocumentRequest): Promise<GenerateContentResult> {
    // Gemini 2.5 Flash "thinks" before it answers by default. Reading a document does not need that,
    // and it adds many seconds, so the thinking budget is 0. The SDK's types do not list
    // thinkingConfig yet, but it is passed straight through to the API.
    const generationConfig = {
        temperature: req.temperature,
        responseMimeType: "application/json",
        responseSchema: req.schema,
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
        thinkingConfig: { thinkingBudget: 0 },
    } as unknown as GenerationConfig
    const model = genAI.getGenerativeModel({ model: AI_MODEL, generationConfig }, { timeout: req.timeoutMs })

    for (let attempt = 0; ; attempt++) {
        try {
            return await model.generateContent([req.prompt, { inlineData: { data: req.file.data, mimeType: req.file.mimeType } }])
        } catch (error) {
            if (isBusyError(error) && attempt < req.retries) {
                const wait = req.retryDelayMs(attempt)
                console.warn(`AI service busy or rate limited. Retrying in ${wait}ms (attempt ${attempt + 1} of ${req.retries})`)
                await new Promise((resolve) => setTimeout(resolve, wait))
                continue
            }
            throw error
        }
    }
}
