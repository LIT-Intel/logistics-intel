/**
 * Phase 4 — Freight rate benchmark helpers.
 *
 * Fetches the latest 12 FBX lanes from `lit_freight_rate_benchmarks`,
 * matches a company's `top_route_12m` to the closest FBX lane via region
 * keywords, and computes a market-rate est-spend value the UI can display
 * alongside ImportYeti's reported number.
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

const LCL_PER_TEU_DEFAULT = 850; // industry midpoint when no specific lane LCL rate

// Map keywords found in a lane label / route string to a region code.
// Each entry: regex tested case-insensitively against the input.
const REGION_KEYWORDS: Array<{ region: string; patterns: RegExp[] }> = [
  {
    region: "China/East Asia",
    patterns: [
      /\bchina\b/i,
      /\bshanghai\b/i,
      /\bshenzhen\b/i,
      /\bningbo\b/i,
      /\byantian\b/i,
      /\bqingdao\b/i,
      /\bxiamen\b/i,
      /\bhong\s?kong\b/i,
      /\bkaohsiung\b/i,
      /\btaiwan\b/i,
      /\bjapan\b/i,
      /\bkorea\b/i,
      /\bbusan\b/i,
      /\btokyo\b/i,
      /\byokohama\b/i,
      /\bkonan\b/i,
      /\bvietnam\b/i,
      /\bcambodia\b/i,
      /\bthailand\b/i,
      /\bmalaysia\b/i,
      /\bsingapore\b/i,
      /\bindonesia\b/i,
      /\bjakarta\b/i,
      /\bphilippines\b/i,
      /\bxa\s/i, // Vietnamese commune prefix used in ImportYeti origin labels
    ],
  },
  {
    region: "North America West Coast",
    patterns: [
      /\blong\s?beach\b/i,
      /\blos\s?angeles\b/i,
      /\boakland\b/i,
      /\bseattle\b/i,
      /\btacoma\b/i,
      /\bvancouver\b/i,
      /\bportland\b/i,
      /\bsan\s?diego\b/i,
      /\bcalifornia\b/i,
      /\bwashington\b/i,
      /\boregon\b/i,
    ],
  },
  {
    region: "North America East Coast",
    patterns: [
      /\bnew\s?york\b/i,
      /\bnewark\b/i,
      /\bsavannah\b/i,
      /\bnorfolk\b/i,
      /\bcharleston\b/i,
      /\bbaltimore\b/i,
      /\bphiladelphia\b/i,
      /\bboston\b/i,
      /\bjacksonville\b/i,
      /\bmiami\b/i,
      /\bspartanburg\b/i,
      /\bgeorgia\b/i,
      /\bsouth\s?carolina\b/i,
      /\bnorth\s?carolina\b/i,
      /\bvirginia\b/i,
      /\bnew\s?jersey\b/i,
      /\bflorida\b/i,
    ],
  },
  {
    region: "North Europe",
    patterns: [
      /\brotterdam\b/i,
      /\bhamburg\b/i,
      /\bantwerp\b/i,
      /\bbremerhaven\b/i,
      /\bfelixstowe\b/i,
      /\bsouthampton\b/i,
      /\ble\s?havre\b/i,
      /\bgermany\b/i,
      /\bnetherlands\b/i,
      /\bbelgium\b/i,
      /\bunited\s?kingdom\b/i,
      /\buk\b/i,
      /\bfrance\b/i,
    ],
  },
  {
    region: "Mediterranean",
    patterns: [
      /\bgenoa\b/i,
      /\bvalencia\b/i,
      /\bbarcelona\b/i,
      /\balgeciras\b/i,
      /\bpiraeus\b/i,
      /\bistanbul\b/i,
      /\bmersin\b/i,
      /\bizmir\b/i,
      /\besenyurt\b/i,
      /\bturkey\b/i,
      /\bspain\b/i,
      /\bitaly\b/i,
      /\bgreece\b/i,
      /\bportugal\b/i,
    ],
  },
  {
    region: "South America East Coast",
    patterns: [
      /\bsantos\b/i,
      /\bbuenos\s?aires\b/i,
      /\brio\s?de\s?janeiro\b/i,
      /\bmontevideo\b/i,
      /\bbrazil\b/i,
      /\bargentina\b/i,
      /\buruguay\b/i,
    ],
  },
  {
    region: "Europe",
    patterns: [/\beurope\b/i, /\beuropean\b/i],
  },
];

function detectRegion(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const entry of REGION_KEYWORDS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(lower)) return entry.region;
    }
  }
  return null;
}

function splitRoute(route: string | null | undefined): {
  origin: string | null;
  destination: string | null;
} {
  if (!route) return { origin: null, destination: null };
  const parts = route.split(/\s*→\s*|\s*->\s*|\s*to\s+/i);
  if (parts.length >= 2) {
    return {
      origin: parts[0].trim() || null,
      destination: parts.slice(1).join(" → ").trim() || null,
    };
  }
  return { origin: null, destination: route.trim() || null };
}

export async function loadLatestBenchmarks(): Promise<FreightLane[]> {
  // Fetch each lane's most-recent row.
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
  // Stable order by lane_code
  latest.sort((a, b) => a.lane_code.localeCompare(b.lane_code));
  return latest;
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
  const originRegion = detectRegion(origin);
  const destRegion = detectRegion(destination);

  // Try exact origin+destination match first.
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
  // Fallback: average rate across all lanes
  const avg =
    lanes.reduce((s, l) => s + Number(l.rate_usd_per_teu || 0), 0) /
    lanes.length;
  return {
    lane: {
      lane_code: "AVG",
      lane_label: "Global FBX12 Average",
      origin_region: null,
      destination_region: null,
      rate_usd_per_40ft: Math.round(avg * 2),
      rate_usd_per_teu: Math.round(avg),
      source: "freightos_fbx",
      as_of_date: lanes[0]?.as_of_date ?? null,
      fetched_at: lanes[0]?.fetched_at ?? new Date().toISOString(),
    },
    matchedOrigin: originRegion,
    matchedDestination: destRegion,
    confidence: "fallback",
  };
}

export type SpendBreakdown = {
  fclTeu: number;
  lclTeu: number;
  fclSpend: number;
  lclSpend: number;
  totalSpend: number;
  laneRatePerTeu: number;
  lclRatePerTeu: number;
  matched: MatchedLane | null;
};

export function computeMarketRateSpend(
  teu12m: number | null | undefined,
  fclPct: number | null | undefined,
  matched: MatchedLane | null,
): SpendBreakdown | null {
  const teu = Number(teu12m);
  if (!Number.isFinite(teu) || teu <= 0) return null;
  const fclShare = Number.isFinite(Number(fclPct))
    ? Math.max(0, Math.min(1, Number(fclPct)))
    : 0.95;
  const fclTeu = Math.round(teu * fclShare);
  const lclTeu = Math.max(0, Math.round(teu - fclTeu));
  const laneRate = Number(matched?.lane?.rate_usd_per_teu ?? 1850);
  const lclRate = LCL_PER_TEU_DEFAULT;
  const fclSpend = Math.round(fclTeu * laneRate);
  const lclSpend = Math.round(lclTeu * lclRate);
  return {
    fclTeu,
    lclTeu,
    fclSpend,
    lclSpend,
    totalSpend: fclSpend + lclSpend,
    laneRatePerTeu: laneRate,
    lclRatePerTeu: lclRate,
    matched,
  };
}
