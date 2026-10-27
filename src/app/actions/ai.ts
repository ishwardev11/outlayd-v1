"use server"

import { GoogleGenerativeAI, SchemaType, type GenerationConfig } from "@google/generative-ai"
import { updateDocument, getOrganizationId } from "./document-utils"
import { createClient } from "@/utils/supabase/server"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export async function extractDocumentData(
    documentId: string,
    mimeType: string,
    base64Data: string
) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing from environment variables")
    }

    // Update document status to extracting while Gemini processes
    await updateDocument(documentId, { status: "extracting" })

    const generationConfig: GenerationConfig = {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
                vendor_name: { type: SchemaType.STRING, description: "Name of the business or vendor" },
                amount: { type: SchemaType.NUMBER, description: "Total amount on the receipt or invoice" },
                document_date: { type: SchemaType.STRING, description: "Date of the transaction in YYYY-MM-DD format" },
                document_type: {
                    type: SchemaType.STRING,
                    description: "Categorize as a receipt (proof of payment) or invoice (request for payment). Must be exactly 'receipt' or 'invoice'."
                },
                invoice_number: { type: SchemaType.STRING, description: "The official, explicit invoice number, if present. Null if not explicitly labeled as an invoice number." },
                alternative_id: { type: SchemaType.STRING, description: "Fallback IDs like Order Number, Transaction ID, Receipt Number, or Bank Auth Code." },
                transaction_time: { type: SchemaType.STRING, description: "The specific time of purchase (e.g., '14:30'), if visible." },
                payment_last4: { type: SchemaType.STRING, description: "The last 4 digits of the card used, if visible." },
                subtotal: { type: SchemaType.NUMBER, description: "The subtotal amount before taxes and fees." },
                tax_amount: { type: SchemaType.NUMBER, description: "The exact tax amount." },
                vendor_branch_or_location: { type: SchemaType.STRING, description: "Specific branch name or street if it's a chain." },
                confidence_score: { type: SchemaType.NUMBER, description: "Confidence score from 0 to 100 based on the clarity and legibility of the document." },
                line_items: {
                    type: SchemaType.ARRAY,
                    description: "List of individual items found in the document",
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            description: { type: SchemaType.STRING, description: "Description of the item" },
                            quantity: { type: SchemaType.NUMBER, description: "Quantity of the item" },
                            unit_price: { type: SchemaType.NUMBER, description: "Unit price of the item" },
                            total: { type: SchemaType.NUMBER, description: "Total price for this line item" }
                        },
                        required: ["description", "quantity", "unit_price", "total"]
                    }
                }
            },
            required: ["vendor_name", "amount", "document_date", "document_type", "confidence_score", "line_items"]
        }
    }

    try {
        let result;
        const maxRetries = 3;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Always use gemini-2.5-flash.
                const modelName = "gemini-2.5-flash";
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig
                });

                // Pass the document inline for extraction
                result = await model.generateContent([
                    "You are a strict financial data extraction parser. Extract the vendor name, date, and total amount from the provided receipt. Do not calculate, guess, or infer numbers that are not clearly visible. If a value is completely unreadable, return null for that specific field rather than hallucinating a value. Ensure all required schema fields including document_type, line_items, and confidence_score are also populated based on these rules.",
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType
                        }
                    }
                ]);
                
                // If successful, break out of the retry loop
                break;
            } catch (error: any) {
                const status = error?.status || error?.response?.status;
                const isRateLimitOrUnavailable = status === 503 || status === 429 || error.message?.includes("503") || error.message?.includes("429");
                
                if (isRateLimitOrUnavailable && attempt < maxRetries) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.warn(`Gemini API unavailable or rate limited. Retrying in ${waitTime}ms... (Attempt ${attempt + 1} of ${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
                
                // If it's not a retryable error or we've exhausted retries, throw
                throw error;
            }
        }

        if (!result) {
            throw new Error("Failed to generate content after max retries");
        }

        const text = result.response.text()
        console.log("Parsing Gemini response...");
        const data = JSON.parse(text)
        console.log("Response parsed successfully. Line items count:", data.line_items?.length || 0);

        const supabase = await createClient()

        let vendorId = null;
        let defaultCategoryId = null;
        let defaultFundId = null;

        if (data.vendor_name) {
            const { data: existingVendor } = await supabase
                .from("vendors")
                .select("id, default_category_id, default_fund_id")
                .ilike("name", data.vendor_name)
                .single()

            if (existingVendor) {
                vendorId = existingVendor.id
                defaultCategoryId = existingVendor.default_category_id
                defaultFundId = existingVendor.default_fund_id
            } else {
                const organization_id = await getOrganizationId()
                const { data: newVendor } = await supabase
                    .from("vendors")
                    .insert({ name: data.vendor_name, organization_id })
                    .select("id")
                    .single()

                if (newVendor) {
                    vendorId = newVendor.id
                }
            }
        }

        let splits: any[] = [];
        if (defaultCategoryId || defaultFundId) {
            splits = [{
                amount: data.amount || 0,
                category_id: defaultCategoryId || null,
                fund_id: defaultFundId || null
            }];
        }

        const organization_id = await getOrganizationId();
        
        // Phase 3: The 'Waterfall' Logical Check (Post-AI)
        let isDuplicate = false;
        
        // Strict truthiness check for invoice number (must be a non-empty string, not "null")
        const normalizedInvoiceNumber = typeof data.invoice_number === 'string' ? data.invoice_number.trim() : null;
        const hasValidInvoiceNumber = normalizedInvoiceNumber && normalizedInvoiceNumber.toLowerCase() !== "null";

        if (hasValidInvoiceNumber && data.vendor_name) {
            // Condition A (The Trump Card)
            const { data: dupA } = await supabase
                .from("documents")
                .select("id")
                .eq("organization_id", organization_id)
                .ilike("vendor_name", data.vendor_name)
                .eq("invoice_number", data.invoice_number)
                .neq("id", documentId)
                .limit(1);
                
            if (dupA && dupA.length > 0) {
                isDuplicate = true;
                console.log(`Duplicate detected via Condition A (Exact Invoice Number): ${data.invoice_number}`);
            }
        } else if (data.vendor_name && data.document_date && data.amount !== undefined && data.amount !== null) {
            // Condition B (The Composite Fallback)
            const { data: potentialDups } = await supabase
                .from("documents")
                .select("id, alternative_id, transaction_time, payment_last4, tax_amount")
                .eq("organization_id", organization_id)
                .ilike("vendor_name", data.vendor_name)
                .eq("document_date", data.document_date)
                .eq("amount", data.amount)
                .neq("id", documentId);
                
            if (potentialDups && potentialDups.length > 0) {
                for (const dup of potentialDups) {
                    const matchAlternativeId = data.alternative_id && dup.alternative_id && String(dup.alternative_id).toLowerCase() === String(data.alternative_id).toLowerCase();
                    const matchTime = data.transaction_time && dup.transaction_time && String(dup.transaction_time) === String(data.transaction_time);
                    const matchCard = data.payment_last4 && dup.payment_last4 && String(dup.payment_last4) === String(data.payment_last4);
                    const matchTax = data.tax_amount !== undefined && data.tax_amount !== null && dup.tax_amount !== null && Number(dup.tax_amount) === Number(data.tax_amount);
                    
                    if (matchAlternativeId || matchTime || matchCard || matchTax) {
                        isDuplicate = true;
                        console.log(`Duplicate detected via Condition B (Composite Match). Matched on: AltId(${matchAlternativeId}), Time(${matchTime}), Card(${matchCard}), Tax(${matchTax})`);
                        break;
                    }
                }
            }
        }

        await updateDocument(documentId, {
            vendor_name: data.vendor_name,
            vendor_id: vendorId,
            amount: data.amount,
            document_date: data.document_date,
            document_type: data.document_type,
            invoice_number: data.invoice_number,
            alternative_id: data.alternative_id,
            transaction_time: data.transaction_time,
            payment_last4: data.payment_last4,
            subtotal: data.subtotal,
            tax_amount: data.tax_amount,
            vendor_branch_or_location: data.vendor_branch_or_location,
            confidence_score: data.confidence_score,
            splits: splits.length > 0 ? splits : [],
            line_items: data.line_items || [],
            status: isDuplicate ? "DUPLICATE_WARNING" : "needs_review"
        })

        return data
    } catch (error: any) {
        console.error("CRITICAL error in extractDocumentData:", error);
        console.error("Error stack trace:", error.stack);
        // Revert status or handle error visually
        try {
            await updateDocument(documentId, {
                status: "needs_review",
                vendor_name: "[Extraction Failed]",
                notes: `AI Extraction Error: ${error.message}`
            })
        } catch (updateErr) {
            console.error("Failed to update status on error:", updateErr);
        }
        throw error; // Re-throw to propagate to processUpload
    }
}
