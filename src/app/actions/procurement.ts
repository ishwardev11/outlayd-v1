"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { getOrganizationId } from "./ledger"
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

/**
 * Throws a structured error if the calling user's organization is not on the Pro tier.
 * Call this at the top of every write action in this file.
 */
async function requireProTier(): Promise<void> {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data: org, error } = await supabase
        .from("organizations")
        .select("subscription_status")
        .eq("id", organization_id)
        .single()

    if (error) {
        console.error("requireProTier: failed to fetch org:", error)
        throw new Error("Failed to verify subscription status")
    }

    if (org?.subscription_status !== "pro") {
        const err: any = new Error(
            "This feature requires a Outlayd Pro subscription. Please upgrade to access Procurement."
        )
        err.code = "FORBIDDEN"
        throw err
    }
}

export async function createProcurementProject(projectData: any) {
    await requireProTier()
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data, error } = await supabase
        .from("procurement_projects")
        .insert({
            ...projectData,
            organization_id
        })
        .select()
        .single()

    if (error) {
        console.error("Error creating procurement project:", JSON.stringify(error, null, 2))
        throw new Error(`Failed to create project: ${error.message || ''} - ${error.details || ''}`)
    }

    revalidatePath("/procurement")
    return data
}

export async function deleteProcurementProject(projectId: string) {
    await requireProTier()
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    // 1. Delete associated quotes first (if not handled by cascade)
    await supabase.from("quotes").delete().eq("project_id", projectId).eq("organization_id", organization_id)

    // 2. Delete the project
    const { error } = await supabase
        .from("procurement_projects")
        .delete()
        .eq("id", projectId)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Error deleting procurement project:", error)
        throw new Error("Failed to delete project")
    }

    revalidatePath("/procurement")
    return { success: true }
}

export async function addManualQuote(projectId: string, quoteData: any) {
    await requireProTier()
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data, error } = await supabase
        .from("quotes")
        .insert({
            project_id: projectId,
            organization_id,
            vendor_name: quoteData.vendor_name,
            total_amount: quoteData.total_amount,
            payment_terms: quoteData.payment_terms,
            status: 'uploaded',
            ai_recommendation_status: null,
            ai_rationale: quoteData.notes || 'Manually entered quote.'
        })
        .select()
        .single()

    if (error) {
        console.error("Error creating manual quote:", error)
        throw new Error("Failed to add manual quote")
    }

    revalidatePath(`/procurement/${projectId}`)
    return data
}

export async function deleteQuote(quoteId: string, projectId: string) {
    await requireProTier()
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { error } = await supabase
        .from("quotes")
        .delete()
        .eq("id", quoteId)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Error deleting quote:", error)
        throw new Error("Failed to delete quote")
    }

    revalidatePath(`/procurement/${projectId}`)
    return { success: true }
}

export async function editQuote(quoteId: string, projectId: string, updates: { vendor_name: string, total_amount: number, payment_terms: string }) {
    await requireProTier()
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { error } = await supabase
        .from("quotes")
        .update(updates)
        .eq("id", quoteId)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Error editing quote:", error)
        throw new Error("Failed to edit quote")
    }

    revalidatePath(`/procurement/${projectId}`)
    return { success: true }
}

