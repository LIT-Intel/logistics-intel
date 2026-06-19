// Deterministic NL parser for Pulse Explorer queries.
//
// Runs BEFORE the LLM and extracts everything that can be matched with
// regex + dictionaries — states, USPS codes, regions, "City, State"
// pairs, ZIP codes, HS codes, percentages, dollar amounts, TEU
// thresholds, growth/decline keywords, opportunity-score thresholds,
// time windows, ports, trade-lane phrasing ("X to Y").
//
// Each extractor returns a partial filter object. The caller merges
// them deterministically, then passes whatever's left to the LLM for
// fuzzy intent (industry synonyms, brand-name detection, product /
// commodity normalisation, opportunity_types). The LLM only fills
// gaps the regex layer couldn't.
//
// Why this matters (CEO-review 2026-06-19):
// - Old parser was 100% LLM → 40% confidence gate gave inconsistent
//   results on identical queries. Cost ~$0.01 per parse.
// - Deterministic-first cuts LLM calls ~70-80% on common queries and
//   produces *consistent* output every time. The LLM is reserved for
//   the genuinely fuzzy 20%.
// - Adds a TYPED contract: every extraction carries a source label
//   so the caller can show provenance ("matched via state pattern"
//   vs "LLM inferred").

export type ParserSource = "regex" | "dictionary" | "llm" | "default";

export interface DeterministicExtraction {
  // Geography
  states: string[];                              // USPS 2-letter codes
  regions: string[];                             // canonical region keys
  cities: string[];                              // city names (case as typed)
  cityStatePairs: Array<{ city: string; state: string }>; // "Decatur, GA"
  zips: string[];                                // 5-digit zip codes
  countries: string[];                           // ISO-2 or full name normalised
  ports_loading: string[];
  ports_discharge: string[];

  // Volume / financial
  teu_min: number | null;
  teu_max: number | null;
  shipments_min: number | null;
  shipments_max: number | null;
  revenue_min: number | null;
  revenue_max: number | null;
  spend_min: number | null;
  spend_max: number | null;
  employees_min: number | null;
  employees_max: number | null;

  // Growth + opportunity
  growthMinPct: number | null;                   // shipment_growth_6m_pct min
  growthMaxPct: number | null;                   // shipment_growth_6m_pct max
  opportunityMin: number | null;                 // opportunity_score min
  opportunityMax: number | null;                 // opportunity_score max

  // Commodity
  hs_codes: string[];

  // Trade lane
  tradeLaneOrigin: string | null;
  tradeLaneDestination: string | null;

  // Modes
  modes: ("ocean" | "air" | "rail" | "truck" | "intermodal")[];

  // Time
  timeWindow: ("last_30d" | "last_60d" | "last_90d" | "last_180d" | "last_365d" | "ytd" | "qtd" | "mtd") | null;

  // Volume trend hint (parsed; backend maps to growth/decline filters)
  volumeTrend: ("growing" | "declining" | "stable" | "new" | "reactivated" | "dormant") | null;

  // CRM
  savedOnly: boolean;
  unsavedOnly: boolean;

  // Metadata
  extractionsBySource: Array<{
    dimension: string;
    value: string;
    source: ParserSource;
    pattern: string;
  }>;

  // The portion of the query NOT consumed by deterministic
  // extraction — passed to the LLM if any tokens remain meaningful.
  residual: string;
}

// ────────────────────────────────────────────────────────────────────────
// Dictionaries
// ────────────────────────────────────────────────────────────────────────

const STATE_NAME_TO_CODE: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
  "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
  "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
  "wisconsin": "WI", "wyoming": "WY",
};

const STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

// Synonyms for common informal state references — keep tight so we
// don't accidentally match a brand name.
const STATE_SYNONYMS: Record<string, string> = {
  "cali": "CA", "socal": "CA", "norcal": "CA",
  "tex": "TX", "mass": "MA", "penn": "PA",
};

