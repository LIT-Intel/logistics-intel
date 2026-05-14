// pulse-search v1 — unified natural-language search pipeline for LIT.
//
// Architecture:
//   1. Parse query → structured intent (Gemini Flash, OpenAI fallback)
//   2. Search saved/internal companies (lit_saved_companies, lit_companies)
//   3. Search lit_company_directory (Panjiva / ImportYeti BOL data)
//   4. Search Apollo (when slot-based routing requires it AND user has quota)
//   5. Normalize all three into PulseCompanyResult shape
//   6. Dedup by canonical_company_key (domain → name+state → address)
//   7. Rank by intent fit + source confidence + data completeness
//   8. Log telemetry to lit_pulse_search_events
//
// Auth: requires Authorization: Bearer <user_jwt>. Server-side service
// role is used for elevated reads (entitlements, daily Apollo cap).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// ─────────────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";
const APOLLO_API_BASE =
  Deno.env.get("APOLLO_API_BASE") || "https://api.apollo.io";

// ─────────────────────────────────────────────────────────────────────
// Apollo daily caps by plan
// ─────────────────────────────────────────────────────────────────────
const APOLLO_DAILY_CAP: Record<string, number> = {
  free_trial: 10,
  starter: 25,
  growth: 100,
  scale: 500,
  enterprise: 5000,
};

// ─────────────────────────────────────────────────────────────────────
// Intent schema (parser output)
// ─────────────────────────────────────────────────────────────────────
type ParsedIntent = {
  raw_query: string;
  intent: "find_companies" | "find_contacts" | "ask_question";
  audience_type: string[];
  industry_terms: string[];
  service_terms: string[];
  geo: {
    region: string | null;
    states: string[];
    metros: string[];
    cities: string[];
    postal_codes: string[];
    countries: string[];
    ports: string[];
  };
  size: {
    employee_min: number | null;
    employee_max: number | null;
    revenue_min_usd: number | null;
    revenue_max_usd: number | null;
  };
  shipment_filters: {
    shipments_min: number | null;
    shipments_max: number | null;
    teu_min: number | null;
    teu_max: number | null;
    containerization: "FCL" | "LCL" | "any" | null;
    recent_activity_days: number | null;
  } | null;
  trade_filters: {
    origin_country: string | null;
    origin_port: string | null;
    destination_country: string | null;
    destination_port: string | null;
    destination_region: string | null;
    hs_codes: string[];
    hs_chapters: string[];
    commodities: string[];
  } | null;
  contact_filters: {
    titles: string[];
    seniority: string[];
  } | null;
  exclusions: string[];
  needs_apollo: boolean;
  needs_shipment_data: boolean;
  confidence: number;
};

type PulseCompanyResult = {
  id?: string | null;
  source: "saved" | "lit_company_directory" | "apollo" | "merged";
  source_company_key?: string | null;
  canonical_company_key?: string | null;
  company_name: string;
  website?: string | null;
  domain?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  industry?: string | null;
  trade_roles?: string | null;
  employee_count?: number | string | null;
  revenue?: number | string | null;
  linkedin_url?: string | null;
  description?: string | null;
  shipment_metrics?: {
    shipments?: number | null;
    teu?: number | null;
    lcl?: number | null;
    value_usd?: number | null;
    last_shipment_date?: string | null;
  } | null;
  matched_reasons: string[];
  confidence_score: number;
  can_enrich_contacts: boolean;
  can_add_to_campaign: boolean;
  can_open_profile: boolean;
};

// ─────────────────────────────────────────────────────────────────────
// Region / metro lookups (deterministic post-parse expansion)
// ─────────────────────────────────────────────────────────────────────
const REGION_STATES: Record<string, string[]> = {
  southeast: [
    "Georgia", "Florida", "Alabama", "South Carolina",
    "North Carolina", "Tennessee", "Mississippi",
  ],
  "west coast": ["California", "Oregon", "Washington"],
  northeast: [
    "New York", "New Jersey", "Pennsylvania", "Massachusetts",
    "Connecticut", "Rhode Island", "Vermont", "New Hampshire", "Maine",
  ],
  midwest: [
    "Illinois", "Indiana", "Ohio", "Michigan", "Wisconsin",
    "Minnesota", "Iowa", "Missouri", "Kansas", "Nebraska",
    "North Dakota", "South Dakota",
  ],
  southwest: ["Texas", "Arizona", "New Mexico", "Oklahoma", "Nevada"],
  "mountain west": [
    "Colorado", "Utah", "Idaho", "Montana", "Wyoming", "Nevada", "New Mexico",
  ],
};

const METRO_CITIES: Record<string, string[]> = {
  atlanta: [
    "Atlanta", "Marietta", "Smyrna", "Alpharetta", "Norcross",
    "Tucker", "Duluth", "Lawrenceville", "McDonough", "Sandy Springs",
  ],
  dallas: ["Dallas", "Fort Worth", "Irving", "Plano", "Arlington", "Grapevine"],
  "dallas-fort worth": ["Dallas", "Fort Worth", "Irving", "Plano", "Arlington", "Grapevine"],
  miami: ["Miami", "Doral", "Medley", "Hialeah", "Fort Lauderdale"],
  "los angeles": ["Los Angeles", "Long Beach", "Carson", "Torrance", "Compton", "Ontario"],
  "new york": ["New York", "Newark", "Elizabeth", "Jersey City"],
  chicago: ["Chicago", "Elk Grove Village", "Schaumburg", "Naperville"],
  houston: ["Houston", "Pasadena", "Baytown"],
  savannah: ["Savannah", "Pooler", "Garden City"],
  charleston: ["Charleston", "North Charleston"],
};

const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

