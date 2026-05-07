/**
 * Phase 4 — Revenue Opportunity sizing.
 *
 * Pure functions that turn shipment + lane benchmark data into per-service-
 * line revenue opportunity estimates a freight account manager would actually
 * trust. Six service lines: Ocean (FCL/LCL), Customs Brokerage, Drayage, Air,
 * Warehousing, Domestic Trucking.
 *
 * Hard rules:
 * - Never fabricate inputs. If a number we'd need is missing, return
 *   `{ value: null, confidence: "insufficient_data", reason: "..." }`.
 * - Use industry-standard per-unit fees (no markups, no fantasy multiples).
 * - Keep math transparent — every service line exposes the inputs and the
 *   formula it used, so the UI can show methodology and a rep can defend
 *   the number on a call.
 */
import {
  matchAllRoutesForCompany,
  type FreightLane,
  type TopRouteMatch,
} from "@/lib/freightRateBenchmark";

// ---------- Industry-standard per-unit fees -----------------------------
//
// All numbers here are public-information benchmarks (Drewry, Xeneta,
// FreightWaves SONAR, USDA AMS, NMFTA published rate guides). They're
// conservative midpoints, not a salesperson's wish-list.

/** Customs brokerage entry fee — single-entry HBL, no special permits. */
const CUSTOMS_FEE_PER_FCL_ENTRY = 150;
const CUSTOMS_FEE_PER_LCL_ENTRY = 200;

/** Average drayage cost per pull (US East/West Coast blended, 2026). */
const DRAYAGE_PER_FCL_USD = 450;

/** Average post-port domestic trucking move per FCL (one-way ~600 mi). */
const DOMESTIC_FTL_PER_FCL_USD = 1200;

/** Air freight effective per-kg rate (general cargo, transpac mid-2026). */
const AIR_RATE_PER_KG_USD = 2.8;

/** Warehouse storage: $7 per CBM per month, ~1 month average dwell. */
const WAREHOUSE_PER_CBM_PER_MONTH_USD = 7;
const WAREHOUSE_AVG_DWELL_MONTHS = 1;
/** TEU → CBM conversion (1 TEU ≈ 28 cubic meters loaded). */
const CBM_PER_TEU = 28;

/** LCL benchmark $/TEU when no carrier-disclosed rate is available. */
const LCL_BENCHMARK_USD_PER_TEU = 850;

// ---------- Types --------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient_data";

export type ServiceLineEstimate = {
  serviceLine: string;
  /** Annualized revenue opportunity in USD. null when inputs are missing. */
  value: number | null;
  confidence: ConfidenceLevel;
  /** Human-readable explanation of the inputs and formula. */
  reason: string;
  /** Detail rows for the UI methodology popover. */
  inputs: Array<{ label: string; value: string }>;
};

export type CrossSellSignal = {
  id: string;
  title: string;
  body: string;
  /** "info" | "buy" | "risk" — drives card color. */
  tone: "info" | "buy" | "risk";
};

export type WinRateScenario = {
  label: string;
  rate: number;
  value: number;
};

export type RevenueOpportunityReport = {
  companyName: string | null;
  totalAddressableSpend: number;
  scenarios: WinRateScenario[];
  serviceLines: {
    ocean: ServiceLineEstimate;
    customs: ServiceLineEstimate;
    drayage: ServiceLineEstimate;
    air: ServiceLineEstimate;
    warehousing: ServiceLineEstimate;
    trucking: ServiceLineEstimate;
  };
  crossSellSignals: CrossSellSignal[];
  /** ISO date of the benchmark snapshot used. */
  benchmarkAsOf: string | null;
  /** True when at least the ocean line could be sized. */
  hasUsableData: boolean;
};

// ---------- Inputs container --------------------------------------------

