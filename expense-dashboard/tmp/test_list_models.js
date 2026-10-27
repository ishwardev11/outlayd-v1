const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const https = require('https');

const envPath = 'e:/Fund Management/expense-dashboard/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const keyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
const key = keyMatch ? keyMatch[1].trim() : null;

async function listModels() {
    if (!key) {
        console.error("FATAL: Key not found");
        return;
    }

    console.log("Fetching models list using API Key starting with:", key.substring(0, 5));

    const url = `https://generativelanguage.googleapis.com/v1/models?key=${key}`;

    https.get(url, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                const data = JSON.parse(rawData);
                if (data.error) {
                    console.error("API Error:", data.error.message);
                    return;
                }
                let out = "Available models:\n";
                for (const model of data.models) {
                    if (model.supportedGenerationMethods.includes("generateContent")) {
                        out += ` - ${model.name}\n`;
                    }
                }
                fs.writeFileSync('e:/Fund Management/expense-dashboard/tmp/models.txt', out);
                console.log("Wrote to models.txt");
            } catch (e) {
                console.error("Parsing error:", e.message);
            }
        });
    }).on('error', (e) => {
        console.error("HTTP request error:", e.message);
    });
}

listModels();
