const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// Manually parse .env.local because dotenv might be finicky with paths across drives
const envPath = 'e:/Fund Management/expense-dashboard/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const keyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
const key = keyMatch ? keyMatch[1].trim() : null;

async function test() {
    if (!key) {
        console.error("FATAL: Key not found in .env.local");
        return;
    }
    console.log("Found Key:", key.substring(0, 5) + "..." + key.substring(key.length - 5));

    const genAI = new GoogleGenerativeAI(key);
    const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro"];

    for (const modelName of modelsToTry) {
        console.log(`\nTesting model: ${modelName}...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Test");
            const response = await result.response;
            console.log(`SUCCESS [${modelName}]:`, response.text().substring(0, 20) + "...");
            return; // Exit if any works
        } catch (e) {
            console.error(`ERROR [${modelName}]:`, e.message);
        }
    }
}

test();