// ─────────────────────────────────────────────────────────────────────
// Parser system prompt
// ─────────────────────────────────────────────────────────────────────
const PARSER_SYSTEM_PROMPT = `You are LIT's freight-sales search parser. Convert a user's natural-language query into a structured JSON intent.

Output ONLY valid JSON matching this schema — no prose, no markdown fences:

{
  "raw_query": string,
  "intent": "find_companies" | "find_contacts" | "ask_question",
  "audience_type": string[],
  "industry_terms": string[],
  "service_terms": string[],
  "geo": {
    "region": string|null, "states": string[], "metros": string[],
    "cities": string[], "postal_codes": string[],
    "countries": string[], "ports": string[]
  },
  "size": {
    "employee_min": number|null, "employee_max": number|null,
    "revenue_min_usd": number|null, "revenue_max_usd": number|null
  },
  "shipment_filters": {
    "shipments_min": number|null, "shipments_max": number|null,
    "teu_min": number|null, "teu_max": number|null,
    "containerization": "FCL"|"LCL"|"any"|null,
    "recent_activity_days": number|null
  } | null,
  "trade_filters": {
    "origin_country": string|null, "origin_port": string|null,
    "destination_country": string|null, "destination_port": string|null,
    "destination_region": string|null,
    "hs_codes": string[], "hs_chapters": string[], "commodities": string[]
  } | null,
  "contact_filters": { "titles": string[], "seniority": string[] } | null,
  "exclusions": string[],
  "needs_apollo": boolean,
  "needs_shipment_data": boolean,
  "confidence": number
}

TAG REGISTRY for audience_type (use only these):
importer, exporter, consignee, shipper,
freight_broker, freight_forwarder, customs_broker, nvocc,
carrier, truckload_carrier, ltl_carrier, drayage_carrier, last_mile_carrier,
3pl, 4pl, warehouse, fulfillment_provider, distribution_center,
cold_chain_provider, cold_storage_provider, hazmat_provider,
manufacturer, distributor, wholesaler, retailer, dtc_brand.

GEOGRAPHY RULES:
- "Southeast" → region:"Southeast" (states resolved server-side)
- "West Coast" / "Northeast" / "Midwest" / "Southwest" / "Mountain West" → set region
- Metros: "Atlanta", "Dallas-Fort Worth", "Miami", "Los Angeles", "New York", "Chicago", "Houston", "Savannah", "Charleston" → metros[]
- ZIP/postal: "zip 30328" / "near 30346" → postal_codes
- Country phrases like "Vietnam to Savannah" → trade_filters.origin_country="Vietnam", trade_filters.destination_port="Savannah"

SIZE RULES:
- "small" → 1-50 | "small business" → 1-100 | "mid-size" / "middle market" → 51-500 | "enterprise" / "large" → 500+
- "1-500 employees" → employee_min:1, employee_max:500
- "under $10M revenue" → revenue_max_usd:10000000

IMPORTANT: when the user mentions an INDUSTRY/TOPIC (automotive, medical, electronics, apparel, furniture, food, chemicals, pharmaceuticals, agriculture, construction, solar, energy, plastics, metals, machinery, paper, textiles, cosmetics, beverages, etc.), ALWAYS populate industry_terms with the topic AND related expansions. Do not put generic audience labels like "manufacturer" alone — always pair them with the topic.

INDUSTRY EXPANSION examples (always write these into industry_terms):
- "automotive" / "auto parts" / "cars" → ["automotive","auto parts","vehicle","motor","automaker","tire","OEM"]; audience_type usually ["manufacturer"]; trade_filters.hs_chapters:["87"]
- "medical" / "medical supplies" / "healthcare" → ["medical","medical device","healthcare","pharmaceutical","hospital supplies","diagnostics"]
- "cold-chain" / "cold chain" → ["cold chain","refrigerated","temperature controlled","reefer","cold storage","frozen","chilled","perishable"]; audience_type:["cold_chain_provider","3pl","warehouse"]
- "freight broker" → ["freight broker","brokerage","truckload","ltl","transportation broker"]; audience_type:["freight_broker"]
- "freight forwarder" / "forwarder" → ["freight forwarder","ocean freight forwarder","air freight forwarder","nvocc","international logistics"]; audience_type:["freight_forwarder"]
- "customs broker" → ["customs broker","customs clearance","import brokerage","trade compliance"]; audience_type:["customs_broker"]
- "3PL" → ["3pl","third party logistics","contract logistics","fulfillment"]; audience_type:["3pl","warehouse"]
- "warehouse" / "warehousing" → audience_type:["warehouse","distribution_center"]
- "electronics" → ["electronics","semiconductor","consumer electronics","PCB"]
- "apparel" → ["apparel","clothing","garment","textile","fashion"]; trade_filters.hs_chapters:["61","62"]
- "furniture" → ["furniture","home furnishings","upholstery","office furniture"]; trade_filters.hs_chapters:["94"]
- "solar" → ["solar","solar panel","photovoltaic","PV","renewable energy"]

NEEDS_APOLLO — set true if ANY of:
- size.employee_min/max or revenue set
- contact_filters set
- intent = find_contacts
- industry_terms is non-empty AND shipment_filters is null
- audience_type is service-provider (freight_broker, freight_forwarder, customs_broker, 3pl, warehouse) AND no shipment_filters
False when:
- shipment_filters or trade_filters dominate (Apollo can't answer those)
- query mentions "saved" or "my companies" only

NEEDS_SHIPMENT_DATA — true if shipment_filters or trade_filters non-null, or audience_type includes importer/exporter/consignee/shipper with no other constraint.

If the query is a question about LIT itself ("how do I X", "what does Y mean") → intent="ask_question", set everything else to defaults, confidence high.

If unparseable (gibberish, single word) → confidence < 0.4, best-effort defaults.`;

// ─────────────────────────────────────────────────────────────────────
// Parser — Gemini Flash primary, OpenAI fallback
// ─────────────────────────────────────────────────────────────────────
async function parseWithGemini(rawQuery: string): Promise<{ intent: ParsedIntent; model: string } | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `${PARSER_SYSTEM_PROMPT}\n\nQUERY: ${rawQuery}\n\nReturn only the JSON object.` }],
        }],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: "application/json",
        },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) return null;
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const intent = JSON.parse(cleaned) as ParsedIntent;
    intent.raw_query = rawQuery;
    return { intent, model: "gemini-2.0-flash-exp" };
  } catch (err) {
    console.warn("[pulse-search] Gemini parse failed:", err);
    return null;
  }
}

async function parseWithOpenAI(rawQuery: string): Promise<{ intent: ParsedIntent; model: string } | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: PARSER_SYSTEM_PROMPT },
          { role: "user", content: `QUERY: ${rawQuery}\n\nReturn only the JSON object.` },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    if (!text) return null;
    const intent = JSON.parse(text) as ParsedIntent;
    intent.raw_query = rawQuery;
    return { intent, model: "gpt-4o-mini" };
  } catch (err) {
    console.warn("[pulse-search] OpenAI parse failed:", err);
    return null;
  }
}

async function parseQuery(rawQuery: string): Promise<{ intent: ParsedIntent; model: string }> {
  // Gemini Flash first (cheapest), OpenAI fallback, rule-based last resort.
  const gemini = await parseWithGemini(rawQuery);
  if (gemini && gemini.intent.confidence >= 0.4) return gemini;
  const openai = await parseWithOpenAI(rawQuery);
  if (openai) return openai;
  // Last-resort rule-based stub so the pipeline still returns something.
  return {
    intent: ruleBasedFallback(rawQuery),
    model: "rule-fallback",
  };
}

