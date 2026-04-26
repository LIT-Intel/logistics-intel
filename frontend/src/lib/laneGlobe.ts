import type { GlobeLane } from "@/components/GlobeCanvas";

/**
 * Shared country-name → [longitude, latitude] map used by every globe surface
 * (Dashboard trade-lanes card, Company Detail trade-lane intelligence).
 *
 * Keys are lower-case canonical names. Add aliases alongside the canonical
 * key ("usa" + "united states") so `laneStringToGlobeLane` can resolve
 * whatever label the upstream returns.
 */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  china: [104.2, 35.9],
  usa: [-95.7, 37.1],
  "united states": [-95.7, 37.1],
  india: [78.9, 20.6],
  germany: [10.5, 51.2],
  japan: [138.3, 36.2],
  "south korea": [127.8, 35.9],
  korea: [127.8, 35.9],
  vietnam: [108.3, 14.1],
  mexico: [-102.6, 23.6],
  uk: [-1.5, 52.4],
  "united kingdom": [-1.5, 52.4],
  brazil: [-51.9, -14.2],
  canada: [-96.8, 56.1],
  australia: [133.7, -25.3],
  taiwan: [120.9, 23.7],
  thailand: [100.9, 15.9],
  malaysia: [109.7, 4.2],
  indonesia: [113.9, -0.8],
  bangladesh: [90.4, 23.7],
  pakistan: [69.3, 30.4],
  turkey: [35.2, 38.9],
  italy: [12.6, 41.9],
  france: [2.2, 46.2],
  netherlands: [5.3, 52.1],
  belgium: [4.5, 50.5],
  spain: [-3.7, 40.4],
  poland: [19.1, 51.9],
  "hong kong": [114.2, 22.3],
  singapore: [103.8, 1.4],
};

/**
 * Lower-cased alias → canonical country key in COUNTRY_COORDS.
 * Includes ISO alpha-2 codes and major port cities so labels like
 * "Shanghai, CN" or "Long Beach, CA" or "CNSHA" still resolve.
 */
export const ENDPOINT_ALIAS_MAP: Record<string, string> = {
  // ISO-3166-1 alpha-2 codes
  cn: "china",
  us: "usa",
  gb: "united kingdom",
  uk: "united kingdom",
  mx: "mexico",
  ca: "canada",
  vn: "vietnam",
  in: "india",
  de: "germany",
  nl: "netherlands",
  kr: "south korea",
  jp: "japan",
  tw: "taiwan",
  th: "thailand",
  my: "malaysia",
  id: "indonesia",
  bd: "bangladesh",
  pk: "pakistan",
  tr: "turkey",
  it: "italy",
  fr: "france",
  be: "belgium",
  es: "spain",
  pl: "poland",
  hk: "hong kong",
  sg: "singapore",
  br: "brazil",
  au: "australia",

  // CN ports
  shanghai: "china",
  ningbo: "china",
  shenzhen: "china",
  qingdao: "china",
  xiamen: "china",
  yantian: "china",
  tianjin: "china",
  dalian: "china",
  guangzhou: "china",
  "hong kong": "hong kong",

  // US ports / cities
  "long beach": "usa",
  "los angeles": "usa",
  savannah: "usa",
  "new york": "usa",
  newark: "usa",
  houston: "usa",
  charleston: "usa",
  norfolk: "usa",
  seattle: "usa",
  tacoma: "usa",
  oakland: "usa",
  miami: "usa",
  baltimore: "usa",
  boston: "usa",

  // JP ports
  tokyo: "japan",
  yokohama: "japan",
  kobe: "japan",
  nagoya: "japan",
  osaka: "japan",

  // KR ports
  busan: "south korea",
  incheon: "south korea",

  // NL ports
  rotterdam: "netherlands",
  amsterdam: "netherlands",

  // DE ports
  hamburg: "germany",
  bremerhaven: "germany",
  bremen: "germany",

  // BE ports
  antwerp: "belgium",
  zeebrugge: "belgium",

  // UK ports
  felixstowe: "united kingdom",
  southampton: "united kingdom",
  "london gateway": "united kingdom",

  // VN ports
  "ho chi minh": "vietnam",
  haiphong: "vietnam",
  "cai mep": "vietnam",

  // IN ports
  chennai: "india",
  "nhava sheva": "india",
  mumbai: "india",
  mundra: "india",
  cochin: "india",

  // MX ports
  manzanillo: "mexico",
  "lazaro cardenas": "mexico",
  veracruz: "mexico",
  altamira: "mexico",

  // TW ports
  kaohsiung: "taiwan",
  taipei: "taiwan",

  // SG
  singapore: "singapore",

  // MY ports
  "port klang": "malaysia",
  "tanjung pelepas": "malaysia",
  penang: "malaysia",

  // TH ports
  "laem chabang": "thailand",
  bangkok: "thailand",

  // ID ports
  jakarta: "indonesia",
  "tanjung priok": "indonesia",
  surabaya: "indonesia",
};