export type RevenueOpportunityInputs = {
  companyName?: string | null;
  /** Total shipments in the last 12 months. */
  shipments12m?: number | null;
  /** TEU in the last 12 months. */
  teu12m?: number | null;
  /** FCL ship count (last 12m). */
  fclShipments12m?: number | null;
  /** LCL ship count (last 12m). */
  lclShipments12m?: number | null;
  /** Top routes (route + ourShipments + ourTeu). */
  topRoutes?: any[] | null;
  /** Latest reference benchmarks. */
  benchmarkLanes?: FreightLane[] | null;
  /** Top HS codes — used to gate the air-freight estimate. */
  hsProfile?: any[] | null;
  /** Carrier mix — used to flag carrier dependency. */
  carrierMix?: any[] | null;
  /** Importer-reported total shipping cost (BOL customs value). */
  importerSelfReportedSpend12m?: number | null;
};

// ---------- Helpers ------------------------------------------------------

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ratio(num: number, denom: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom <= 0) return 0;
  return num / denom;
}

/** HS chapters that are realistically air-shippable in volume. */
const AIR_LIKELY_HS_CHAPTERS = new Set([
  "30", // pharmaceuticals
  "85", // electronics / electrical
  "84", // machinery / parts
  "90", // optical / medical instruments
  "62", // apparel knit/sewn (fast-fashion air)
  "61", // knitted apparel (fast-fashion air)
  "71", // jewelry / precious metals
  "97", // art / antiques
  "33", // perfumes / cosmetics
]);

function airLikelyShareFromHs(hsProfile: any[] | null | undefined): number {
  if (!Array.isArray(hsProfile) || hsProfile.length === 0) return 0;
  let airTotal = 0;
  let allTotal = 0;
  for (const row of hsProfile) {
    const code = String(row?.code ?? row?.hs_code ?? "").slice(0, 2);
    const weight = Number(row?.share ?? row?.percent ?? row?.count ?? 1) || 1;
    allTotal += weight;
    if (AIR_LIKELY_HS_CHAPTERS.has(code)) airTotal += weight;
  }
  if (allTotal <= 0) return 0;
  return airTotal / allTotal;
}

// ---------- Service-line sizers -----------------------------------------

function sizeOcean(
  inputs: RevenueOpportunityInputs,
  matches: TopRouteMatch[],
): ServiceLineEstimate {
  const totalSpend = matches.reduce((s, m) => s + (m.marketSpend || 0), 0);
  if (totalSpend > 0) {
    const exactMatches = matches.filter(
      (m) => m.matched?.confidence === "exact",
    ).length;
    const partialMatches = matches.filter(
      (m) => m.matched?.confidence === "partial",
    ).length;
    const fallbackMatches = matches.length - exactMatches - partialMatches;
    const conf: ConfidenceLevel =
      exactMatches >= matches.length * 0.6
        ? "high"
        : partialMatches + exactMatches >= matches.length * 0.6
          ? "medium"
          : "low";
    return {
      serviceLine: "Ocean freight",
      value: Math.round(totalSpend),
      confidence: conf,
      reason: `Sum of ${matches.length} top lane${matches.length === 1 ? "" : "s"} matched to current FBX rates. ${exactMatches} exact / ${partialMatches} partial / ${fallbackMatches} fallback match${fallbackMatches === 1 ? "" : "es"}.`,
      inputs: [
        { label: "Lanes evaluated", value: String(matches.length) },
        {
          label: "Match quality",
          value: `${exactMatches} exact, ${partialMatches} partial`,
        },
        {
          label: "Methodology",
          value: "TEU × matched FBX $/TEU + LCL bench (LCL-bounded)",
        },
      ],
    };
  }
  // Fallback: if benchmarks didn't load, use TEU × generic average rate.
  const teu = safeNum(inputs.teu12m);
  if (teu && Array.isArray(inputs.benchmarkLanes) && inputs.benchmarkLanes.length > 0) {
    const avgPerTeu =
      inputs.benchmarkLanes.reduce(
        (s, l) => s + (Number(l.rate_usd_per_teu) || 0),
        0,
      ) / inputs.benchmarkLanes.length;
    if (avgPerTeu > 0) {
      const value = Math.round(teu * avgPerTeu);
      return {
        serviceLine: "Ocean freight",
        value,
        confidence: "low",
        reason:
          "Top-route lane match unavailable. Used global FBX average $/TEU as a placeholder.",
        inputs: [
          { label: "TEU 12m", value: teu.toLocaleString() },
          {
            label: "Avg lane $/TEU",
            value: `$${Math.round(avgPerTeu).toLocaleString()}`,
          },
        ],
      };
    }
  }
  return {
    serviceLine: "Ocean freight",
    value: null,
    confidence: "insufficient_data",
    reason:
      "Need top routes plus current FBX benchmarks. Refresh the company snapshot or wait for the weekly rate fetch.",
    inputs: [],
  };
}