export async function processQuoteUpload(projectId: string, formData: FormData) {
    await requireProTier()
    const file = formData.get("file") as File
    if (!file) throw new Error("No file uploaded")

    // Security Validation
    const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!ALLOWED_MIMES.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}. Only images and PDFs are allowed.`);
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
        throw new Error("File too large. Maximum size is 10MB.");
    }

    // Sanitize Filename (Remove path components and special characters)
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/^[./\\]+/, "");
    const fileName = `${Date.now()}-${safeName}`

    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    // Global Rate Limit (per Organization): Max 5 uploads per minute
    const ONE_MINUTE_AGO = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentCount, error: countError } = await supabase
        .from("quotes")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .gt("created_at", ONE_MINUTE_AGO);

    if (recentCount && recentCount >= 5) {
        throw new Error("Too many quote uploads. Please wait a minute before uploading more.");
    }

    // 1. Upload to Storage
    const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from("receipts") // Using same bucket for now, or could create a new 'quotes' bucket
        .upload(fileName, file)

    if (uploadError) {
        console.error("Storage upload error:", uploadError)
        throw new Error("Failed to upload file")
    }

    const { data: { publicUrl } } = supabase
        .storage
        .from("receipts")
        .getPublicUrl(fileName)

    // 2. Initial DB insertion
    const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .insert({
            project_id: projectId,
            organization_id,
            vendor_name: "Pending...",
            total_amount: 0,
            payment_terms: "Pending...",
            file_url: publicUrl,
            file_size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            status: 'uploaded',
            ai_recommendation_status: null
        })
        .select()
        .single()

    if (quoteError) {
        console.error("Quotes Insert Error:", quoteError)
        throw new Error("Failed to create quote record")
    }

    revalidatePath(`/procurement/${projectId}`)
    return quoteData
}

export async function runSingleEvaluation(quoteId: string, projectId: string) {
    await requireProTier()
    const supabase = await createClient()
    
    // Update status to evaluating
    await supabase.from("quotes").update({ status: 'evaluating' }).eq('id', quoteId)
    revalidatePath(`/procurement/${projectId}`)

    // Redirect to the bulk evaluation function to ensure full context
    return await evaluateQuotes(projectId)
}

export async function extractQuoteData(quoteId: string, projectId: string, mimeType: string, base64Data: string) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing from environment variables")
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    vendor_name: { type: SchemaType.STRING, description: "Name of the bidding vendor" },
                    total_amount: { type: SchemaType.NUMBER, description: "Total quoted amount" },
                    payment_terms: { type: SchemaType.STRING, description: "Net-30, Due on Receipt, etc." },
                    ai_recommendation_status: {
                        type: SchemaType.STRING,
                        description: "Must be EXACTLY one of: 'Recommended', 'Alternative', 'Rejected'."
                    },
                    ai_rationale: { type: SchemaType.STRING, description: "Short 2 sentence explanation of why this was the recommendation." },
                    extracted_data: {
                        type: SchemaType.OBJECT,
                        description: "Raw JSON key-value pairs of the extracted line items",
                        properties: {
                            line_items: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        description: { type: SchemaType.STRING },
                                        price: { type: SchemaType.NUMBER }
                                    }
                                }
                            }
                        }
                    }
                },
                required: ["vendor_name", "total_amount", "payment_terms", "ai_recommendation_status", "ai_rationale"]
            }
        }
    })

    try {
        const result = await model.generateContent([
            "Extract the vendor quote information from this document. If the vendor appears professional and the quote is clear, mark it as 'Recommended'. If it lacks details or explicitly demands immediate upfront payment, mark it as 'Alternative'. If it seems incomplete or suspicious, mark it 'Rejected'.",
            {
                inlineData: {
                    data: base64Data,
                    mimeType
                }
            }
        ])

        const text = result.response.text()
        const data = JSON.parse(text)

        await updateQuote(quoteId, {
            vendor_name: data.vendor_name,
            total_amount: data.total_amount,
            payment_terms: data.payment_terms,
            ai_recommendation_status: data.ai_recommendation_status,
            ai_rationale: data.ai_rationale,
            extracted_data: data.extracted_data || {}
        })

        return data
    } catch (error) {
        console.error("Failed to extract Quote data:", error)
        throw new Error("Failed to parse Quote AI extraction")
    }
}

async function updateQuote(id: string, updates: any) {
    const supabase = await createClient()
    const { error } = await supabase
        .from("quotes")
        .update(updates)
        .eq("id", id)

    if (error) console.error("Error updating quote:", error)
}

export async function evaluateQuotes(projectId: string) {
    await requireProTier()
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing from environment variables")
    }

    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    // Global Rate Limit (per Organization): Max 5 evaluations per minute
    const ONE_MINUTE_AGO = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
        .from("quotes")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .neq("ai_recommendation_status", null)
        .gt("updated_at", ONE_MINUTE_AGO);

    if (recentCount && recentCount >= 5) {
        throw new Error("Too many quote evaluations. Please wait a minute.");
    }


    // 1. Fetch Project Constraints
    const { data: project, error: projectError } = await supabase
        .from("procurement_projects")
        .select("*")
        .eq("id", projectId)
        .single()

    if (projectError || !project) {
        console.error("Failed to fetch project:", projectError)
        throw new Error("Failed to fetch project constraints")
    }

    // 2. Fetch all active quotes (exclude rejected if you only want to compare current options)
    const { data: quotes, error: quotesError } = await supabase
        .from("quotes")
        .select("*")
        .eq("project_id", projectId)
        .neq("status", "rejected")

    if (quotesError || !quotes || quotes.length === 0) {
        console.error("Failed to fetch quotes:", quotesError)
        throw new Error("No quotes found for evaluation")
    }

    // 3. Configure Gemini Model with Strict JSON Schema
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                description: "Evaluation results for all quotes",
                properties: {
                    recommendedBidId: { type: SchemaType.STRING, description: "The UUID of the best overall quote from the provided quotes." },
                    recommendationReason: { type: SchemaType.STRING, description: "A solid 2-3 sentence explanation of why this vendor was chosen over the others." },
                    individualEvaluations: {
                        type: SchemaType.ARRAY,
                        description: "Array of evaluated quotes",
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                quote_id: { type: SchemaType.STRING, description: "The exact quote ID provided" },
                                summary: {
                                    type: SchemaType.STRING,
                                    description: "A short summary of the quote analysis"
                                },
                                flags: {
                                    type: SchemaType.ARRAY,
                                    items: { type: SchemaType.STRING },
                                    description: "List of identified risks or notable exclusions"
                                }
                            },
                            required: ["quote_id", "summary", "flags"]
                        }
                    }
                },
                required: ["recommendedBidId", "recommendationReason", "individualEvaluations"]
            }
        }
    })

    // 4. Construct Prompt
    const prompt = `
