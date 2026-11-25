import { SchemaType, type GenerationConfig } from "@google/generative-ai"
import { createClient } from "@/utils/supabase/server"
import { parseStatement, type RawStatement } from "@/utils/bank-statement-parse"
import { errorMessage } from "@/utils/row-types";
import { aiConfigured, generateFromDocument } from "@/lib/ai/gemini"
import { claimAiCall, finishAiCall } from "@/lib/ai/usage"

type Supabase = Awaited<ReturnType<typeof createClient>>

// A request gets 40s and the whole job 52s, inside the 60s limit of the page or route that starts
// it, so a statement that cannot be read ends as "failed" with a message and never stays "reading".
const GEMINI_TIMEOUT_MS = 40_000
export const STATEMENT_DEADLINE_MS = 52_000

const PROMPT = `You are reading a bank statement PDF. Transcribe it exactly. Do not guess, summarise or invent anything.

Return:
- bank_name: the bank's name.
- account_last4: the LAST 4 characters of the account number only. Never return the full number.
- currency: the 3-letter ISO currency code of the account (for example MYR, SGD, USD).
- period_start / period_end: the statement period as YYYY-MM-DD.
- opening_balance / closing_balance: the balance brought forward and the closing balance, as plain numbers.
- transactions: EVERY transaction row, in the order printed, across all pages. For each:
  - date as YYYY-MM-DD. If the statement prints dates without a year (like 05/10 or 05 OCT), use the statement period to work out the year.
  - description: the full text of the row. If the description wraps onto more lines, join them with spaces.
  - debit: money going OUT of the account, as a positive number, or null.
  - credit: money coming IN, as a positive number, or null.
  - balance: the running balance after the row if it is printed, otherwise null.

Rules:
- Numbers are plain numbers with a dot for decimals and no thousands separators, no currency symbols.
- Do NOT include the opening balance line, closing balance line, page totals, "total debit/credit" summary lines, or page headers and footers as transactions.
- If a row has both a debit and a credit, return both.
- If you cannot read a value, use null. Never make one up.`

const schema: GenerationConfig["responseSchema"] = {
    type: SchemaType.OBJECT,
    properties: {
        bank_name: { type: SchemaType.STRING, nullable: true },
        account_last4: { type: SchemaType.STRING, nullable: true },
        currency: { type: SchemaType.STRING, nullable: true },
        period_start: { type: SchemaType.STRING, nullable: true },
        period_end: { type: SchemaType.STRING, nullable: true },
        opening_balance: { type: SchemaType.NUMBER, nullable: true },
        closing_balance: { type: SchemaType.NUMBER, nullable: true },
        transactions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    date: { type: SchemaType.STRING },
                    description: { type: SchemaType.STRING },
                    debit: { type: SchemaType.NUMBER, nullable: true },
                    credit: { type: SchemaType.NUMBER, nullable: true },
                    balance: { type: SchemaType.NUMBER, nullable: true },
                },
                required: ["date", "description"],
            },
        },
    },
    required: ["transactions"],
}

export class StatementError extends Error {}

async function readStatementWithAI(base64Pdf: string): Promise<RawStatement> {
    if (!aiConfigured()) throw new StatementError("The AI service is not set up (missing GEMINI_API_KEY).")

    // One more try after 2s if the AI service is busy (429/503)
    const result = await generateFromDocument({
        prompt: PROMPT,
        file: { data: base64Pdf, mimeType: "application/pdf" },
        schema,
        temperature: 0,
        timeoutMs: GEMINI_TIMEOUT_MS,
        retries: 1,
        retryDelayMs: () => 2000,
        maxOutputTokens: 32768,
    })
    if (!result) throw new StatementError("The AI service did not answer.")

    // If the answer was cut off, the last rows are missing, so refuse rather than import half of it
    const finish = result.response.candidates?.[0]?.finishReason
    if (finish === "MAX_TOKENS") {
        throw new StatementError("This statement is too long to read in one go. Upload it in shorter periods, for example one month at a time.")
    }

    try {
        return JSON.parse(result.response.text()) as RawStatement
    } catch {
        throw new StatementError("The AI returned something that could not be read. Please try again.")
    }
}