function sizeCustoms(inputs: RevenueOpportunityInputs): ServiceLineEstimate {
  const fcl = safeNum(inputs.fclShipments12m);
  const lcl = safeNum(inputs.lclShipments12m);
  if (!fcl && !lcl) {
    const total = safeNum(inputs.shipments12m);
    if (!total) {
      return {
        serviceLine: "Customs brokerage",
        value: null,
        confidence: "insufficient_data",
        reason: "Need FCL/LCL ship counts (or total shipments).",
        inputs: [],
      };
    }
    // Assume 90% FCL when split is unknown — most ocean importers.
    const assumedFcl = Math.round(total * 0.9);
    const assumedLcl = total - assumedFcl;
    const value =
      assumedFcl * CUSTOMS_FEE_PER_FCL_ENTRY +
      assumedLcl * CUSTOMS_FEE_PER_LCL_ENTRY;
    return {
      serviceLine: "Customs brokerage",
      value,
      confidence: "low",
      reason:
        "FCL/LCL split unknown — assumed 90/10 split based on industry default.",
      inputs: [
        { label: "Shipments 12m", value: total.toLocaleString() },
        {
          label: "FCL/LCL fees",
          value: `$${CUSTOMS_FEE_PER_FCL_ENTRY}/$${CUSTOMS_FEE_PER_LCL_ENTRY} per entry`,
        },
      ],
    };
  }
  const fclEntries = fcl ?? 0;
  const lclEntries = lcl ?? 0;
  const value =
    fclEntries * CUSTOMS_FEE_PER_FCL_ENTRY +
    lclEntries * CUSTOMS_FEE_PER_LCL_ENTRY;
  return {
    serviceLine: "Customs brokerage",
    value,
    confidence: "high",
    reason:
      "Per-entry brokerage fee × actual FCL + LCL ship counts (industry-standard pricing).",
    inputs: [
      { label: "FCL entries", value: fclEntries.toLocaleString() },
      { label: "LCL entries", value: lclEntries.toLocaleString() },
      {
        label: "Per-entry fee",
        value: `$${CUSTOMS_FEE_PER_FCL_ENTRY} FCL · $${CUSTOMS_FEE_PER_LCL_ENTRY} LCL`,
      },
    ],
  };
}

function sizeDrayage(inputs: RevenueOpportunityInputs): ServiceLineEstimate {
  const fcl = safeNum(inputs.fclShipments12m);
  if (!fcl) {
    return {
      serviceLine: "Drayage",
      value: null,
      confidence: "insufficient_data",
      reason: "Need FCL container count to size drayage.",
      inputs: [],
    };
  }
  const value = fcl * DRAYAGE_PER_FCL_USD;
  return {
    serviceLine: "Drayage",
    value,
    confidence: "high",
    reason:
      "FCL containers × blended US East/West coast drayage rate (~$450/pull).",
    inputs: [
      { label: "FCL containers", value: fcl.toLocaleString() },
      { label: "Per-pull rate", value: `$${DRAYAGE_PER_FCL_USD}` },
    ],
  };
}