You are acting as a rigorous non-profit Chief Procurement Officer. Your job is to analyze all uploaded bids for a project, compare them, and explicitly recommend the best option with a detailed justification.

Here are the constraints for this project:
- Title: ${project.title}
- Budget Ceiling: $${project.budget_ceiling}
- Required Delivery/Completion Date: ${project.required_deadline}
- Mandatory Requirements: ${project.mandatory_requirements?.join(", ") || "None"}

Here is the JSON data containing all uploaded quotes for this project:
${JSON.stringify(quotes.map((q: any) => ({
        quote_id: q.id,
        vendor_name: q.vendor_name,
        total_amount: q.total_amount,
        payment_terms: q.payment_terms,
        notes: q.notes,
        extracted_data: q.extracted_data
    })), null, 2)}

Evaluation Rules:
1. Analyze the bids based on total cost, payment terms, and any manual notes.
2. Critically penalize quotes that exceed the budget ceiling.
3. Identify any hidden exclusions or missing requirements (e.g. from the notes).
4. Select exactly ONE quote as the recommended winner (recommendedBidId).
5. Provide a solid 2-3 sentence explanation of why this vendor was chosen over the others (recommendationReason).
6. Provide an individual summary and risk flags for EACH quote.

Return the strict JSON structure.
`

    // 5. Query Gemini
    try {
        const result = await model.generateContent(prompt)
        const text = result.response.text()
        const evaluationResponse = JSON.parse(text)
        
        const { recommendedBidId, recommendationReason, individualEvaluations } = evaluationResponse

        // 6. Bulk Update Database
        for (const evaluation of individualEvaluations) {
            const isWinner = evaluation.quote_id === recommendedBidId
            
            const aiNotes = `AI Summary: ${evaluation.summary}\n\nRisks: ${evaluation.flags.length > 0 ? evaluation.flags.join(", ") : "None"}`
            
            await updateQuote(evaluation.quote_id, {
                status: 'evaluated',
                is_recommended: isWinner,
                // We'll store the overarching reason in the winning quote's rationale
                ai_rationale: isWinner ? recommendationReason : 'Not recommended. See notes for details.',
                ai_recommendation_status: isWinner ? 'Recommended' : 'Alternative',
                notes: aiNotes
            })
        }

        revalidatePath(`/procurement/${projectId}`)
        return { success: true, recommendedBidId, recommendationReason }
    } catch (error) {
        console.error("Failed to evaluate quotes via Gemini:", error)
        throw new Error("Failed to evaluate quotes")
    }
}

export async function awardBid(quoteId: string, projectId: string) {
    await requireProTier()
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    // 1. Award the chosen bid
    const { error: quoteError } = await supabase
        .from("quotes")
        .update({ status: 'awarded' })
        .eq("id", quoteId)
        .eq("organization_id", organization_id)

    if (quoteError) {
        console.error("Error awarding bid:", quoteError)
        throw new Error("Failed to award bid")
    }

    // 2. Reject all other bids for this project
    const { error: rejectError } = await supabase
        .from("quotes")
        .update({ status: 'rejected' })
        .eq("project_id", projectId)
        .neq("id", quoteId)
        .eq("organization_id", organization_id)
        .in("status", ["uploaded", "evaluating", "evaluated"])
    
    if (rejectError) {
        console.warn("Failed to reject other bids:", rejectError)
    }

    // 3. Update the parent project status to 'Awarded'
    const { error: projectError } = await supabase
        .from("procurement_projects")
        .update({ status: 'Awarded' })
        .eq("id", projectId)
        .eq("organization_id", organization_id)

    if (projectError) {
        console.error("Error updating project status:", projectError)
        // We don't throw here to avoid a half-awarded state confusion, but it's an issue
    }

    revalidatePath(`/procurement/${projectId}`)
    revalidatePath("/procurement")
    return { success: true }
}
