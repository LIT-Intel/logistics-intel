// pulse-explore-parse — NL query → Pulse Explorer filter object.
//
// Purpose-built for the Explorer's filter taxonomy (industry, geo region,
// opportunity types, freshness, workflow, dataset, size ranges). Distinct
// from the larger pulse-search parser which feeds the Search tab.
//
// Auth: Bearer <user JWT>. Body: { query: string }
// Returns: { ok, parsed: ExplorerFilters, model, confidence }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const REGION_KEYS = ["southeast","west_coast","northeast","midwest","southwest","mountain"] as const;
const OPPORTUNITY_KEYS = ["consolidation","vulnerable","velocity","defend"] as const;
const FRESHNESS_KEYS = ["live","saved","directory","stale"] as const;
const DATASET_KEYS = ["directory_only","live_only","all"] as const;

type ExplorerFilters = {
  query: string;
  // Free-text company-name substring. Populated when the user appears
  // to be looking up a specific brand (e.g. "Walmart", "Tesla", "Q
  // Cells US"). Maps to lit_company_directory.company_name ILIKE
  // and lit_companies.name ILIKE on the backend.
  name: string;
  industry: string[];
  geo: {
    // Multi-region: "west coast and southeast" → ["west_coast","southeast"].
    // Kept as an array so combined-region searches work; the backend
    // expands every entry to its US-state list and unions the results.
    regions: typeof REGION_KEYS[number][];
    states: string[];
    countries: string[];
  };
  size: {
    teu_min: number | null;
    teu_max: number | null;
    shipments_min: number | null;
    shipments_max: number | null;
    spend_min: number | null;
    spend_max: number | null;
  };
  opportunity_types: typeof OPPORTUNITY_KEYS[number][];
  freshness_state: typeof FRESHNESS_KEYS[number][];
  workflow_state: string[];
  dataset_filter: typeof DATASET_KEYS[number];
  confidence: number;
};