/**
 * UN/LOCODE country prefix → canonical country key. Used when an endpoint
 * label looks like a 5-character LOCODE such as `CNSHA` or `USLGB` — we strip
 * the first two characters and look the country up here.
 */
export const LOCODE_PREFIX_MAP: Record<string, string> = {
  CN: "china",
  US: "usa",
  HK: "hong kong",
  MX: "mexico",
  CA: "canada",
  VN: "vietnam",
  IN: "india",
  DE: "germany",
  NL: "netherlands",
  KR: "south korea",
  JP: "japan",
  TW: "taiwan",
  TH: "thailand",
  MY: "malaysia",
  ID: "indonesia",
  BR: "brazil",
  AU: "australia",
  IT: "italy",
  FR: "france",
  BE: "belgium",
  ES: "spain",
  PL: "poland",
  SG: "singapore",
  GB: "united kingdom",
  UK: "united kingdom",
  BD: "bangladesh",
  PK: "pakistan",
  TR: "turkey",
};

/**
 * Reverse lookup: canonical country key → ISO alpha-2 code.
 * Built from LOCODE_PREFIX_MAP, preferring `GB` over `UK` for the UK
 * (because the regional-indicator emoji uses `GB`).
 */
const COUNTRY_KEY_TO_CODE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [code, key] of Object.entries(LOCODE_PREFIX_MAP)) {
    if (out[key]) continue;
    out[key] = code;
  }
  // Force GB rather than UK for the United Kingdom — emoji flag uses GB.
  out["united kingdom"] = "GB";
  return out;
})();

export const COUNTRY_DISPLAY: Record<
  string,
  { name: string; code: string; flag: string }
> = {};

/**
 * Convert an ISO alpha-2 country code into the corresponding regional-indicator
 * emoji (e.g. "CN" → "🇨🇳"). Returns an empty string for invalid input.
 */
export function flagFromCode(cc: string | null | undefined): string {
  if (!cc) return "";
  const code = String(cc).trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    0x1f1e6 + (code.charCodeAt(0) - 65),
    0x1f1e6 + (code.charCodeAt(1) - 65),
  );
}

const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  china: "China",
  usa: "United States",
  "united states": "United States",
  india: "India",
  germany: "Germany",
  japan: "Japan",
  "south korea": "South Korea",
  korea: "South Korea",
  vietnam: "Vietnam",
  mexico: "Mexico",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  brazil: "Brazil",
  canada: "Canada",
  australia: "Australia",
  taiwan: "Taiwan",
  thailand: "Thailand",
  malaysia: "Malaysia",
  indonesia: "Indonesia",
  bangladesh: "Bangladesh",
  pakistan: "Pakistan",
  turkey: "Turkey",
  italy: "Italy",
  france: "France",
  netherlands: "Netherlands",
  belgium: "Belgium",
  spain: "Spain",
  poland: "Poland",
  "hong kong": "Hong Kong",
  singapore: "Singapore",
};

// Populate COUNTRY_DISPLAY from the canonical maps so consumers can look up
// display metadata directly by canonical key.
for (const [key] of Object.entries(COUNTRY_COORDS)) {
  const code = COUNTRY_KEY_TO_CODE[key] || "";
  COUNTRY_DISPLAY[key] = {
    name: COUNTRY_DISPLAY_NAMES[key] || key,
    code,
    flag: flagFromCode(code),
  };
}

export type ResolvedEndpoint = {
  /** Original raw input, trimmed but case-preserved. */
  label: string;
  /** Lower-case canonical country key, e.g. "china". */
  canonicalKey: string;
  /** Display name, e.g. "China". */
  countryName: string;
  /** ISO-3166-1 alpha-2 code, e.g. "CN". */
  countryCode: string;
  /** Regional-indicator emoji, e.g. "🇨🇳". */
  flag: string;
  /** [longitude, latitude] from COUNTRY_COORDS. */
  coords: [number, number];
};

