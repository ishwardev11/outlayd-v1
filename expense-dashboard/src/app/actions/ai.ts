"use server"

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { updateDocument } from "./ledger"

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

    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    vendor_name: { type: SchemaType.STRING, description: "Name of the business or vendor" },
                    amount: { type: SchemaType.NUMBER, description: "Total amount on the receipt or invoice" },
                    document_date: { type: SchemaType.STRING, description: "Date of the transaction in YYYY-MM-DD format" },
                    document_type: {
                        type: SchemaType.STRING,
                        enum: ["receipt", "invoice"],
                        description: "Categorize as a receipt (proof of payment) or invoice (request for payment)"
                    }
                },
                required: ["vendor_name", "amount", "document_date", "document_type"]
            }
        }
    })

    try {
        // Pass the document inline for extraction
        const result = await model.generateContent([
            "Extract the vendor name, total amount, date, and document type from this provided document image.",
            {
                inlineData: {
                    data: base64Data,
                    mimeType
                }
            }
        ])

        const text = result.response.text()
        const data = JSON.parse(text)

        // Update the document in the database with the extracted structured data
        await updateDocument(documentId, {
            vendor_name: data.vendor_name,
            amount: data.amount,
            document_date: data.document_date,
            document_type: data.document_type,
            status: "needs_review" // Move column to needs review now that data is populated
        })

        return data
    } catch (error) {
        console.error("Failed to extract or parse Gemini response:", error)
        // Revert status or handle error visually
        await updateDocument(documentId, { status: "needs_review" })
        throw new Error("Failed to parse document data.")
    }
}