async function failStatement(supabase: Supabase, statementId: string, message: string) {
    const { error } = await supabase
        .from("bank_statements")
        .update({ status: "failed", error_message: message.slice(0, 500) })
        .eq("id", statementId)
        .eq("status", "extracting")
    if (error) console.error("Failed to mark statement as failed:", error)
}

async function readAndStore(supabase: Supabase, statementId: string, organizationId: string, base64Pdf: string) {
    const parsed = parseStatement(await readStatementWithAI(base64Pdf))

    // Rows already imported from an overlapping statement are skipped by the unique fingerprint
    let inserted = 0
    for (let i = 0; i < parsed.transactions.length; i += 500) {
        const chunk = parsed.transactions.slice(i, i + 500).map((t) => ({
            organization_id: organizationId,
            statement_id: statementId,
            txn_date: t.date,
            description: t.description,
            amount: t.cents / 100,
            balance: t.balanceCents === null ? null : t.balanceCents / 100,
            fingerprint: t.fingerprint,
        }))
        const { data, error } = await supabase
            .from("bank_transactions")
            .upsert(chunk, { onConflict: "organization_id,fingerprint", ignoreDuplicates: true })
            .select("id")
        if (error) {
            console.error("Failed to store bank transactions:", error)
            // Do not leave a half-imported statement behind
            await supabase.from("bank_transactions").delete().eq("statement_id", statementId)
            throw new StatementError("The transactions could not be saved. Please try again.")
        }
        inserted += data?.length ?? 0
    }

    const duplicates = parsed.transactions.length - inserted
    const note = duplicates > 0
        ? `${duplicates} row${duplicates === 1 ? " was" : "s were"} already imported from another statement and ${duplicates === 1 ? "was" : "were"} skipped.`
        : null
    const { error } = await supabase
        .from("bank_statements")
        .update({
            status: "ready",
            bank_name: parsed.bankName,
            account_last4: parsed.accountLast4,
            currency: parsed.currency,
            period_start: parsed.periodStart,
            period_end: parsed.periodEnd,
            opening_balance: parsed.openingCents === null ? null : parsed.openingCents / 100,
            closing_balance: parsed.closingCents === null ? null : parsed.closingCents / 100,
            transaction_count: inserted,
            duplicate_count: duplicates,
            warning: [parsed.warning, note].filter(Boolean).join(" ") || null,
            error_message: null,
        })
        .eq("id", statementId)
    if (error) {
        console.error("Failed to finish statement:", error)
        throw new StatementError("The statement could not be saved. Please try again.")
    }
}

// Runs in the background after the upload returns. Whatever happens, the statement ends as
// "ready" or "failed".
export async function processBankStatement(statementId: string, organizationId: string, base64Pdf: string) {
    const supabase = await createClient()
    // Counted in ai_usage only: statement import keeps its own rule (paid plans)
    await claimAiCall(organizationId, "bank_statement")
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), STATEMENT_DEADLINE_MS)
    })
    try {
        const outcome = await Promise.race([
            readAndStore(supabase, statementId, organizationId, base64Pdf).then(() => "done" as const),
            deadline,
        ])
        if (outcome === "done") await finishAiCall(organizationId, "bank_statement", true)
        if (outcome === "timeout") {
            console.error(`Statement ${statementId} passed ${STATEMENT_DEADLINE_MS}ms`)
            await failStatement(supabase, statementId, "Reading this statement took too long. Try a shorter period, or upload it again.")
        }
    } catch (error) {
        console.error("Statement extraction failed:", error)
        const message = error instanceof StatementError
            ? errorMessage(error)
            : /abort|timed? ?out/i.test(String(errorMessage(error)))
                ? "Reading this statement took too long. Try a shorter period, or upload it again."
                : "The statement could not be read. Check that it is a bank statement PDF and try again."
        await failStatement(supabase, statementId, message)
    } finally {
        clearTimeout(timer)
    }
}
