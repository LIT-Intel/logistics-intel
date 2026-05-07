/**
 * Phase 4 — Freight rate benchmark helpers.
 *
 * Loads the latest FBX12 lane rates from `lit_freight_rate_benchmarks`,
 * matches a company's `top_route_12m` to the closest FBX lane via region
 * keywords, and computes a market-rate est-spend value the UI can display
 * alongside the importer-reported number.
 *
 * Spend math (corrected):
 *   1 FCL container = 2 TEU (assumes 40ft equivalent; rare 20ft mix is
 *     absorbed by the TEU cap below).
 *   fclTeu = min(fclShipments × 2, totalTeu)
 *   lclTeu = max(0, totalTeu − fclTeu)
 *   spend  = (fclShipments × matchedLane.rate_usd_per_40ft)
 *          + (lclTeu × LCL_PER_TEU_DEFAULT)
 *   When fclShipments is unknown, fall back to fcl_pct × totalShipments.
 */

import { supabase } from "@/lib/supabase";

export type FreightLane = {
  lane_code: string;
  lane_label: string;
  origin_region: string | null;
  destination_region: string | null;
  rate_usd_per_40ft: number;
  rate_usd_per_teu: number;
  source: string;
  as_of_date: string | null;
  fetched_at: string;
};

const LCL_PER_TEU_DEFAULT = 850;
const LCL_TEU_PER_SHIPMENT_CAP = 1.0; // industry hard cap (LCL ships rarely exceed 1 TEU)
const LCL_TEU_TOTAL_CAP_FRACTION = 0.15; // LCL never >15% of total TEU

// ---------- Region detection ---------------------------------------------
// Comprehensive US state + city map so destinations like "Atlanta, United
// States of America" route to East Coast (FBX02) instead of falling back
// to the origin-only match (which previously produced FBX01 West Coast).
//
// East = east of the Mississippi + Texas Gulf. West = Mountain + Pacific.
// When only "United States" appears with no city/state hint, the matcher
// uses origin region as a tiebreaker (China/East Asia → West, Europe →
// East) since most imports enter via the closer-coast ports.

type Region =
  | "China/East Asia"
  | "North America West Coast"
  | "North America East Coast"
  | "North Europe"
  | "Mediterranean"
  | "South America East Coast"
  | "Europe"
  | "Australia"
  | "India/Middle East";

type Pattern = { region: Region; tokens: string[] };