const REGION_KEYS: Record<string, string> = {
  "southeast": "southeast", "south east": "southeast",
  "west coast": "west_coast", "pacific": "west_coast",
  "pacific northwest": "west_coast",
  "northeast": "northeast", "new england": "northeast",
  "midwest": "midwest", "mid west": "midwest", "mid-west": "midwest",
  "southwest": "southwest", "south west": "southwest",
  "mountain west": "mountain", "rockies": "mountain", "mountain": "mountain",
  "gulf coast": "southeast", // closest available bucket
  "east coast": "northeast",
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "china": "CN", "prc": "CN", "people's republic of china": "CN",
  "vietnam": "VN", "viet nam": "VN",
  "india": "IN", "japan": "JP", "south korea": "KR", "korea": "KR",
  "taiwan": "TW", "thailand": "TH", "indonesia": "ID", "philippines": "PH",
  "malaysia": "MY", "singapore": "SG", "bangladesh": "BD", "pakistan": "PK",
  "germany": "DE", "italy": "IT", "france": "FR", "spain": "ES",
  "united kingdom": "GB", "uk": "GB", "great britain": "GB",
  "netherlands": "NL", "belgium": "BE", "poland": "PL", "turkey": "TR",
  "mexico": "MX", "canada": "CA", "brazil": "BR", "colombia": "CO",
  "chile": "CL", "peru": "PE", "argentina": "AR",
  "united states": "US", "usa": "US", "u.s.": "US", "u.s.a.": "US",
};

// Common port names → typical UN/LOCODE-ish identifiers
// (kept simple — backend handles fuzzy matching).
const PORT_NAMES: Record<string, string> = {
  "shanghai": "CNSHA", "yantian": "CNYTN", "shenzhen": "CNSZN",
  "ningbo": "CNNGB", "qingdao": "CNTAO", "hong kong": "HKHKG",
  "kaohsiung": "TWKHH", "busan": "KRPUS", "ho chi minh": "VNSGN",
  "haiphong": "VNHPH", "rotterdam": "NLRTM", "hamburg": "DEHAM",
  "antwerp": "BEANR", "los angeles": "USLAX", "long beach": "USLGB",
  "oakland": "USOAK", "seattle": "USSEA", "tacoma": "USTIW",
  "savannah": "USSAV", "charleston": "USCHS", "new york": "USNYC",
  "newark": "USEWR", "norfolk": "USORF", "houston": "USHOU",
  "mobile": "USMOB", "miami": "USMIA",
};

const GROWTH_PHRASES: Array<{ pattern: RegExp; min: number; trend: "growing" }> = [
  { pattern: /\b(exploding|skyrocketing|booming)\b/i, min: 50, trend: "growing" },
  { pattern: /\b(fast.?growing|rapidly growing|surging)\b/i, min: 25, trend: "growing" },
  { pattern: /\b(growing|rising|increasing|trending up|uptrending)\b/i, min: 10, trend: "growing" },
];

const DECLINE_PHRASES: Array<{ pattern: RegExp; max: number; trend: "declining" }> = [
  { pattern: /\b(collapsed|crashed|stopped importing|halted imports)\b/i, max: -50, trend: "declining" },
  { pattern: /\b(downtrending|down.?trader|sharply declining|losing volume)\b/i, max: -25, trend: "declining" },
  { pattern: /\b(declining|falling|decreasing|slowing|slipping|trending down)\b/i, max: -10, trend: "declining" },
];

const NEW_IMPORTER_PHRASES = /\b(new importers?|first.?time shippers?|recently started importing|just started shipping)\b/i;
const REACTIVATED_PHRASES = /\b(reactivated|restarted importing|dormant.*active|woke back up)\b/i;
const DORMANT_PHRASES = /\b(dormant|inactive|paused importing|gone quiet)\b/i;

const VOLUME_HIGH_PHRASES = /\b(high.?volume|major shippers?|top importers?|biggest shippers?|enterprise volume)\b/i;
const VOLUME_LOW_PHRASES = /\b(low.?volume|small shippers?|boutique importers?)\b/i;

