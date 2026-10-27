const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const fs = require('fs');

const envPath = 'e:/Fund Management/expense-dashboard/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const keyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
const key = keyMatch ? keyMatch[1].trim() : null;

async function test() {
    const genAI = new GoogleGenerativeAI(key);

    // 1. Test basic flash without schema
    try {
        const model1 = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        await model1.generateContent("Test");
        console.log("SUCCESS basic gemini-2.5-flash");
    } catch (e) {
        console.log("FAIL basic gemini-2.5-flash:", e.message);
    }

    // 2. Test basic pro without schema
    try {
        const model3 = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        await model3.generateContent("Test");
        console.log("SUCCESS basic gemini-1.5-pro");
    } catch (e) {
        console.log("FAIL basic gemini-1.5-pro:", e.message);
    }
}

test();
