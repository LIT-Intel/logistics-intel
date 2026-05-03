// pulseQueryParser — client-side natural-language entity extraction
// for Pulse search prompts. Pure functions, no network calls. The
// goal is to give the user instant, visible feedback as they type
// what Pulse will actually look for — so a query like
//
//   "Find 50 companies importing automotive parts from Vietnam to Georgia"
//
// parses into:
//
//   {
//     intent:      'companies',
//     direction:   'import',
//     quantity:    50,
//     products:    ['automotive parts'],
//     origins:     [{ name: 'Vietnam', code: 'VN', kind: 'country' }],
//     destinations:[{ name: 'Georgia',  code: 'GA', kind: 'us_state' }],
//     industries:  [],
//     roles:       [],
//     similarTo:   null,
//   }
//
// The QueryInterpretation component renders these as editable chips
// so the user sees and can refine what the search will do BEFORE it
// runs. The Pulse page also passes the structured entities through
// to the cache-first lit_companies search so location/industry
// filters tighten the local hits.

/* ─── Country lookups ─── */

const COUNTRY_LIST = [
  { name: 'United States', code: 'US', aliases: ['usa', 'us', 'united states', 'america', 'united states of america'] },
  { name: 'China',         code: 'CN', aliases: ['china', 'mainland china', 'prc'] },
  { name: 'Vietnam',       code: 'VN', aliases: ['vietnam', 'viet nam'] },
  { name: 'India',         code: 'IN', aliases: ['india'] },
  { name: 'Mexico',        code: 'MX', aliases: ['mexico'] },
  { name: 'Canada',        code: 'CA', aliases: ['canada'] },
  { name: 'Germany',       code: 'DE', aliases: ['germany', 'deutschland'] },
  { name: 'United Kingdom',code: 'GB', aliases: ['uk', 'united kingdom', 'britain', 'england', 'great britain'] },
  { name: 'France',        code: 'FR', aliases: ['france'] },
  { name: 'Italy',         code: 'IT', aliases: ['italy'] },
  { name: 'Japan',         code: 'JP', aliases: ['japan'] },
  { name: 'South Korea',   code: 'KR', aliases: ['korea', 'south korea', 'south-korea'] },
  { name: 'Taiwan',        code: 'TW', aliases: ['taiwan'] },
  { name: 'Brazil',        code: 'BR', aliases: ['brazil', 'brasil'] },
  { name: 'Australia',     code: 'AU', aliases: ['australia'] },
  { name: 'Spain',         code: 'ES', aliases: ['spain', 'espana'] },
  { name: 'Netherlands',   code: 'NL', aliases: ['netherlands', 'holland'] },
  { name: 'Indonesia',     code: 'ID', aliases: ['indonesia'] },
  { name: 'Thailand',      code: 'TH', aliases: ['thailand'] },
  { name: 'Turkey',        code: 'TR', aliases: ['turkey', 'türkiye'] },
  { name: 'UAE',           code: 'AE', aliases: ['uae', 'united arab emirates', 'emirates', 'dubai'] },
  { name: 'Singapore',     code: 'SG', aliases: ['singapore'] },
  { name: 'Hong Kong',     code: 'HK', aliases: ['hong kong', 'hongkong'] },
];

