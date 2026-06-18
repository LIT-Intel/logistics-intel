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
    // Added 2026-06-18 — see docs/superpowers/specs/2026-06-18-
    // pulse-search-dimensions-design.md. All new geo fields are
    // optional / empty-array-default so old clients don't break.
    cities: string[];
    zips: string[];
    counties: string[];
    metros: string[];
    ports_loading: string[];
    ports_discharge: string[];
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
  // Opportunity score range. Numeric thresholds: 0-100 scale. Letter
  // grades are remapped: A=90, B=75, C=60, D=40.
  opportunity_score_min: number | null;
  opportunity_score_max: number | null;
  freshness_state: typeof FRESHNESS_KEYS[number][];
  workflow_state: string[];
  dataset_filter: typeof DATASET_KEYS[number];
  // Lane / origin → destination. country code OR UN/LOCODE port codes.
  trade_lane: {
    origin: string | null;
    destination: string | null;
  };
  // Mode + container detail
  mode: ("ocean" | "air" | "rail" | "truck" | "intermodal")[];
  container: {
    full_load: boolean | null;
    refrigerated: boolean;
    hazmat: boolean;
    types: string[];
  };
  // HS codes + plain-English commodity names
  commodity: {
    hs_codes: string[];
    names: string[];
  };
  // Time window
  time: {
    window:
      | "last_30d"
      | "last_60d"
      | "last_90d"
      | "last_180d"
      | "last_365d"
      | "ytd"
      | "qtd"
      | "mtd"
      | null;
    range_start: string | null;
    range_end: string | null;
  };
  // Carriers + counterparties
  carriers: {
    ocean: string[];
    forwarder: string[];
    customs_broker: string[];
    nvocc: string[];
  };
  counterparties: {
    suppliers: string[];
  };
  // Commercial signals (revenue / employees / public-listing)
  commercial: {
    revenue_min: number | null;
    revenue_max: number | null;
    employees_min: number | null;
    employees_max: number | null;
    public_only: boolean;
  };
  // Persona / contact shape
  persona: {
    titles: string[];
    seniority: ("c_suite" | "vp" | "director" | "manager" | "ic")[];
    functions: (
      | "procurement"
      | "ops"
      | "supply_chain"
      | "finance"
      | "logistics"
      | "executive"
    )[];
  };
  contact: {
    email_required: boolean;
    phone_required: boolean;
    dcs_only: boolean;
  };
  // Org-scoped CRM filters (resolved downstream against user_id/org_id)
  crm: {
    in_pipeline: boolean;
    recently_contacted_days: number | null;
    tags: string[];
    owner_email: string | null;
  };
  // Similarity lookup ("like X")
  similarity: {
    like_company: string | null;
  };
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
    "countries": string[],
    "cities": string[],
    "zips": string[],
    "counties": string[],
    "metros": string[],
    "ports_loading": string[],
    "ports_discharge": string[]
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
  "opportunity_score_min": number | null,
  "opportunity_score_max": number | null,
  "freshness_state": ("live" | "saved" | "directory" | "stale")[],
  "workflow_state": string[],
  "dataset_filter": "directory_only" | "live_only" | "all",
  "trade_lane": { "origin": string | null, "destination": string | null },
  "mode": ("ocean" | "air" | "rail" | "truck" | "intermodal")[],
  "container": {
    "full_load": boolean | null,
    "refrigerated": boolean,
    "hazmat": boolean,
    "types": string[]
  },
  "commodity": { "hs_codes": string[], "names": string[] },
  "time": {
    "window": "last_30d" | "last_60d" | "last_90d" | "last_180d" | "last_365d" | "ytd" | "qtd" | "mtd" | null,
    "range_start": string | null,
    "range_end": string | null
  },
  "carriers": {
    "ocean": string[],
    "forwarder": string[],
    "customs_broker": string[],
    "nvocc": string[]
  },
  "counterparties": { "suppliers": string[] },
  "commercial": {
    "revenue_min": number | null,
    "revenue_max": number | null,
    "employees_min": number | null,
    "employees_max": number | null,
    "public_only": boolean
  },
  "persona": {
    "titles": string[],
    "seniority": ("c_suite" | "vp" | "director" | "manager" | "ic")[],
    "functions": ("procurement" | "ops" | "supply_chain" | "finance" | "logistics" | "executive")[]
  },
  "contact": {
    "email_required": boolean,
    "phone_required": boolean,
    "dcs_only": boolean
  },
  "crm": {
    "in_pipeline": boolean,
    "recently_contacted_days": number | null,
    "tags": string[],
    "owner_email": string | null
  },
  "similarity": { "like_company": string | null },
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