const OPPORTUNITY_HIGH_PHRASES = /\b(best opportunities|highest scoring|top targets|hottest accounts|high.?intent)\b/i;

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function newExtraction(query: string): DeterministicExtraction {
  return {
    states: [], regions: [], cities: [], cityStatePairs: [], zips: [], countries: [],
    ports_loading: [], ports_discharge: [],
    teu_min: null, teu_max: null,
    shipments_min: null, shipments_max: null,
    revenue_min: null, revenue_max: null,
    spend_min: null, spend_max: null,
    employees_min: null, employees_max: null,
    growthMinPct: null, growthMaxPct: null,
    opportunityMin: null, opportunityMax: null,
    hs_codes: [],
    tradeLaneOrigin: null, tradeLaneDestination: null,
    modes: [],
    timeWindow: null,
    volumeTrend: null,
    savedOnly: false, unsavedOnly: false,
    extractionsBySource: [],
    residual: query,
  };
}

function pushHit(ex: DeterministicExtraction, dimension: string, value: string, pattern: string, source: ParserSource = "regex") {
  ex.extractionsBySource.push({ dimension, value, source, pattern });
}

function uniqPush(arr: string[], value: string): void {
  const norm = value.trim();
  if (!norm) return;
  if (!arr.includes(norm)) arr.push(norm);
}

// Money parser: "over $50M", "above 100k", "under $20 million", "$1.5b"
function parseMoneyToken(raw: string): number | null {
  const m = /\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(b|bn|billion|m|mm|million|k|thousand)?/i.exec(raw);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  let mult = 1;
  if (unit.startsWith("b")) mult = 1_000_000_000;
  else if (unit === "m" || unit === "mm" || unit === "million") mult = 1_000_000;
  else if (unit === "k" || unit === "thousand") mult = 1_000;
  return Math.round(n * mult);
}

// ────────────────────────────────────────────────────────────────────────
// Extractors — pure functions, each consumes from the residual
// ────────────────────────────────────────────────────────────────────────

function extractStatesAndCityStatePairs(query: string, ex: DeterministicExtraction): void {
  // Pass 1: "City, State" pairs — e.g. "Decatur, Georgia", "Atlanta, GA".
  // This is the highest-priority pattern because the LLM frequently
  // dropped the city when the state was also present.
  const pairPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*,\s*(?:([A-Z]{2})\b|([A-Za-z][a-zA-Z\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = pairPattern.exec(query)) !== null) {
    const city = m[1];
    let stateCode: string | null = null;
    if (m[2]) {
      if (STATE_CODES.has(m[2])) stateCode = m[2];
    } else if (m[3]) {
      const candidate = m[3].toLowerCase().trim();
      // Greedy state-name match against the trailing token sequence.
      const direct = STATE_NAME_TO_CODE[candidate];
      if (direct) {
        stateCode = direct;
      } else {
        // Try first 1-3 tokens (e.g. "New York" but stop at "New York City")
        const tokens = candidate.split(/\s+/);
        for (let take = Math.min(3, tokens.length); take >= 1; take--) {
          const probe = tokens.slice(0, take).join(" ");
          if (STATE_NAME_TO_CODE[probe]) {
            stateCode = STATE_NAME_TO_CODE[probe];
            break;
          }
        }
      }
    }
    if (city && stateCode) {
      ex.cityStatePairs.push({ city, state: stateCode });
      uniqPush(ex.cities, city);
      uniqPush(ex.states, stateCode);
      pushHit(ex, "city_state_pair", `${city}, ${stateCode}`, "City, State");
    }
  }

  // Pass 2: bare state names like "in Georgia", "California companies"
  // BUT only if not already captured via a City, State pair.
  const lowered = ` ${query.toLowerCase()} `;
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (ex.states.includes(code)) continue;
    const padded = ` ${name} `;
    if (lowered.includes(padded)) {
      uniqPush(ex.states, code);
      pushHit(ex, "state", code, `state name: ${name}`);
    }
  }

  // Pass 3: state codes — only when preceded by "in" / "from" / "," to
  // avoid false positives on brand names containing letter pairs.
  const codePattern = /\b(?:in|from|to|near)\s+([A-Z]{2})\b/g;
  while ((m = codePattern.exec(query)) !== null) {
    if (STATE_CODES.has(m[1])) {
      uniqPush(ex.states, m[1]);
      pushHit(ex, "state", m[1], `USPS code with prefix`);
    }
  }

  // Pass 4: informal synonyms (cali, socal, mass, ...)
  for (const [syn, code] of Object.entries(STATE_SYNONYMS)) {
    if (new RegExp(`\\b${syn}\\b`, "i").test(query)) {
      uniqPush(ex.states, code);
      pushHit(ex, "state", code, `synonym: ${syn}`);
    }
  }
}