/**
 * Resolve an arbitrary endpoint label ("China", "Shanghai, CN", "CNSHA",
 * "Long Beach, CA", etc.) into a canonical country with display metadata
 * and lat/lon. Returns null when the label cannot be resolved.
 */
export function resolveEndpoint(
  raw: string | null | undefined,
): ResolvedEndpoint | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "—" || lower === "unknown" || lower === "n/a" || lower === "na") {
    return null;
  }

  const buildResult = (canonicalKey: string): ResolvedEndpoint | null => {
    const coords = COUNTRY_COORDS[canonicalKey];
    if (!coords) return null;
    const display = COUNTRY_DISPLAY[canonicalKey] || {
      name: COUNTRY_DISPLAY_NAMES[canonicalKey] || canonicalKey,
      code: COUNTRY_KEY_TO_CODE[canonicalKey] || "",
      flag: flagFromCode(COUNTRY_KEY_TO_CODE[canonicalKey] || ""),
    };
    return {
      label: trimmed,
      canonicalKey,
      countryName: display.name,
      countryCode: display.code,
      flag: display.flag,
      coords,
    };
  };

  // 1. Direct match in COUNTRY_COORDS.
  if (COUNTRY_COORDS[lower]) {
    return buildResult(lower);
  }

  // 2. Alias match.
  if (ENDPOINT_ALIAS_MAP[lower]) {
    return buildResult(ENDPOINT_ALIAS_MAP[lower]);
  }

  // 3. LOCODE check — five letters total, e.g. "cnsha".
  if (/^[a-z]{2}[a-z]{3}$/.test(lower)) {
    const prefix = lower.slice(0, 2).toUpperCase();
    const key = LOCODE_PREFIX_MAP[prefix];
    if (key) return buildResult(key);
  }

  // 4. Country-code check — exactly two letters.
  if (/^[a-z]{2}$/.test(lower)) {
    const key = LOCODE_PREFIX_MAP[lower.toUpperCase()];
    if (key) return buildResult(key);
  }

  // 5. "City, CC" pattern — split on comma, try alias for first part, then
  //    LOCODE prefix for last part.
  if (lower.includes(",")) {
    const parts = lower.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      if (ENDPOINT_ALIAS_MAP[first]) {
        return buildResult(ENDPOINT_ALIAS_MAP[first]);
      }
      if (COUNTRY_COORDS[first]) {
        return buildResult(first);
      }
      const last = parts[parts.length - 1];
      const lastUpper = last.toUpperCase();
      if (lastUpper.length === 2 && LOCODE_PREFIX_MAP[lastUpper]) {
        return buildResult(LOCODE_PREFIX_MAP[lastUpper]);
      }
      if (ENDPOINT_ALIAS_MAP[last]) {
        return buildResult(ENDPOINT_ALIAS_MAP[last]);
      }
      if (COUNTRY_COORDS[last]) {
        return buildResult(last);
      }
    }
  }

  return null;
}

/**
 * Parse a lane string like "China → USA" into a `GlobeLane` with coordinates
 * resolved through {@link resolveEndpoint}. Accepts `→`, `->`, or `>` as the
 * separator and normalises casing. Returns `null` when either endpoint
 * cannot be resolved — callers should filter `null` out before passing
 * the array to `<GlobeCanvas />`.
 *
 * Carries `fromMeta` / `toMeta` for consumers that want flag pills or
 * country-code display alongside the rendered arc.
 *
 * The second parameter is retained for backwards compatibility with the
 * historical signature; it is ignored.
 */
export function laneStringToGlobeLane(
  laneStr: string,
  _index?: number,
): GlobeLane | null {
  const parts = laneStr.split(/→|->|>/).map((s) => s.trim());
  if (parts.length < 2) return null;
  const fromResolved = resolveEndpoint(parts[0]);
  const toResolved = resolveEndpoint(parts[1]);
  if (!fromResolved || !toResolved) return null;
  return {
    id: laneStr,
    from: fromResolved.canonicalKey,
    to: toResolved.canonicalKey,
    coords: [fromResolved.coords, toResolved.coords],
    fromMeta: fromResolved,
    toMeta: toResolved,
  };
}