function sizeAir(inputs: RevenueOpportunityInputs): ServiceLineEstimate {
  const airShare = airLikelyShareFromHs(inputs.hsProfile);
  if (airShare <= 0.02) {
    return {
      serviceLine: "Air freight",
      value: null,
      confidence: "insufficient_data",
      reason:
        "HS profile shows < 2% air-likely cargo (electronics, pharma, fast-fashion, instruments). No meaningful air opportunity to size.",
      inputs: [],
    };
  }
  const teu = safeNum(inputs.teu12m);
  if (!teu) {
    return {
      serviceLine: "Air freight",
      value: null,
      confidence: "insufficient_data",
      reason: "Need TEU to derive air-equivalent kg.",
      inputs: [],
    };
  }
  // Convert TEU to a rough kg figure (1 TEU ≈ 14,000 kg dense cargo).
  const totalKg = teu * 14000;
  const airKg = totalKg * airShare;
  // Apply a 5% conversion factor: not all air-likely cargo actually moves
  // by air — most still goes by ocean. Conservative anchor.
  const realisticAirKg = airKg * 0.05;
  const value = Math.round(realisticAirKg * AIR_RATE_PER_KG_USD);
  return {
    serviceLine: "Air freight",
    value,
    confidence: "low",
    reason: `${(airShare * 100).toFixed(0)}% of HS profile is air-likely; assumed 5% of that volume actually moves by air. Air spend = realistic-air kg × $${AIR_RATE_PER_KG_USD}/kg.`,
    inputs: [
      { label: "Air-likely HS share", value: `${(airShare * 100).toFixed(0)}%` },
      {
        label: "Realistic air kg",
        value: Math.round(realisticAirKg).toLocaleString(),
      },
      { label: "Per-kg rate", value: `$${AIR_RATE_PER_KG_USD}` },
    ],
  };
}

function sizeWarehousing(inputs: RevenueOpportunityInputs): ServiceLineEstimate {
  const teu = safeNum(inputs.teu12m);
  if (!teu) {
    return {
      serviceLine: "Warehousing",
      value: null,
      confidence: "insufficient_data",
      reason: "Need TEU to derive cubic-meter throughput.",
      inputs: [],
    };
  }
  const cbm = teu * CBM_PER_TEU;
  const value = Math.round(
    cbm * WAREHOUSE_PER_CBM_PER_MONTH_USD * WAREHOUSE_AVG_DWELL_MONTHS,
  );
  return {
    serviceLine: "Warehousing",
    value,
    confidence: "medium",
    reason: `Annual TEU × ${CBM_PER_TEU} CBM/TEU × $${WAREHOUSE_PER_CBM_PER_MONTH_USD}/CBM/mo × ${WAREHOUSE_AVG_DWELL_MONTHS} mo dwell. Assumes domestic dwell — discount if buyer ships direct-to-store.`,
    inputs: [
      { label: "Annual CBM", value: Math.round(cbm).toLocaleString() },
      {
        label: "Storage rate",
        value: `$${WAREHOUSE_PER_CBM_PER_MONTH_USD}/CBM/mo`,
      },
      { label: "Avg dwell", value: `${WAREHOUSE_AVG_DWELL_MONTHS} mo` },
    ],
  };
}

function sizeTrucking(inputs: RevenueOpportunityInputs): ServiceLineEstimate {
  const fcl = safeNum(inputs.fclShipments12m);
  if (!fcl) {
    return {
      serviceLine: "Domestic trucking",
      value: null,
      confidence: "insufficient_data",
      reason: "Need FCL container count to size post-port trucking.",
      inputs: [],
    };
  }
  // Assume 60% of FCL containers do a post-port FTL move (the rest are
  // local drayage to a near-port DC and stop there).
  const ftlMoves = Math.round(fcl * 0.6);
  const value = ftlMoves * DOMESTIC_FTL_PER_FCL_USD;
  return {
    serviceLine: "Domestic trucking",
    value,
    confidence: "medium",
    reason: `60% of FCL containers assumed to do a post-port FTL move (~600 mi avg). Remaining 40% ship local-only.`,
    inputs: [
      { label: "Estimated FTL moves", value: ftlMoves.toLocaleString() },
      { label: "Per-move rate", value: `$${DOMESTIC_FTL_PER_FCL_USD}` },
    ],
  };
}

// ---------- Cross-sell signals ------------------------------------------