function ruleBasedFallback(rawQuery: string): ParsedIntent {
  const q = rawQuery.toLowerCase();
  const audience: string[] = [];
  const industryTerms: string[] = [];
  const serviceTerms: string[] = [];
  if (/cold[- ]chain|refriger|reefer|cold storage|frozen|chilled|perishable/.test(q)) {
    industryTerms.push("cold chain", "refrigerated", "temperature controlled", "reefer");
    audience.push("cold_chain_provider", "3pl", "warehouse");
  }
  if (/freight broker|brokerage|truckload|ltl broker/.test(q)) {
    serviceTerms.push("freight broker", "brokerage");
    audience.push("freight_broker");
  }
  if (/freight forwarder|forwarder|nvocc/.test(q)) {
    serviceTerms.push("freight forwarder", "ocean freight forwarder");
    audience.push("freight_forwarder");
  }
  if (/customs broker|customs clearance/.test(q)) {
    serviceTerms.push("customs broker");
    audience.push("customs_broker");
  }
  if (/3pl|third[- ]party logistics|warehouse|warehousing|fulfillment/.test(q)) {
    audience.push("3pl", "warehouse");
  }
  // Industry/topic expansion — the LLM parser usually fills these, but
  // when it falls back to this rule-based path we still want topical
  // tokens in industry_terms so downstream SQL matching works.
  if (/automotive|auto parts|\bcars?\b/.test(q)) industryTerms.push("automotive", "auto parts", "vehicle", "motor");
  if (/medical|healthcare|pharma/.test(q)) industryTerms.push("medical", "medical device", "healthcare", "pharmaceutical");
  if (/electronics?|semiconductor/.test(q)) industryTerms.push("electronics", "semiconductor");
  if (/furniture|home furnishing/.test(q)) industryTerms.push("furniture", "home furnishings");
  if (/apparel|clothing|garment|textile/.test(q)) industryTerms.push("apparel", "clothing", "garment", "textile");
  if (/solar|photovoltaic/.test(q)) industryTerms.push("solar", "solar panel", "photovoltaic");
  if (/manufactur|factory/.test(q)) audience.push("manufacturer");
  if (/importer|importing/.test(q)) audience.push("importer");
  if (/exporter|exporting/.test(q)) audience.push("exporter");

  let region: string | null = null;
  for (const r of Object.keys(REGION_STATES)) {
    if (q.includes(r)) { region = r.replace(/\b\w/g, (c) => c.toUpperCase()); break; }
  }

  return {
    raw_query: rawQuery,
    intent: "find_companies",
    audience_type: Array.from(new Set(audience)),
    industry_terms: Array.from(new Set(industryTerms)),
    service_terms: Array.from(new Set(serviceTerms)),
    geo: { region, states: [], metros: [], cities: [], postal_codes: [], countries: [], ports: [] },
    size: { employee_min: null, employee_max: null, revenue_min_usd: null, revenue_max_usd: null },
    shipment_filters: null,
    trade_filters: null,
    contact_filters: null,
    exclusions: [],
    needs_apollo: audience.some((a) => ["freight_broker", "freight_forwarder", "customs_broker", "3pl", "warehouse"].includes(a)) || industryTerms.length > 0,
    needs_shipment_data: audience.includes("importer") || audience.includes("exporter"),
    confidence: 0.3,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Post-parse expansion (deterministic)
// ─────────────────────────────────────────────────────────────────────

// Reverse map: "GA" -> "Georgia"
const STATE_ABBR_TO_FULL: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBR).map(([full, abbr]) => [abbr, full.replace(/\b\w/g, (c) => c.toUpperCase())]),
);

// Tokens we strip when deriving keyword terms from the raw query.
const KEYWORD_STOPWORDS = new Set([
  "a", "an", "the", "in", "at", "for", "to", "from", "of", "with", "by",
  "and", "or", "find", "get", "give", "want", "need", "list", "me", "my",
  "you", "i", "top", "best", "most", "any", "some", "all",
  "companies", "company", "business", "businesses", "firm", "firms",
  "provider", "providers", "vendor", "vendors", "industry", "sector",
  "market", "based", "near", "around", "that", "is", "are", "more", "than",
  "under", "over", "between", "do", "does", "please", "kindly", "could",
  "can", "compile", "make", "build", "create", "show", "let", "know",
  "show", "us", "we", "their", "lookalike", "similar", "like",
  // generic plurals/digits
  "50", "100", "10", "20", "25",
]);

function deriveKeywordTerms(intent: ParsedIntent): string[] {
  const geoWords = new Set<string>();
  for (const s of intent.geo.states) geoWords.add(s.toLowerCase());
  for (const c of intent.geo.cities) geoWords.add(c.toLowerCase());
  for (const c of intent.geo.countries) geoWords.add(c.toLowerCase());
  for (const m of intent.geo.metros) geoWords.add(m.toLowerCase());
  for (const r of Object.keys(REGION_STATES)) geoWords.add(r);
  for (const s of Object.keys(STATE_ABBR)) geoWords.add(s);
  for (const a of Object.values(STATE_ABBR)) geoWords.add(a.toLowerCase());

  const raw = String(intent.raw_query || "").toLowerCase();
  const cleaned = raw.replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  const unigrams: string[] = [];
  for (const t of tokens) {
    if (t.length < 3) continue;
    if (KEYWORD_STOPWORDS.has(t)) continue;
    if (geoWords.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    unigrams.push(t);
  }

  // Bigrams: keep meaningful adjacent pairs
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (!a || !b) continue;
    if (KEYWORD_STOPWORDS.has(a) || KEYWORD_STOPWORDS.has(b)) continue;
    if (geoWords.has(a) || geoWords.has(b)) continue;
    if (a.length < 3 || b.length < 3) continue;
    bigrams.push(`${a} ${b}`);
  }

  return Array.from(new Set([...bigrams.slice(0, 3), ...unigrams]));
}

// Audience tokens describe a trade role (manufacturer, distributor, retailer,
// wholesaler, etc.) — they're so generic that ILIKE-matching them against
// `trade_roles` floods the result set with unrelated companies. Keep these
// out of the directory SQL filter; use them only for Apollo keyword tags
// and match-reason explanations.
const AUDIENCE_GENERIC = new Set([
  "manufacturer", "distributor", "wholesaler", "retailer", "importer",
  "exporter", "consignee", "shipper", "carrier", "3pl", "4pl",
]);

// Split parsed intent into:
//   topicTerms     → used for directory SQL filtering (industry/service +
//                    raw-query derivation when parser was empty). MUST be
//                    specific enough to narrow rows, not flood them.
//   audienceTokens → used for Apollo keyword tags + match reasons only.
function buildSearchTerms(intent: ParsedIntent): { topicTerms: string[]; audienceTokens: string[]; all: string[] } {
  const topicExplicit = [
    ...intent.industry_terms,
    ...intent.service_terms,
  ]
    .map((t) => (t || "").toLowerCase().trim())
    .filter(Boolean);
  const audienceTokens = intent.audience_type
    .map((a) => (a || "").replace(/_/g, " ").toLowerCase().trim())
    .filter(Boolean);

  const derived = deriveKeywordTerms(intent);
  const topicTerms = Array.from(new Set([...topicExplicit, ...derived]))
    // Drop generic audience tokens that slipped into industry_terms or the
    // derived bigrams — they don't help narrow the directory.
    .filter((t) => !AUDIENCE_GENERIC.has(t));

  const all = Array.from(new Set([...topicTerms, ...audienceTokens]));
  return { topicTerms, audienceTokens, all };
}

// Kept for backwards-compat where callers only want the union for display.
function buildTextTerms(intent: ParsedIntent): string[] {
  return buildSearchTerms(intent).all;
}

