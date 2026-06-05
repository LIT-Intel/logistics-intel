// Buying Intent aggregator — 4 signals derived from existing ImportYeti BOL
// data. Pure function, no network. The user explicitly rejected hiring-
// signals as a buy-side intent proxy because LIT's audience is supply chain
// professionals selling logistics services to importers — knowing the
// importer is hiring tells us nothing about whether they're about to buy
// more freight services.
//
// The 4 signals (all locked in the roadmap):
//   1. YoY growth        — last 12 months vs prior 12 months volume change
//   2. New lanes 90d     — destination/origin pairs newly active in last 90d
//   3. Forwarder switch  — top carrier in last 90d differs from prior 90d
//   4. HS expansion      — commodity chapters newly active in last 90d
//
// Each signal is a pure function. The aggregator composes them and surfaces
// a `hasAnySignal` flag so the UI can hide the tile entirely when nothing
// is interesting (Finding 4.1 in /plan-eng-review).

import {
  getBolDate,
  getBolDestination,
  getBolHs,
  getBolOrigin,
  readCarrier,
} from "@/lib/bols/helpers";

export type SignalKey =
  | "yoy_growth"
  | "new_lanes"
  | "forwarder_switch"
  | "hs_expansion";

export type SignalStrength = "high" | "medium" | "low";

export type BuyingIntentSignal = {
  key: SignalKey;
  label: string;
  strength: SignalStrength | null;
  /** Human-readable detail. UI uses this verbatim. */
  detail: string;
  /** Raw value backing the signal (% change, count of new lanes, etc.). */
  value: number;
};