const PROMPT = `You convert a freight-sales user's natural-language query into a structured Pulse Explorer filter JSON object.

Output ONLY valid JSON — no prose, no markdown fences — matching this schema:

{
  "query": string,
  "name": string,
  "industry": string[],
  "geo": {
    "regions": ("southeast" | "west_coast" | "northeast" | "midwest" | "southwest" | "mountain")[],
    "states": string[],
    "countries": string[]
  },
  "size": {
    "teu_min": number | null,
    "teu_max": number | null,
    "shipments_min": number | null,
    "shipments_max": number | null,
    "spend_min": number | null,
    "spend_max": number | null
  },
  "opportunity_types": ("consolidation" | "vulnerable" | "velocity" | "defend")[],
  "freshness_state": ("live" | "saved" | "directory" | "stale")[],
  "workflow_state": string[],
  "dataset_filter": "directory_only" | "live_only" | "all",
  "confidence": number
}

NAME — populate with a company brand/name when the query looks like a
specific company lookup ("Walmart", "Tesla", "Q Cells US", "Apple Inc",
"Maersk", "the Coca-Cola Company"). Strip filler words ("show me",
"find", "search for", "lookup", "the", "Inc", "LLC", "Corp") but keep
proper-noun structure. If the query is clearly NOT a brand lookup
(e.g. "vulnerable incumbents in texas"), leave "name" as "".

REGIONS — populate `geo.regions` with ONE OR MORE region keys. Combine
when the user mentions multiple ("west coast and southeast" →
["west_coast","southeast"]). Use empty array `[]` when no region is
mentioned. Mapping:
- "southeast" / "south east US" → "southeast"
- "west coast" / "pacific" → "west_coast"
- "northeast" / "new england" → "northeast"
- "midwest" → "midwest"
- "southwest" / "texas/oklahoma" → "southwest"
- "rockies" / "mountain west" → "mountain"

STATES — populate geo.states as 2-letter USPS codes (CA, TX, etc) when explicitly mentioned.

INDUSTRY — extract any industry/vertical from V6 taxonomy:
- "manufacturing", "manufacturer", "factory" → ["Manufacturing"]
- "retail", "retailer" → ["Retail"]
- "auto" / "automotive" → ["Manufacturing"] (vertical: Automotive)
- "food and beverage" / "food" → ["Food Manufacturing"]
- "electronics" → ["Electronics Manufacturing"]
- "healthcare" / "medical" → ["Healthcare Services"]
- "tech" / "software" → ["Software", "Technology"]
- "wholesale" → ["Wholesale"]
- "construction" → ["Construction"]
- "energy" / "oil & gas" → ["Energy"]
- "transportation" / "logistics" / "freight" → ["Transportation", "Logistics"]

OPPORTUNITY_TYPES — set when the user explicitly asks for one of these sales angles:
- "consolidation" / "multi-forwarder" / "spread across forwarders" → ["consolidation"]
- "vulnerable" / "vulnerable incumbent" / "weak incumbent" / "incumbent slipping" → ["vulnerable"]
- "high velocity" / "high-velocity" / "big shippers" / "top movers" → ["velocity"]
- "defend" / "defend my book" / "my accounts" / "in my pulse list" → ["defend"]
- multiple if mentioned together

FRESHNESS_STATE — set when the user mentions data recency:
- "live data" / "recently refreshed" → ["live"]
- "saved" / "in my CRM" → ["saved"]
- "directory" / "from the seed list" / "haven't been refreshed" → ["directory"]
- "stale" / "needs refresh" / "old data" → ["stale"]

WORKFLOW_STATE — leave empty array unless user mentions a list explicitly. Free-text values OK.

DATASET_FILTER — default "all":
- "live data only" / "from CRM only" → "live_only"
- "directory only" / "from seed list only" → "directory_only"
- otherwise → "all"

SIZE — set numeric ranges when mentioned:
- "above 5k TEU" → teu_min: 5000
- "under $1M spend" → spend_max: 1000000

CONFIDENCE — 0.0 to 1.0 estimate of parse quality.

EXAMPLES:

"Walmart" →
{"query":"Walmart","name":"Walmart","industry":[],"geo":{"regions":[],"states":[],"countries":[]},"size":{"teu_min":null,"teu_max":null,"shipments_min":null,"shipments_max":null,"spend_min":null,"spend_max":null},"opportunity_types":[],"freshness_state":[],"workflow_state":[],"dataset_filter":"all","confidence":0.95}

"show me Q Cells" →
{"query":"show me Q Cells","name":"Q Cells","industry":[],"geo":{"regions":[],"states":[],"countries":[]},"size":{"teu_min":null,"teu_max":null,"shipments_min":null,"shipments_max":null,"spend_min":null,"spend_max":null},"opportunity_types":[],"freshness_state":[],"workflow_state":[],"dataset_filter":"all","confidence":0.9}

"vulnerable incumbents in the southeast" →
{"query":"vulnerable incumbents in the southeast","name":"","industry":[],"geo":{"regions":["southeast"],"states":[],"countries":[]},"size":{"teu_min":null,"teu_max":null,"shipments_min":null,"shipments_max":null,"spend_min":null,"spend_max":null},"opportunity_types":["vulnerable"],"freshness_state":[],"workflow_state":[],"dataset_filter":"all","confidence":0.95}

"high-velocity manufacturers in california above 5000 TEU" →
{"query":"high-velocity manufacturers in california above 5000 TEU","name":"","industry":["Manufacturing"],"geo":{"regions":[],"states":["CA"],"countries":[]},"size":{"teu_min":5000,"teu_max":null,"shipments_min":null,"shipments_max":null,"spend_min":null,"spend_max":null},"opportunity_types":["velocity"],"freshness_state":[],"workflow_state":[],"dataset_filter":"all","confidence":0.92}

"consolidation candidates with stale data, defend & grow my book" →
{"query":"consolidation candidates with stale data, defend & grow my book","name":"","industry":[],"geo":{"regions":[],"states":[],"countries":[]},"size":{"teu_min":null,"teu_max":null,"shipments_min":null,"shipments_max":null,"spend_min":null,"spend_max":null},"opportunity_types":["consolidation","defend"],"freshness_state":["stale"],"workflow_state":[],"dataset_filter":"all","confidence":0.9}

"automotive companies in the west coast and southeast" →
{"query":"automotive companies in the west coast and southeast","name":"","industry":["Manufacturing"],"geo":{"regions":["west_coast","southeast"],"states":[],"countries":[]},"size":{"teu_min":null,"teu_max":null,"shipments_min":null,"shipments_max":null,"spend_min":null,"spend_max":null},"opportunity_types":[],"freshness_state":[],"workflow_state":[],"dataset_filter":"all","confidence":0.92}

"food and beverage importers in texas with live data" →
{"query":"food and beverage importers in texas with live data","name":"","industry":["Food Manufacturing"],"geo":{"regions":[],"states":["TX"],"countries":[]},"size":{"teu_min":null,"teu_max":null,"shipments_min":null,"shipments_max":null,"spend_min":null,"spend_max":null},"opportunity_types":[],"freshness_state":["live"],"workflow_state":[],"dataset_filter":"all","confidence":0.9}

If query is gibberish or empty → return defaults with confidence < 0.3.
`;

