// Client for the pulse-explore-parse edge fn.
// POST { query } → { ok, parsed: ExplorerFilters, model }

import { supabase } from '@/lib/supabase';

export async function parseExploreQuery(query) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-explore-parse`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`pulse-explore-parse ${r.status}`);
  return await r.json();
}

// Last-resort: when the LLM parse extracted nothing useful AND the query
// looks like a company brand (short, mostly letters/spaces, not a known
// filter phrase), treat the raw text as a company-name search. Lets
// "Walmart" / "Q Cells" / "Tesla" work even when the LLM is cold or down.
const NAME_KILL_PHRASES = [
  'incumbent','vulnerable','consolidat','high-velocity','high velocity',
  'defend','grow','book','stale','live data','top mover','importer','exporter',
  'shipper','forwarder','teu','spend','revenue','manufacturer','retailer',
  'food and beverage','automotive','electronics','industry','vertical','metro',
  'state','country','region','coast','southeast','northeast','midwest','southwest',
];
export function looksLikeCompanyName(query) {
  const q = String(query ?? '').trim();
  if (!q || q.length > 80) return false;
  const lower = q.toLowerCase();
  if (NAME_KILL_PHRASES.some((p) => lower.includes(p))) return false;
  // Mostly letters / spaces / common brand punctuation, not a phrase
  // with prepositions / commas.
  if (/[,;]| in | from | with | above | below | under /.test(` ${lower} `)) return false;
  return /^[A-Za-z][A-Za-z0-9 .,&'\-_/]{1,79}$/.test(q);
}

// Cross-border origin intent — "importing from canada", "mexican suppliers",
// "buys from mexico". These can NEVER be answered by the US market directory
// (it has no shipment-origin dimension); the NA cross-border dataset
// (lit_na_market_search: US companies importing from Mexico & Canada) is the
// one that answers them, so market-mode queries route there on detection.
export function detectNaOrigin(query) {
  const q = ` ${String(query ?? '').toLowerCase()} `;
  const canada = /\bcanad(a|ian)\b/.test(q);
  const mexico = /\bmexic(o|an)\b/.test(q);
  if (!canada && !mexico) return null;
  const originIntent =
    /\b(from|out of|sourced? (in|from)|sourcing (in|from)|import\w*|buy\w* from|ship\w* from|suppliers?|cross[\s-]?border)\b/.test(q);
  if (!originIntent) return null;
  // RPC takes one origin; when both are named, Mexico is the larger set.
  return mexico ? 'Mexico' : 'Canada';
}


// ─────────────────────────────────────────────────────────────────────────
// Deterministic, LLM-FREE filter extraction.
//
// Resilience fallback: when the edge LLM parse returns nothing useful — or is
// unreachable, or its provider API keys are misconfigured — the Explorer can
// STILL run a real search for the most common query shape ("<x> in <place>").
// pulse-explore queries Postgres directly (no LLM), so geography filters alone
// produce real results. Region keys mirror the server's region_presets.ts so
// the edge fn expands them identically.
// ─────────────────────────────────────────────────────────────────────────
// A phrase may map to ONE region key or SEVERAL (e.g. "east coast" spans the
// northeast + southeast presets — the server has no single east_coast key).
const REGION_PHRASES = [
  [/\b(east[\s-]?coast|eastern seaboard|atlantic coast|eastern us)\b/, ['northeast', 'southeast']],
  [/\b(south[\s-]?east(ern)?|se us)\b/, 'southeast'],
  [/\b(west[\s-]?coast|pacific( coast)?|western us)\b/, 'west_coast'],
  [/\b(north[\s-]?east(ern)?|new england|tri[\s-]?state)\b/, 'northeast'],
  [/\b(mid[\s-]?west(ern)?|great lakes)\b/, 'midwest'],
  [/\b(south[\s-]?west(ern)?)\b/, 'southwest'],
  [/\b(mountain( west)?|rock(y|ies)|rocky mountain)\b/, 'mountain'],
];

const STATE_NAME_TO_CODE = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'puerto rico': 'PR',
};
const STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

// Small bounded Damerau-Levenshtein (OSA) for typo-tolerant state matching:
// "geogia" → georgia (deletion), "flordia" → florida (transposition counts
// as ONE edit — it's the most common typo class). Inputs are ≤ ~20 chars so
// cost is nil.
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

// Fuzzy state lookup over query tokens (unigrams + bigrams for two-word
// states). Distance budget: 1 for names under 8 letters, 2 for 8+. Tokens
// under 5 letters never fuzzy-match — short words have too many neighbors
// ("iowa"/"ohio"/"utah" stay exact-only).
function fuzzyStates(lower) {
  const tokens = lower.split(/[^a-z]+/).filter((t) => t.length >= 5);
  const grams = [...tokens];
  const all = lower.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < all.length - 1; i++) grams.push(`${all[i]} ${all[i + 1]}`);
  const hits = [];
  for (const g of grams) {
    if (g.length < 5) continue;
    for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
      if (name.length < 5 || Math.abs(name.length - g.length) > 2) continue;
      const budget = name.length >= 8 ? 2 : 1;
      if (editDistance(g, name) <= budget && !hits.includes(code)) hits.push(code);
    }
  }
  return hits;
}

// Remove tokens that are TYPOS of the given states' names ("geogia" when GA
// was resolved) from residual keyword text — otherwise the typo leaks into
// keyword matching downstream and filters everything to zero. Same distance
// budget as fuzzyStates.
export function stripStateTypoTokens(text, stateCodes = []) {
  const names = stateCodes
    .map((c) => Object.entries(STATE_NAME_TO_CODE).find(([, code]) => code === c)?.[0])
    .filter(Boolean);
  if (!names.length) return text;
  return String(text || '')
    .split(/\s+/)
    .filter((tok) => {
      const t = tok.toLowerCase();
      if (t.length < 5) return true;
      return !names.some(
        (n) => n.length >= 5 && editDistance(t, n) <= (n.length >= 8 ? 2 : 1),
      );
    })
    .join(' ');
}

// Keyword → EXACT lit_company_directory.industry value(s). pulse-explore does
// an exact `industry IN (...)` match, so mapped strings MUST match stored
// values — the canonical 32-value list lives in the edge fn's prompt
// (supabase/functions/pulse-explore-parse/index.ts) and was verified against
// the live table. A phrase may map to one canonical value or several.
//
// This dictionary is the DETERMINISTIC layer: it resolves the common vertical
// phrasings instantly with zero LLM latency. The unbounded tail (novel
// phrasings, typos, niche verticals) is handled by the edge LLM parse, whose
// output actually reaches the filters now (envelope unwrap fix in
// parsedToFilters below).
const INDUSTRY_PHRASES = [
  // Core industrial
  [/\b(manufactur\w*|factor(y|ies)|oem|industrial goods)\b/, 'Manufacturing'],
  [/\b(machin(e|ery|ing)|heavy equipment|industrial equipment|tooling|cnc)\b/, 'Machinery'],
  [/\b(electronics?|electrical|semiconductors?|microchips?|circuit boards?|pcbs?)\b/, ['Electrical Equipment', 'Manufacturing']],
  [/\b(lighting|led fixtures?)\b/, 'Electrical Equipment'],
  [/\b(batter(y|ies)|solar|photovoltaics?|renewables?|wind turbines?)\b/, ['Electrical Equipment', 'Energy, Utilities & Waste']],
  [/\b(aerospace|aviation|defense|avionics)\b/, ['Manufacturing', 'Machinery']],
  [/\b(appliances?|hvac|air condition\w*|refrigerat\w*)\b/, ['Manufacturing', 'Electrical Equipment']],
  [/\b(hand tools?|power tools?|hardware|fasteners?|abrasives?)\b/, ['Machinery', 'Manufacturing']],
  [/\b(glass(ware)?|ceramics?|porcelain)\b/, 'Manufacturing'],
  [/\b(furniture|furnishings?|home goods|home decor|mattress(es)?|cabinet(s|ry)?|flooring|tiles?|countertops?)\b/, 'Manufacturing'],
  [/\b(toys?|board games|hobby (goods|products))\b/, 'Manufacturing'],
  [/\b(sporting goods|sports equipment|outdoor gear|fitness equipment|bicycles?|e-?bikes?)\b/, ['Manufacturing', 'Specialty Retail']],
  [/\b(office supplies|stationery|school supplies)\b/, 'Manufacturing'],
  [/\b(paper|pulp|tissue)\b/, ['Manufacturing', 'Containers and Packaging']],
  [/\b(lumber|timber|wood(en)? products?|plywood|millwork)\b/, 'Manufacturing'],
  // Materials
  [/\b(chemicals?|resins?|polymers?|plastics?|adhesives?|coatings?|paints?)\b/, 'Chemicals'],
  [/\b(fertilizers?|pesticides?|agrochemicals?)\b/, ['Chemicals', 'Agriculture']],
  [/\b(steel|aluminum|aluminium|copper|alloys?|metal products?|metal fabricat\w*|metals)\b/, ['Metals and Mining', 'Manufacturing']],
  [/\b(mining|minerals?|quarr(y|ies)|aggregates?)\b/, ['Minerals & Mining', 'Metals and Mining']],
  // Auto / transport equipment
  [/\b(automotive|auto ?parts?|car parts?|vehicles?|electric vehicles?|tires?|wheels?|powersports?)\b/, ['Auto Components', 'Manufacturing']],
  // Food / bev / ag
  [/\b(food products?|food (and|&) beverage|beverages?|f&b|snacks?|confectioner\w*|dairy|bakery|baked goods)\b/, 'Food Products'],
  [/\b(grocer(y|ies)|supermarkets?|frozen foods?)\b/, ['Food and Staples Retailing', 'Food Products']],
  [/\b(seafood|fish|meat|poultry|beef|pork)\b/, ['Food Products', 'Agriculture']],
  [/\b(coffee|tea|wine|beer|spirits|liquor|brewer\w*|distiller\w*)\b/, 'Food Products'],
  [/\b(pet ?(food|supplies|products)|petcare)\b/, 'Food Products'],
  [/\b(agricultur\w*|farming|agri|fresh produce|crops?|grain|nurser(y|ies)|garden\w*|landscap\w*)\b/, 'Agriculture'],
  // Apparel / consumer
  [/\b(apparel|textiles?|clothing|garments?|fashion|footwear|shoes|sneakers?|jewelr\w*|handbags?|luggage|luxury goods|luxury)\b/, 'Textiles, Apparel and Luxury Goods'],
  [/\b(cosmetics?|beauty products?|skincare|personal care|fragrances?|toiletries)\b/, ['Manufacturing', 'Consumer Services']],
  [/\b(retail\w*|stores?|e-?commerce|online sellers?|marketplaces?|d2c|dtc|direct.to.consumer)\b/, ['Retail', 'Specialty Retail']],
  // Packaging
  [/\b(packaging|containers?|bottles?|cans|labels?|corrugated|cartons?)\b/, 'Containers and Packaging'],
  // Health
  [/\b(pharma\w*|biotech\w*|life sciences?|medicines?)\b/, ['Healthcare Services', 'Chemicals']],
  [/\b(healthcare|medical devices?|medical supplies|medical equipment|hospitals?|clinics?|dental|diagnostics?|lab(oratory)? equipment)\b/, ['Healthcare Services', 'Hospitals & Physicians Clinics']],
  // Construction / real estate
  [/\b(construction|builders?|contractors?|building materials?|building products?|roofing|plumbing|drywall|concrete|cement)\b/, ['Construction', 'Construction and Engineering']],
  [/\b(engineering firms?|epc contractors?)\b/, 'Construction and Engineering'],
  [/\b(real estate|property manage\w*|reits?)\b/, 'Real Estate'],
  // Energy
  [/\b(energy|utilit(y|ies)|waste|recycling|oil (and|&) gas|petroleum|pipelines?|power plants?)\b/, 'Energy, Utilities & Waste'],
  // Logistics / distribution
  [/\b(transportation|trucking|carriers?|railroads?|shipping lines?|maritime)\b/, 'Transportation'],
  [/\b(3pls?|logistics|freight forward\w*|nvoccs?|customs brokers?|air freight|freight compan\w*)\b/, ['Air Freight and Logistics', 'Transportation']],
  [/\b(wholesale\w*|distributors?|distribution|trading compan\w*|warehous\w*|fulfillment)\b/, ['Trading Companies and Distributors', 'Distributors']],
  // Services / other verticals
  [/\b(software|saas|tech compan\w*|technology compan\w*|it services)\b/, 'Software'],
  [/\b(telecom\w*|wireless|broadband|isps?)\b/, 'Telecommunications'],
  [/\b(media|publishers?|advertising|streaming|internet compan\w*)\b/, 'Media & Internet'],
  [/\b(finance|financial|banks?|banking|fintech|lenders?|credit unions?)\b/, 'Finance'],
  [/\b(insurance|insurers?|underwriters?)\b/, 'Insurance'],
  [/\b(hospitality|hotels?|resorts?|restaurants?|food service|catering|qsr)\b/, 'Hospitality'],
  [/\b(education|schools?|universit\w*|colleges?|edtech)\b/, 'Education'],
  [/\b(business services|consulting|staffing|bpo)\b/, 'Business Services'],
  [/\b(consumer services)\b/, 'Consumer Services'],
];

export function localExtractFilters(query) {
  const q = String(query ?? '').trim();
  if (!q) return {};
  const lower = ` ${q.toLowerCase()} `;
  const geo = {};

  const regions = [];
  for (const [re, key] of REGION_PHRASES) {
    if (!re.test(lower)) continue;
    for (const k of (Array.isArray(key) ? key : [key])) {
      if (!regions.includes(k)) regions.push(k);
    }
  }
  if (regions.length) geo.regions = regions;

  const states = [];
  // Full state names (multi-word handled, e.g. "new york").
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    const re = new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'i');
    if (re.test(lower) && !states.includes(code)) states.push(code);
  }
  // 2-letter codes — only match UPPERCASE in the original string so common
  // words ("or", "in", "me", "hi") don't get mistaken for state codes.
  for (const code of STATE_CODES) {
    if (new RegExp(`\\b${code}\\b`).test(q) && !states.includes(code)) states.push(code);
  }
  // Typo tolerance — "geogia", "californa", "flordia" still resolve. Only
  // consulted when exact matching found nothing, so clean queries never pay
  // for (or risk) the fuzzy pass.
  if (!states.length) {
    for (const code of fuzzyStates(lower)) {
      if (!states.includes(code)) states.push(code);
    }
  }
  if (states.length) geo.states = states;

  const industry = [];
  for (const [re, val] of INDUSTRY_PHRASES) {
    if (!re.test(lower)) continue;
    for (const v of (Array.isArray(val) ? val : [val])) {
      if (!industry.includes(v)) industry.push(v);
    }
  }

  const out = {};
  if (Object.keys(geo).length) out.geo = geo;
  if (industry.length) out.industry = industry;
  return out;
}

// Map the edge fn's parsed payload to the Filters shape that pulse-explore
// accepts. Keeps the contract narrow even if the edge fn returns extras.
// Accepts EITHER the bare ExplorerFilters object OR the full edge-fn
// envelope { ok, parsed, model, confidence }: the market-mode fallback passed
// the ENVELOPE for months, every field read hit undefined, and the LLM parse
// silently contributed nothing — every query the local regex missed died on
// "couldn't turn X into a market filter" no matter how well the LLM parsed it.
export function parsedToFilters(parsed) {
  if (!parsed) return {};
  const p = parsed.parsed && typeof parsed.parsed === 'object' ? parsed.parsed : parsed;
  const out = {};
  if (p.name?.trim()) out.name = p.name.trim();
  if (p.industry?.length) out.industry = p.industry;
  const geo = {};
  // New shape: regions[]. Legacy single `region` still accepted as a
  // fallback if the edge fn ever returns the old shape.
  if (p.geo?.regions?.length) geo.regions = p.geo.regions;
  else if (p.geo?.region) geo.regions = [p.geo.region];
  if (p.geo?.states?.length) geo.states = p.geo.states;
  if (p.geo?.countries?.length) geo.countries = p.geo.countries;
  if (p.geo?.cities?.length) geo.cities = p.geo.cities;
  if (Object.keys(geo).length) out.geo = geo;
  const size = {};
  for (const k of ['teu_min','teu_max','shipments_min','shipments_max','spend_min','spend_max']) {
    if (p.size?.[k] != null) size[k] = p.size[k];
  }
  if (Object.keys(size).length) out.size = size;
  if (p.opportunity_types?.length) out.opportunity_types = p.opportunity_types;
  if (p.freshness_state?.length) out.freshness_state = p.freshness_state;
  if (p.workflow_state?.length) out.workflow_state = p.workflow_state;
  if (p.dataset_filter && p.dataset_filter !== 'all') out.dataset_filter = p.dataset_filter;
  return out;
}

export function hasAnyFilter(filters) {
  if (!filters || Object.keys(filters).length === 0) return false;
  if (filters.name?.trim()) return true;
  if (filters.industry?.length) return true;
  if (filters.geo && (filters.geo.regions?.length || filters.geo.region || filters.geo.states?.length || filters.geo.countries?.length || filters.geo.cities?.length)) return true;
  if (filters.size && Object.values(filters.size).some((v) => v != null)) return true;
  if (filters.opportunity_types?.length) return true;
  if (filters.freshness_state?.length) return true;
  if (filters.workflow_state?.length) return true;
  if (filters.dataset_filter && filters.dataset_filter !== 'all') return true;
  return false;
}
