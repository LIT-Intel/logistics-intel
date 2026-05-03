// pulse-coach-classify — LLM-backed Pulse prompt classifier.
//
// Augments the client-side heuristic parser with a stronger structured
// extraction pass: pulls origins / destinations / industries / roles /
// products / quantity / direction / similar-to, plus a clarifying
// question when the prompt is ambiguous and 2-3 suggested refinements.
//
// Returns the same shape as the client-side parser so Pulse can
// merge / overlay results without a second adapter. Strict JSON
// schema response — model output is validated before return.
//
// Cost: ~200-400 tokens per call. We don't hard-cap here since the
// frontend debounces and caches per-query for 24h. Plan gating can
// be added later if usage spikes.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_COACH_MODEL")
  || Deno.env.get("OPENAI_MODEL")
  || "gpt-4.1-mini";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are Pulse Coach, a query-classifier for a B2B prospecting tool used by logistics and supply-chain professionals. You parse natural-language search prompts into structured entities so the search engine can apply real filters.

Rules:
- Be FAITHFUL to the user's prompt. Do not invent entities that aren't there.
- Distinguish ORIGINS from DESTINATIONS using prepositions (from/to, sourcing/shipping, exported-from/imported-to). Origins describe where goods come from; destinations describe where the target company is located OR where goods arrive.
- For "from X to Y" patterns: X is origin, Y is destination. The TARGET COMPANY lives in the destination, not the origin.
- US state codes (GA, CA, NY) are ISO 3166-2 — return the 2-letter code.
- Country codes are ISO 3166-1 alpha-2 (US, VN, CN, DE, etc.).
- If the prompt is ambiguous in a way a clarifying question would help, write ONE short question (under 100 chars). If unambiguous, leave clarifying_question empty.
- Suggest 2-3 refinements the user could try if results are too narrow or too broad. Keep each under 80 chars.
- Confidence: 0-1, how confident you are in the structured extraction.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "direction",
    "quantity",
    "products",
    "industries",
    "roles",
    "origins",
    "destinations",
    "similar_to",
    "clarifying_question",
    "suggested_refinements",
    "confidence",
  ],
  properties: {
    intent: {
      type: "string",
      enum: ["companies", "people", "industry", "lookalike", "unclear"],
    },
    direction: {
      type: ["string", "null"],
      enum: ["import", "export", "ship", null],
    },
    quantity: { type: ["integer", "null"] },
    products: { type: "array", items: { type: "string" } },
    industries: { type: "array", items: { type: "string" } },
    roles: { type: "array", items: { type: "string" } },
    origins: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "code", "kind"],
        properties: {
          name: { type: "string" },
          code: { type: "string" },
          kind: { type: "string", enum: ["country", "us_state", "metro"] },
        },
      },
    },
    destinations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "code", "kind"],
        properties: {
          name: { type: "string" },
          code: { type: "string" },
          kind: { type: "string", enum: ["country", "us_state", "metro"] },
        },
      },
    },
    similar_to: { type: ["string", "null"] },
    clarifying_question: { type: ["string", "null"] },
    suggested_refinements: {
      type: "array",
      items: { type: "string" },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (!OPENAI_API_KEY) {
    return jsonResponse(
      { ok: false, code: "NOT_CONFIGURED", message: "OPENAI_API_KEY missing." },
      500,
    );
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: "INVALID_JSON" }, 400);
  }

  const query = String(body?.query || "").trim();
  if (!query) {
    return jsonResponse(
      { ok: false, code: "EMPTY_QUERY", message: "query is required." },
      400,
    );
  }
  if (query.length > 500) {
    return jsonResponse(
      { ok: false, code: "QUERY_TOO_LONG", message: "Max 500 chars." },
      400,
    );
  }

  const t0 = Date.now();
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Classify this prompt: ${query}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pulse_coach_classification",
            schema: RESPONSE_SCHEMA,
            strict: true,
          },
        },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("[pulse-coach-classify] OpenAI error", data);
      return jsonResponse(
        {
          ok: false,
          code: "PROVIDER_ERROR",
          message: data?.error?.message || `OpenAI HTTP ${resp.status}`,
        },
        502,
      );
    }

    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) {
      return jsonResponse(
        { ok: false, code: "EMPTY_RESPONSE", message: "No content from model." },
        502,
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonResponse(
        { ok: false, code: "PARSE_ERROR", message: "Model returned non-JSON." },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      query,
      classification: parsed,
      model: OPENAI_MODEL,
      elapsed_ms: Date.now() - t0,
      token_usage: data.usage || null,
    });
  } catch (err) {
    console.error("[pulse-coach-classify] fatal", err);
    return jsonResponse(
      {
        ok: false,
        code: "FATAL",
        message: (err as Error)?.message || "Unexpected error",
      },
      500,
    );
  }
});