function defaults(query: string): ExplorerFilters {
  return {
    query,
    name: "",
    industry: [],
    geo: { regions: [], states: [], countries: [] },
    size: { teu_min: null, teu_max: null, shipments_min: null, shipments_max: null, spend_min: null, spend_max: null },
    opportunity_types: [],
    freshness_state: [],
    workflow_state: [],
    dataset_filter: "all",
    confidence: 0,
  };
}

function sanitize(raw: any, query: string): ExplorerFilters {
  const out = defaults(query);
  if (!raw || typeof raw !== "object") return out;
  out.query = typeof raw.query === "string" ? raw.query : query;
  if (typeof raw.name === "string") out.name = raw.name.trim().slice(0, 200);
  if (Array.isArray(raw.industry)) out.industry = raw.industry.filter((s: any) => typeof s === "string" && s);
  if (raw.geo && typeof raw.geo === "object") {
    // Accept both new-shape (regions: string[]) and legacy single
    // `region` field so older clients don't break.
    if (Array.isArray(raw.geo.regions)) {
      out.geo.regions = raw.geo.regions.filter((v: any) => REGION_KEYS.includes(v));
    } else if (typeof raw.geo.region === "string" && REGION_KEYS.includes(raw.geo.region)) {
      out.geo.regions = [raw.geo.region];
    }
    if (Array.isArray(raw.geo.states)) out.geo.states = raw.geo.states.map((s: any) => String(s).toUpperCase()).filter(Boolean);
    if (Array.isArray(raw.geo.countries)) out.geo.countries = raw.geo.countries.filter((s: any) => typeof s === "string" && s);
  }
  if (raw.size && typeof raw.size === "object") {
    for (const k of ["teu_min","teu_max","shipments_min","shipments_max","spend_min","spend_max"] as const) {
      const v = raw.size[k];
      if (typeof v === "number" && Number.isFinite(v)) (out.size as any)[k] = v;
    }
  }
  if (Array.isArray(raw.opportunity_types)) {
    out.opportunity_types = raw.opportunity_types.filter((v: any) => OPPORTUNITY_KEYS.includes(v));
  }
  if (Array.isArray(raw.freshness_state)) {
    out.freshness_state = raw.freshness_state.filter((v: any) => FRESHNESS_KEYS.includes(v));
  }
  if (Array.isArray(raw.workflow_state)) {
    out.workflow_state = raw.workflow_state.filter((s: any) => typeof s === "string" && s);
  }
  if (DATASET_KEYS.includes(raw.dataset_filter)) out.dataset_filter = raw.dataset_filter;
  if (typeof raw.confidence === "number") out.confidence = Math.max(0, Math.min(1, raw.confidence));
  return out;
}

async function parseWithGemini(query: string): Promise<{ parsed: ExplorerFilters; model: string } | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${PROMPT}\n\nUser query: ${query}` }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const raw = JSON.parse(cleaned);
    return { parsed: sanitize(raw, query), model: "gemini-2.0-flash-exp" };
  } catch (err) {
    console.warn("[pulse-explore-parse] gemini failed", String(err));
    return null;
  }
}

async function parseWithOpenAI(query: string): Promise<{ parsed: ExplorerFilters; model: string } | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: query },
        ],
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content ?? "";
    const raw = JSON.parse(text);
    return { parsed: sanitize(raw, query), model: "gpt-4o-mini" };
  } catch (err) {
    console.warn("[pulse-explore-parse] openai failed", String(err));
    return null;
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ ok: false, error: "supabase_env_missing" }, 500);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user?.id) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  } catch {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  let body: { query?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const query = (body.query ?? "").trim();
  if (!query) return jsonResponse({ ok: true, parsed: defaults(""), model: "noop", confidence: 0 });

  const gemini = await parseWithGemini(query);
  if (gemini && gemini.parsed.confidence >= 0.4) {
    return jsonResponse({ ok: true, parsed: gemini.parsed, model: gemini.model });
  }
  const openai = await parseWithOpenAI(query);
  if (openai) {
    return jsonResponse({ ok: true, parsed: openai.parsed, model: openai.model });
  }
  if (gemini) {
    return jsonResponse({ ok: true, parsed: gemini.parsed, model: gemini.model });
  }
  return jsonResponse({ ok: true, parsed: defaults(query), model: "fallback" });
});
