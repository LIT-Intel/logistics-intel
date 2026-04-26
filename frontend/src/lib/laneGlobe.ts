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

  // Country-name variants — full / formal / informal aliases that show up in
  // raw `parsed_summary` strings. These ensure that an endpoint label like
  // "United States of America" or "PR China" still resolves through the same
  // chain that handles short codes and city names.
  "united states of america": "usa",
  "united states": "usa",
  "u.s.": "usa",
  "u.s.a.": "usa",
  "u s a": "usa",
  "us of a": "usa",
  america: "usa",
  usa: "usa",
  "people's republic of china": "china",
  "peoples republic of china": "china",
  "pr china": "china",
  prc: "china",
  "mainland china": "china",
  "republic of korea": "south korea",
  rok: "south korea",
  "south korea": "south korea",
  sokorea: "south korea",
  "great britain": "united kingdom",
  england: "united kingdom",
  deutschland: "germany",
  méxico: "mexico",
  "mexico city": "mexico",

  // Indian states / regions / districts that surface in parsed_summary
  "chengalpattu district": "india",
  "tamil nadu": "india",
  kerala: "india",
  maharashtra: "india",
  karnataka: "india",
  gujarat: "india",
  haryana: "india",
  punjab: "india",
  "uttar pradesh": "india",
  "west bengal": "india",

  // Chinese provinces
  guangdong: "china",
  zhejiang: "china",
  jiangsu: "china",
  fujian: "china",
  shandong: "china",

  // US states (avoid `new york` — already mapped to USA via city alias)
  california: "usa",
  texas: "usa",
  georgia: "usa",
  florida: "usa",
  "new york state": "usa",
  illinois: "usa",
  "washington state": "usa",
  virginia: "usa",
  "south carolina": "usa",
  "north carolina": "usa",
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

  // 1. Alias match takes precedence over direct COUNTRY_COORDS hit so
  //    canonical aliases (e.g. "united states" → "usa") win the lookup
  //    and downstream metadata (countryCode, flag) is correct. Without
  //    this, "united states" would resolve to canonicalKey "united
  //    states" which has no entry in COUNTRY_KEY_TO_CODE → empty flag.
  if (ENDPOINT_ALIAS_MAP[lower]) {
    return buildResult(ENDPOINT_ALIAS_MAP[lower]);
  }

  // 2. Direct match in COUNTRY_COORDS.
  if (COUNTRY_COORDS[lower]) {
    return buildResult(lower);
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
  //    LOCODE prefix for last part. Also supports "City, FullCountryName"
  //    by trying alias / coord lookup on the trailing token after the
  //    LOCODE-prefix attempt fails.
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
      // Try every interior token (e.g. "Chengalpattu district, Tamil Nadu, India")
      // so the country segment in the middle still resolves.
      for (let i = parts.length - 2; i >= 0; i--) {
        const seg = parts[i];
        if (ENDPOINT_ALIAS_MAP[seg]) return buildResult(ENDPOINT_ALIAS_MAP[seg]);
        if (COUNTRY_COORDS[seg]) return buildResult(seg);
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

// ---------------------------------------------------------------------------
// Phase B.3 — canonical lane grouping
// ---------------------------------------------------------------------------

/**
 * Short-form display names used by `canonicalizeLanes` so the rendered label
 * matches the validated design source: "🇨🇳 China → 🇺🇸 USA" instead of
 * "China → United States". All other canonical keys fall through to the
 * `COUNTRY_DISPLAY[key].name` value.
 */
const SHORT_COUNTRY_NAME: Record<string, string> = {
  usa: "USA",
  "united states": "USA",
  "united kingdom": "UK",
  uk: "UK",
  "south korea": "South Korea",
  "hong kong": "Hong Kong",
};

const shortNameFor = (meta: ResolvedEndpoint): string =>
  SHORT_COUNTRY_NAME[meta.canonicalKey] ?? meta.countryName;

/**
 * Known 3-letter ISO-style country codes that appear in raw `parsed_summary`
 * labels alongside 2-letter ISO codes (e.g. "USA US"). Mapped to the same
 * canonical key as the 2-letter equivalent so the strip logic can match
 * them without a full ISO-3 lookup table.
 */
const ALPHA3_CODE_MAP: Record<string, string> = {
  USA: "usa",
  CHN: "china",
  GBR: "united kingdom",
  MEX: "mexico",
  CAN: "canada",
  VNM: "vietnam",
  IND: "india",
  DEU: "germany",
  NLD: "netherlands",
  KOR: "south korea",
  JPN: "japan",
  TWN: "taiwan",
  THA: "thailand",
  MYS: "malaysia",
  IDN: "indonesia",
  BRA: "brazil",
  AUS: "australia",
  ITA: "italy",
  FRA: "france",
  BEL: "belgium",
  ESP: "spain",
  POL: "poland",
  SGP: "singapore",
  HKG: "hong kong",
  BGD: "bangladesh",
  PAK: "pakistan",
  TUR: "turkey",
};

/**
 * Strip redundant trailing country-code tokens from an endpoint label. Handles:
 *  - Trailing 2-letter ISO code:  "United States of America US" → "United States of America"
 *  - Trailing 2-letter ISO code:  "United States US"            → "United States"
 *  - Trailing 3-letter ISO code:  "USA US"                      → "USA" (drops the 2-letter)
 *  - Multiple trailing dupes:     "US USA"                      → "USA" (keep the longer canonical token)
 *  - Trailing both forms:         "United States USA"           → "United States"
 * Leaves the input untouched when no trailing code-like token resolves to the
 * same country as the head, or when the head has no resolvable country.
 *
 * Phase B.4 — runs iteratively (max 3 passes) to peel multiple trailing
 * codes (e.g. "United States of America USA US"). Each pass strips at most
 * one trailing token; the loop terminates as soon as no further token can
 * be safely stripped.
 */
function stripTrailingCountryCode(raw: string): string {
  let current = String(raw || "").trim();
  if (!current) return current;

  for (let pass = 0; pass < 3; pass++) {
    const tokens = current.split(/\s+/);
    if (tokens.length < 2) return current;
    const last = tokens[tokens.length - 1];
    const lastUpper = last.toUpperCase();
    const head = tokens.slice(0, -1).join(" ").trim();
    if (!head) return current;

    // 2-letter ISO trailing token.
    if (/^[A-Z]{2}$/.test(lastUpper) && LOCODE_PREFIX_MAP[lastUpper]) {
      const headResolved = resolveEndpoint(head);
      if (!headResolved) return current;
      const codeKey = LOCODE_PREFIX_MAP[lastUpper];
      // Same country → safe to drop the trailing 2-letter code.
      if (headResolved.canonicalKey === codeKey) {
        current = head;
        continue;
      }
      return current;
    }

    // 3-letter ISO-style trailing token (e.g. "USA").
    if (/^[A-Z]{3}$/.test(lastUpper) && ALPHA3_CODE_MAP[lastUpper]) {
      const codeKey = ALPHA3_CODE_MAP[lastUpper];
      const headResolved = resolveEndpoint(head);
      if (headResolved && headResolved.canonicalKey === codeKey) {
        // Special case "US USA" — head is shorter ISO-2, but the
        // 3-letter token is the canonical we want to keep. Drop the
        // shorter 2-letter head, keep "USA" as the surviving label.
        if (/^[A-Z]{2}$/.test(head.toUpperCase()) && LOCODE_PREFIX_MAP[head.toUpperCase()]) {
          // Replace with the canonical short name from the alpha-3.
          current = COUNTRY_DISPLAY_NAMES[codeKey] || last;
          continue;
        }
        current = head;
        continue;
      }
      return current;
    }

    return current;
  }

  return current;
}

export type CanonicalLane = {
  /** Resolved country pair key, e.g. "italy::usa". Group key. */
  pairKey: string;
  /** Display label: "🇮🇹 Italy → 🇺🇸 USA". */
  displayLabel: string;
  fromMeta: ResolvedEndpoint;
  toMeta: ResolvedEndpoint;
  shipments: number;
  teu: number;
  spend: number | null;
  /** Raw lane labels merged into this canonical row. */
  aliases: string[];
  /** Iff both endpoints resolved (drives globe rendering). */
  resolvable: true;
};

export type NonCanonicalLane = {
  pairKey: null;
  /** Raw label cleaned of trailing country-code suffix. */
  displayLabel: string;
  shipments: number;
  teu: number;
  spend: number | null;
  aliases: string[];
  resolvable: false;
};

/**
 * Group raw lane rows into canonical country-pair rows. The same Italy → USA
 * shipments are merged regardless of whether the upstream label was
 * "Italy → United States of America US", "Italy → USA", or
 * "Genoa, IT → Long Beach, US". Rows where either endpoint cannot be
 * resolved are surfaced as `NonCanonicalLane` entries so they still show in
 * the table — they just don't render an arc on the globe.
 */
export function canonicalizeLanes(
  rawLanes: Array<{
    lane: string;
    shipments?: number;
    teu?: number;
    spend?: number | null;
  }>,
): { canonical: CanonicalLane[]; nonCanonical: NonCanonicalLane[] } {
  type CanonicalDraft = {
    pairKey: string;
    fromMeta: ResolvedEndpoint;
    toMeta: ResolvedEndpoint;
    shipments: number;
    teu: number;
    spendSum: number;
    spendContributors: number;
    aliasSet: Set<string>;
  };
  type NonCanonicalDraft = {
    displayLabel: string;
    shipments: number;
    teu: number;
    spendSum: number;
    spendContributors: number;
    aliasSet: Set<string>;
  };

  const canonicalMap = new Map<string, CanonicalDraft>();
  const nonCanonicalMap = new Map<string, NonCanonicalDraft>();

  for (const row of rawLanes || []) {
    const rawLane = String(row?.lane || "").trim();
    if (!rawLane) continue;

    const parts = rawLane.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
    const fromRaw = parts[0] || "";
    const toRaw = parts.length > 1 ? parts[1] : "";

    const cleanedFrom = stripTrailingCountryCode(fromRaw);
    const cleanedTo = stripTrailingCountryCode(toRaw);
    const cleanedLabel =
      cleanedFrom && cleanedTo
        ? `${cleanedFrom} → ${cleanedTo}`
        : cleanedFrom || cleanedTo || rawLane;

    const fromMeta = cleanedFrom ? resolveEndpoint(cleanedFrom) : null;
    const toMeta = cleanedTo ? resolveEndpoint(cleanedTo) : null;

    const shipments = Math.max(0, Number(row?.shipments ?? 0) || 0);
    const teu = Math.max(0, Number(row?.teu ?? 0) || 0);
    const spend =
      row?.spend == null || Number.isNaN(Number(row.spend))
        ? null
        : Number(row.spend);

    if (fromMeta && toMeta) {
      const pairKey = `${fromMeta.canonicalKey}::${toMeta.canonicalKey}`;
      const draft =
        canonicalMap.get(pairKey) ||
        ({
          pairKey,
          fromMeta,
          toMeta,
          shipments: 0,
          teu: 0,
          spendSum: 0,
          spendContributors: 0,
          aliasSet: new Set<string>(),
        } as CanonicalDraft);
      draft.shipments += shipments;
      draft.teu += teu;
      if (spend != null) {
        draft.spendSum += spend;
        draft.spendContributors += 1;
      }
      draft.aliasSet.add(cleanedLabel);
      canonicalMap.set(pairKey, draft);
    } else {
      const key = cleanedLabel || rawLane;
      const draft =
        nonCanonicalMap.get(key) ||
        ({
          displayLabel: key,
          shipments: 0,
          teu: 0,
          spendSum: 0,
          spendContributors: 0,
          aliasSet: new Set<string>(),
        } as NonCanonicalDraft);
      draft.shipments += shipments;
      draft.teu += teu;
      if (spend != null) {
        draft.spendSum += spend;
        draft.spendContributors += 1;
      }
      draft.aliasSet.add(key);
      nonCanonicalMap.set(key, draft);
    }
  }

  const canonical: CanonicalLane[] = [...canonicalMap.values()]
    .map((draft) => ({
      pairKey: draft.pairKey,
      displayLabel: `${draft.fromMeta.flag} ${shortNameFor(draft.fromMeta)} → ${draft.toMeta.flag} ${shortNameFor(draft.toMeta)}`,
      fromMeta: draft.fromMeta,
      toMeta: draft.toMeta,
      shipments: draft.shipments,
      teu: draft.teu,
      spend: draft.spendContributors > 0 ? draft.spendSum : null,
      aliases: [...draft.aliasSet],
      resolvable: true as const,
    }))
    .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu);

  const nonCanonical: NonCanonicalLane[] = [...nonCanonicalMap.values()]
    .map((draft) => ({
      pairKey: null as null,
      displayLabel: draft.displayLabel,
      shipments: draft.shipments,
      teu: draft.teu,
      spend: draft.spendContributors > 0 ? draft.spendSum : null,
      aliases: [...draft.aliasSet],
      resolvable: false as const,
    }))
    .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu);

  return { canonical, nonCanonical };
}
