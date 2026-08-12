// supabase/functions/_shared/freight_benchmark.ts
//
// Server-side port of the FBX lane-matching logic from
// frontend/src/lib/freightRateBenchmark.ts (region detection + lane match +
// per-route market-spend). Used by `profile-kpi-writeback` so the
// est_spend_12m KPI is computed and persisted server-side instead of from
// the browser (CEO trust P0). Keep the matching semantics in sync with the
// frontend module — the profile page renders the same tiered formula.
//
// Pure functions only — no Supabase client in here; callers load the
// benchmark rows themselves.

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

export const LCL_PER_TEU_DEFAULT = 850;
export const LCL_TEU_PER_SHIPMENT_CAP = 1.0; // LCL ships rarely exceed 1 TEU
export const LCL_TEU_TOTAL_CAP_FRACTION = 0.15; // LCL never >15% of total TEU

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
      "china", "japan", "south korea", "korea", "vietnam", "cambodia",
      "thailand", "malaysia", "singapore", "indonesia", "philippines", "taiwan",
      "hong kong", "myanmar", "burma",
      "shanghai", "shenzhen", "ningbo", "yantian", "qingdao", "xiamen",
      "tianjin", "dalian", "guangzhou", "kaohsiung", "keelung", "busan",
      "incheon", "tokyo", "yokohama", "kobe", "osaka", "nagoya", "konan",
      "haiphong", "ho chi minh", "saigon", "da nang", "laem chabang",
      "bangkok", "port klang", "tanjung pelepas", "manila", "jakarta",
      "tanjung priok", "surabaya",
      "xa ", // Vietnamese commune prefix
    ],
  },
  {
    region: "North America West Coast",
    tokens: [
      "long beach", "los angeles", "oakland", "san francisco", "san diego",
      "seattle", "tacoma", "portland", "vancouver",
      "phoenix", "tucson", "las vegas", "reno", "salt lake city", "boise",
      "denver", "albuquerque", "santa fe", "anchorage", "honolulu",
      "california", "oregon", "washington state", "nevada", "arizona",
      "idaho", "utah", "colorado", "new mexico", "montana", "wyoming",
      "alaska", "hawaii",
    ],
  },
  {
    region: "North America East Coast",
    tokens: [
      "new york", "newark", "jersey city", "philadelphia", "baltimore",
      "norfolk", "savannah", "charleston", "jacksonville", "miami",
      "fort lauderdale", "tampa", "wilmington", "boston", "portsmouth",
      "houston", "galveston", "new orleans", "mobile",
      "atlanta", "macon", "augusta", "spartanburg", "greenville", "raleigh",
      "charlotte", "durham", "richmond", "memphis", "nashville", "knoxville",
      "louisville", "lexington", "cincinnati", "columbus", "cleveland",
      "pittsburgh", "buffalo", "rochester", "albany", "hartford",
      "providence", "detroit", "grand rapids", "indianapolis", "chicago",
      "milwaukee", "minneapolis", "st louis", "kansas city", "dallas",
      "fort worth", "austin", "san antonio", "oklahoma city",
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
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`, "i");
      if (re.test(lower)) return { region: entry.region, isGenericUS: false };
    }
  }
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
  // Bare "United States" destination with no city/state hint → infer coast
  // from origin region (Asia → West, Europe/Med → East).
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
  // deno-lint-ignore no-explicit-any
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
    // Per-lane market spend using the LCL-bounded algorithm:
    // lclTeu = min(lclShips × 1, teu × 0.15); FCL is the residual.
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
