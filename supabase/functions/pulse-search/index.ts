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

INDUSTRY EXPANSION (write these expanded terms into industry_terms):
- "cold-chain" / "cold chain" → ["cold chain","refrigerated","temperature controlled","reefer","cold storage","frozen","chilled","perishable","food logistics","pharma logistics"]; audience_type:["cold_chain_provider","3pl","warehouse"]
- "freight broker" → service_terms:["freight broker","brokerage","truckload","ltl","transportation broker"]; audience_type:["freight_broker"]
- "freight forwarder" / "forwarder" → service_terms:["freight forwarder","ocean freight forwarder","air freight forwarder","nvocc","international logistics"]; audience_type:["freight_forwarder"]
- "customs broker" → service_terms:["customs broker","customs clearance","import brokerage","trade compliance"]; audience_type:["customs_broker"]
- "3PL" → service_terms:["3pl","third party logistics","contract logistics","fulfillment"]; audience_type:["3pl","warehouse"]
- "warehouse" / "warehousing" → audience_type:["warehouse","distribution_center"]
- "manufacturer" / "factory" → audience_type:["manufacturer"]
- "importer" → audience_type:["importer"]; "exporter" → audience_type:["exporter"]

HS / commodity:
- "auto parts" → trade_filters.commodities:["auto parts"], trade_filters.hs_chapters:["87"]
- "apparel" → chapters ["61","62"]; "furniture" → ["94"]; "electronics" → ["85"]; "machinery" → ["84"]; "food" → ["16","17","18","19","20","21","22"]

NEEDS_APOLLO — set true if ANY of:
- size.employee_min/max or revenue set
- contact_filters set
- intent = find_contacts
- audience_type is service-provider (freight_broker, freight_forwarder, customs_broker, 3pl, warehouse) AND no shipment_filters
- query references website/phone/address/linkedin/industry as discovery criteria
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
    needs_apollo: audience.some((a) => ["freight_broker", "freight_forwarder", "customs_broker", "3pl", "warehouse"].includes(a)),
    needs_shipment_data: audience.includes("importer") || audience.includes("exporter"),
    confidence: 0.3,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Post-parse expansion (deterministic)