──────────────────────────────────────────────────────────────────────
Extended dimensions (added 2026-06-18 — see
docs/superpowers/specs/2026-06-18-pulse-search-dimensions-design.md):

CITY — populate geo.cities with a flat string array of city names when
mentioned ("Houston shippers" → ["Houston"]). Disambiguate using state
hints when present ("Houston, TX" → ["Houston, TX"]). When the user
writes a metro nickname ("LA basin", "DFW", "NY tri-state"), expand
to constituent cities AND populate geo.metros with the MSA code.

ZIP — populate geo.zips with 5-digit strings ("77002") OR 3-digit
prefixes ("770xx" → "770"). Multiple ZIPs comma-separated → array.

COUNTY — populate geo.counties with "<County name>, <state>" when state
is known.

PORT — populate geo.ports_loading / geo.ports_discharge as UN/LOCODE
arrays. Common nicknames: "LAX" → "USLAX", "Long Beach" → "USLGB",
"Savannah" → "USSAV", "Houston port" → "USHOU", "Shanghai" → "CNSHA",
"Ho Chi Minh" → "VNSGN", "Yantian" → "CNYTN".

LANE — populate trade_lane.origin and trade_lane.destination as
2-letter country codes OR UN/LOCODE port codes. "China to LA" →
{origin:"CN",destination:"USLAX"}. "Vietnam to Savannah" →
{origin:"VN",destination:"USSAV"}.

MODE — populate mode with one or more of: "ocean", "air", "rail",
"truck", "intermodal". "FCL"/"LCL" → container.full_load (true/false).
"reefer"/"cold chain" → container.refrigerated=true. "hazmat"/"DG" →
container.hazmat=true. "40HC", "20GP", "20RF" → container.types[].

HS CODE — populate commodity.hs_codes as numeric strings; preserve
prefix length the user supplied ("HS 8703" → ["8703"]; "Chapter 87"
→ ["87"]). Commodity names → commodity.names[].

TIME — populate time.window with one of {"last_30d","last_60d",
"last_90d","last_180d","last_365d","ytd","qtd","mtd"} OR
time.range_start / time.range_end as ISO dates when the user gives
explicit bounds. "Q3 2025" → range_start "2025-07-01",
range_end "2025-09-30". "this year" → "ytd".

CARRIER — populate carriers.ocean[], carriers.forwarder[],
carriers.customs_broker[], carriers.nvocc[] when named. Carrier vs
forwarder dictionary: MSC/Maersk/CMA-CGM/COSCO/Hapag-Lloyd/ONE/Evergreen
/HMM/ZIM/Yang Ming/OOCL → ocean. Flexport/Expeditors/CH Robinson/DSV
/DHL Global Forwarding/Kuehne+Nagel/DB Schenker/Geodis → forwarder.

SUPPLIER — populate counterparties.suppliers[] when the user says
"supplier of X", "vendor for X", "X's suppliers".

COMMERCIAL — populate commercial.revenue_min/max (USD),
commercial.employees_min/max (count), commercial.public_only (bool)
when revenue / employee size / public-listing language appears.
"Fortune 500" → revenue_min ~5_000_000_000.

PERSONA — populate persona.titles[] (verbatim string), persona.seniority[]
(one of c_suite/vp/director/manager/ic) and persona.functions[]
(procurement/ops/supply_chain/finance/logistics/executive). "VP of
Logistics" → titles:["VP of Logistics"], seniority:["vp"],
functions:["logistics"].

CONTACT_VERIFICATION — populate contact.email_required,
contact.phone_required, contact.dcs_only when the user asks for
verified-only contacts.