function extractRegions(query: string, ex: DeterministicExtraction): void {
  const lowered = query.toLowerCase();
  for (const [phrase, key] of Object.entries(REGION_KEYS)) {
    if (lowered.includes(phrase)) {
      if (!ex.regions.includes(key)) {
        ex.regions.push(key);
        pushHit(ex, "region", key, `phrase: ${phrase}`);
      }
    }
  }
}

function extractZips(query: string, ex: DeterministicExtraction): void {
  const pattern = /\b(\d{5})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(query)) !== null) {
    uniqPush(ex.zips, m[1]);
    pushHit(ex, "zip", m[1], "5-digit zip");
  }
}

function extractCountries(query: string, ex: DeterministicExtraction): void {
  const lowered = ` ${query.toLowerCase()} `;
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    const padded = ` ${name} `;
    if (lowered.includes(padded)) {
      uniqPush(ex.countries, code);
      pushHit(ex, "country", code, `country name: ${name}`);
    }
  }
}

function extractPorts(query: string, ex: DeterministicExtraction): void {
  const lowered = query.toLowerCase();
  for (const [name, code] of Object.entries(PORT_NAMES)) {
    if (lowered.includes(name)) {
      // Heuristic: if it's near "from" / "origin" → loading port, near
      // "to" / "destination" → discharge port. Default to loading.
      const idx = lowered.indexOf(name);
      const context = lowered.slice(Math.max(0, idx - 30), idx);
      const isDischarge = /\bto\b|\binto\b|\bdestination\b|\bunlading\b|\barrive\b/i.test(context);
      const isLoading = /\bfrom\b|\borigin\b|\bloading\b|\bdeparting\b/i.test(context);
      if (isDischarge && !isLoading) {
        uniqPush(ex.ports_discharge, code);
        pushHit(ex, "port_discharge", code, `port: ${name}`);
      } else {
        uniqPush(ex.ports_loading, code);
        pushHit(ex, "port_loading", code, `port: ${name}`);
      }
    }
  }
}

function extractHsCodes(query: string, ex: DeterministicExtraction): void {
  // Match "HS 9403", "hs code 8703", "code 4011", with 4-10 digit support
  const pattern = /\b(?:hs\s*(?:code\s*)?|code\s+)([\d]{4,10})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(query)) !== null) {
    uniqPush(ex.hs_codes, m[1]);
    pushHit(ex, "hs_code", m[1], "HS code");
  }
}

