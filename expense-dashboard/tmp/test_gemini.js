const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: 'e:/Fund Management/expense-dashboard/.env.local' });

async function test() {
    console.log("Testing Gemini API...");
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No API key found in .env.local");
        return;
    }
    console.log("Using API Key starting with:", key.substring(0, 8));

    const genAI = new GoogleGenerativeAI(key);

    try {
        console.log("Listing models...");
        // The SDK might not have a direct listModels, so we try a simple generation with a known model
        // but let's try to see if we can get a list via the underlying API if possible
        // Actually, let's just try 'gemini-pro' as a fallback test
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello?");
        console.log("Response:", result.response.text());
    } catch (e) {
        console.error("Error details:", e.message);
        if (e.message.includes("404")) {
            console.log("Model not found. Trying 'gemini-pro'...");
            try {
                const proModel = genAI.getGenerativeModel({ model: "gemini-pro" });
                const proResult = await proModel.generateContent("Hello?");
                console.log("Pro Response:", proResult.response.text());
            } catch (proE) {
                console.error("Pro Error:", proE.message);
            }
        }
    }
}

test();
