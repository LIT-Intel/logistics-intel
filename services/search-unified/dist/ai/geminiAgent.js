import { GoogleGenerativeAI } from "@google/generative-ai";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";
const MODEL = "gemini-2.5-flash";
let client = null;
function ensureClient() {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY) is not configured");
    }
    if (!client) {
        client = new GoogleGenerativeAI(GEMINI_API_KEY);
    }
    return client;
}
function buildPrompt(input) {
    const json = JSON.stringify(input ?? {}, null, 2);
    return [
        "You are the LIT Search AI enrichment agent. Analyze the provided ImportYeti company profile, logistics context, and command center state. Produce a JSON object with the shape:",
        "",
        "{",
        '  "normalized_company": {',
        '    "name": string, "website": string | null, "domain": string | null, "phone": string | null, "hq": string | null',
        "  },",
        '  "logistics_kpis": {',
        '    "shipments_12m": number | null, "teus_12m": number | null, "est_spend_usd": number | null, "top_lanes": Array<{ lane: string, mode?: "FCL" | "LCL", shipments_12m?: number, fcl_shipments?: number, lcl_shipments?: number }>, "normalized_monthly": Array<{ month: string, fcl_shipments?: number, lcl_shipments?: number }>',
        "  },",
        '  "crm_save_payload": { company_id: string, title: string, website?: string | null, phone?: string | null, payload: Record<string, any> },',
        '  "command_center_enrichment": Record<string, any>',
        "}",
        "",
        "Always respond with valid JSON. If data is unavailable, use nulls instead of prose.",
        "",
        "Input:",
        json,
    ].join("\n");
}
export async function runGeminiAgent(input) {
    const ai = ensureClient();
    const prompt = buildPrompt(input);
    const maybeNextGen = ai;
    const contents = [
        {
            role: "user",
            parts: [{ text: prompt }],
        },
    ];
    const config = {
        temperature: 0.25,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2048,
    };
    let response;
    if (maybeNextGen.models?.generateContent) {
        response = await maybeNextGen.models.generateContent({
            model: MODEL,
            contents,
            config,
        });
    }
    else {
        const modelClient = ai.getGenerativeModel({ model: MODEL });
        response = await modelClient.generateContent({
            contents,
            generationConfig: config,
        });
    }
    const text = typeof response?.response?.text === "function"
        ? response.response.text()
        : String(response?.response?.text ?? "");
    if (!text || !text.trim()) {
        throw new Error("Gemini returned an empty response");
    }
    try {
        return JSON.parse(text);
    }
    catch (err) {
        throw new Error(`Gemini response could not be parsed as JSON: ${err.message}`);
    }
}