function extractMoneyRanges(query: string, ex: DeterministicExtraction): void {
  // "over $50M", "above 100M revenue", "more than $1B in sales"
  const minRevenue = /\b(?:over|above|more than|at least|greater than|>=?)\s+(\$?\s*[\d.]+\s*(?:b|bn|billion|m|mm|million|k|thousand)?)/gi;
  // "under $20M", "less than $50 million", "below 100k"
  const maxRevenue = /\b(?:under|below|less than|at most|fewer than|<=?)\s+(\$?\s*[\d.]+\s*(?:b|bn|billion|m|mm|million|k|thousand)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = minRevenue.exec(query)) !== null) {
    const n = parseMoneyToken(m[1]);
    // Decide whether this is revenue, spend, or TEU based on context
    const idx = m.index;
    const after = query.slice(idx, idx + 100).toLowerCase();
    if (/teu|container/.test(after)) {
      if (n) ex.teu_min = n;
      if (n) pushHit(ex, "teu_min", String(n), "money pattern → TEU");
    } else if (/spend|spending|freight cost|ocean spend/.test(after)) {
      if (n) ex.spend_min = n;
      if (n) pushHit(ex, "spend_min", String(n), "money pattern → spend");
    } else {
      if (n) ex.revenue_min = n;
      if (n) pushHit(ex, "revenue_min", String(n), "money pattern → revenue");
    }
  }
  while ((m = maxRevenue.exec(query)) !== null) {
    const n = parseMoneyToken(m[1]);
    const idx = m.index;
    const after = query.slice(idx, idx + 100).toLowerCase();
    if (/teu|container/.test(after)) {
      if (n) ex.teu_max = n;
      if (n) pushHit(ex, "teu_max", String(n), "money pattern → TEU");
    } else if (/spend/.test(after)) {
      if (n) ex.spend_max = n;
      if (n) pushHit(ex, "spend_max", String(n), "money pattern → spend");
    } else {
      if (n) ex.revenue_max = n;
      if (n) pushHit(ex, "revenue_max", String(n), "money pattern → revenue");
    }
  }
}

function extractShipmentAndTeu(query: string, ex: DeterministicExtraction): void {
  // "500 TEU+", "1000 containers", "100 shipments+"
  const teuPattern = /\b([\d,]+)\s*(?:\+|or more|plus)?\s*(?:teu|containers?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = teuPattern.exec(query)) !== null) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n)) {
      ex.teu_min = ex.teu_min == null ? n : Math.max(ex.teu_min, n);
      pushHit(ex, "teu_min", String(n), "TEU number");
    }
  }
  const shipPattern = /\b([\d,]+)\s*(?:\+|or more|plus)?\s*shipments?\b/gi;
  while ((m = shipPattern.exec(query)) !== null) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n)) {
      ex.shipments_min = ex.shipments_min == null ? n : Math.max(ex.shipments_min, n);
      pushHit(ex, "shipments_min", String(n), "shipments number");
    }
  }
  // Volume language: "high volume", "small shippers"
  if (VOLUME_HIGH_PHRASES.test(query)) {
    ex.teu_min = ex.teu_min == null ? 50 : ex.teu_min;
    ex.shipments_min = ex.shipments_min == null ? 100 : ex.shipments_min;
    pushHit(ex, "volume_high", "TEU≥50 + shipments≥100", "high-volume phrase");
  } else if (VOLUME_LOW_PHRASES.test(query)) {
    ex.teu_max = ex.teu_max == null ? 50 : ex.teu_max;
    pushHit(ex, "volume_low", "TEU<50", "low-volume phrase");
  }
}

function extractGrowthAndDecline(query: string, ex: DeterministicExtraction): void {
  // Explicit percentage: "growing 25%", "up 30%", "down 40%"
  const pctPattern = /\b(growing|up|increased|grew|rising|declining|down|fell|dropped|decreased|fell)\s+(\d+)\s*%/gi;
  let m: RegExpExecArray | null;
  while ((m = pctPattern.exec(query)) !== null) {
    const verb = m[1].toLowerCase();
    const pct = parseInt(m[2], 10);
    if (!Number.isFinite(pct)) continue;
    if (/grow|up|increas|grew|ris/.test(verb)) {
      ex.growthMinPct = ex.growthMinPct == null ? pct : Math.max(ex.growthMinPct, pct);
      ex.volumeTrend = "growing";
      pushHit(ex, "growth_min_pct", String(pct), "explicit % growth");
    } else {
      ex.growthMaxPct = ex.growthMaxPct == null ? -pct : Math.min(ex.growthMaxPct, -pct);
      ex.volumeTrend = "declining";
      pushHit(ex, "growth_max_pct", String(-pct), "explicit % decline");
    }
  }
  // Phrase-based growth (fast-growing, exploding, surging, ...)
  if (ex.growthMinPct == null) {
    for (const g of GROWTH_PHRASES) {
      if (g.pattern.test(query)) {
        ex.growthMinPct = g.min;
        ex.volumeTrend = "growing";
        pushHit(ex, "growth_min_pct", String(g.min), `phrase: ${g.pattern.source}`);
        break;
      }
    }
  }
  // Phrase-based decline
  if (ex.growthMaxPct == null) {
    for (const d of DECLINE_PHRASES) {
      if (d.pattern.test(query)) {
        ex.growthMaxPct = d.max;
        ex.volumeTrend = "declining";
        pushHit(ex, "growth_max_pct", String(d.max), `phrase: ${d.pattern.source}`);
        break;
      }
    }
  }
  // New / reactivated / dormant
  if (NEW_IMPORTER_PHRASES.test(query)) {
    ex.volumeTrend = "new";
    pushHit(ex, "volume_trend", "new", "new-importer phrase");
  } else if (REACTIVATED_PHRASES.test(query)) {
    ex.volumeTrend = "reactivated";
    pushHit(ex, "volume_trend", "reactivated", "reactivated phrase");
  } else if (DORMANT_PHRASES.test(query)) {
    ex.volumeTrend = "dormant";
    pushHit(ex, "volume_trend", "dormant", "dormant phrase");
  }
}