// Defensive: ensure all nested fields exist even if parser returned partial JSON.
// Prevents 500s when the LLM omits geo/size/industry_terms etc.
function normalizeIntent(intent: any, rawQuery: string): ParsedIntent {
  return {
    raw_query: intent?.raw_query || rawQuery,
    intent: intent?.intent || "find_companies",
    audience_type: Array.isArray(intent?.audience_type) ? intent.audience_type : [],
    industry_terms: Array.isArray(intent?.industry_terms) ? intent.industry_terms : [],
    service_terms: Array.isArray(intent?.service_terms) ? intent.service_terms : [],
    geo: {
      region: intent?.geo?.region ?? null,
      states: Array.isArray(intent?.geo?.states) ? intent.geo.states : [],
      metros: Array.isArray(intent?.geo?.metros) ? intent.geo.metros : [],
      cities: Array.isArray(intent?.geo?.cities) ? intent.geo.cities : [],
      postal_codes: Array.isArray(intent?.geo?.postal_codes) ? intent.geo.postal_codes : [],
      countries: Array.isArray(intent?.geo?.countries) ? intent.geo.countries : [],
      ports: Array.isArray(intent?.geo?.ports) ? intent.geo.ports : [],
    },
    size: {
      employee_min: intent?.size?.employee_min ?? null,
      employee_max: intent?.size?.employee_max ?? null,
      revenue_min_usd: intent?.size?.revenue_min_usd ?? null,
      revenue_max_usd: intent?.size?.revenue_max_usd ?? null,
    },
    shipment_filters: intent?.shipment_filters ?? null,
    trade_filters: intent?.trade_filters ?? null,
    contact_filters: intent?.contact_filters ?? null,
    exclusions: Array.isArray(intent?.exclusions) ? intent.exclusions : [],
    needs_apollo: Boolean(intent?.needs_apollo),
    needs_shipment_data: Boolean(intent?.needs_shipment_data),
    confidence: typeof intent?.confidence === "number" ? intent.confidence : 0.3,
  };
}

function expandIntent(intent: ParsedIntent): ParsedIntent {
  // Region → states
  if (intent.geo.region) {
    const key = intent.geo.region.toLowerCase();
    if (REGION_STATES[key] && intent.geo.states.length === 0) {
      intent.geo.states = [...REGION_STATES[key]];
    }
  }
  // State abbreviations → full names (directory stores full names; abbr
  // queries used to return zero rows). Keep both forms downstream.
  if (intent.geo.states.length > 0) {
    intent.geo.states = intent.geo.states.map((s) => {
      const up = s.toUpperCase();
      if (STATE_ABBR_TO_FULL[up]) return STATE_ABBR_TO_FULL[up];
      return s;
    });
  }
  // Metros → cities (don't override explicit cities)
  if (intent.geo.metros && intent.geo.metros.length > 0) {
    for (const metro of intent.geo.metros) {
      const cities = METRO_CITIES[metro.toLowerCase()];
      if (cities) {
        intent.geo.cities = Array.from(new Set([...intent.geo.cities, ...cities]));
      }
    }
  }
  // Backfill industry_terms when parser left both industry and service empty,
  // so downstream text matching has something to grip on.
  if (intent.industry_terms.length === 0 && intent.service_terms.length === 0) {
    const derived = deriveKeywordTerms(intent);
    if (derived.length > 0) {
      intent.industry_terms = derived.slice(0, 6);
    }
  }
  // Widen Apollo gating: general-industry discovery (industry terms set, no
  // shipment/trade filter) should also call Apollo, not just service-provider
  // audiences. Fixes "medical supplies in Georgia" → Apollo skipped.
  if (!intent.needs_apollo) {
    const hasShipment = intent.shipment_filters &&
      (intent.shipment_filters.shipments_min != null ||
        intent.shipment_filters.teu_min != null ||
        intent.shipment_filters.containerization != null);
    const hasTrade = intent.trade_filters &&
      (intent.trade_filters.origin_country ||
        intent.trade_filters.destination_country ||
        intent.trade_filters.commodities?.length);
    if (intent.industry_terms.length > 0 && !hasShipment && !hasTrade) {
      intent.needs_apollo = true;
    }
  }
  return intent;
}

// ─────────────────────────────────────────────────────────────────────
// Canonical company key (for dedup)
// ─────────────────────────────────────────────────────────────────────
function normalizeDomain(url: string | null | undefined): string {
  if (!url) return "";
  return String(url)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the|and|of|usa|us)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalKeyFor(r: PulseCompanyResult): string {
  const dom = normalizeDomain(r.domain || r.website);
  if (dom) return `dom:${dom}`;
  const nm = normalizeName(r.company_name);
  const state = (r.state || "").toLowerCase().trim();
  if (nm) return state ? `nm:${nm}|${state}` : `nm:${nm}`;
  return `raw:${(r.company_name || "").toLowerCase()}`;
}