const PATTERNS: Pattern[] = [
  {
    region: "China/East Asia",
    tokens: [
      // Countries
      "china", "japan", "south korea", "korea", "vietnam", "cambodia",
      "thailand", "malaysia", "singapore", "indonesia", "philippines", "taiwan",
      "hong kong", "myanmar", "burma",
      // Major Asian ports / cities
      "shanghai", "shenzhen", "ningbo", "yantian", "qingdao", "xiamen",
      "tianjin", "dalian", "guangzhou", "kaohsiung", "keelung", "busan",
      "incheon", "tokyo", "yokohama", "kobe", "osaka", "nagoya", "konan",
      "haiphong", "ho chi minh", "saigon", "da nang", "laem chabang",
      "bangkok", "port klang", "tanjung pelepas", "manila", "jakarta",
      "tanjung priok", "surabaya",
      // Generic prefixes seen in ImportYeti origin labels
      "xa ", // Vietnamese commune prefix
    ],
  },
  {
    region: "North America West Coast",
    tokens: [
      // Pacific port cities
      "long beach", "los angeles", "oakland", "san francisco", "san diego",
      "seattle", "tacoma", "portland", "vancouver",
      // Inland West (Mountain region — typically routed via West Coast ports)
      "phoenix", "tucson", "las vegas", "reno", "salt lake city", "boise",
      "denver", "albuquerque", "santa fe", "anchorage", "honolulu",
      // States — Pacific + Mountain
      "california", "oregon", "washington state", "nevada", "arizona",
      "idaho", "utah", "colorado", "new mexico", "montana", "wyoming",
      "alaska", "hawaii",
    ],
  },
  {
    region: "North America East Coast",
    tokens: [
      // Atlantic / Gulf port cities
      "new york", "newark", "jersey city", "philadelphia", "baltimore",
      "norfolk", "savannah", "charleston", "jacksonville", "miami",
      "fort lauderdale", "tampa", "wilmington", "boston", "portsmouth",
      "houston", "galveston", "new orleans", "mobile",
      // Major inland East cities (routed via East/Gulf ports)
      "atlanta", "macon", "augusta", "spartanburg", "greenville", "raleigh",
      "charlotte", "durham", "richmond", "memphis", "nashville", "knoxville",
      "louisville", "lexington", "cincinnati", "columbus", "cleveland",
      "pittsburgh", "buffalo", "rochester", "albany", "hartford",
      "providence", "detroit", "grand rapids", "indianapolis", "chicago",
      "milwaukee", "minneapolis", "st louis", "kansas city", "dallas",
      "fort worth", "austin", "san antonio", "oklahoma city",
      // States — east of Mississippi + Gulf
      "new york state", "new jersey", "pennsylvania", "massachusetts",
      "connecticut", "rhode island", "maine", "new hampshire", "vermont",
      "maryland", "delaware", "virginia", "north carolina", "south carolina",
      "georgia", "florida", "alabama", "mississippi", "tennessee",
      "kentucky", "ohio", "michigan", "indiana", "illinois", "wisconsin",
      "minnesota", "iowa", "missouri", "arkansas", "louisiana", "texas",
      "oklahoma", "kansas", "nebraska", "west virginia",
    ],
  },
  {
    region: "North Europe",
    tokens: [
      "rotterdam", "hamburg", "bremerhaven", "antwerp", "felixstowe",
      "southampton", "le havre", "dunkirk", "gdansk", "gothenburg",
      "germany", "netherlands", "belgium", "united kingdom", "uk", "great britain",
      "france", "denmark", "sweden", "norway", "finland", "poland",
      "ireland", "estonia", "latvia", "lithuania",
    ],
  },
  {
    region: "Mediterranean",
    tokens: [
      "genoa", "valencia", "barcelona", "algeciras", "piraeus", "istanbul",
      "izmir", "mersin", "esenyurt", "naples", "gioia tauro", "marseille",
      "fos", "ashdod", "haifa", "alexandria", "port said", "tangier",
      "turkey", "spain", "italy", "greece", "portugal", "egypt", "morocco",
      "israel", "cyprus", "malta",
    ],
  },
  {
    region: "South America East Coast",
    tokens: [
      "santos", "rio de janeiro", "rio grande", "paranagua", "buenos aires",
      "montevideo", "sao paulo",
      "brazil", "argentina", "uruguay", "paraguay",
    ],
  },
  {
    region: "Europe",
    tokens: ["europe", "european union", "eu"],
  },
  {
    region: "Australia",
    tokens: [
      "australia", "sydney", "melbourne", "brisbane", "perth", "adelaide",
      "fremantle", "new zealand", "auckland", "wellington",
    ],
  },
  {
    region: "India/Middle East",
    tokens: [
      "india", "mumbai", "nhava sheva", "chennai", "kolkata", "mundra",
      "pakistan", "karachi", "bangladesh", "chittagong", "sri lanka",
      "colombo", "uae", "dubai", "jebel ali", "saudi arabia", "jeddah",
      "qatar", "doha", "kuwait", "iran", "iraq", "oman",
    ],
  },
];

const GENERIC_US_TOKENS = ["united states", "usa", "u.s.", "u.s.a"];