export type BuyingIntent = {
  signals: BuyingIntentSignal[];
  highStrengthCount: number;
  /** False when every signal is null. UI hides the whole tile in that case. */
  hasAnySignal: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Public API ──────────────────────────────────────────────────────── */

export function computeBuyingIntent(
  profile: any,
  recentBols: any[] = [],
  now: Date = new Date(),
): BuyingIntent {
  const bols = Array.isArray(recentBols) ? recentBols : [];

  const yoy = computeYoyGrowth(profile, now);
  const lanes = computeNewLanes90d(bols, now);
  const carrier = computeForwarderSwitch(bols, now);
  const hs = computeHsExpansion(bols, now);

  const signals: BuyingIntentSignal[] = [yoy, lanes, carrier, hs];
  const highStrengthCount = signals.filter((s) => s.strength === "high").length;
  const hasAnySignal = signals.some((s) => s.strength !== null);

  return { signals, highStrengthCount, hasAnySignal };
}

/* ── Signal 1: YoY growth ────────────────────────────────────────────── */
// Uses profile.timeSeries (already aggregated by month from `lit_shipments`)
// because per-month shipment counts are the canonical source. Falls back to
// computing from raw BOLs only if no timeSeries is present.

export function computeYoyGrowth(
  profile: any,
  now: Date,
): BuyingIntentSignal {
  const series = Array.isArray(profile?.timeSeries) ? profile.timeSeries : [];
  if (series.length < 13) {
    return signalNull("yoy_growth", "YoY growth", "Not enough history");
  }
  const monthCount = (entry: any): number =>
    Number(entry?.shipments) ||
    (Number(entry?.fclShipments) || 0) + (Number(entry?.lclShipments) || 0);

  // Newest entries are at the end of the timeSeries by convention. Take the
  // last 12 + the 12 before that, summed.
  const last12 = series.slice(-12).reduce((s: number, e: any) => s + monthCount(e), 0);
  const prev12 = series.slice(-24, -12).reduce((s: number, e: any) => s + monthCount(e), 0);

  if (prev12 === 0) {
    // Brand new shipper — can't compute YoY %, but if last 12 is meaningful
    // surface as a separate "Newly active shipper" signal at medium strength.
    if (last12 >= 12) {
      return {
        key: "yoy_growth",
        label: "Newly active shipper",
        strength: "medium",
        detail: `${last12.toLocaleString()} shipments in last 12 mo (no prior history)`,
        value: last12,
      };
    }
    return signalNull("yoy_growth", "YoY growth", "No prior-year baseline");
  }

  const pct = Math.round(((last12 - prev12) / prev12) * 100);
  const strength = yoyStrength(pct);
  if (strength === null) {
    return signalNull("yoy_growth", "YoY growth", `${pct}% YoY (below threshold)`);
  }
  const arrow = pct >= 0 ? "↑" : "↓";
  return {
    key: "yoy_growth",
    label: "YoY growth",
    strength,
    detail: `${arrow} ${Math.abs(pct)}% vs prior 12 mo (${last12.toLocaleString()} ships)`,
    value: pct,
  };
}

function yoyStrength(pct: number): SignalStrength | null {
  // Asymmetric thresholds: growth is the buying-intent signal, decline is
  // worth surfacing only when severe (could indicate carrier switch or
  // operational disruption — both are sales conversation triggers).
  if (pct >= 25) return "high";
  if (pct >= 10) return "medium";
  if (pct <= -30) return "medium"; // sharp decline is also actionable
  return null;
}

/* ── Signal 2: New lanes opened in last 90d ──────────────────────────── */

export function computeNewLanes90d(
  bols: any[],
  now: Date,
): BuyingIntentSignal {
  const cutoff90 = now.getTime() - 90 * DAY_MS;
  const cutoff365 = now.getTime() - 365 * DAY_MS;

  const recent = new Set<string>();
  const historical = new Set<string>();

  for (const bol of bols) {
    const t = parseBolTs(getBolDate(bol));
    if (t === null) continue;
    const lane = laneKey(bol);
    if (!lane) continue;
    if (t >= cutoff90) {
      recent.add(lane);
    } else if (t >= cutoff365) {
      historical.add(lane);
    }
  }

  const newLanes: string[] = [];
  for (const lane of recent) {
    if (!historical.has(lane)) newLanes.push(lane);
  }

  if (newLanes.length === 0) {
    return signalNull("new_lanes", "New trade lanes", "No new lanes in last 90 days");
  }

  const strength: SignalStrength =
    newLanes.length >= 3 ? "high" : newLanes.length === 2 ? "medium" : "low";
  const preview = newLanes.slice(0, 2).join(" · ");
  const more = newLanes.length > 2 ? ` (+${newLanes.length - 2} more)` : "";
  return {
    key: "new_lanes",
    label: "New trade lanes",
    strength,
    detail: `${newLanes.length} new in 90 days — ${preview}${more}`,
    value: newLanes.length,
  };
}

function laneKey(bol: any): string | null {
  const origin = getBolOrigin(bol);
  const dest = getBolDestination(bol);
  if (!origin || origin === "—" || !dest || dest === "—") return null;
  // Drop city detail — country-pair captures "new lane" semantically.
  // Keep last token after the comma where present (e.g. "Shanghai, CN" → "CN").
  const originCountry = origin.split(",").pop()?.trim() || origin;
  const destCountry = dest.split(",").pop()?.trim() || dest;
  return `${originCountry}::${destCountry}`;
}

/* ── Signal 3: Forwarder switch ──────────────────────────────────────── */

export function computeForwarderSwitch(
  bols: any[],
  now: Date,
): BuyingIntentSignal {
  const cutoff90 = now.getTime() - 90 * DAY_MS;
  const cutoff180 = now.getTime() - 180 * DAY_MS;

  const recentCarriers = new Map<string, number>();
  const priorCarriers = new Map<string, number>();

  for (const bol of bols) {
    const t = parseBolTs(getBolDate(bol));
    if (t === null) continue;
    const carrierObj = readCarrier(bol);
    const name = carrierObj?.name;
    if (!name) continue;
    if (t >= cutoff90) {
      recentCarriers.set(name, (recentCarriers.get(name) || 0) + 1);
    } else if (t >= cutoff180) {
      priorCarriers.set(name, (priorCarriers.get(name) || 0) + 1);
    }
  }

  if (recentCarriers.size === 0 || priorCarriers.size === 0) {
    return signalNull(
      "forwarder_switch",
      "Forwarder switch",
      "Insufficient carrier history",
    );
  }

  const topRecent = topEntry(recentCarriers);
  const topPrior = topEntry(priorCarriers);
  if (!topRecent || !topPrior) {
    return signalNull("forwarder_switch", "Forwarder switch", "No top carrier");
  }

  if (topRecent.name === topPrior.name) {
    return signalNull(
      "forwarder_switch",
      "Forwarder switch",
      `Still on ${topRecent.name}`,
    );
  }

  // Different top carrier → switch detected. Strength scales by how
  // dominant the new carrier is relative to the previous top.
  const recentShare =
    topRecent.count /
    Array.from(recentCarriers.values()).reduce((s, n) => s + n, 0);
  const strength: SignalStrength =
    recentShare >= 0.65 ? "high" : recentShare >= 0.4 ? "medium" : "low";

  return {
    key: "forwarder_switch",
    label: "Forwarder switch",
    strength,
    detail: `${topPrior.name} → ${topRecent.name}`,
    value: Math.round(recentShare * 100),
  };
}

/* ── Signal 4: HS-code category expansion ────────────────────────────── */

export function computeHsExpansion(
  bols: any[],
  now: Date,
): BuyingIntentSignal {
  const cutoff90 = now.getTime() - 90 * DAY_MS;
  const cutoff365 = now.getTime() - 365 * DAY_MS;

  const recentChapters = new Set<string>();
  const historicalChapters = new Set<string>();

  for (const bol of bols) {
    const t = parseBolTs(getBolDate(bol));
    if (t === null) continue;
    const hs = getBolHs(bol);
    if (!hs || hs === "—") continue;
    const chapter = String(hs).slice(0, 2);
    if (!chapter || chapter.length !== 2) continue;
    if (t >= cutoff90) {
      recentChapters.add(chapter);
    } else if (t >= cutoff365) {
      historicalChapters.add(chapter);
    }
  }

  const newChapters: string[] = [];
  for (const ch of recentChapters) {
    if (!historicalChapters.has(ch)) newChapters.push(ch);
  }

  if (newChapters.length === 0) {
    return signalNull("hs_expansion", "HS expansion", "No new commodity categories");
  }

  const strength: SignalStrength =
    newChapters.length >= 2 ? "high" : "medium";
  const preview = newChapters.slice(0, 3).map((c) => `HS ${c}`).join(" · ");
  const more = newChapters.length > 3 ? ` (+${newChapters.length - 3} more)` : "";
  return {
    key: "hs_expansion",
    label: "HS expansion",
    strength,
    detail: `${newChapters.length} new HS chapter${newChapters.length === 1 ? "" : "s"} in 90 days — ${preview}${more}`,
    value: newChapters.length,
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function signalNull(
  key: SignalKey,
  label: string,
  detail: string,
): BuyingIntentSignal {
  return { key, label, strength: null, detail, value: 0 };
}

function parseBolTs(raw: string | null): number | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function topEntry(
  m: Map<string, number>,
): { name: string; count: number } | null {
  let bestName: string | null = null;
  let bestCount = 0;
  for (const [name, count] of m.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  }
  return bestName ? { name: bestName, count: bestCount } : null;
}