const US_STATE_LIST = [
  { name: 'Alabama',        code: 'AL' }, { name: 'Alaska',     code: 'AK' },
  { name: 'Arizona',        code: 'AZ' }, { name: 'Arkansas',   code: 'AR' },
  { name: 'California',     code: 'CA' }, { name: 'Colorado',   code: 'CO' },
  { name: 'Connecticut',    code: 'CT' }, { name: 'Delaware',   code: 'DE' },
  { name: 'Florida',        code: 'FL' }, { name: 'Georgia',    code: 'GA' },
  { name: 'Hawaii',         code: 'HI' }, { name: 'Idaho',      code: 'ID' },
  { name: 'Illinois',       code: 'IL' }, { name: 'Indiana',    code: 'IN' },
  { name: 'Iowa',           code: 'IA' }, { name: 'Kansas',     code: 'KS' },
  { name: 'Kentucky',       code: 'KY' }, { name: 'Louisiana',  code: 'LA' },
  { name: 'Maine',          code: 'ME' }, { name: 'Maryland',   code: 'MD' },
  { name: 'Massachusetts',  code: 'MA' }, { name: 'Michigan',   code: 'MI' },
  { name: 'Minnesota',      code: 'MN' }, { name: 'Mississippi',code: 'MS' },
  { name: 'Missouri',       code: 'MO' }, { name: 'Montana',    code: 'MT' },
  { name: 'Nebraska',       code: 'NE' }, { name: 'Nevada',     code: 'NV' },
  { name: 'New Hampshire',  code: 'NH' }, { name: 'New Jersey', code: 'NJ' },
  { name: 'New Mexico',     code: 'NM' }, { name: 'New York',   code: 'NY' },
  { name: 'North Carolina', code: 'NC' }, { name: 'North Dakota', code: 'ND' },
  { name: 'Ohio',           code: 'OH' }, { name: 'Oklahoma',   code: 'OK' },
  { name: 'Oregon',         code: 'OR' }, { name: 'Pennsylvania', code: 'PA' },
  { name: 'Rhode Island',   code: 'RI' }, { name: 'South Carolina', code: 'SC' },
  { name: 'South Dakota',   code: 'SD' }, { name: 'Tennessee',  code: 'TN' },
  { name: 'Texas',          code: 'TX' }, { name: 'Utah',       code: 'UT' },
  { name: 'Vermont',        code: 'VT' }, { name: 'Virginia',   code: 'VA' },
  { name: 'Washington',     code: 'WA' }, { name: 'West Virginia', code: 'WV' },
  { name: 'Wisconsin',      code: 'WI' }, { name: 'Wyoming',    code: 'WY' },
];

// US ports / metros that double as locations users actually type
const US_METROS = [
  { name: 'Los Angeles',  code: 'LAX' }, { name: 'Long Beach',  code: 'LGB' },
  { name: 'New York',     code: 'NYC' }, { name: 'Atlanta',     code: 'ATL' },
  { name: 'Savannah',     code: 'SAV' }, { name: 'Houston',     code: 'HOU' },
  { name: 'Seattle',      code: 'SEA' }, { name: 'Miami',       code: 'MIA' },
  { name: 'Chicago',      code: 'CHI' }, { name: 'Dallas',      code: 'DFW' },
  { name: 'San Francisco',code: 'SFO' }, { name: 'Boston',      code: 'BOS' },
];

/* ─── Industry / role / product lookups ─── */

const INDUSTRY_TERMS = [
  'saas', 'fintech', 'ecommerce', 'e-commerce', 'retail', 'logistics',
  'furniture', 'electronics', 'apparel', 'healthcare', 'consumer',
  'manufacturing', 'automotive', 'food', 'beverage', 'cosmetics',
  'pharmaceutical', 'pharma', 'chemical', 'aerospace', 'construction',
  'agriculture', 'energy', 'oil & gas', 'media', 'gaming', 'edtech',
  'real estate', 'insurance', 'banking', 'crypto', 'blockchain', 'ai',
  'machine learning', 'cybersecurity', 'biotech',
];

const ROLE_TERMS = [
  { label: 'CEO',         pattern: /\b(ceo|chief executive)\b/i },
  { label: 'CFO',         pattern: /\b(cfo|chief financial)\b/i },
  { label: 'CTO',         pattern: /\b(cto|chief technology)\b/i },
  { label: 'COO',         pattern: /\b(coo|chief operating)\b/i },
  { label: 'CMO',         pattern: /\b(cmo|chief marketing)\b/i },
  { label: 'Founder',     pattern: /\bfounders?\b/i },
  { label: 'VP Logistics', pattern: /\bvp(s|s of)?\s+(of\s+)?(logistics|supply\s*chain)\b/i },
  { label: 'VP Sales',    pattern: /\bvp(s|s of)?\s+(of\s+)?sales\b/i },
  { label: 'VP Marketing',pattern: /\bvp(s|s of)?\s+(of\s+)?marketing\b/i },
  { label: 'VP Operations', pattern: /\bvp(s|s of)?\s+(of\s+)?operations\b/i },
  { label: 'Director of Procurement', pattern: /\b(director|head)\s+(of\s+)?procurement\b/i },
  { label: 'Director of Marketing', pattern: /\b(directors?|head)\s+(of\s+)?marketing\b/i },
  { label: 'Director of Sales', pattern: /\b(directors?|head)\s+(of\s+)?sales\b/i },
  { label: 'Operations Manager', pattern: /\b(operations|ops)\s+(managers?|leads?)\b/i },
  { label: 'Supply Chain Manager', pattern: /\b(supply\s*chain)\s+(managers?|leads?)\b/i },
  { label: 'Director',    pattern: /\bdirectors?\b/i },
  { label: 'Manager',     pattern: /\bmanagers?\b/i },
  { label: 'VP',          pattern: /\bvps?\b/i },
];

