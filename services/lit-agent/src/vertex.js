import {VertexAI} from "@google-cloud/vertexai";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || "us-central1";
const MODEL = process.env.VERTEXAI_MODEL || "gemini-1.5-pro";

const schema = {
  "type":"object",
  "properties":{
    "ok":{"type":"boolean"},
    "plan":{
      "type":"object",
      "properties":{
        "summary":{"type":"string"},
        "files_to_touch":{"type":"array","items":{"type":"string"}},
        "checks":{"type":"array","items":{"type":"string"}},
        "feature_flags":{"type":"array","items":{"type":"string"}},
        "est_changes":{"type":"object","properties":{"files":{"type":"number"},"loc":{"type":"number"}}},
        "risk_level":{"type":"string"},
        "next_actions":{"type":"array","items":{"type":"string"}}
      },
      "required":["summary","files_to_touch","checks","feature_flags","est_changes","risk_level","next_actions"]
    }
  },
  "required":["ok","plan"]
};

const SYSTEM_PROMPT = `
You are the LIT Dev Agent. Propose minimal, safe changes to the Logistics Intel repo.
Never push to main; PRs only (Phase 0 returns a Plan JSON only; no writes).
Respect allowlist and change budgets (≤12 files, ≤800 LOC).
Keep all search filters optional; no implicit defaults.
If SQL changes are proposed, plan for BigQuery DRY-RUN checks.
Browser endpoints must include OpenAPI updates + OPTIONS CORS preflights.
Always return: summary, files_to_touch, checks, feature_flags, est_changes, risk_level, next_actions.
Return strict JSON only.
`;

export async function generatePlan({message, context, preferences}) {
  const vertex = new VertexAI({project: PROJECT_ID, location: LOCATION});
  const model = vertex.getGenerativeModel({
    model: MODEL,
    systemInstruction: { parts: [{text: SYSTEM_PROMPT}] }
  });

  const input = {
    message,
    context,
    preferences
  };

  const generationConfig = {
    temperature: 0.25,
    maxOutputTokens: 1024,
    responseMimeType: "application/json",
    responseSchema: schema
  };

  const res = await model.generateContent({
    contents: [{role:"user", parts:[{text: JSON.stringify(input)}]}],
    generationConfig
  });

  const text = res.response?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {
      ok: true,
      plan: {
        summary: "Unable to parse model JSON; returning safe skeleton.",
        files_to_touch: [],
        checks: ["tsc","eslint","bq.dry_run","gateway.smoke","playwright.smoke"],
        feature_flags: [],
        est_changes: {files:0, loc:0},
        risk_level: "low",
        next_actions: ["await_approval"]
      }
    };
  }
  return parsed;
}