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
            ai_recommendation_status: 'Manual Entry',
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
            vendor_name: "Processing...",
            total_amount: 0,
            payment_terms: "Processing...",
            ai_recommendation_status: null
        })
        .select()
        .single()

    if (quoteError) {
        console.error("Quotes Insert Error:", quoteError)
        throw new Error("Failed to create quote record")
    }

    // 3. Kick off Gemini processing asynchronously
    try {
        const buffer = await file.arrayBuffer()
        const base64Data = Buffer.from(buffer).toString("base64")

        await extractQuoteData(quoteData.id, projectId, file.type, base64Data)
    } catch (e) {
        console.error("Gemini Extraction failed in processQuoteUpload:", e)
        // Ensure it doesn't leave the UI hanging permanently
        updateQuote(quoteData.id, { vendor_name: "Extraction Failed" })
    }

    revalidatePath(`/procurement/${projectId}`)
    return quoteData
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

    // 2. Fetch all related quotes
    const { data: quotes, error: quotesError } = await supabase
        .from("quotes")
        .select("*")
        .eq("project_id", projectId)

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
                type: SchemaType.ARRAY,
                description: "Array of evaluated quotes",
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        quote_id: { type: SchemaType.STRING, description: "The exact quote ID provided" },
                        ai_recommendation_status: {
                            type: SchemaType.STRING,
                            description: "Must be EXACTLY one of: 'Recommended', 'Alternative', 'Rejected'"
                        },
                        ai_rationale: {
                            type: SchemaType.STRING,
                            description: "Detailed paragraph explaining exactly why it won or lost based on the non-profit's specific constraints"
                        }
                    },
                    required: ["quote_id", "ai_recommendation_status", "ai_rationale"]
                }
            }
        }
    })

    // 4. Construct Prompt
    const prompt = `
You are acting as a rigorous non-profit Chief Procurement Officer. Your job is to evaluate multiple vendor quotes against strict project constraints and select the best fit.

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
        extracted_data: q.extracted_data
    })), null, 2)}

Evaluation Rules:
1. Identify any hidden exclusions or missing requirements.
2. Compare payment terms in relation to standard non-profit needs.
3. Critically penalize quotes that exceed the budget ceiling.
4. You must select exactly ONE quote to mark as 'Recommended'. 
5. The remaining quotes must be marked as 'Alternative' or 'Rejected' based on their viability.
6. Provide a comprehensive paragraph in 'ai_rationale' explaining exactly why this quote was given its status based on the specific constraints above.

Return the JSON array as strictly defined.
`

    // 5. Query Gemini
    try {
        const result = await model.generateContent(prompt)
        const text = result.response.text()
        const evaluations = JSON.parse(text)

        // 6. Update Database
        for (const evaluation of evaluations) {
            await updateQuote(evaluation.quote_id, {
                ai_recommendation_status: evaluation.ai_recommendation_status,
                ai_rationale: evaluation.ai_rationale
            })
        }

        revalidatePath(`/procurement/${projectId}`)
        return { success: true }
    } catch (error) {
        console.error("Failed to evaluate quotes via Gemini:", error)
        throw new Error("Failed to evaluate quotes")
    }
}