// ─────────────────────────────────────────────────────────────────────
// Source A — saved/internal companies
// ─────────────────────────────────────────────────────────────────────
async function searchSaved(supa: any, userId: string, intent: ParsedIntent, limit: number): Promise<PulseCompanyResult[]> {
  if (!userId) return [];
  try {
    let q = supa
      .from("lit_saved_companies")
      .select("id, source_company_key, snapshot, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];

    const out: PulseCompanyResult[] = [];
    for (const row of data) {
      const snap = row.snapshot || {};
      const result = snapshotToResult(snap, "saved", row.source_company_key, row.id);
      const reasons = matchReasons(result, intent);
      if (reasons.length === 0 && intent.confidence > 0.5) continue;
      result.matched_reasons = ["Saved to your workspace", ...reasons];
      result.confidence_score = 0.95;
      out.push(result);
    }
    return out;
  } catch (err) {
    console.warn("[pulse-search] saved search failed:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// Source B — lit_company_directory (Panjiva/ImportYeti shipment data)
// ─────────────────────────────────────────────────────────────────────
// Escape an ilike pattern fragment for safe inclusion inside a PostgREST
// .or() string (commas + parens have meaning there). PostgREST URL-encodes
// the value for us, but we still strip characters that would break the
// boolean filter expression.
function escapeIlikeFragment(s: string): string {
  return String(s).replace(/[,()\\]/g, " ").trim();
}

async function searchDirectory(supa: any, intent: ParsedIntent, limit: number, topicTerms: string[]): Promise<PulseCompanyResult[]> {
  try {
    let q = supa
      .from("lit_company_directory")
      .select(
        "company_key, company_name, domain, website, phone, address_line1, address_line2, city, state, postal_code, country, industry, trade_roles, shipments, teu, lcl, value_usd, description",
      )
      .eq("is_active", true)
      .limit(limit * 3);

    // Geography filters — state.ilike matches the directory's full-name
    // storage; state.eq.{abbr} is kept as a safety net for any abbr rows.
    if (intent.geo.states.length > 0) {
      const orParts: string[] = [];
      for (const s of intent.geo.states) {
        const safe = escapeIlikeFragment(s);
        if (!safe) continue;
        orParts.push(`state.ilike.${safe}`);
        const abbr = STATE_ABBR[s.toLowerCase()];
        if (abbr) orParts.push(`state.eq.${abbr}`);
        // If the input was an abbreviation, also try as-is
        if (s.length === 2) orParts.push(`state.eq.${s.toUpperCase()}`);
      }
      if (orParts.length) q = q.or(orParts.join(","));
    } else if (intent.geo.cities.length > 0) {
      q = q.or(intent.geo.cities.map((c) => `city.ilike.${escapeIlikeFragment(c)}`).join(","));
    } else if (intent.geo.postal_codes.length > 0) {
      q = q.in("postal_code", intent.geo.postal_codes);
    }

    if (intent.geo.countries.length > 0) {
      q = q.in("country", intent.geo.countries);
    }

    if (intent.shipment_filters?.shipments_min != null) {
      q = q.gte("shipments", intent.shipment_filters.shipments_min);
    }
    if (intent.shipment_filters?.teu_min != null) {
      q = q.gte("teu", intent.shipment_filters.teu_min);
    }
    if (intent.shipment_filters?.containerization === "LCL") {
      q = q.gt("lcl", 0);
    }

    // SQL-level text-match. Only TOPIC terms (industry/service/raw-query
    // derivation) drive the filter. Audience tokens like "manufacturer"
    // are explicitly excluded upstream because OR-matching them across
    // trade_roles flooded results with every Southeast manufacturer
    // (food, furniture, cosmetics) when the user searched "automotive".
    //
    // For company_name we ILIKE the term so partial matches work
    // (Panasonic Automotive Systems matches "automotive"). We also try
    // industry/description. We deliberately DROP trade_roles from the
    // filter columns — that column carries audience-style values
    // ("Manufacturer", "Logistics") that don't carry topic signal.
    const topTerms = topicTerms.slice(0, 5).map(escapeIlikeFragment).filter(Boolean);
    if (topTerms.length > 0) {
      const orParts: string[] = [];
      for (const t of topTerms) {
        const pat = `%${t}%`;
        orParts.push(`company_name.ilike.${pat}`);
        orParts.push(`industry.ilike.${pat}`);
        orParts.push(`description.ilike.${pat}`);
      }
      q = q.or(orParts.join(","));
    }

    const { data, error } = await q;
    if (error || !Array.isArray(data)) {
      console.warn("[pulse-search] directory error:", error);
      return [];
    }

    const lowerTerms = topTerms.map((t) => t.toLowerCase());
    const scored = (data as any[])
      .map((row) => {
        const result = directoryRowToResult(row);
        const reasons = matchReasons(result, intent);
        const haystack = [
          row.company_name, row.industry, row.trade_roles, row.description,
        ].filter(Boolean).join(" ").toLowerCase();
        let textBoost = 0;
        for (const t of lowerTerms) {
          if (t.length > 2 && haystack.includes(t)) {
            textBoost += 0.15;
            reasons.push(`Matched: ${t}`);
            break;
          }
        }
        result.matched_reasons = reasons;
        result.confidence_score = Math.min(0.9, 0.5 + textBoost + Math.min(0.2, (row.shipments || 0) / 500));
        return { result, textBoost };
      })
      // When text terms were supplied we trust the SQL filter; no extra
      // in-memory drop is necessary. Score still surfaces best matches first.
      .sort((a, b) => b.result.confidence_score - a.result.confidence_score)
      .slice(0, limit)
      .map(({ result }) => result);

    return scored;
  } catch (err) {
    console.warn("[pulse-search] directory search failed:", err);
    return [];
  }
}

function directoryRowToResult(row: any): PulseCompanyResult {
  return {
    id: row.company_key,
    source: "lit_company_directory",
    source_company_key: row.company_key,
    canonical_company_key: null,
    company_name: row.company_name || "",
    website: row.website || null,
    domain: row.domain || null,
    phone: row.phone || null,
    address: [row.address_line1, row.address_line2].filter(Boolean).join(", ") || null,
    city: row.city || null,
    state: row.state || null,
    postal_code: row.postal_code || null,
    country: row.country || null,
    industry: row.industry || null,
    trade_roles: row.trade_roles || null,
    employee_count: null,
    revenue: null,
    linkedin_url: null,
    description: row.description || null,
    shipment_metrics: {
      shipments: Number(row.shipments) || null,
      teu: Number(row.teu) || null,
      lcl: Number(row.lcl) || null,
      value_usd: Number(row.value_usd) || null,
      last_shipment_date: null,
    },
    matched_reasons: [],
    confidence_score: 0.5,
    can_enrich_contacts: true,
    can_add_to_campaign: true,
    can_open_profile: true,
  };
}

function snapshotToResult(snap: any, source: "saved" | "lit_company_directory", key?: string | null, id?: string | null): PulseCompanyResult {
  return {
    id: id || snap.id || snap.company_key,
    source,
    source_company_key: key || snap.company_key,
    canonical_company_key: null,
    company_name: snap.company_name || snap.name || "",
    website: snap.website || null,
    domain: snap.domain || null,
    phone: snap.phone || null,
    address: snap.address || snap.address_line1 || null,
    city: snap.city || null,
    state: snap.state || null,
    postal_code: snap.postal_code || null,
    country: snap.country || null,
    industry: snap.industry || null,
    trade_roles: snap.trade_roles || null,
    employee_count: snap.employee_count || null,
    revenue: snap.revenue || snap.estimated_annual_revenue || null,
    linkedin_url: snap.linkedin_url || null,
    description: snap.description || null,
    shipment_metrics: snap.shipment_metrics || null,
    matched_reasons: [],
    confidence_score: 0.5,
    can_enrich_contacts: true,
    can_add_to_campaign: true,
    can_open_profile: true,
  };
}

function matchReasons(result: PulseCompanyResult, intent: ParsedIntent): string[] {
  const reasons: string[] = [];
  if (intent.geo.region && result.state) {
    const states = REGION_STATES[intent.geo.region.toLowerCase()] || [];
    if (states.some((s) => s.toLowerCase() === (result.state || "").toLowerCase()) || states.some((s) => STATE_ABBR[s.toLowerCase()] === (result.state || "").toUpperCase())) {
      reasons.push(`Matched region: ${intent.geo.region}`);
    }
  }
  if (intent.geo.cities.length > 0 && result.city) {
    if (intent.geo.cities.some((c) => c.toLowerCase() === (result.city || "").toLowerCase())) {
      reasons.push(`Matched city: ${result.city}`);
    }
  }
  if (intent.geo.postal_codes.length > 0 && result.postal_code) {
    if (intent.geo.postal_codes.includes(result.postal_code)) {
      reasons.push(`Matched ZIP: ${result.postal_code}`);
    }
  }
  if (intent.shipment_filters?.shipments_min != null && result.shipment_metrics?.shipments) {
    if (result.shipment_metrics.shipments >= intent.shipment_filters.shipments_min) {
      reasons.push(`Matched shipment volume: ${result.shipment_metrics.shipments}+`);
    }
  }
  if (intent.shipment_filters?.teu_min != null && result.shipment_metrics?.teu) {
    if (result.shipment_metrics.teu >= intent.shipment_filters.teu_min) {
      reasons.push(`Matched TEU: ${result.shipment_metrics.teu}`);
    }
  }
  if (intent.audience_type.length > 0 && (result.trade_roles || result.industry)) {
    const tr = (result.trade_roles || "").toLowerCase();
    const ind = (result.industry || "").toLowerCase();
    for (const a of intent.audience_type) {
      const token = a.replace(/_/g, " ");
      if (tr.includes(token) || ind.includes(token)) {
        reasons.push(`Matched trade role: ${a.replace(/_/g, " ")}`);
        break;
      }
    }
  }
  return reasons;
}

// ─────────────────────────────────────────────────────────────────────
// Source C — Apollo
// ─────────────────────────────────────────────────────────────────────
// NAICS/SIC prefix map keyed by lowercased topic term. When Apollo returns
// firmographic codes, we use these to filter false positives (CNN, IT
// staffing firms, etc. that match by keyword only) and to boost true
// industry matches. Sourced from the Apollo audit; extend over time.
const NAICS_PREFIX_BY_TOPIC: Record<string, string[]> = {
  automotive: ["3361", "3362", "3363", "4231", "4411", "4413", "4511", "8111"],
  "auto parts": ["3363", "4231", "4413"],
  vehicle: ["3361", "3362", "3363"],
  motor: ["3361", "3362", "3363"],
  medical: ["3391", "3254", "3345", "4234", "6211", "6215"],
  "medical device": ["3391", "3345"],
  "medical supplies": ["3391", "4234"],
  healthcare: ["6211", "6215", "6213", "6214", "6216"],
  pharmaceutical: ["3254", "4242"],
  electronics: ["3341", "3342", "3344", "3345", "4234", "4431"],
  semiconductor: ["3344"],
  furniture: ["3371", "3372", "4232", "4421", "4422"],
  "home furnishings": ["3371", "4422"],
  food: ["3111", "3112", "3114", "3115", "3116", "3118", "4244", "4245"],
  beverages: ["3121", "4248"],
  apparel: ["3151", "3152", "3159", "3162", "4243", "4481"],
  clothing: ["3151", "3152", "4243"],
  textile: ["3131", "3132", "3133"],
  solar: ["3344", "2211", "2371", "3359", "3361"],
  photovoltaic: ["3344"],
  chemicals: ["3251", "3252", "3253", "3254", "3255", "3256", "3259"],
  plastics: ["3261"],
  machinery: ["3331", "3332", "3333", "3334", "3335", "3336", "3339"],
  cosmetics: ["3256", "4461"],
};

function naicsTargetsFor(intent: ParsedIntent): string[] {
  const targets = new Set<string>();
  for (const t of intent.industry_terms) {
    const prefixes = NAICS_PREFIX_BY_TOPIC[t.toLowerCase().trim()];
    if (prefixes) for (const p of prefixes) targets.add(p);
  }
  return Array.from(targets);
}

function naicsMatches(codes: string[] | null | undefined, targets: string[]): string | null {
  if (!Array.isArray(codes) || codes.length === 0 || targets.length === 0) return null;
  for (const code of codes) {
    const s = String(code);
    for (const prefix of targets) {
      if (s.startsWith(prefix)) return s;
    }
  }
  return null;
}

// Batch industry classifier — fills `industry` on rows where Apollo /
// directory returned null, using a single Gemini Flash call for up to
// 20 rows. Cheap (~$0.0001 per batch, ~600ms) and turns blank-industry
// rows into proper "Automotive Manufacturing" labels for the UI.
async function batchClassifyIndustries(rows: PulseCompanyResult[]): Promise<void> {
  if (!GEMINI_API_KEY) return;
  const blanks = rows.filter((r) => !r.industry && r.company_name).slice(0, 20);
  if (blanks.length === 0) return;
  try {
    const prompt = `Classify each company by industry. Return ONLY a JSON array of objects with this exact shape:
[{"name":"<input name>","industry":"<short industry label like 'Automotive Manufacturing', 'Medical Devices', 'Freight Forwarding'>"}]
Use null for industry if you genuinely don't know. No prose, no markdown.

Companies:
${blanks.map((r, i) => `${i + 1}. ${r.company_name}${r.domain ? ` (${r.domain})` : ""}`).join("\n")}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, response_mime_type: "application/json" },
      }),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) return;
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return;
    const byName = new Map<string, string>();
    for (const entry of arr) {
      const name = (entry?.name || "").toString().trim().toLowerCase();
      const industry = (entry?.industry || "").toString().trim();
      if (name && industry && industry.toLowerCase() !== "null") byName.set(name, industry);
    }
    for (const row of blanks) {
      const tag = byName.get(row.company_name.toLowerCase());
      if (tag) {
        row.industry = tag;
        row.matched_reasons = [...row.matched_reasons, `AI-classified: ${tag}`];
      }
    }
  } catch (err) {
    console.warn("[pulse-search] batchClassifyIndustries failed:", err);
  }
}

async function searchApollo(intent: ParsedIntent, limit: number): Promise<PulseCompanyResult[]> {
  if (!APOLLO_API_KEY) return [];
  try {
    // Keyword tags: TOPIC ONLY (industry + service). Sending audience tokens
    // like "manufacturer" as a keyword tag drags in IT staffing / media
    // companies that mention the word in their marketing copy.
    const keywords = Array.from(new Set([
      ...intent.industry_terms,
      ...intent.service_terms,
    ])).filter((s) => s && s.length > 2);

    // Build locations: prefer cities, then states, then countries.
    const locations: string[] = [];
    if (intent.geo.cities.length > 0) {
      for (const c of intent.geo.cities.slice(0, 5)) {
        if (intent.geo.states.length === 1) {
          locations.push(`${c}, ${intent.geo.states[0]}`);
        } else {
          locations.push(c);
        }
      }
    } else if (intent.geo.states.length > 0) {
      for (const s of intent.geo.states.slice(0, 7)) locations.push(s);
    } else if (intent.geo.countries.length > 0) {
      for (const c of intent.geo.countries.slice(0, 3)) locations.push(c);
    } else if (intent.geo.postal_codes.length > 0) {
      for (const p of intent.geo.postal_codes) locations.push(p);
    }

    // Employee ranges
    const ranges: string[] = [];
    const eMin = intent.size.employee_min;
    const eMax = intent.size.employee_max;
    if (eMin != null || eMax != null) {
      const buckets = [[1,10],[11,20],[21,50],[51,100],[101,200],[201,500],[501,1000],[1001,5000],[5001,10000]];
      for (const [lo, hi] of buckets) {
        if ((eMax == null || lo <= eMax) && (eMin == null || hi >= eMin)) {
          ranges.push(`${lo},${hi}`);
        }
      }
      if (eMax == null || eMax >= 10001) ranges.push("10001");
    }

    const body: Record<string, any> = {
      page: 1,
      per_page: Math.min(limit, 50),
    };
    if (keywords.length > 0) body.q_organization_keyword_tags = keywords.slice(0, 6);
    if (locations.length > 0) body.organization_locations = locations;
    if (ranges.length > 0) body.organization_num_employees_ranges = ranges;

    // Wire revenue range — we already parse it from the LLM; previously
    // the value sat in intent.size but never reached Apollo.
    const rMin = intent.size.revenue_min_usd;
    const rMax = intent.size.revenue_max_usd;
    if (rMin != null || rMax != null) {
      body.revenue_range = {};
      if (rMin != null) body.revenue_range.min = rMin;
      if (rMax != null) body.revenue_range.max = rMax;
    }

    // Exclusions from parser (regions / industries we don't want).
    if (Array.isArray(intent.exclusions) && intent.exclusions.length > 0) {
      body.organization_not_locations = intent.exclusions.slice(0, 5);
    }

    const url = `${APOLLO_API_BASE}/api/v1/mixed_companies/search`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn("[pulse-search] Apollo non-ok:", resp.status, txt.slice(0, 200));
      return [];
    }
    const data = await resp.json();
    const orgs: any[] = data?.organizations || data?.accounts || [];

    const naicsTargets = naicsTargetsFor(intent);
    const mapped = orgs.map((o: any) => apolloOrgToResult(o, intent, naicsTargets));

    // NAICS post-filter: when we have target codes for the topic, DROP rows
    // that match neither a NAICS code nor a keyword/name hit. This kills
    // CNN/Jabil/VDart-class false positives where Apollo matched on a
    // marketing-copy keyword but the firmographic record is unrelated.
    // If no NAICS targets exist for the topic, fall back to the original
    // keyword-only signal (no row dropping).
    let filtered: PulseCompanyResult[];
    if (naicsTargets.length > 0) {
      filtered = mapped.filter((r: any) => r.__keywordHit || r.__naicsHit);
      // Safety net: if NAICS filtering wiped everything (rare — Apollo
      // sometimes returns rows with empty naics_codes), keep keyword hits
      // and the top few by score so we don't return nothing.
      if (filtered.length === 0) filtered = mapped.filter((r: any) => r.__keywordHit);
      if (filtered.length === 0) filtered = mapped.slice(0, Math.min(10, mapped.length));
    } else {
      filtered = mapped;
    }

    // Strip the internal scoring flags before returning to merge.
    for (const r of filtered as any[]) { delete r.__keywordHit; delete r.__naicsHit; }
    return filtered;
  } catch (err) {
    console.warn("[pulse-search] Apollo failed:", err);
    return [];
  }
}

function apolloOrgToResult(o: any, intent: ParsedIntent, naicsTargets: string[]): PulseCompanyResult & { __keywordHit?: boolean; __naicsHit?: boolean } {
  const reasons: string[] = ["Discovered via Apollo"];
  const stateMatch = (o.state || "").toLowerCase();
  if (intent.geo.region) {
    const region = intent.geo.region.toLowerCase();
    const stateNames = REGION_STATES[region] || [];
    if (stateNames.some((s) => s.toLowerCase() === stateMatch)) {
      reasons.push(`Matched region: ${intent.geo.region}`);
    }
  }
  if (intent.size.employee_min != null || intent.size.employee_max != null) {
    if (o.estimated_num_employees) {
      reasons.push(`Matched employee range: ${o.estimated_num_employees}`);
    }
  }
  let keywordHit = false;
  if (intent.industry_terms.length > 0) {
    const ind = String(o.industry || "").toLowerCase();
    const nm = String(o.name || "").toLowerCase();
    for (const t of intent.industry_terms) {
      const tl = t.toLowerCase();
      if (ind.includes(tl) || nm.includes(tl)) {
        reasons.push(`Matched topic: ${t}`);
        keywordHit = true;
        break;
      }
    }
  }

  const naicsCodes: string[] = Array.isArray(o.naics_codes) ? o.naics_codes.map((c: any) => String(c)) : [];
  const sicCodes: string[] = Array.isArray(o.sic_codes) ? o.sic_codes.map((c: any) => String(c)) : [];
  const naicsHitCode = naicsMatches(naicsCodes, naicsTargets);
  if (naicsHitCode) reasons.push(`Matched NAICS: ${naicsHitCode}`);

  // Score: base 0.7 + boosts for industry + NAICS + completeness.
  let score = 0.7;
  if (keywordHit) score += 0.1;
  if (naicsHitCode) score += 0.15;

  return {
    id: o.id,
    source: "apollo",
    source_company_key: o.id,
    canonical_company_key: null,
    company_name: o.name || "",
    website: o.website_url || (o.primary_domain ? `https://${o.primary_domain}` : null),
    domain: o.primary_domain || normalizeDomain(o.website_url) || null,
    phone: o.phone || o.primary_phone?.number || null,
    address: [o.street_address, o.raw_address].filter(Boolean)[0] || null,
    city: o.city || null,
    state: o.state || null,
    postal_code: o.postal_code || null,
    country: o.country || null,
    industry: o.industry || (Array.isArray(o.industries) ? o.industries[0] : null),
    trade_roles: null,
    employee_count: o.estimated_num_employees || null,
    revenue: o.annual_revenue_printed || o.organization_revenue || null,
    linkedin_url: o.linkedin_url || null,
    description: o.short_description || null,
    shipment_metrics: null,
    matched_reasons: reasons,
    confidence_score: Math.min(0.95, score),
    can_enrich_contacts: true,
    can_add_to_campaign: true,
    can_open_profile: true,
    __keywordHit: keywordHit,
    __naicsHit: !!naicsHitCode,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Merge + dedup + rank
// ─────────────────────────────────────────────────────────────────────
function mergeResults(buckets: PulseCompanyResult[][]): PulseCompanyResult[] {
  const byKey = new Map<string, PulseCompanyResult>();
  for (const list of buckets) {
    for (const r of list) {
      const key = canonicalKeyFor(r);
      r.canonical_company_key = key;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, r);
      } else {
        // Merge: prefer existing (higher precedence source first) but fill blanks.
        const merged: PulseCompanyResult = { ...existing };
        const fields: (keyof PulseCompanyResult)[] = [
          "website", "domain", "phone", "address", "city", "state", "postal_code",
          "country", "industry", "trade_roles", "employee_count", "revenue",
          "linkedin_url", "description",
        ];
        for (const f of fields) {
          if (merged[f] == null && r[f] != null) (merged as any)[f] = r[f];
        }
        // Shipment metrics — keep whichever has data
        if (!merged.shipment_metrics?.shipments && r.shipment_metrics?.shipments) {
          merged.shipment_metrics = r.shipment_metrics;
        }
        // Merge reasons + boost confidence (multi-source = stronger)
        merged.matched_reasons = Array.from(new Set([
          ...existing.matched_reasons,
          ...r.matched_reasons,
        ]));
        merged.confidence_score = Math.min(1, existing.confidence_score + 0.1);
        if (existing.source !== r.source) merged.source = "merged";
        byKey.set(key, merged);
      }
    }
  }
  return Array.from(byKey.values());
}

function rankResults(results: PulseCompanyResult[], intent: ParsedIntent): PulseCompanyResult[] {
  return results
    .map((r) => {
      let score = r.confidence_score * 100;
      // Source priority
      if (r.source === "saved") score += 30;
      else if (r.source === "merged") score += 20;
      else if (r.source === "lit_company_directory") score += 10;
      // Data completeness
      const completeness = [
        r.website, r.domain, r.phone, r.city, r.state, r.industry,
      ].filter(Boolean).length;
      score += completeness * 2;
      // Shipment relevance
      if (intent.needs_shipment_data && r.shipment_metrics?.shipments) {
        score += Math.min(30, (r.shipment_metrics.shipments / 10));
      }
      // Match-reason count
      score += r.matched_reasons.length * 3;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ r }) => r);
}

// ─────────────────────────────────────────────────────────────────────
// Plan + Apollo cap
// ─────────────────────────────────────────────────────────────────────
async function getUserPlanAndApolloUsage(supa: any, userId: string): Promise<{ plan: string; usedToday: number; cap: number }> {
  let plan = "free_trial";
  try {
    const { data: sub } = await supa
      .from("subscriptions")
      .select("plan_code, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (sub?.plan_code) plan = sub.plan_code;
    if (sub?.status && ["expired", "incomplete", "unpaid", "past_due", "cancelled", "canceled", "paused"].includes(sub.status)) {
      plan = "expired";
    }
  } catch {}
  const cap = APOLLO_DAILY_CAP[plan] ?? 0;
  let usedToday = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supa
      .from("lit_apollo_daily_usage")
      .select("apollo_company_searches")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();
    if (data?.apollo_company_searches) usedToday = data.apollo_company_searches;
  } catch {}
  return { plan, usedToday, cap };
}

async function incrementApollo(supa: any, userId: string) {
  try {
    await supa.rpc("increment_apollo_usage", { p_user_id: userId, p_kind: "company", p_delta: 1 });
  } catch (err) {
    console.warn("[pulse-search] increment_apollo_usage failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Serve
// ─────────────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const startedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  try {

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  let body: any = {};
  try { body = await req.json(); } catch {}
  const rawQuery = String(body?.query || "").trim();
  if (!rawQuery) {
    return new Response(JSON.stringify({ ok: false, error: "query_required" }), {
      status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
  const limit = Math.max(5, Math.min(Number(body?.limit) || 50, 100));
  const includeApollo = body?.includeApollo !== false;
  const includeSaved = body?.includeSaved !== false;
  const includeDirectory = body?.includeDirectory !== false;

  // Identify user via JWT
  const supaAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  let userId = "";
  let orgId = "";
  try {
    const { data: userResp } = await supaAuth.auth.getUser(token);
    userId = userResp?.user?.id || "";
  } catch {}

  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Look up org_id (best effort)
  try {
    const { data: prof } = await supa
      .from("user_profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    orgId = prof?.organization_id || "";
  } catch {}

  // 1. Parse
  const t0 = Date.now();
  const { intent: parsedRaw, model: parserModel } = await parseQuery(rawQuery);
  // Defensive normalization — guarantees every field downstream code reads
  // is present, even if the LLM returned a partial JSON object.
  const normalizedRaw = normalizeIntent(parsedRaw, rawQuery);
  const intent = expandIntent(normalizedRaw);
  const { topicTerms, audienceTokens, all: textTerms } = buildSearchTerms(intent);
  const parserMs = Date.now() - t0;

  // 2. Run sources in parallel (within slot-routing rules)
  const savedPromise: Promise<PulseCompanyResult[]> = includeSaved
    ? searchSaved(supa, userId, intent, Math.min(20, limit))
    : Promise.resolve([]);

  const directoryPromise: Promise<PulseCompanyResult[]> = includeDirectory
    ? searchDirectory(supa, intent, Math.min(50, limit), topicTerms)
    : Promise.resolve([]);

  let apolloCalled = false;
  let apolloPromise: Promise<PulseCompanyResult[]> = Promise.resolve([]);
  if (includeApollo && intent.needs_apollo) {
    const { plan, usedToday, cap } = await getUserPlanAndApolloUsage(supa, userId);
    if (cap > 0 && usedToday < cap) {
      apolloCalled = true;
      apolloPromise = searchApollo(intent, Math.min(50, limit)).then(async (rows) => {
        await incrementApollo(supa, userId);
        return rows;
      });
    } else {
      console.log(`[pulse-search] Apollo skipped — plan=${plan} usedToday=${usedToday} cap=${cap}`);
    }
  }

  const [savedRows, directoryRows, apolloRows] = await Promise.all([
    savedPromise, directoryPromise, apolloPromise,
  ]);

  // 3. Merge + dedup + rank
  const merged = mergeResults([savedRows, directoryRows, apolloRows]);
  const ranked = rankResults(merged, intent).slice(0, limit);

  // 3.5. AI industry classification — fills `industry` on rows where the
  // upstream source returned null (very common in lit_company_directory,
  // where only 12% of rows have industry set). One batched Gemini Flash
  // call covers up to 20 blank rows in ~600ms / ~$0.0001. We don't fail
  // the response if it errors; rows just stay blank.
  await batchClassifyIndustries(ranked);

  const sourceCounts = {
    saved: savedRows.length,
    directory: directoryRows.length,
    apollo: apolloRows.length,
    merged: ranked.length,
  };
  const totalMs = Date.now() - startedAt;

  // 4. Telemetry
  try {
    await supa.from("lit_pulse_search_events").insert({
      user_id: userId,
      org_id: orgId || null,
      raw_query: rawQuery,
      parsed_intent: intent,
      source_counts: sourceCounts,
      result_count: ranked.length,
      zero_result: ranked.length === 0,
      apollo_called: apolloCalled,
      parser_model: parserModel,
      first_result_ms: parserMs,
      total_ms: totalMs,
    });
  } catch (err) {
    console.warn("[pulse-search] telemetry insert failed:", err);
  }

  const coachSummary = buildCoachSummary(intent, sourceCounts, ranked, textTerms);

  return new Response(JSON.stringify({
    ok: true,
    query: rawQuery,
    parsed: intent,
    parser_model: parserModel,
    sources: sourceCounts,
    apollo_called: apolloCalled,
    text_terms: textTerms,
    topic_terms: topicTerms,
    audience_tokens: audienceTokens,
    results: ranked,
    coach_summary: coachSummary,
    timing_ms: { parser: parserMs, total: totalMs },
  }), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });

  } catch (err: any) {
    // Top-level safety net — never return 500 to the UI; always a structured body.
    // The frontend shows "Failed to send a request to the Edge Function" on any
    // non-2xx, which is unhelpful. Returning 200 with ok:false lets the UI
    // surface the actual error message.
    console.error("[pulse-search] unhandled error:", err?.stack || err?.message || String(err));
    return new Response(JSON.stringify({
      ok: false,
      error: "pulse_search_internal_error",
      message: err?.message || "Unexpected error in pulse-search",
      results: [],
      sources: { saved: 0, directory: 0, apollo: 0, merged: 0 },
    }), { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }
});

function buildCoachSummary(intent: ParsedIntent, counts: Record<string, number>, results: PulseCompanyResult[], textTerms: string[]): string {
  if (results.length === 0) {
    if (intent.confidence < 0.4 && textTerms.length === 0) {
      return "I couldn't quite parse that query. Try a phrase like 'cold-chain logistics providers in the Southeast' or 'freight brokers in Atlanta with 1-500 employees'.";
    }
    const what = textTerms.slice(0, 3).join(", ") || "your query";
    return `No matches for ${what} yet. Try broadening the region, removing a size filter, or rephrasing the industry term.`;
  }
  const parts: string[] = [];
  parts.push(`Found ${results.length} ${results.length === 1 ? "company" : "companies"}`);
  if (textTerms.length > 0) {
    parts.push(`matching ${textTerms.slice(0, 3).join(", ")}`);
  }
  const breakdown: string[] = [];
  if (counts.saved) breakdown.push(`${counts.saved} from your saved list`);
  if (counts.directory) breakdown.push(`${counts.directory} from the LIT shipment directory`);
  if (counts.apollo) breakdown.push(`${counts.apollo} from Apollo discovery`);
  if (breakdown.length) parts.push(`— ${breakdown.join(", ")}`);
  if (intent.geo.region) parts.push(`across the ${intent.geo.region}`);
  else if (intent.geo.states.length === 1) parts.push(`in ${intent.geo.states[0]}`);
  else if (intent.geo.cities.length === 1) parts.push(`in ${intent.geo.cities[0]}`);
  return parts.join(" ") + ".";
}
