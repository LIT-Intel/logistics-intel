// IyShipperHit[] → UnifiedExplorerRow[]
//
// The Company Search tab calls searchShippers() (api.ts:2991) and gets
// back an IyShipperHit[]. ImportYeti doesn't return lat/lng — it returns
// city, state, country. To plot those rows on the Pulse Explorer map
// without a network geocoding call, we resolve each row against a
// static city/state centroid file (cityStateCoordinates.json).
//
// Resolution order:
//   1. row.latitude + row.longitude (if upstream ever adds them — none today)
//   2. cities[city:state]                — city-level centroid → mapped
//   3. cities[city] (best-effort)        — city without state → mapped
//   4. states[stateCode]                 — state-level centroid → approximate
//   5. countries[countryCode]            — country-level → approximate
//   6. nothing                           → unmapped (stays in table, no marker)
//
// Unmapped rows MUST still appear in the table per PRD §6: "If a
// company cannot be mapped, it must still appear in the results table."

import type { IyShipperHit } from '@/lib/api';
import coords from './cityStateCoordinates.json';
import type { UnifiedExplorerRow, MapStatus } from './types';

interface CoordsFile {
  cities: Record<string, [number, number]>;
  states: Record<string, [number, number]>;
  countries: Record<string, [number, number]>;
}

const COORDS = coords as unknown as CoordsFile;

// Reverse lookup: full state name → 2-letter USPS code. Used so a
// state field like "Oregon" still resolves to its centroid.
const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'd.c.': 'DC', dc: 'DC',
};

const VALID_STATE_CODES = new Set(Object.keys(COORDS.states));

/**
 * Extract a 2-letter USPS state code from any messy text. Handles
 *   - "OR", "Or", "or" → "OR"
 *   - "Or 97005" → "OR"
 *   - "Oregon" → "OR"
 *   - "Beaverton, OR, 97005" → "OR"
 *   - "OR, USA" → "OR"
 * Returns null when nothing recognisable matches.
 */
function extractStateCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const raw = String(text).trim();
  if (!raw) return null;

  // 1. Direct 2-char match (case insensitive).
  const upper = raw.toUpperCase();
  if (upper.length === 2 && VALID_STATE_CODES.has(upper)) return upper;

  // 2. Full state name match (case insensitive).
  const lower = raw.toLowerCase();
  if (STATE_NAME_TO_CODE[lower]) return STATE_NAME_TO_CODE[lower];

  // 3. First word — handles "Or 97005" / "OR USA" / "or, 12345".
  const firstWord = upper.split(/[\s,]/).filter(Boolean)[0];
  if (firstWord && firstWord.length === 2 && VALID_STATE_CODES.has(firstWord)) {
    return firstWord;
  }

  // 4. Any whole-word USPS code anywhere in the string.
  const tokens = upper.split(/[\s,]+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length === 2 && VALID_STATE_CODES.has(t)) return t;
  }

  // 5. Multi-word state name inside the text — "Beaverton New York 10001".
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (lower.includes(name)) return code;
  }

  return null;
}

/**
 * Best-effort city extraction. ImportYeti sometimes returns the FULL
 * address in `city`, like "1 Bowerman Dr, Beaverton, Or 97005, Us".
 * Strategy: split on commas, take the longest comma-separated chunk
 * that looks like a place name (alpha + space only). Falls back to the
 * first non-empty chunk.
 */