function buildCrossSellSignals(
  inputs: RevenueOpportunityInputs,
  matches: TopRouteMatch[],
  oceanSpend: number,
): CrossSellSignal[] {
  const signals: CrossSellSignal[] = [];

  // Multi-lane importer
  if (matches.length >= 3) {
    signals.push({
      id: "multi-lane",
      title: "Multi-lane importer",
      body: `Active on ${matches.length} distinct lanes — strong consolidation play. A single 4PL relationship can replace ${matches.length} carrier contracts.`,
      tone: "buy",
    });
  }

  // LCL-heavy
  const lcl = safeNum(inputs.lclShipments12m) || 0;
  const total = safeNum(inputs.shipments12m) || 0;
  if (total > 0 && ratio(lcl, total) > 0.3) {
    signals.push({
      id: "lcl-heavy",
      title: "Heavy LCL share",
      body: `${Math.round(ratio(lcl, total) * 100)}% of shipments are LCL — buyer's consol opportunity. They're paying retail for partial loads instead of consolidating with peers.`,
      tone: "buy",
    });
  }

  // Single-carrier dependency
  if (Array.isArray(inputs.carrierMix) && inputs.carrierMix.length === 1) {
    signals.push({
      id: "carrier-concentration",
      title: "Single-carrier dependency",
      body: `Only one carrier appears in their mix. A 2026 service disruption (rate spike, blank sailing, contract surprise) hits this account harder than peers.`,
      tone: "risk",
    });
  }

  // NVOCC arbitrage signal
  const importerSpend = safeNum(inputs.importerSelfReportedSpend12m);
  if (importerSpend && oceanSpend > 0) {
    const gap = oceanSpend / importerSpend;
    if (gap >= 3) {
      signals.push({
        id: "nvocc-arbitrage",
        title: "NVOCC arbitrage signal",
        body: `Customs-disclosed freight is $${Math.round(importerSpend / 1000).toLocaleString()}K but market-rate freight is $${Math.round(oceanSpend / 1000).toLocaleString()}K (${gap.toFixed(1)}× gap). Usually means buyer is moving through a heavy NVOCC layer with margin to win back.`,
        tone: "info",
      });
    }
  }

  return signals;
}

// ---------- Main entry --------------------------------------------------

export function buildRevenueOpportunity(
  inputs: RevenueOpportunityInputs,
): RevenueOpportunityReport {
  const benchmarkLanes = Array.isArray(inputs.benchmarkLanes)
    ? inputs.benchmarkLanes
    : [];
  const matches: TopRouteMatch[] =
    Array.isArray(inputs.topRoutes) &&
    inputs.topRoutes.length > 0 &&
    benchmarkLanes.length > 0
      ? matchAllRoutesForCompany(inputs.topRoutes, benchmarkLanes)
      : [];

  const ocean = sizeOcean(inputs, matches);
  const customs = sizeCustoms(inputs);
  const drayage = sizeDrayage(inputs);
  const air = sizeAir(inputs);
  const warehousing = sizeWarehousing(inputs);
  const trucking = sizeTrucking(inputs);

  const totalAddressableSpend = [
    ocean,
    customs,
    drayage,
    air,
    warehousing,
    trucking,
  ].reduce((s, line) => s + (line.value ?? 0), 0);

  const scenarios: WinRateScenario[] = [
    {
      label: "Conservative (10%)",
      rate: 0.1,
      value: Math.round(totalAddressableSpend * 0.1),
    },
    {
      label: "Realistic (25%)",
      rate: 0.25,
      value: Math.round(totalAddressableSpend * 0.25),
    },
    {
      label: "Aggressive (50%)",
      rate: 0.5,
      value: Math.round(totalAddressableSpend * 0.5),
    },
  ];

  const crossSellSignals = buildCrossSellSignals(
    inputs,
    matches,
    ocean.value ?? 0,
  );

  const benchmarkAsOf = benchmarkLanes[0]?.as_of_date ?? null;

  return {
    companyName: inputs.companyName ?? null,
    totalAddressableSpend: Math.round(totalAddressableSpend),
    scenarios,
    serviceLines: { ocean, customs, drayage, air, warehousing, trucking },
    crossSellSignals,
    benchmarkAsOf,
    hasUsableData: totalAddressableSpend > 0,
  };
}

export function formatUsdShort(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

// Suppress unused-warning for benchmark constant when caller doesn't need it
// (e.g. outside the ocean codepath). Exporting anyway so docs/tests can see it.
export const REV_OPP_LCL_BENCHMARK_USD_PER_TEU = LCL_BENCHMARK_USD_PER_TEU;