function detectRegion(text: string | null | undefined): {
  region: Region | null;
  isGenericUS: boolean;
} {
  if (!text) return { region: null, isGenericUS: false };
  const lower = text.toLowerCase();
  for (const entry of PATTERNS) {
    for (const token of entry.tokens) {
      // Word-boundary match so "phoenix" matches "phoenix az" but not "phoenixville pa"
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`, "i");
      if (re.test(lower)) return { region: entry.region, isGenericUS: false };
    }
  }
  // Fallback: bare "United States" with no city/state → mark for tiebreak
  const isGenericUS = GENERIC_US_TOKENS.some((t) => lower.includes(t));
  return { region: null, isGenericUS };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitRoute(route: string | null | undefined): {
  origin: string | null;
  destination: string | null;
} {
  if (!route) return { origin: null, destination: null };
  const parts = route.split(/\s*→\s*|\s*->\s*|\s+to\s+/i);
  if (parts.length >= 2) {
    return {
      origin: parts[0].trim() || null,
      destination: parts.slice(1).join(" → ").trim() || null,
    };
  }
  return { origin: null, destination: route.trim() || null };
}

// ---------- Loader -------------------------------------------------------

export async function loadLatestBenchmarks(): Promise<FreightLane[]> {
  const { data, error } = await supabase
    .from("lit_freight_rate_benchmarks")
    .select("*")
    .order("fetched_at", { ascending: false });
  if (error) {
    console.warn("[freightRateBenchmark] load failed", error);
    return [];
  }
  const seen = new Set<string>();
  const latest: FreightLane[] = [];
  for (const row of (data ?? []) as FreightLane[]) {
    if (seen.has(row.lane_code)) continue;
    seen.add(row.lane_code);
    latest.push(row);
  }
  latest.sort((a, b) => a.lane_code.localeCompare(b.lane_code));
  return latest;
}

export async function loadHistoryForLane(
  laneCode: string,
  weeks = 26,
): Promise<Array<{ as_of_date: string; rate_usd_per_40ft: number; rate_usd_per_teu: number }>> {
  const { data, error } = await supabase
    .from("lit_freight_rate_benchmarks")
    .select("as_of_date, rate_usd_per_40ft, rate_usd_per_teu, fetched_at")
    .eq("lane_code", laneCode)
    .order("as_of_date", { ascending: true })
    .limit(weeks * 2);
  if (error || !data) return [];
  return data.map((r: any) => ({
    as_of_date: r.as_of_date ?? r.fetched_at?.slice(0, 10) ?? "",
    rate_usd_per_40ft: Number(r.rate_usd_per_40ft) || 0,
    rate_usd_per_teu: Number(r.rate_usd_per_teu) || 0,
  }));
}

// ---------- Lane matching -----------------------------------------------

export type MatchedLane = {
  lane: FreightLane;
  matchedOrigin: string | null;
  matchedDestination: string | null;
  confidence: "exact" | "partial" | "fallback";
};

export function matchLaneForRoute(
  routeText: string | null | undefined,
  lanes: FreightLane[],
): MatchedLane | null {
  if (!routeText || lanes.length === 0) return null;
  const { origin, destination } = splitRoute(routeText);
  const o = detectRegion(origin);
  const d = detectRegion(destination);

  const originRegion = o.region;
  // If destination is a bare "United States" / "USA" with no city or state
  // hint, infer coast from the origin region. Asia → West Coast (closest),
  // Europe / Mediterranean → East Coast.
  let destRegion = d.region;
  if (!destRegion && d.isGenericUS) {
    if (originRegion === "China/East Asia") destRegion = "North America West Coast";
    else if (
      originRegion === "North Europe" ||
      originRegion === "Mediterranean" ||
      originRegion === "Europe"
    ) {
      destRegion = "North America East Coast";
    }
  }

  // Exact origin+destination match
  if (originRegion && destRegion) {
    const exact = lanes.find(
      (l) =>
        l.origin_region === originRegion && l.destination_region === destRegion,
    );
    if (exact) {
      return {
        lane: exact,
        matchedOrigin: originRegion,
        matchedDestination: destRegion,
        confidence: "exact",
      };
    }
  }
  // Origin-only match
  if (originRegion) {
    const partial = lanes.find((l) => l.origin_region === originRegion);
    if (partial) {
      return {
        lane: partial,
        matchedOrigin: originRegion,
        matchedDestination: destRegion,
        confidence: "partial",
      };
    }
  }
  // Destination-only match
  if (destRegion) {
    const partial = lanes.find((l) => l.destination_region === destRegion);
    if (partial) {
      return {
        lane: partial,
        matchedOrigin: originRegion,
        matchedDestination: destRegion,
        confidence: "partial",
      };
    }
  }
  // Fallback: average across all lanes
  const avg =
    lanes.reduce((s, l) => s + Number(l.rate_usd_per_teu || 0), 0) /
    Math.max(1, lanes.length);
  return {
    lane: {
      lane_code: "AVG",
      lane_label: "Global FBX12 Average",
      origin_region: null,
      destination_region: null,
      rate_usd_per_40ft: Math.round(avg * 2),
      rate_usd_per_teu: Math.round(avg),
      source: "fbx12",
      as_of_date: lanes[0]?.as_of_date ?? null,
      fetched_at: lanes[0]?.fetched_at ?? new Date().toISOString(),
    },
    matchedOrigin: originRegion,
    matchedDestination: destRegion,
    confidence: "fallback",
  };
}

// ---------- Spend calculation -------------------------------------------

export type SpendBreakdown = {
  fclContainers: number;
  fclTeu: number;
  lclTeu: number;
  fclSpend: number;
  lclSpend: number;
  totalSpend: number;
  laneRatePer40ft: number;
  laneRatePerTeu: number;
  lclRatePerTeu: number;
  matched: MatchedLane | null;
};

/**
 * Compute market-rate spend with the CORRECTED FCL/LCL TEU split.
 *
 * Old algorithm assumed 1 FCL = 2 TEU. That breaks for importers using
 * 45ft/53ft containers or multi-container BOLs (e.g. EAE Usa with avg
 * 7.31 TEU/shipment). The residual (totalTeu − fclShips × 2) was
 * massively over-attributed to LCL even when LCL share is <2%.
 *
 * New algorithm derives LCL TEU from actual LCL shipment count, capped
 * by industry-realistic bounds:
 *   lclTeu = min(lclShips × 1.0,  totalTeu × 0.15)
 *   fclTeu = totalTeu − lclTeu       // residual is always FCL
 *   fclSpend = fclTeu × lane $/TEU   // TEU-weighted handles 20/40/45ft mix
 *   lclSpend = lclTeu × $850/TEU
 */
export function computeMarketRateSpend(
  teu12m: number | null | undefined,
  fclShipments: number | null | undefined,
  totalShipments: number | null | undefined,
  matched: MatchedLane | null,
  lclShipments?: number | null,
): SpendBreakdown | null {
  const teu = Number(teu12m);
  if (!Number.isFinite(teu) || teu <= 0) return null;

  // Prefer explicit LCL shipment count. Fall back to 0 (assume all FCL
  // when LCL count missing — overstates FCL slightly but honest).
  const lclShips = Number.isFinite(Number(lclShipments))
    ? Math.max(0, Math.round(Number(lclShipments)))
    : 0;

  // LCL TEU = lclShips × 1 TEU/ship, hard-capped at 15% of total. This
  // prevents the false residual blow-up when FCL containers are >2 TEU.
  const lclTeu = Math.min(
    lclShips * LCL_TEU_PER_SHIPMENT_CAP,
    teu * LCL_TEU_TOTAL_CAP_FRACTION,
  );
  const fclTeu = Math.max(0, teu - lclTeu);

  // FCL container count for display (informational — not used in spend
  // because TEU-weighted is more accurate when container sizes vary).
  let fclContainers = Number.isFinite(Number(fclShipments))
    ? Math.max(0, Math.round(Number(fclShipments)))
    : 0;
  if (!fclContainers && Number.isFinite(Number(totalShipments))) {
    fclContainers = Math.max(0, Math.round(Number(totalShipments)) - lclShips);
  }

  const laneRate40 = Number(matched?.lane?.rate_usd_per_40ft ?? 1850 * 2);
  const laneRateTeu = Number(matched?.lane?.rate_usd_per_teu ?? laneRate40 / 2);
  const lclRate = LCL_PER_TEU_DEFAULT;

  // FCL spend = FCL TEU × lane per-TEU rate (TEU-weighted is correct
  // regardless of whether containers are 20/40/45/53ft — TEU is the
  // canonical normalizer the FBX index uses internally).
  const fclSpend = Math.round(fclTeu * laneRateTeu);
  const lclSpend = Math.round(lclTeu * lclRate);

  return {
    fclContainers,
    fclTeu: Math.round(fclTeu),
    lclTeu: Math.round(lclTeu),
    fclSpend,
    lclSpend,
    totalSpend: fclSpend + lclSpend,
    laneRatePer40ft: laneRate40,
    laneRatePerTeu: laneRateTeu,
    lclRatePerTeu: lclRate,
    matched,
  };
}

// ---------- Lane geo coordinates (for the interactive map) ---------------

export type LaneCoord = {
  laneCode: string;
  fromLabel: string;
  fromCoords: [number, number]; // [lon, lat]
  toLabel: string;
  toCoords: [number, number];
};

export const FBX_LANE_COORDS: Record<string, LaneCoord> = {
  FBX01: { laneCode: "FBX01", fromLabel: "Shanghai",  fromCoords: [121.4737,  31.2304], toLabel: "Long Beach", toCoords: [-118.1937,  33.7701] },
  FBX02: { laneCode: "FBX02", fromLabel: "Shanghai",  fromCoords: [121.4737,  31.2304], toLabel: "New York",   toCoords: [ -74.0060,  40.7128] },
  FBX03: { laneCode: "FBX03", fromLabel: "Shanghai",  fromCoords: [121.4737,  31.2304], toLabel: "Rotterdam",  toCoords: [   4.4777,  51.9244] },
  FBX04: { laneCode: "FBX04", fromLabel: "Shanghai",  fromCoords: [121.4737,  31.2304], toLabel: "Genoa",      toCoords: [   8.9463,  44.4056] },
  FBX05: { laneCode: "FBX05", fromLabel: "Long Beach",fromCoords: [-118.1937, 33.7701], toLabel: "Shanghai",   toCoords: [ 121.4737,  31.2304] },
  FBX06: { laneCode: "FBX06", fromLabel: "New York",  fromCoords: [ -74.0060, 40.7128], toLabel: "Shanghai",   toCoords: [ 121.4737,  31.2304] },
  FBX07: { laneCode: "FBX07", fromLabel: "Rotterdam", fromCoords: [   4.4777, 51.9244], toLabel: "Shanghai",   toCoords: [ 121.4737,  31.2304] },
  FBX08: { laneCode: "FBX08", fromLabel: "Genoa",     fromCoords: [   8.9463, 44.4056], toLabel: "Shanghai",   toCoords: [ 121.4737,  31.2304] },
  FBX09: { laneCode: "FBX09", fromLabel: "Shanghai",  fromCoords: [121.4737,  31.2304], toLabel: "Santos",     toCoords: [ -46.3344, -23.9619] },
  FBX10: { laneCode: "FBX10", fromLabel: "Hamburg",   fromCoords: [   9.9937, 53.5511], toLabel: "Santos",     toCoords: [ -46.3344, -23.9619] },
  FBX11: { laneCode: "FBX11", fromLabel: "New York",  fromCoords: [ -74.0060, 40.7128], toLabel: "Rotterdam",  toCoords: [   4.4777,  51.9244] },
  FBX12: { laneCode: "FBX12", fromLabel: "Rotterdam", fromCoords: [   4.4777, 51.9244], toLabel: "New York",   toCoords: [ -74.0060,  40.7128] },
  // Extended LIT-maintained lanes covering routes outside the standard FBX12.
  "LIT-MED-NAEC":   { laneCode: "LIT-MED-NAEC",   fromLabel: "Genoa",      fromCoords: [   8.9463, 44.4056], toLabel: "Savannah",  toCoords: [ -81.0998,  32.0809] },
  "LIT-NAEC-MED":   { laneCode: "LIT-NAEC-MED",   fromLabel: "New York",   fromCoords: [ -74.0060, 40.7128], toLabel: "Genoa",     toCoords: [   8.9463,  44.4056] },
  "LIT-ASIA-AUS":   { laneCode: "LIT-ASIA-AUS",   fromLabel: "Shanghai",   fromCoords: [ 121.4737, 31.2304], toLabel: "Sydney",    toCoords: [ 151.2093, -33.8688] },
  "LIT-NEU-NAWC":   { laneCode: "LIT-NEU-NAWC",   fromLabel: "Rotterdam",  fromCoords: [   4.4777, 51.9244], toLabel: "Long Beach",toCoords: [-118.1937,  33.7701] },
  "LIT-NAWC-NEU":   { laneCode: "LIT-NAWC-NEU",   fromLabel: "Long Beach", fromCoords: [-118.1937, 33.7701], toLabel: "Rotterdam", toCoords: [   4.4777,  51.9244] },
  "LIT-ASIA-INDIA": { laneCode: "LIT-ASIA-INDIA", fromLabel: "Shanghai",   fromCoords: [ 121.4737, 31.2304], toLabel: "Mumbai",    toCoords: [  72.8777,  19.0760] },
};

// Match every top-route a company has against the reference lanes,
// computing per-route market spend. Lanes without a clean origin OR
// destination match get a "fallback" tag so the UI can flag them
// honestly. Returns sorted by market_spend descending.
export type TopRouteMatch = {
  route: string;
  ourShipments: number;
  ourTeu: number;
  ourFcl: number;
  ourLcl: number;
  matched: MatchedLane | null;
  marketSpend: number;
};

export function matchAllRoutesForCompany(
  topRoutes: any[] | null | undefined,
  lanes: FreightLane[],
): TopRouteMatch[] {
  if (!Array.isArray(topRoutes) || topRoutes.length === 0 || lanes.length === 0) {
    return [];
  }
  const result: TopRouteMatch[] = [];
  for (const r of topRoutes) {
    const routeLabel: string =
      r?.route ||
      [r?.origin, r?.destination].filter(Boolean).join(" → ") ||
      "";
    if (!routeLabel) continue;
    const matched = matchLaneForRoute(routeLabel, lanes);
    const ships = Number(r?.shipments) || 0;
    const teu = Number(r?.teu) || 0;
    const fcl = Number(r?.fclShipments ?? r?.fcl_shipments) || 0;
    const lcl = Number(r?.lclShipments ?? r?.lcl_shipments) || 0;
    // Per-lane market spend using the CORRECTED LCL-bounded algorithm.
    // LCL TEU is min(lclShips × 1, teu × 0.15); FCL is the residual.
    let marketSpend = 0;
    if (matched?.lane && teu > 0) {
      const ratePerTeu = Number(matched.lane.rate_usd_per_teu) || 0;
      const lclTeu = Math.min(
        lcl * LCL_TEU_PER_SHIPMENT_CAP,
        teu * LCL_TEU_TOTAL_CAP_FRACTION,
      );
      const fclTeu = Math.max(0, teu - lclTeu);
      marketSpend = Math.round(fclTeu * ratePerTeu + lclTeu * LCL_PER_TEU_DEFAULT);
    } else if (matched?.lane && ships > 0) {
      // No TEU at all — fall back to per-ship × per-40ft rate.
      marketSpend = Math.round(ships * Number(matched.lane.rate_usd_per_40ft) || 0);
    }
    result.push({
      route: routeLabel,
      ourShipments: ships,
      ourTeu: teu,
      ourFcl: fcl,
      ourLcl: lcl,
      matched,
      marketSpend,
    });
  }
  return result.sort((a, b) => b.marketSpend - a.marketSpend);
}