// ─────────────────────────────────────────────────────────────────────
function expandIntent(intent: ParsedIntent): ParsedIntent {
  // Region → states
  if (intent.geo.region) {
    const key = intent.geo.region.toLowerCase();
    if (REGION_STATES[key] && intent.geo.states.length === 0) {
      intent.geo.states = [...REGION_STATES[key]];
    }
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
async function searchDirectory(supa: any, intent: ParsedIntent, limit: number): Promise<PulseCompanyResult[]> {
  try {
    let q = supa
      .from("lit_company_directory")
      .select(
        "company_key, company_name, domain, website, phone, address_line1, address_line2, city, state, postal_code, country, industry, trade_roles, shipments, teu, lcl, value_usd, description, normalized_json",
      )
      .eq("is_active", true)
      .limit(limit * 2);

    // Geography filters
    if (intent.geo.states.length > 0) {
      const abbrs = intent.geo.states
        .map((s) => STATE_ABBR[s.toLowerCase()])
        .filter(Boolean);
      const orParts = [
        ...intent.geo.states.map((s) => `state.ilike.${s}`),
        ...abbrs.map((a) => `state.eq.${a}`),
      ];
      if (orParts.length) q = q.or(orParts.join(","));
    } else if (intent.geo.cities.length > 0) {
      q = q.or(intent.geo.cities.map((c) => `city.ilike.${c}`).join(","));
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

    const { data, error } = await q;
    if (error || !Array.isArray(data)) {
      console.warn("[pulse-search] directory error:", error);
      return [];
    }

    // Text relevance filter (industry/service/audience term match) — apply
    // in-memory since lit_company_directory has spotty industry coverage.
    const terms = [
      ...intent.industry_terms,
      ...intent.service_terms,
      ...intent.audience_type.map((a) => a.replace(/_/g, " ")),
    ]
      .map((t) => t.toLowerCase())
      .filter(Boolean);

    const scored = (data as any[])
      .map((row) => {
        const result = directoryRowToResult(row);
        const reasons = matchReasons(result, intent);
        // Tier-1 strong: company name / industry / trade_roles / description
        // contains a term
        const haystack = [
          row.company_name, row.industry, row.trade_roles, row.description,
        ].filter(Boolean).join(" ").toLowerCase();
        let textBoost = 0;
        for (const t of terms) {
          if (t.length > 2 && haystack.includes(t)) {
            textBoost += 0.15;
            reasons.push(`Matched: ${t}`);
            break;
          }
        }
        result.matched_reasons = reasons;
        result.confidence_score = Math.min(0.85, 0.5 + textBoost + Math.min(0.2, (row.shipments || 0) / 500));
        return { result, hasGeo: !!(row.city || row.state || row.country), textBoost };
      })
      .filter(({ result, textBoost }) => {
        // If we have audience/industry terms, require either a text match OR
        // a clear geo filter that already narrowed the result set.
        if (terms.length > 0 && textBoost === 0 && intent.geo.states.length === 0 && intent.geo.cities.length === 0 && intent.geo.postal_codes.length === 0) {
          return false;
        }
        return true;
      })
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
async function searchApollo(intent: ParsedIntent, limit: number): Promise<PulseCompanyResult[]> {
  if (!APOLLO_API_KEY) return [];
  try {
    // Build keyword tags from audience/industry/service terms.
    const keywords = Array.from(new Set([
      ...intent.industry_terms,
      ...intent.service_terms,
      ...intent.audience_type.map((a) => a.replace(/_/g, " ")),
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

    const out: PulseCompanyResult[] = orgs.map((o: any) => apolloOrgToResult(o, intent));
    return out;
  } catch (err) {
    console.warn("[pulse-search] Apollo failed:", err);
    return [];
  }
}

function apolloOrgToResult(o: any, intent: ParsedIntent): PulseCompanyResult {
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
  if (intent.industry_terms.length > 0 && o.industry) {
    const ind = String(o.industry).toLowerCase();
    for (const t of intent.industry_terms) {
      if (ind.includes(t.toLowerCase())) {
        reasons.push(`Matched Apollo industry: ${o.industry}`);
        break;
      }
    }
  }

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
    confidence_score: 0.7,
    can_enrich_contacts: true,
    can_add_to_campaign: true,
    can_open_profile: true,
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
  const intent = expandIntent(parsedRaw);
  const parserMs = Date.now() - t0;

  // 2. Run sources in parallel (within slot-routing rules)
  const savedPromise: Promise<PulseCompanyResult[]> = includeSaved
    ? searchSaved(supa, userId, intent, Math.min(20, limit))
    : Promise.resolve([]);

  const directoryPromise: Promise<PulseCompanyResult[]> = includeDirectory
    ? searchDirectory(supa, intent, Math.min(50, limit))
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

  const coachSummary = buildCoachSummary(intent, sourceCounts, ranked);

  return new Response(JSON.stringify({
    ok: true,
    query: rawQuery,
    parsed: intent,
    parser_model: parserModel,
    sources: sourceCounts,
    apollo_called: apolloCalled,
    results: ranked,
    coach_summary: coachSummary,
    timing_ms: { parser: parserMs, total: totalMs },
  }), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
});

function buildCoachSummary(intent: ParsedIntent, counts: Record<string, number>, results: PulseCompanyResult[]): string {
  if (results.length === 0) {
    if (intent.confidence < 0.4) {
      return "I couldn't quite parse that query. Try a phrase like 'cold-chain logistics providers in the Southeast' or 'freight brokers in Atlanta with 1-500 employees'.";
    }
    return "No matches yet. Try broadening the region, removing a size filter, or rephrasing the industry term.";
  }
  const parts: string[] = [];
  parts.push(`Found ${results.length} ${results.length === 1 ? "company" : "companies"}`);
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