function extractOpportunityScore(query: string, ex: DeterministicExtraction): void {
  // "score over 80", "opportunity score > 75", "above 90 score"
  const minPattern = /\b(?:opportunity\s+)?score\s+(?:over|above|>=?)\s+(\d{1,3})\b/i;
  const m1 = minPattern.exec(query);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      ex.opportunityMin = n;
      pushHit(ex, "opportunity_min", String(n), "score threshold");
    }
  }
  if (OPPORTUNITY_HIGH_PHRASES.test(query)) {
    if (ex.opportunityMin == null) ex.opportunityMin = 75;
    pushHit(ex, "opportunity_min", "75", "best-opportunities phrase");
  }
}

function extractTradeLane(query: string, ex: DeterministicExtraction): void {
  // "X to Y" / "from X to Y" — match origin + destination tokens
  // against country / port dictionaries.
  const tokens = query.toLowerCase();
  const lanePattern = /\b(?:from\s+)?([a-z][a-z\s]+?)\s+(?:to|into)\s+([a-z][a-z\s]+?)(?:\s|$|,)/i;
  const m = lanePattern.exec(tokens);
  if (m) {
    const origin = m[1].trim();
    const destination = m[2].trim();
    const originCode = COUNTRY_NAME_TO_CODE[origin] || PORT_NAMES[origin] || null;
    const destCode = COUNTRY_NAME_TO_CODE[destination] || PORT_NAMES[destination] || null;
    if (originCode) {
      ex.tradeLaneOrigin = originCode;
      pushHit(ex, "trade_lane_origin", originCode, `lane: ${origin} → ${destination}`);
    }
    if (destCode) {
      ex.tradeLaneDestination = destCode;
      pushHit(ex, "trade_lane_destination", destCode, `lane: ${origin} → ${destination}`);
    }
  }
}

function extractModes(query: string, ex: DeterministicExtraction): void {
  const map: Array<["ocean" | "air" | "rail" | "truck" | "intermodal", RegExp]> = [
    ["ocean", /\b(ocean|sea|maritime|container ship|fcl|lcl)\b/i],
    ["air", /\b(air freight|air cargo|airfreight)\b/i],
    ["rail", /\b(rail|train|intermodal rail)\b/i],
    ["truck", /\b(truck|trucking|over the road|otr|drayage)\b/i],
    ["intermodal", /\b(intermodal)\b/i],
  ];
  for (const [key, pattern] of map) {
    if (pattern.test(query)) {
      if (!ex.modes.includes(key)) {
        ex.modes.push(key);
        pushHit(ex, "mode", key, `mode phrase`);
      }
    }
  }
}

