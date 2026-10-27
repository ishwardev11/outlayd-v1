const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const fs = require('fs');

const envPath = 'e:/Fund Management/expense-dashboard/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const keyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
const key = keyMatch ? keyMatch[1].trim() : null;

async function test() {
    const genAI = new GoogleGenerativeAI(key);
    // Exact model definition from ai.ts
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
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
                        description: "Categorize as a receipt (proof of payment) or invoice (request for payment). Must be exactly 'receipt' or 'invoice'."
                    },
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
    });

    try {
        console.log("Generating content with schema...");
        const result = await model.generateContent("Create a fictional receipt.");
        console.log("SUCCESS:", result.response.text());
    } catch (e) {
        console.error("FAILURE:", e);
    }
}

test();