function extractCityName(text: string | null | undefined): string {
  if (!text) return '';
  const raw = String(text).trim();
  if (!raw) return '';
  if (!raw.includes(',')) return raw.toLowerCase();
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  // Prefer the last alphabetic-only chunk before the state — e.g. for
  // "1 Bowerman Dr, Beaverton, Or 97005, Us" we want "Beaverton".
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (/^[a-zA-Z][a-zA-Z\s\-']{2,}$/.test(p)) return p.toLowerCase();
  }
  return parts[0].toLowerCase();
}

/**
 * Robust US detection — handles "US", "us", "Us", "USA", "U.S.A",
 * "United States", and the messy zip+country suffixes ImportYeti
 * sometimes returns.
 */
export function isUnitedStates(country: string | null | undefined): boolean {
  if (!country) return false;
  const t = String(country).trim().toLowerCase().replace(/\./g, '');
  if (!t) return false;
  if (t === 'us' || t === 'usa' || t === 'united states' || t === 'united states of america') return true;
  // Suffix from messy concatenations like "Or 97005, Us"
  if (/\b(us|usa)\b/.test(t)) return true;
  return false;
}

/**
 * Look up a centroid for a (city, state, country) triple. Each piece
 * is optional. Returns null if no usable centroid is found.
 */
export function lookupCentroid(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined,
): { lat: number; lng: number; mapStatus: MapStatus } | null {
  // Robust extraction up-front. ImportYeti returns messy fields like
  // city="1 Bowerman Dr, Beaverton, Or 97005, Us" / state="Or 97005"
  // / country="Us"; older clean fields like state="OR" also work.
  const cityKey = extractCityName(city);
  const stateCode =
    extractStateCode(state) ??
    extractStateCode(city) ??         // sometimes state lives inside the city blob
    null;
  const isUS = isUnitedStates(country) || stateCode != null;
  const countryUpper = (country ?? '').trim().toUpperCase();

  // City + state (best signal) — city dict keys are "city:st".
  if (cityKey && stateCode) {
    const hit = COORDS.cities[`${cityKey}:${stateCode.toLowerCase()}`];
    if (hit) return { lng: hit[0], lat: hit[1], mapStatus: 'mapped' };
  }
  // City alone (lower confidence — there are many "Springfield"s).
  if (cityKey) {
    for (const k of Object.keys(COORDS.cities)) {
      if (k.startsWith(`${cityKey}:`)) {
        const hit = COORDS.cities[k];
        return { lng: hit[0], lat: hit[1], mapStatus: 'mapped' };
      }
    }
  }
  // State centroid → approximate.
  if (stateCode && COORDS.states[stateCode]) {
    const hit = COORDS.states[stateCode];
    return { lng: hit[0], lat: hit[1], mapStatus: 'approximate' };
  }
  // Non-US country centroid → approximate. The previous fix banned
  // US country fallback to avoid the "Oklahoma cluster" bug, but
  // that left genuine US rows totally unmapped (e.g. Nike with
  // unparseable state). Now that extractStateCode handles "Or",
  // "Oregon", "Or 97005", etc, the vast majority of US rows
  // resolve at state level. The handful that still don't fall
  // through to the US country centroid below.
  if (!isUS && countryUpper && COORDS.countries[countryUpper]) {
    const hit = COORDS.countries[countryUpper];
    return { lng: hit[0], lat: hit[1], mapStatus: 'approximate' };
  }
  // US final fallback. Rows that look US-y but had no parseable state
  // get the country centroid as a last resort so they still appear on
  // the map. fitBoundsToPoints will zoom in to show them alongside the
  // properly-resolved rows.
  if (isUS && COORDS.countries['US']) {
    const hit = COORDS.countries['US'];
    return { lng: hit[0], lat: hit[1], mapStatus: 'approximate' };
  }
  return null;
}

/**
 * Clean an upstream route string for the Origin → Destination cell.
 * Trims, collapses inner whitespace, and normalises any arrow variant to
 * " → ". Returns null when the value is missing or empty so the cell shows
 * "—" rather than a blank or fabricated lane. (T1)
 */
export function cleanLane(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/\s*(?:→|->|=>|\bto\b)\s*/i, ' → ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Normalise a single IyShipperHit into a UnifiedExplorerRow.
 */
export function normalizeIyShipperHit(hit: IyShipperHit): UnifiedExplorerRow {
  const lookup = lookupCentroid(hit.city, hit.state, hit.countryCode);
  const stableId = hit.key || hit.companyId || hit.domain || hit.name;

  // Clean up the visible location strings so the list / cards don't
  // surface "1 Bowerman Dr, Beaverton, Or 97005, Us" as the city.
  // We trust extractCityName + extractStateCode here since lookupCentroid
  // already used them — the row gets the *parsed* values, not the raw
  // upstream blob.
  const parsedCity = extractCityName(hit.city);
  const parsedState = extractStateCode(hit.state) ?? extractStateCode(hit.city);
  const cityDisplay = parsedCity
    ? parsedCity.replace(/\b\w/g, (c) => c.toUpperCase())  // Title Case
    : null;
  const stableCountry = isUnitedStates(hit.countryCode) || parsedState ? 'US' : (hit.countryCode ?? null);

  return {
    id: String(stableId),
    company_name: hit.name || hit.title || 'Unnamed account',
    domain: hit.domain ?? hit.website ?? null,
    source_company_key: hit.key ?? null,
    company_id: hit.companyId ?? null,

    city: cityDisplay,
    state: parsedState ?? null,
    country: stableCountry,
    latitude: lookup?.lat ?? null,
    longitude: lookup?.lng ?? null,

    industry: null,
    vertical: null,
    revenue: null,
    teu: typeof hit.teusLast12m === 'number' ? hit.teusLast12m : null,
    shipments: typeof hit.shipmentsLast12m === 'number'
      ? hit.shipmentsLast12m
      : (typeof hit.totalShipments === 'number' ? hit.totalShipments : null),
    last_shipment: hit.mostRecentShipment ?? hit.lastShipmentDate ?? null,
    top_origin_country: null,
    // T1 (eng-review): the raw IyShipperHit already carries a route string
    // (primaryRouteSummary / primaryRoute). Map it into top_lane so the
    // existing Origin → Destination cell populates — same lane field the
    // shared row model uses, no separate rendering path. Returns null (cell
    // shows "—") when the upstream route is missing; never fabricated.
    top_lane: cleanLane(hit.primaryRouteSummary ?? hit.primaryRoute),
    opportunity_composite_score: null,

    source: 'importyeti',
    source_label: 'Company Search',
    mapStatus: lookup?.mapStatus ?? 'unmapped',

    raw: hit as unknown as Record<string, unknown>,
  };
}

/**
 * Optional per-row metadata overlay (industry / vertical / revenue /
 * opp score) keyed by source_company_key. Populated by
 * fetchSearchMetadataOverlay() in api.ts; the normaliser merges
 * each row by key.
 */
export type CompanyMetadataOverlay = Record<string, {
  industry?: string | null;
  vertical?: string | null;
  revenue?: number | string | null;
  opportunity_composite_score?: number | null;
  is_saved?: boolean;
}>;

/**
 * Build a stable dedup key from (name, domain). Strips legal suffixes
 * ("Inc", "LLC", "Corp", "S.A.", etc), case-folds, collapses
 * whitespace, and joins with the domain so "The Home Depot" + null
 * and "Home Depot Inc" + "homedepot.com" both fall under the same
 * bucket. Used by normalizeCompanySearchResults to drop the
 * cross-source duplicates the user flagged in Polish 4.
 */
function dedupKey(name: string, domain: string | null | undefined): string {
  const stripped = String(name ?? '')
    .toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|ltd|llc|llp|plc|sa|sas|gmbh|ag|bv|nv|co|company|holdings|group|the)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  const dom = String(domain ?? '').trim().toLowerCase().replace(/^www\./, '');
  return `${stripped}|${dom}`;
}

/** Parse "$50M" / "$1.2B" / 50000000 / "50000000" into a number, else null. */
function parseRevenueValue(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[\s$,]/g, '');
  if (!s) return null;
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*([kmbKMB])?$/);
  if (m) {
    const num = parseFloat(m[1]);
    if (!Number.isFinite(num)) return null;
    const unit = (m[2] ?? '').toLowerCase();
    if (unit === 'k') return num * 1_000;
    if (unit === 'm') return num * 1_000_000;
    if (unit === 'b') return num * 1_000_000_000;
    return num;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Batch normaliser. Splits the result into (mapped + approximate) vs
 * unmapped so callers can drive separate UI states cleanly:
 * - `rows` is everything the table should render
 * - `mapPoints` is the subset the map should plot
 * - `analytics` is a precomputed metrics block for the header bar
 *
 * Optional `metadata` overlay: merged onto each row by
 * source_company_key so the table can show the same column set as
 * Pulse Explorer (industry / vertical / annual sales / opp score).
 * Pass {} when no overlay is available; missing fields render as "—".
 */
export function normalizeCompanySearchResults(
  hits: IyShipperHit[],
  metadata: CompanyMetadataOverlay = {},
): {
  rows: UnifiedExplorerRow[];
  mapPoints: UnifiedExplorerRow[];
  unmappedCount: number;
  analytics: {
    matchingCompanies: number;
    totalShipments: number;
    mappedLocations: number;
    mostRecentShipment: string | null;
  };
} {
  const merged = hits.map((h) => {
    const base = normalizeIyShipperHit(h);
    const meta = (base.source_company_key && metadata[base.source_company_key]) ?? null;
    if (!meta) return base;
    return {
      ...base,
      industry: meta.industry ?? base.industry,
      vertical: meta.vertical ?? base.vertical,
      revenue: parseRevenueValue(meta.revenue) ?? base.revenue,
      opportunity_composite_score:
        meta.opportunity_composite_score ?? base.opportunity_composite_score,
      is_saved: Boolean(meta.is_saved),
    };
  });
  // Cross-source dedup pass (Polish 4): when the upstream returns
  // "The Home Depot" and "Home Depot Inc" with the same domain, drop
  // the duplicate. Keeps the FIRST occurrence — searchShippers ranks
  // by confidence so the kept row is the highest-quality match.
  const seen = new Map<string, UnifiedExplorerRow>();
  for (const r of merged) {
    const k = dedupKey(r.company_name, r.domain);
    if (!seen.has(k)) seen.set(k, r);
  }
  const rows = Array.from(seen.values());
  const mapPoints = rows.filter((r) => r.latitude != null && r.longitude != null);
  const unmappedCount = rows.length - mapPoints.length;

  let totalShipments = 0;
  let mostRecent: string | null = null;
  for (const r of rows) {
    if (typeof r.shipments === 'number' && Number.isFinite(r.shipments)) {
      totalShipments += r.shipments;
    }
    if (r.last_shipment) {
      if (!mostRecent || r.last_shipment > mostRecent) mostRecent = r.last_shipment;
    }
  }

  return {
    rows,
    mapPoints,
    unmappedCount,
    analytics: {
      matchingCompanies: rows.length,
      totalShipments,
      mappedLocations: mapPoints.length,
      mostRecentShipment: mostRecent,
    },
  };
}
