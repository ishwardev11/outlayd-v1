"use server"

import { GoogleGenerativeAI, SchemaType, type GenerationConfig } from "@google/generative-ai"
import { updateDocument, getOrganizationId, getOrganizationCurrency } from "./document-utils"
import { getCurrencyDetails } from "@/utils/currency"
import { createClient } from "@/utils/supabase/server"
import { assessExtraction } from "@/utils/extraction-checks"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

const getExtractionSystemPrompt = (baseCurrency: string, symbol: string) => `You are an expert Document AI and financial data extractor specialized in unstructured receipts, tax invoices, utility bills, SaaS statements, and purchase orders.

Your task is to extract all key financial, vendor, line item, and tax metadata from the provided document image or text into a strict, validated JSON structure.

### EXTRACTION RULES & EDGE CASES:

1. INVOICE IDENTIFIERS & METADATA:
- Extract the primary Invoice Number / Reference Number:
  - Search for labels such as "Invoice #", "Inv No.", "Bill #", "Doc #", "Factura #", "Tax Invoice No.", or alphanumeric values in header metadata blocks.
  - Trim any leading colons, spaces, or hashes (e.g., extract "US-001" instead of "# US-001" or "Inv: US-001").
  - If no invoice number exists on the document (e.g., standard thermal receipts or retail slips), return null.
- Separate Reference IDs:
  - If a Purchase Order number ("P.O. #", "PO Number", "Order Ref") is present, capture it strictly under "po_number" and do not confuse it with the invoice number.
- Classify Document Type:
  - Identify whether the document is an "Invoice (Unpaid)", "Invoice (Paid)", "Tax Invoice", "Receipt", "Credit Note", or "Purchase Order".

2. VENDOR IDENTIFICATION:
- Differentiate between the "Vendor / Supplier / Bill From" and the "Customer / Client / Bill To". Always extract the entity providing the goods/services and receiving payment as the vendor.
- Do NOT rely solely on bold headers or top-left positioning. Cross-reference vendor tax IDs, registration numbers (e.g., VAT, GST, EIN, UEN, SSM), remittance addresses, and support domain/email addresses.
- If multiple company entities appear, identify which one is receiving the payment.

3. DATES & NORMALIZATION:
- Handle all global date variations: ISO (YYYY-MM-DD), European/UK/Commonwealth (DD/MM/YYYY), US (MM/DD/YYYY), or alphanumeric formats ("24 Oct 2026", "October 24, 2026").
- Contextually disambiguate ambiguous dates (e.g., 05/06/2026) by inspecting neighboring dates, invoice issue vs. due periods, or country-specific conventions.
- ALWAYS normalize all extracted dates ("issue_date" and "due_date") to ISO 8601 string: "YYYY-MM-DD". If missing or unreadable, return null.

4. LINE ITEMS EXTRACTION:
- Extract all individual products, subscription tiers, seat licenses, or services itemized in tables or lists.
- For each item, extract:
  - description: Clean product/service label without table headers or noise.
  - quantity: Decimal or integer (default to 1.0 if not explicitly stated).
  - unit_price: Per-unit cost before line-level discounts or taxes.
  - amount: Net line item total.
- Never concatenate separate charges into a single string. If itemized discounts apply, calculate the final charge accurately.

5. TOTALS, CURRENCY & TAX:
- Extract ISO 4217 3-letter currency codes (e.g., "MYR", "USD", "EUR", "GBP", "SGD"). The organization's base currency is ${baseCurrency} (symbol: ${symbol}). Infer from symbols (${symbol} = ${baseCurrency}, RM = MYR, € = EUR, £ = GBP, $ = ${baseCurrency === 'MYR' ? 'MYR unless explicitly stated as USD' : baseCurrency}) or vendor context. Default to "${baseCurrency}" if not explicitly specified.
- Extract numbers as raw floats or strings with 2 decimal places (do not include currency symbols, commas, or letters in numeric fields).
- Accurately isolate subtotal, total tax/VAT/GST amount, discount amount, and final total amount.
- Self-reconciliation check: verify that (subtotal + tax_amount - discount_amount ≈ total_amount). If an explicit discrepancy exists on the printed document, prioritize the explicit total stated on the document.

6. UNREADABLE / MISSING FIELDS:
- Never fabricate or guess values. If a field (e.g., "po_number", "tax_rate", or "due_date") is not explicitly present on the document, return null.`;

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

    const orgCurrency = await getOrganizationCurrency();
    const { symbol } = getCurrencyDetails(orgCurrency);
    const extractionPrompt = getExtractionSystemPrompt(orgCurrency, symbol);

    const generationConfig: GenerationConfig = {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
                vendor: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: { type: SchemaType.STRING, description: "Official business name of the vendor/supplier receiving payment" },
                        tax_id: { type: SchemaType.STRING, description: "Vendor tax ID, VAT, GST, EIN, UEN, or registration number" },
                        address: { type: SchemaType.STRING, description: "Vendor physical or remittance address" },
                        email: { type: SchemaType.STRING, description: "Vendor support or billing email address" }
                    },
                    required: ["name"]
                },
                customer: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: { type: SchemaType.STRING, description: "Name of the client/customer being billed" },
                        tax_id: { type: SchemaType.STRING, description: "Customer tax or registration ID if stated" },
                        address: { type: SchemaType.STRING, description: "Customer billing or delivery address" }
                    }
                },
                invoice_details: {
                    type: SchemaType.OBJECT,
                    properties: {
                        invoice_number: { type: SchemaType.STRING, description: "Primary invoice or reference number, trimmed of leading symbols like # or colons" },
                        po_number: { type: SchemaType.STRING, description: "Purchase Order number if distinct from invoice number" },
                        issue_date: { type: SchemaType.STRING, description: "Normalized transaction or issue date in YYYY-MM-DD format" },
                        due_date: { type: SchemaType.STRING, description: "Normalized payment due date in YYYY-MM-DD format" },
                        document_type: {
                            type: SchemaType.STRING,
                            description: "Document classification: 'Invoice (Unpaid)', 'Invoice (Paid)', 'Tax Invoice', 'Receipt', 'Credit Note', or 'Purchase Order'"
                        },
                        currency: { type: SchemaType.STRING, description: `ISO 4217 3-letter currency code (e.g. ${orgCurrency}, USD, EUR, GBP, SGD). Default to ${orgCurrency} if unspecified.` }
                    },
                    required: ["document_type", "currency"]
                },
                financial_summary: {
                    type: SchemaType.OBJECT,
                    properties: {
                        subtotal: { type: SchemaType.NUMBER, description: "Subtotal before tax and discounts as float" },
                        tax_amount: { type: SchemaType.NUMBER, description: "Total tax/VAT/GST amount as float" },
                        tax_percentage: { type: SchemaType.NUMBER, description: "Tax rate percentage (e.g., 6.0, 10.0, 20.0)" },
                        discount_amount: { type: SchemaType.NUMBER, description: "Total discount amount applied" },
                        total_amount: { type: SchemaType.NUMBER, description: "Final net total amount payable" }
                    },
                    required: ["total_amount"]
                },
                line_items: {
                    type: SchemaType.ARRAY,
                    description: "Itemized line items from the document",
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            description: { type: SchemaType.STRING, description: "Description or product name" },
                            quantity: { type: SchemaType.NUMBER, description: "Quantity of items (default 1.0)" },
                            unit_price: { type: SchemaType.NUMBER, description: "Unit price before tax" },
                            amount: { type: SchemaType.NUMBER, description: "Total amount for this line item" }
                        },
                        required: ["description", "quantity", "unit_price", "amount"]
                    }
                }
            },
            required: ["vendor", "invoice_details", "financial_summary", "line_items"]
        }
    }

    try {
        let result;
        const maxRetries = 3;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Always use gemini-2.5-flash
                const modelName = "gemini-2.5-flash";
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig
                });

                // Pass system prompt and the document inline for extraction
                result = await model.generateContent([
                    extractionPrompt,
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

        const text = result.response.text();
        console.log("Parsing Gemini response...");
        const data = JSON.parse(text);
        console.log("Response parsed successfully. Line items count:", data.line_items?.length || 0);

        const supabase = await createClient();

        // 1. Normalize Extracted Values
        const vendorName = data.vendor?.name?.trim() || null;
        const totalAmount = typeof data.financial_summary?.total_amount === 'number'
            ? data.financial_summary.total_amount
            : parseFloat(data.financial_summary?.total_amount) || 0;
        const issueDate = data.invoice_details?.issue_date || null;
        const dueDate = data.invoice_details?.due_date || null;
        const invoiceNumber = data.invoice_details?.invoice_number ? String(data.invoice_details.invoice_number).trim() : null;
        const poNumber = data.invoice_details?.po_number ? String(data.invoice_details.po_number).trim() : null;

        // Normalize document_type to comply with database check constraint ('receipt' | 'invoice')
        const rawType = (data.invoice_details?.document_type || "").toLowerCase();
        const normalizedDocType = (rawType.includes("receipt") || rawType.includes("paid")) && !rawType.includes("unpaid")
            ? "receipt"
            : "invoice";

        // Normalize Line Items with UI compatibility (providing both total and amount)
        const normalizedLineItems = (data.line_items || []).map((item: any) => ({
            description: item.description || "",
            quantity: typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity) || 1,
            unit_price: typeof item.unit_price === 'number' ? item.unit_price : parseFloat(item.unit_price) || 0,
            total: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0,
            amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0,
        }));

        // 2. Vendor Association & Defaults
        let vendorId = null;
        let defaultCategoryId = null;
        let defaultFundId = null;

        if (vendorName) {
            const { data: existingVendor } = await supabase
                .from("vendors")
                .select("id, default_category_id, default_fund_id")
                .ilike("name", vendorName)
                .single();

            if (existingVendor) {
                vendorId = existingVendor.id;
                defaultCategoryId = existingVendor.default_category_id;
                defaultFundId = existingVendor.default_fund_id;
            } else {
                const organization_id = await getOrganizationId();
                const { data: newVendor } = await supabase
                    .from("vendors")
                    .insert({ name: vendorName, organization_id })
                    .select("id")
                    .single();

                if (newVendor) {
                    vendorId = newVendor.id;
                }
            }
        }

        let splits: any[] = [];
        if (defaultCategoryId || defaultFundId) {
            splits = [{
                amount: totalAmount,
                category_id: defaultCategoryId || null,
                fund_id: defaultFundId || null
            }];
        }

        const organization_id = await getOrganizationId();
        
        // 3. Duplicate Detection Logic
        let isDuplicate = false;
        const normalizedInv = typeof invoiceNumber === 'string' ? invoiceNumber.trim() : null;
        const hasValidInvoiceNumber = normalizedInv && normalizedInv.toLowerCase() !== "null";

        if (hasValidInvoiceNumber && vendorName) {
            // Condition A: Exact Invoice Number match for same vendor in org
            const { data: dupA } = await supabase
                .from("documents")
                .select("id")
                .eq("organization_id", organization_id)
                .ilike("vendor_name", vendorName)
                .eq("invoice_number", invoiceNumber)
                .neq("id", documentId)
                .limit(1);
                
            if (dupA && dupA.length > 0) {
                isDuplicate = true;
                console.log(`Duplicate detected via Condition A (Exact Invoice Number): ${invoiceNumber}`);
            }
        } else if (vendorName && issueDate && totalAmount > 0) {
            // Condition B: Composite match (Vendor + Date + Amount + Tax match)
            const { data: potentialDups } = await supabase
                .from("documents")
                .select("id, tax_amount")
                .eq("organization_id", organization_id)
                .ilike("vendor_name", vendorName)
                .eq("document_date", issueDate)
                .eq("amount", totalAmount)
                .neq("id", documentId);
                
            if (potentialDups && potentialDups.length > 0) {
                for (const dup of potentialDups) {
                    const taxAmt = data.financial_summary?.tax_amount;
                    const matchTax = taxAmt !== undefined && taxAmt !== null && dup.tax_amount !== null && Number(dup.tax_amount) === Number(taxAmt);
                    if (matchTax) {
                        isDuplicate = true;
                        console.log(`Duplicate detected via Condition B (Composite Match on Tax)`);
                        break;
                    }
                }
            }
        }

        // Check the extraction itself (not the AI's own opinion of it) and keep the reasons
        const numberOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        const assessment = assessExtraction({
            vendorName,
            total: totalAmount,
            subtotal: numberOrNull(data.financial_summary?.subtotal),
            tax: numberOrNull(data.financial_summary?.tax_amount),
            discount: numberOrNull(data.financial_summary?.discount_amount),
            issueDate,
            documentType: normalizedDocType,
            invoiceNumber,
            lineItems: normalizedLineItems,
            currency: data.invoice_details?.currency ?? null,
            baseCurrency: orgCurrency,
        });

        // 4. Update Document Record in Supabase
        await updateDocument(documentId, {
            vendor_name: vendorName,
            vendor_id: vendorId,
            amount: totalAmount,
            document_date: issueDate,
            due_date: dueDate,
            document_type: normalizedDocType,
            invoice_number: invoiceNumber,
            reference_number: poNumber || invoiceNumber,
            subtotal: data.financial_summary?.subtotal,
            tax_amount: data.financial_summary?.tax_amount,
            vendor_branch_or_location: data.vendor?.address || null,
            confidence_score: assessment.score,
            extraction_flags: assessment.flags,
            splits: splits.length > 0 ? splits : [],
            line_items: normalizedLineItems,
            status: isDuplicate ? "DUPLICATE_WARNING" : "needs_review"
        });

        return data;
    } catch (error: any) {
        console.error("CRITICAL error in extractDocumentData:", error);
        console.error("Error stack trace:", error.stack);
        try {
            await updateDocument(documentId, {
                status: "needs_review",
                vendor_name: "[Extraction Failed]",
                confidence_score: 0,
                extraction_flags: [{ code: "EXTRACTION_FAILED", message: "The AI could not read this document. Enter the details manually." }],
                notes: `AI Extraction Error: ${error.message}`
            });
        } catch (updateErr) {
            console.error("Failed to update status on error:", updateErr);
        }
        throw error;
    }
}