// Common product nouns that appear in import/export prompts. We pick
// them up only when the query has an import/export verb so we don't
// label every noun as a "product".
const PRODUCT_TERMS = [
  'automotive parts', 'auto parts', 'furniture', 'electronics',
  'apparel', 'clothing', 'textiles', 'toys', 'cosmetics',
  'pet products', 'pet food', 'home goods', 'kitchenware',
  'machinery', 'medical devices', 'pharmaceuticals', 'beverages',
  'consumer electronics', 'industrial equipment', 'building materials',
  'plastics', 'metals', 'chemicals', 'paper', 'glass',
];

/* ─── Verb / direction detection ─── */

const IMPORT_RX = /\bimport(?:ing|ers?|s)?\b/i;
const EXPORT_RX = /\bexport(?:ing|ers?|s)?\b/i;
const SHIP_RX   = /\b(ship(?:ping|ments?|pers?)?|moving)\b/i;
const SIMILAR_RX = /\b(similar to|like)\s+([A-Z][\w&.\- ]{1,40})/i;

// "from X" / "to Y" — the prepositions that bind a country to a role
// in the freight sentence ("from Vietnam to Georgia"). Used to assign
// origins vs destinations after we've extracted the location list.
const FROM_PREPS = ['from', 'out of', 'leaving', 'sourcing from'];
const TO_PREPS   = ['to', 'into', 'arriving in', 'destined for', 'shipping to', 'bound for'];

/* ─── Main parser ─── */

/**
 * Parse a freeform Pulse prompt into structured entities. Returns
 * an object even for empty input — call sites can check
 * `result.hasAny` to know whether to render the interpretation card.
 */
export function parsePulseQuery(rawQuery) {
  const q = String(rawQuery || '').trim();
  const result = {
    raw: q,
    intent: null,            // 'companies' | 'people' | 'industry' | 'lookalike'
    direction: null,         // 'import' | 'export' | 'ship'
    quantity: null,          // 50, 100, etc.
    products: [],            // ['automotive parts']
    origins: [],             // [{ name, code, kind: 'country' | 'us_state' | 'metro' }]
    destinations: [],
    countries: [],           // dedupe — populated unscoped if no from/to verb
    states: [],
    metros: [],
    industries: [],
    roles: [],
    similarTo: null,
    keywords: [],            // misc tokens the user might want to remove/edit
    hasAny: false,
  };
  if (!q) return result;

  const lc = q.toLowerCase();

  // 1) Quantity — "50 companies", "Top 100", "list of 25"
  const qtyMatch = q.match(/\b(?:top|first|give me|find|show|list of)?\s*(\d{1,4})\s+(?:companies|brands|importers|exporters|shippers|firms|accounts)\b/i);
  if (qtyMatch) result.quantity = parseInt(qtyMatch[1], 10);
  else {
    const rawQty = q.match(/\btop\s+(\d{1,4})\b/i);
    if (rawQty) result.quantity = parseInt(rawQty[1], 10);
  }

  // 2) Direction — import / export / ship
  if (IMPORT_RX.test(q))      result.direction = 'import';
  else if (EXPORT_RX.test(q)) result.direction = 'export';
  else if (SHIP_RX.test(q))   result.direction = 'ship';

  // 3) Similar-to
  const simMatch = q.match(SIMILAR_RX);
  if (simMatch) {
    result.similarTo = simMatch[2].replace(/[.,;:!?]+$/, '').trim();
    result.intent = 'lookalike';
  }

  // 4) Roles — pick first matching role pattern (most-specific first)
  for (const role of ROLE_TERMS) {
    if (role.pattern.test(q)) {
      result.roles.push(role.label);
      break;
    }
  }
  if (result.roles.length) result.intent = 'people';

  // 5) Industries — multi-match across the term list
  for (const term of INDUSTRY_TERMS) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(q)) result.industries.push(term);
  }

  // 6) Products — only if a freight verb is present (avoid labeling
  // every noun as a product when the user is doing a generic search)
  if (result.direction) {
    for (const term of PRODUCT_TERMS) {
      const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(q)) result.products.push(term);
    }
  }

  // 7) Locations — countries first (dedup against state aliases)
  const countryHits = [];
  for (const c of COUNTRY_LIST) {
    for (const a of c.aliases) {
      const pattern = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(q)) {
        countryHits.push({ ...c, kind: 'country', alias: a });
        break;
      }
    }
  }
  // Filter out 'georgia' as country when it's clearly the US state
  // (US state Georgia is far more common in our user base; the
  // country Georgia is rare and would be explicitly typed).
  const stateHits = [];
  for (const s of US_STATE_LIST) {
    const pattern = new RegExp(`\\b${s.name}\\b`, 'i');
    if (pattern.test(q)) stateHits.push({ ...s, kind: 'us_state' });
  }
  // If "Georgia" matched both as US state and as country, prefer US state
  const stateNames = new Set(stateHits.map((s) => s.name.toLowerCase()));
  const filteredCountries = countryHits.filter(
    (c) => !stateNames.has(c.name.toLowerCase()),
  );
  result.countries = dedupeBy(filteredCountries, 'code');
  result.states = dedupeBy(stateHits, 'code');

  // 8) Metros / port cities
  const metroHits = [];
  for (const m of US_METROS) {
    const pattern = new RegExp(`\\b${m.name}\\b`, 'i');
    if (pattern.test(q)) metroHits.push({ ...m, kind: 'metro' });
  }
  result.metros = dedupeBy(metroHits, 'code');

  // 9) Assign origin / destination via from/to prepositions
  const allLocations = [...result.countries, ...result.states, ...result.metros];
  if (allLocations.length && result.direction) {
    for (const loc of allLocations) {
      const aliasOrName = (loc.alias || loc.name).toLowerCase();
      const idx = lc.indexOf(aliasOrName);
      if (idx < 0) continue;
      // Look at the 24 chars before the location for from/to verbs
      const window = lc.substring(Math.max(0, idx - 24), idx);
      if (FROM_PREPS.some((p) => window.includes(p))) {
        result.origins.push(loc);
      } else if (TO_PREPS.some((p) => window.includes(p))) {
        result.destinations.push(loc);
      }
    }
    // Dedupe + remove cross-classified
    result.origins = dedupeBy(result.origins, 'code');
    result.destinations = dedupeBy(result.destinations, 'code');
  }

  // 10) Intent fallback — if we have role hits it's people, otherwise
  // companies (lookalike was set above)
  if (!result.intent) {
    result.intent = result.roles.length ? 'people' : 'companies';
  }

  // hasAny — should we render the interpretation card?
  result.hasAny = Boolean(
    result.quantity ||
    result.direction ||
    result.products.length ||
    result.origins.length ||
    result.destinations.length ||
    result.countries.length ||
    result.states.length ||
    result.metros.length ||
    result.industries.length ||
    result.roles.length ||
    result.similarTo,
  );

  return result;
}