CRM — populate crm.in_pipeline, crm.recently_contacted_days,
crm.tags[] when the user references their own workflow. "Sarah's
book" → crm.owner_email only when fully qualified; otherwise leave
blank.

SIMILARITY — populate similarity.like_company when the user says
"like X" / "similar to X" / "competitors of X". This becomes an
embedding lookup downstream.

OPPORTUNITY_SCORE — populate opportunity_score_min/max when a numeric
or letter-grade threshold is given. "score above 80" → score_min:80.
"B or better" → score_min:75. "A only" → score_min:90.

Missing dimensions → empty array / null / false as appropriate. Do
NOT invent values; leave fields at default when no signal.
`;

function defaults(query: string): ExplorerFilters {
  return {
    query,
    name: "",
    industry: [],
    geo: {
      regions: [],
      states: [],
      countries: [],
      cities: [],
      zips: [],
      counties: [],
      metros: [],
      ports_loading: [],
      ports_discharge: [],
    },
    size: { teu_min: null, teu_max: null, shipments_min: null, shipments_max: null, spend_min: null, spend_max: null },
    opportunity_types: [],
    opportunity_score_min: null,
    opportunity_score_max: null,
    freshness_state: [],
    workflow_state: [],
    dataset_filter: "all",
    trade_lane: { origin: null, destination: null },
    mode: [],
    container: { full_load: null, refrigerated: false, hazmat: false, types: [] },
    commodity: { hs_codes: [], names: [] },
    time: { window: null, range_start: null, range_end: null },
    carriers: { ocean: [], forwarder: [], customs_broker: [], nvocc: [] },
    counterparties: { suppliers: [] },
    commercial: {
      revenue_min: null,
      revenue_max: null,
      employees_min: null,
      employees_max: null,
      public_only: false,
    },
    persona: { titles: [], seniority: [], functions: [] },
    contact: { email_required: false, phone_required: false, dcs_only: false },
    crm: { in_pipeline: false, recently_contacted_days: null, tags: [], owner_email: null },
    similarity: { like_company: null },
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
    // New geo fields (2026-06-18). Lenient: any string array passes.
    for (const k of ["cities", "zips", "counties", "metros", "ports_loading", "ports_discharge"] as const) {
      const v = raw.geo[k];
      if (Array.isArray(v)) (out.geo as any)[k] = v.filter((s: any) => typeof s === "string" && s);
    }
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
  if (typeof raw.opportunity_score_min === "number") out.opportunity_score_min = clampScore(raw.opportunity_score_min);
  if (typeof raw.opportunity_score_max === "number") out.opportunity_score_max = clampScore(raw.opportunity_score_max);
  if (Array.isArray(raw.freshness_state)) {
    out.freshness_state = raw.freshness_state.filter((v: any) => FRESHNESS_KEYS.includes(v));
  }
  if (Array.isArray(raw.workflow_state)) {
    out.workflow_state = raw.workflow_state.filter((s: any) => typeof s === "string" && s);
  }
  if (DATASET_KEYS.includes(raw.dataset_filter)) out.dataset_filter = raw.dataset_filter;
  // ─── New dimensions (2026-06-18) ──────────────────────────────────
  if (raw.trade_lane && typeof raw.trade_lane === "object") {
    if (typeof raw.trade_lane.origin === "string") out.trade_lane.origin = raw.trade_lane.origin.trim().slice(0, 16) || null;
    if (typeof raw.trade_lane.destination === "string") out.trade_lane.destination = raw.trade_lane.destination.trim().slice(0, 16) || null;
  }
  const MODE_KEYS = ["ocean", "air", "rail", "truck", "intermodal"] as const;
  if (Array.isArray(raw.mode)) out.mode = raw.mode.filter((v: any) => MODE_KEYS.includes(v));
  if (raw.container && typeof raw.container === "object") {
    if (typeof raw.container.full_load === "boolean") out.container.full_load = raw.container.full_load;
    if (raw.container.refrigerated === true) out.container.refrigerated = true;
    if (raw.container.hazmat === true) out.container.hazmat = true;
    if (Array.isArray(raw.container.types)) out.container.types = raw.container.types.filter((s: any) => typeof s === "string" && s);
  }
  if (raw.commodity && typeof raw.commodity === "object") {
    if (Array.isArray(raw.commodity.hs_codes)) out.commodity.hs_codes = raw.commodity.hs_codes.map((s: any) => String(s).replace(/\D/g, "")).filter(Boolean);
    if (Array.isArray(raw.commodity.names)) out.commodity.names = raw.commodity.names.filter((s: any) => typeof s === "string" && s);
  }
  if (raw.time && typeof raw.time === "object") {
    const TIME_WINDOWS = ["last_30d","last_60d","last_90d","last_180d","last_365d","ytd","qtd","mtd"] as const;
    if (TIME_WINDOWS.includes(raw.time.window)) out.time.window = raw.time.window;
    if (typeof raw.time.range_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.time.range_start)) out.time.range_start = raw.time.range_start;
    if (typeof raw.time.range_end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.time.range_end)) out.time.range_end = raw.time.range_end;
  }
  if (raw.carriers && typeof raw.carriers === "object") {
    for (const k of ["ocean", "forwarder", "customs_broker", "nvocc"] as const) {
      const v = raw.carriers[k];
      if (Array.isArray(v)) (out.carriers as any)[k] = v.filter((s: any) => typeof s === "string" && s).slice(0, 50);
    }
  }
  if (raw.counterparties && Array.isArray(raw.counterparties.suppliers)) {
    out.counterparties.suppliers = raw.counterparties.suppliers.filter((s: any) => typeof s === "string" && s).slice(0, 50);
  }
  if (raw.commercial && typeof raw.commercial === "object") {
    for (const k of ["revenue_min", "revenue_max", "employees_min", "employees_max"] as const) {
      const v = raw.commercial[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) (out.commercial as any)[k] = v;
    }
    if (raw.commercial.public_only === true) out.commercial.public_only = true;
  }
  if (raw.persona && typeof raw.persona === "object") {
    const SENIORITY = ["c_suite", "vp", "director", "manager", "ic"] as const;
    const FUNCTIONS = ["procurement", "ops", "supply_chain", "finance", "logistics", "executive"] as const;
    if (Array.isArray(raw.persona.titles)) out.persona.titles = raw.persona.titles.filter((s: any) => typeof s === "string" && s).slice(0, 20);
    if (Array.isArray(raw.persona.seniority)) out.persona.seniority = raw.persona.seniority.filter((v: any) => SENIORITY.includes(v));
    if (Array.isArray(raw.persona.functions)) out.persona.functions = raw.persona.functions.filter((v: any) => FUNCTIONS.includes(v));
  }
  if (raw.contact && typeof raw.contact === "object") {
    if (raw.contact.email_required === true) out.contact.email_required = true;
    if (raw.contact.phone_required === true) out.contact.phone_required = true;
    if (raw.contact.dcs_only === true) out.contact.dcs_only = true;
  }
  if (raw.crm && typeof raw.crm === "object") {
    if (raw.crm.in_pipeline === true) out.crm.in_pipeline = true;
    if (typeof raw.crm.recently_contacted_days === "number" && raw.crm.recently_contacted_days >= 0) {
      out.crm.recently_contacted_days = Math.floor(raw.crm.recently_contacted_days);
    }
    if (Array.isArray(raw.crm.tags)) out.crm.tags = raw.crm.tags.filter((s: any) => typeof s === "string" && s).slice(0, 50);
    if (typeof raw.crm.owner_email === "string" && /@/.test(raw.crm.owner_email)) {
      out.crm.owner_email = raw.crm.owner_email.trim().slice(0, 200);
    }
  }
  if (raw.similarity && typeof raw.similarity.like_company === "string") {
    out.similarity.like_company = raw.similarity.like_company.trim().slice(0, 200) || null;
  }
  if (typeof raw.confidence === "number") out.confidence = Math.max(0, Math.min(1, raw.confidence));
  return out;
}

/** Clamp opportunity score to [0, 100]. Letter grades resolve to
 *  numeric ranges upstream in the prompt. */
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
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