function extractTimeWindow(query: string, ex: DeterministicExtraction): void {
  const map: Array<[NonNullable<DeterministicExtraction["timeWindow"]>, RegExp]> = [
    ["last_30d", /\b(last 30 days?|past 30 days?|last month)\b/i],
    ["last_60d", /\b(last 60 days?|past 60 days?|last 2 months)\b/i],
    ["last_90d", /\b(last 90 days?|past 90 days?|last quarter|last 3 months)\b/i],
    ["last_180d", /\b(last 180 days?|past 180 days?|last 6 months|past 6 months|h2|h1)\b/i],
    ["last_365d", /\b(last (?:12 months|year)|past (?:12 months|year)|trailing twelve months|ttm)\b/i],
    ["ytd", /\b(year to date|ytd|this year)\b/i],
    ["qtd", /\b(quarter to date|qtd|this quarter)\b/i],
    ["mtd", /\b(month to date|mtd|this month)\b/i],
  ];
  for (const [key, pattern] of map) {
    if (pattern.test(query)) {
      ex.timeWindow = key;
      pushHit(ex, "time_window", key, "time phrase");
      break;
    }
  }
}

function extractCrm(query: string, ex: DeterministicExtraction): void {
  if (/\b(saved (?:companies|accounts)|in my crm|on my list|my saved)\b/i.test(query)) {
    ex.savedOnly = true;
    pushHit(ex, "saved_only", "true", "saved-only phrase");
  }
  if (/\b(not (?:saved|contacted)|unsaved|never contacted|fresh accounts|new prospects)\b/i.test(query)) {
    ex.unsavedOnly = true;
    pushHit(ex, "unsaved_only", "true", "unsaved phrase");
  }
}

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

/**
 * Parse a natural-language query against every deterministic
 * extractor. Order matters slightly — city/state runs first so the
 * region/state passes know what's already accounted for.
 *
 * Returns a populated extraction PLUS a confidence score derived
 * from how many dimensions were captured deterministically. A
 * confidence ≥ 0.75 means the caller can probably skip the LLM
 * entirely. A confidence < 0.5 means the LLM should run to fill
 * gaps (industry synonyms, brand-name detection, fuzzy intent).
 */
export function parseDeterministic(query: string): DeterministicExtraction & { confidence: number } {
  const ex = newExtraction(query);

  extractStatesAndCityStatePairs(query, ex);
  extractRegions(query, ex);
  extractZips(query, ex);
  extractCountries(query, ex);
  extractPorts(query, ex);
  extractHsCodes(query, ex);
  extractMoneyRanges(query, ex);
  extractShipmentAndTeu(query, ex);
  extractGrowthAndDecline(query, ex);
  extractOpportunityScore(query, ex);
  extractTradeLane(query, ex);
  extractModes(query, ex);
  extractTimeWindow(query, ex);
  extractCrm(query, ex);

  // Confidence — count of dimensions extracted, capped.
  const dimsHit =
    (ex.states.length ? 1 : 0) +
    (ex.regions.length ? 1 : 0) +
    (ex.cities.length ? 1 : 0) +
    (ex.zips.length ? 1 : 0) +
    (ex.countries.length ? 1 : 0) +
    (ex.ports_loading.length || ex.ports_discharge.length ? 1 : 0) +
    (ex.hs_codes.length ? 1 : 0) +
    (ex.teu_min != null || ex.teu_max != null ? 1 : 0) +
    (ex.shipments_min != null || ex.shipments_max != null ? 1 : 0) +
    (ex.revenue_min != null || ex.revenue_max != null ? 1 : 0) +
    (ex.growthMinPct != null || ex.growthMaxPct != null ? 1 : 0) +
    (ex.opportunityMin != null ? 1 : 0) +
    (ex.tradeLaneOrigin || ex.tradeLaneDestination ? 1 : 0) +
    (ex.modes.length ? 1 : 0) +
    (ex.timeWindow ? 1 : 0) +
    (ex.savedOnly || ex.unsavedOnly ? 1 : 0);

  // 5+ dimensions captured ≈ very confident; 0 captured ≈ rely on LLM.
  const confidence = Math.min(0.95, dimsHit * 0.18);
  return { ...ex, confidence };
}
