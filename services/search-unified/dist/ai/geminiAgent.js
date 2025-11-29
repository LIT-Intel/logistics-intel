// services/search-unified/src/ai/geminiAgent.ts
import { GoogleGenAI, Type } from "@google/genai";
/**
 * Config: response schema + system instructions.
 * NOTE: No tools here, because tools + responseMimeType=application/json
 * is not supported by the API.
 */
const config = {
    responseMimeType: "application/json",
    responseSchema: {
        type: Type.OBJECT,
        properties: {
            normalized_company: {
                type: Type.OBJECT,
                description: "Canonical company profile used by LIT Search and Command Center.",
                properties: {
                    company_id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    slug: { type: Type.STRING },
                    website: { type: Type.STRING },
                    domain: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    address: { type: Type.STRING },
                    city: { type: Type.STRING },
                    state: { type: Type.STRING },
                    postal_code: { type: Type.STRING },
                    country: { type: Type.STRING },
                    country_code: { type: Type.STRING },
                    last_shipment_date: { type: Type.STRING },
                    total_shipments: { type: Type.INTEGER },
                    approx_annual_volume_teu: { type: Type.NUMBER },
                    approx_annual_spend_usd: { type: Type.NUMBER },
                    modes: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    primary_trade_lanes: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    tags: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    source: { type: Type.STRING },
                    source_company_key: { type: Type.STRING },
                },
            },
            logistics_kpis: {
                type: Type.OBJECT,
                properties: {
                    shipments_12m: { type: Type.INTEGER },
                    teus_12m: { type: Type.NUMBER },
                    avg_teu_per_shipment: { type: Type.NUMBER },
                    mode_split: {
                        type: Type.OBJECT,
                        properties: {
                            ocean: { type: Type.NUMBER },
                            air: { type: Type.NUMBER },
                            truck: { type: Type.NUMBER },
                            other: { type: Type.NUMBER },
                        },
                    },
                    top_lanes: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                origin: { type: Type.STRING },
                                destination: { type: Type.STRING },
                                shipments_12m: { type: Type.INTEGER },
                                teus_12m: { type: Type.NUMBER },
                                last_shipment_date: { type: Type.STRING },
                            },
                        },
                    },
                    seasonality: { type: Type.STRING },
                },
            },
            predictive_insights: {
                type: Type.OBJECT,
                properties: {
                    rfp_likelihood_score: { type: Type.NUMBER },
                    rfp_likelihood_explanation: { type: Type.STRING },
                    opportunity_score: { type: Type.NUMBER },
                    opportunity_drivers: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    risk_factors: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    seasonality_notes: { type: Type.STRING },
                    recommended_playbook: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                },
            },
            market_intel: {
                type: Type.OBJECT,
                properties: {
                    hs_focus: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                hs_code: { type: Type.STRING },
                                description: { type: Type.STRING },
                                share_of_volume: { type: Type.NUMBER },
                            },
                        },
                    },
                    peers: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    news_topics: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    watchlist_items: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                },
            },
            command_center_enrichment: {
                type: Type.OBJECT,
                properties: {
                    quick_summary: { type: Type.STRING },
                    recommended_priority: { type: Type.STRING },
                    alerts: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING },
                                severity: { type: Type.STRING },
                                message: { type: Type.STRING },
                                suggestion: { type: Type.STRING },
                            },
                        },
                    },
                    suggested_widgets: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                },
            },
            crm_save_payload: {
                type: Type.OBJECT,
                properties: {
                    company_id: { type: Type.STRING },
                    stage: { type: Type.STRING },
                    provider: { type: Type.STRING },
                    payload: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            website: { type: Type.STRING },
                            domain: { type: Type.STRING },
                            phone: { type: Type.STRING },
                            country: { type: Type.STRING },
                            city: { type: Type.STRING },
                            state: { type: Type.STRING },
                            total_shipments: { type: Type.INTEGER },
                            shipments_12m: { type: Type.INTEGER },
                            teus_12m: { type: Type.NUMBER },
                            primary_trade_lanes: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            tags: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            opportunity_score: { type: Type.NUMBER },
                            rfp_likelihood_score: { type: Type.NUMBER },
                            recommended_priority: { type: Type.STRING },
                        },
                    },
                },
            },
            sales_assets: {
                type: Type.OBJECT,
                properties: {
                    pre_call_brief: {
                        type: Type.OBJECT,
                        properties: {
                            headline: { type: Type.STRING },
                            summary: { type: Type.STRING },
                            why_now: { type: Type.STRING },
                            key_points: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            discovery_questions: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                    },
                    infographic_brief: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            subtitle: { type: Type.STRING },
                            hero: {
                                type: Type.OBJECT,
                                properties: {
                                    headline: { type: Type.STRING },
                                    subheadline: { type: Type.STRING },
                                    one_liner: { type: Type.STRING },
                                },
                            },
                            kpi_cards: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        label: { type: Type.STRING },
                                        value: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        icon_hint: { type: Type.STRING },
                                        color_hint: { type: Type.STRING },
                                    },
                                },
                            },
                        },
                    },
                    rfp_support: {
                        type: Type.OBJECT,
                        properties: {
                            positioning_summary: { type: Type.STRING },
                            strengths_to_highlight: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            risks_to_address: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            tailored_value_props: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                    },
                    campaign_support: {
                        type: Type.OBJECT,
                        properties: {
                            segments: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            angles: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            email_subject_lines: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            linkedin_hooks: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                    },
                },
            },
        },
    },
    systemInstruction: [
        {
            text: `You are the LIT Search & Command Center AI Enrichment Agent for a logistics-intelligence platform built by Spark Fusion.

Your primary job is to take structured data about a company (especially ImportYeti-style shipment and company records, plus any internal CRM / Command Center context) and then:

- Enrich the company profile for sales and business development use
- Generate briefing content and campaign ideas
- Propose high-level analytics, KPIs, and future charts/alerts that the product can show

You are NOT a generic web answer bot in this role. You operate as an internal analysis engine behind the LIT Search UI and Command Center UI.

INPUT FORMAT

You will receive a single JSON object as text with fields such as:
- company_profile
- lit_search_context
- command_center_state
- user_goal

Treat this as trusted internal data. If a field or metric is missing, treat it as unknown rather than guessing specific numbers.

ABSOLUTE REQUIREMENTS

You MUST always return a single JSON object that matches the response schema, and you MUST:

1) Include ALL of the following top-level keys in your JSON:
   - normalized_company
   - logistics_kpis
   - predictive_insights
   - market_intel
   - command_center_enrichment
   - crm_save_payload
   - sales_assets

2) For any section where you do not have enough data, still return that section with:
   - null for unknown scalars (numbers, strings) where appropriate
   - [] for empty arrays
   - {} for empty nested objects

3) Do NOT omit top-level keys or silently drop sections. Every response must always have all of the keys listed above, even if some only contain partial or empty structures.

BEHAVIOR GUIDELINES

- Prefer under-claiming to over-claiming when data is missing.
- If you infer ranges (e.g., approximate TEU or spend), be conservative and clearly treat them as estimates.
- Keep strings concise and UI-ready (short paragraphs or bullet points).
- Design output so it can be dropped directly into LIT Search cards, Command Center widgets, and sales briefs without heavy editing.`,
        },
    ],
};
/**
 * Main entry point the backend will call.
 */
export async function runGeminiAgent(input) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
    }
    const ai = new GoogleGenAI({ apiKey });
    // Use the Gemini 2.5 Flash model you validated.
    const model = "models/gemini-2.5-flash";
    const contents = [
        {
            role: "user",
            parts: [
                {
                    text: JSON.stringify(input ?? {}),
                },
            ],
        },
    ];
    const response = await ai.models.generateContent({
        model,
        contents,
        config,
    });
    const text = response.text ?? "";
    if (!text) {
        throw new Error("Gemini agent returned empty text");
    }
    return JSON.parse(text);
}