function dedupeBy(arr, key) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const k = v[key];
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/**
 * Reduce a parsed query into a small filter recipe the cache-first
 * lit_companies search can consume. Returns null when no useful
 * structured filters are present.
 *
 * Critical: this filter targets the WHERE THE COMPANY LIVES, not
 * sourcing geography. For an import query like "automotive parts
 * from Vietnam to Georgia," the importer is in Georgia (US) — NOT
 * in Vietnam. So we always derive country/state from destinations,
 * and never bleed origin countries into the country filter.
 */
export function buildLocalFilterRecipe(parsed) {
  if (!parsed?.hasAny) return null;
  const recipe = {};

  // 1) Destination US states or metros → state filter + implied US country
  const destStates = parsed.destinations.filter((d) => d.kind === 'us_state');
  const destMetros = parsed.destinations.filter((d) => d.kind === 'metro');
  if (destStates.length || destMetros.length) {
    if (destStates.length) recipe.states = destStates.map((s) => s.code);
    recipe.countries = ['US'];
    return recipe;
  }

  // 2) Destination country → country filter
  const destCountries = parsed.destinations.filter((d) => d.kind === 'country');
  if (destCountries.length) {
    recipe.countries = destCountries.map((c) => c.code);
    return recipe;
  }

  // 3) No destinations parsed — fall back to standalone state/metro hits
  // (these are NOT direction-scoped, so they stand for "company is in X")
  if (parsed.states.length || parsed.metros.length) {
    if (parsed.states.length) recipe.states = parsed.states.map((s) => s.code);
    recipe.countries = ['US'];
    return recipe;
  }

  // 4) Standalone country mentions — only safe to apply when there
  // are NO origins/destinations parsed. If origins exist, the user is
  // describing sourcing geography ("from Vietnam"), not where the
  // target company lives, so we must NOT filter on it.
  if (!parsed.origins.length && !parsed.destinations.length && parsed.countries.length) {
    recipe.countries = parsed.countries.map((c) => c.code);
    return recipe;
  }

  return null;
}
