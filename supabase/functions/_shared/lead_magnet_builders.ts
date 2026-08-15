// lead_magnet_builders — SHARED, pure result builders for the lead magnets.
// ---------------------------------------------------------------------------
// These are imported by BOTH the public edge functions (lead-magnet-list,
// lead-magnet-report) AND the fulfillment cron (lead-magnet-fulfillment) so the
// email a user receives is built from the exact same logic as the on-page
// result — no duplication, no drift.
//
// Everything here is snapshot/directory READ-ONLY (0 provider credits) or pure
// data-shaping. No serve(), no side effects at import time.
// ---------------------------------------------------------------------------

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { expandRegion } from "./region_presets.ts";
import { compositeScore } from "./opportunity_scoring.ts";

// ===========================================================================
// small shared helpers
// ===========================================================================

export function lmStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function lmNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => lmStr(x)).filter((x): x is string => Boolean(x));
  const s = lmStr(v);
  return s ? [s] : [];
}

// ===========================================================================
// LIST MAGNETS (top-shippers / free-freight-prospects)
// ===========================================================================

const STATE_CODE_TO_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico",
};

function statesToFullNames(codes: string[]): string[] {
  return codes.map((c) => STATE_CODE_TO_NAME[c.toUpperCase()] ?? c);
}

export type MagnetFilters = {
  industry: string[];
  regions: string[];
  states: string[];
  countries: string[];
  shipments_min: number | null;
  destination_hint: string[];
  mode: string[];
};

const VOLUME_FLOORS: Record<string, number> = {
  low: 0, small: 0, medium: 25, mid: 25, high: 100, large: 100, enterprise: 500,
};

function volumeFloor(v: unknown): number | null {
  const s = lmStr(v);
  if (!s) return null;
  const key = s.toLowerCase().trim();
  if (key in VOLUME_FLOORS) return VOLUME_FLOORS[key];
  const n = Number(key.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseFilters(raw: unknown): MagnetFilters {
  const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const regions = strArr(f.region).map((r) => r.toLowerCase());
  const states = strArr(f.state);
  return {
    industry: strArr(f.industry),
    regions,
    states,
    countries: strArr(f.origin_country),
    shipments_min: volumeFloor(f.volume_range),
    destination_hint: [...strArr(f.destination_region), ...strArr(f.destination_port)],
    mode: strArr(f.mode),
  };
}

function expandedStateNames(f: MagnetFilters): string[] {
  const fromRegions = f.regions.flatMap((k) => expandRegion(k));
  const all = Array.from(new Set([...fromRegions, ...f.states].map((s) => s.toUpperCase())));
  return statesToFullNames(all);
}

// Country → lane-text synonyms (ports / spelling variants) for the SOFT origin
// refinement over top_dimensions. lit_company_directory has no shipment-origin
// column (country is 100% "United States"), so we match lane label text.
const ORIGIN_SYNONYMS: Record<string, string[]> = {
  china: ["Yantian", "Shanghai", "Ningbo", "Shenzhen", "Qingdao", "Xiamen", "China"],
  vietnam: ["Vung Tau", "Cat Lai", "Cai Mep", "Haiphong", "Viet Nam", "Vietnam"],
  india: ["Nhava Sheva", "Mundra", "Chennai", "India"],
  germany: ["Hamburg", "Bremerhaven", "Germany"],
  mexico: ["Manzanillo", "Lazaro Cardenas", "Veracruz", "Mexico"],
  "south korea": ["Busan", "Pusan", "Incheon", "Korea"],
  japan: ["Tokyo", "Yokohama", "Kobe", "Nagoya", "Japan"],
  italy: ["Genoa", "Genova", "La Spezia", "Italy"],
  taiwan: ["Kaohsiung", "Keelung", "Taipei", "Taiwan"],
  thailand: ["Laem Chabang", "Bangkok", "Thailand"],
  canada: ["Vancouver", "Montreal", "Prince Rupert", "Canada"],
};

function laneNeedles(f: MagnetFilters): string[] {
  const out: string[] = [];
  for (const c of f.countries) {
    const key = c.toLowerCase().trim();
    if (ORIGIN_SYNONYMS[key]) out.push(...ORIGIN_SYNONYMS[key]);
    else out.push(c);
  }
  for (const d of f.destination_hint) out.push(d);
  return Array.from(new Set(out.map((s) => s.trim()).filter(Boolean)));
}

export type DirRow = {
  id: string;
  company_name: string;
  industry: string | null;
  vertical: string | null;
  state: string | null;
  country: string | null;
  city: string | null;
  teu: number | null;
  shipments: number | null;
  value_usd: number | null;
  top_dimensions: unknown;
  opportunity_consolidation_score: number;
  opportunity_vulnerable_score: number;
  opportunity_velocity_score: number;
  opportunity_composite_score: number;
};

const DIR_COLS =
  "id, company_name, industry, vertical, state, country, city, teu, shipments, value_usd, " +
  "top_dimensions, opportunity_consolidation_score, opportunity_vulnerable_score, " +
  "opportunity_velocity_score, opportunity_composite_score";

const READ_CAP = 500;
export const VISIBLE_COUNT = 5;
export const LOCKED_COUNT = 20;
export const TOTAL_COUNT = VISIBLE_COUNT + LOCKED_COUNT;

function mapDirRow(r: any): DirRow {
  return {
    id: String(r.id),
    company_name: lmStr(r.company_name) ?? "",
    industry: lmStr(r.industry),
    vertical: lmStr(r.vertical),
    state: lmStr(r.state),
    country: lmStr(r.country),
    city: lmStr(r.city),
    teu: numOrNull(r.teu),
    shipments: numOrNull(r.shipments),
    value_usd: numOrNull(r.value_usd),
    top_dimensions: r.top_dimensions ?? null,
    opportunity_consolidation_score: Number(r.opportunity_consolidation_score ?? 0),
    opportunity_vulnerable_score: Number(r.opportunity_vulnerable_score ?? 0),
    opportunity_velocity_score: Number(r.opportunity_velocity_score ?? 0),
    opportunity_composite_score: Number(r.opportunity_composite_score ?? 0),
  };
}

async function fetchDirectoryHard(admin: SupabaseClient, f: MagnetFilters): Promise<DirRow[]> {
  let q = admin
    .from("lit_company_directory")
    .select(DIR_COLS)
    .order("opportunity_composite_score", { ascending: false, nullsFirst: false })
    .limit(READ_CAP);
  if (f.industry.length) q = q.in("industry", f.industry);
  const stateNames = expandedStateNames(f);
  if (stateNames.length) q = q.in("state", stateNames);
  if (f.shipments_min != null && f.shipments_min > 0) q = q.gte("shipments", f.shipments_min);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map(mapDirRow);
}

async function fetchDirectoryGlobal(admin: SupabaseClient): Promise<DirRow[]> {
  const { data, error } = await admin
    .from("lit_company_directory")
    .select(DIR_COLS)
    .order("opportunity_composite_score", { ascending: false, nullsFirst: false })
    .limit(READ_CAP);
  if (error) return [];
  return (data ?? []).map(mapDirRow);
}

function applyLaneRefinement(rows: DirRow[], f: MagnetFilters): DirRow[] {
  const needles = laneNeedles(f).map((n) => n.toLowerCase());
  if (needles.length === 0) return rows;
  const refined = rows.filter((r) => {
    const text = JSON.stringify(r.top_dimensions ?? "").toLowerCase();
    return needles.some((n) => text.includes(n));
  });
  return refined.length > 0 ? refined : rows;
}

/**
 * Full list resolution shared by the edge handler AND the fulfillment cron:
 *   hard filters (industry/volume/state) → soft lane refinement (origin/dest,
 *   never zeroes) → global top-ranked fallback.
 * Always returns a ranked list unless the directory table is genuinely empty.
 */
export async function resolveProspectList(
  admin: SupabaseClient,
  f: MagnetFilters,
): Promise<{ rows: DirRow[]; usedFallback: boolean }> {
  const hard = await fetchDirectoryHard(admin, f);
  if (hard.length > 0) return { rows: applyLaneRefinement(hard, f), usedFallback: false };
  const global = await fetchDirectoryGlobal(admin);
  return { rows: applyLaneRefinement(global, f), usedFallback: true };
}

function topLane(dims: unknown): string | null {
  if (!Array.isArray(dims) || dims.length === 0) return null;
  const first = dims[0] as Record<string, unknown>;
  return lmStr(first?.lane) ?? lmStr(first?.route) ?? null;
}

function growthTrend(velocity: number): "accelerating" | "steady" | "cooling" {
  if (velocity >= 55) return "accelerating";
  if (velocity >= 25) return "steady";
  return "cooling";
}

export function compositeOf(r: DirRow): number {
  if (r.opportunity_composite_score > 0) return r.opportunity_composite_score;
  return compositeScore({
    consolidation: r.opportunity_consolidation_score,
    vulnerable: r.opportunity_vulnerable_score,
    velocity: r.opportunity_velocity_score,
    defend: 0,
  });
}

export type VisibleRow = {
  rank: number;
  company_name: string;
  industry: string | null;
  region: string | null;
  shipments_12m: number | null;
  shipments_12m_label: string;
  teu: number | null;
  teu_label: string;
  growth_trend: "accelerating" | "steady" | "cooling";
  top_lane: string | null;
  opportunity_score: number;
};

export type LockedRow = { rank: number; name_teaser: string; industry: string | null; locked: true };

export function toVisible(r: DirRow, rank: number): VisibleRow {
  return {
    rank,
    company_name: r.company_name,
    industry: r.industry ?? r.vertical ?? null,
    region: [r.city, r.state, r.country].filter(Boolean).join(", ") || null,
    shipments_12m: r.shipments != null ? Math.round(r.shipments) : null,
    shipments_12m_label: "estimated · trailing 12 months",
    teu: r.teu != null ? Math.round(r.teu) : null,
    teu_label: "modeled estimate",
    growth_trend: growthTrend(r.opportunity_velocity_score),
    top_lane: topLane(r.top_dimensions),
    opportunity_score: Math.round(compositeOf(r)),
  };
}

function maskName(name: string): string {
  const clean = name.trim();
  if (!clean) return "•••••••";
  const first = clean[0].toUpperCase();
  return `${first}${"•".repeat(Math.max(4, Math.min(10, clean.length - 1)))}`;
}

export function toLocked(r: DirRow, rank: number): LockedRow {
  return { rank, name_teaser: maskName(r.company_name), industry: r.industry ?? r.vertical ?? null, locked: true };
}

export type ListResult = {
  visible: VisibleRow[];
  locked: LockedRow[];
  locked_count: number;
  total_count: number;
  data_freshness: string;
};

/** Rank + split into 5 visible / 20 locked — the shape both the edge fn and the email use. */
export function buildListResult(rows: DirRow[]): ListResult {
  const ranked = [...rows].sort((a, b) => compositeOf(b) - compositeOf(a)).slice(0, TOTAL_COUNT);
  const visible = ranked.slice(0, VISIBLE_COUNT).map((r, i) => toVisible(r, i + 1));
  const locked = ranked.slice(VISIBLE_COUNT).map((r, i) => toLocked(r, VISIBLE_COUNT + i + 1));
  return {
    visible,
    locked,
    locked_count: locked.length,
    total_count: visible.length + locked.length,
    data_freshness: "cached directory · aggregated public intel",
  };
}

// ===========================================================================
// REPORT MAGNET (free-shipper-report) — cached snapshot → LIMITED public view
// ===========================================================================

function slugify(input: string): string {
  if (!input) return "";
  const stripped = input.trim().startsWith("company/")
    ? input.trim().slice("company/".length)
    : input.trim();
  return (
    stripped
      .toLowerCase()
      .replace(/[\s_.]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "") || ""
  );
}

function prettify(slug: string): string {
  return slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function endpointCountry(label: string): string | null {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : (label.trim() || null);
}
function endpointCity(label: string): string | null {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[0] : (label.trim() || null);
}

export function buildReport(companyKey: string, ps: Record<string, unknown>, snapDate: string | null) {
  const routes = Array.isArray(ps.top_routes) ? (ps.top_routes as any[]) : [];
  const suppliers = Array.isArray(ps.top_suppliers) ? (ps.top_suppliers as any[]) : [];
  const monthly = (ps.monthly_volumes && typeof ps.monthly_volumes === "object" ? ps.monthly_volumes : {}) as Record<string, any>;
  const recentBols = Array.isArray(ps.recent_bols) ? (ps.recent_bols as any[]) : [];

  const originCounts = new Map<string, number>();
  for (const r of routes) {
    const label = lmStr(r?.route);
    if (!label) continue;
    const [originLabel] = label.split(/→|->|—/).map((s: string) => s.trim());
    const country = originLabel ? endpointCountry(originLabel) : null;
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (lmNum(r?.shipments) ?? 1));
  }
  for (const s of suppliers) {
    const country = lmStr(s?.country);
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (lmNum(s?.shipment_count) ?? 1));
  }
  const topOriginCountries = [...originCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);

  const destCounts = new Map<string, number>();
  for (const r of routes) {
    const label = lmStr(r?.route);
    if (!label) continue;
    const parts = label.split(/→|->|—/).map((s: string) => s.trim());
    const destLabel = parts.length > 1 ? parts[parts.length - 1] : null;
    const city = destLabel ? endpointCity(destLabel) : null;
    if (!city) continue;
    destCounts.set(city, (destCounts.get(city) ?? 0) + (lmNum(r?.shipments) ?? 1));
  }
  const topDestPorts = [...destCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);

  const leadRoute = routes[0] ? lmStr(routes[0]?.route) : null;

  const monthKeys = Object.keys(monthly).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  const last12 = monthKeys.slice(-12);
  const trend = last12.map((k) => ({ month: k, shipments: lmNum(monthly[k]?.shipments) ?? 0 }));

  const shipments12m = lmNum(ps.shipments_last_12m) ?? lmNum(ps.total_shipments) ?? 0;
  const totalTeu = lmNum(ps.total_teu) ?? 0;

  const lanesCount = routes.filter((r) => lmStr(r?.route)).length;
  const contactsEstimate = shipments12m > 0 ? Math.max(3, Math.min(120, Math.round(Math.sqrt(shipments12m)))) : 0;
  const bolCount = recentBols.length;
  const suppliersCount = suppliers.length;

  return {
    visible: {
      company_key: companyKey,
      company_name: lmStr(ps.company_name) ?? prettify(companyKey),
      country: lmStr(ps.country),
      shipments_last_12m: shipments12m,
      shipments_last_12m_label: "estimated · trailing 12 months",
      total_teu: Math.round(totalTeu),
      total_teu_label: "modeled estimate",
      last_shipment_date: lmStr(ps.last_shipment_date),
      top_origin_countries: topOriginCountries,
      top_destination_ports: topDestPorts,
      lead_trade_lane: leadRoute,
      trend,
    },
    locked: {
      lanes_count: lanesCount,
      suppliers_count: suppliersCount,
      shipment_records_count: bolCount,
      contacts_count_estimate: contactsEstimate,
      decision_makers: true,
      pulse_monitoring: true,
      company_alerts: true,
      opportunity_score: true,
    },
    data_freshness: snapDate ? `cached as of ${snapDate}` : "cached snapshot",
  };
}

// ===========================================================================
// RISK MAGNET (import-risk-scanner) — cached snapshot → NON-legal indicators
// ===========================================================================

function concentrationBand(topSharePct: number, distinctCount: number): "Low" | "Moderate" | "High" {
  if (topSharePct >= 65 || distinctCount <= 1) return "High";
  if (topSharePct >= 40 || distinctCount <= 3) return "Moderate";
  return "Low";
}

function shareMap(counts: Map<string, number>): { name: string; share: number; count: number }[] {
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, share: Math.round((count / total) * 100), count }));
}

export function buildRisk(
  companyKey: string,
  ps: Record<string, unknown>,
  snapDate: string | null,
  declared: { commodity: string | null; hs_code: string | null; origin_country: string | null },
) {
  const routes = Array.isArray(ps.top_routes) ? (ps.top_routes as any[]) : [];
  const suppliers = Array.isArray(ps.top_suppliers) ? (ps.top_suppliers as any[]) : [];
  const monthly = (ps.monthly_volumes && typeof ps.monthly_volumes === "object" ? ps.monthly_volumes : {}) as Record<string, any>;
  const recentBols = Array.isArray(ps.recent_bols) ? (ps.recent_bols as any[]) : [];

  const originCounts = new Map<string, number>();
  for (const r of routes) {
    const label = lmStr(r?.route);
    if (!label) continue;
    const [originLabel] = label.split(/→|->|—/).map((s: string) => s.trim());
    const country = originLabel ? endpointCountry(originLabel) : null;
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (lmNum(r?.shipments) ?? 1));
  }
  for (const s of suppliers) {
    const country = lmStr(s?.country);
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (lmNum(s?.shipment_count) ?? 1));
  }
  const originShares = shareMap(originCounts);
  const primarySourcing = originShares.slice(0, 4);
  const topCountryShare = originShares[0]?.share ?? 0;
  const countryRisk = concentrationBand(topCountryShare, originShares.length);

  const destCounts = new Map<string, number>();
  for (const r of routes) {
    const label = lmStr(r?.route);
    if (!label) continue;
    const parts = label.split(/→|->|—/).map((s: string) => s.trim());
    const destLabel = parts.length > 1 ? parts[parts.length - 1] : null;
    const city = destLabel ? endpointCity(destLabel) : null;
    if (!city) continue;
    destCounts.set(city, (destCounts.get(city) ?? 0) + (lmNum(r?.shipments) ?? 1));
  }
  const portShares = shareMap(destCounts);
  const topPortShare = portShares[0]?.share ?? 0;
  const portRisk = concentrationBand(topPortShare, portShares.length);

  const supplierCounts = new Map<string, number>();
  for (const s of suppliers) {
    const nm = lmStr(s?.name) ?? lmStr(s?.supplier_name);
    if (!nm) continue;
    supplierCounts.set(nm, (supplierCounts.get(nm) ?? 0) + (lmNum(s?.shipment_count) ?? 1));
  }
  const supplierShares = shareMap(supplierCounts);
  const topSupplierShare = supplierShares[0]?.share ?? 0;
  const supplierRisk = concentrationBand(topSupplierShare, supplierShares.length);

  const monthKeys = Object.keys(monthly).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  const last12 = monthKeys.slice(-12);
  const trend = last12.map((k) => ({ month: k, shipments: lmNum(monthly[k]?.shipments) ?? 0 }));
  let trendDirection: "accelerating" | "steady" | "cooling" = "steady";
  if (trend.length >= 4) {
    const half = Math.floor(trend.length / 2);
    const early = trend.slice(0, half).reduce((a, p) => a + p.shipments, 0) / Math.max(1, half);
    const late = trend.slice(half).reduce((a, p) => a + p.shipments, 0) / Math.max(1, trend.length - half);
    if (late > early * 1.15) trendDirection = "accelerating";
    else if (late < early * 0.85) trendDirection = "cooling";
  }

  const shipments12m = lmNum(ps.shipments_last_12m) ?? lmNum(ps.total_shipments) ?? 0;
  const declaredOrigin = declared.origin_country;
  const originObserved = declaredOrigin
    ? originShares.some((o) => o.name.toLowerCase().includes(declaredOrigin.toLowerCase()))
    : null;

  return {
    visible: {
      company_key: companyKey,
      company_name: lmStr(ps.company_name) ?? prettify(companyKey),
      country: lmStr(ps.country),
      shipments_last_12m: shipments12m,
      primary_sourcing_countries: primarySourcing,
      import_concentration: {
        top_country: originShares[0]?.name ?? null,
        top_country_share: topCountryShare,
        distinct_countries: originShares.length,
        level: countryRisk,
        label: "estimated concentration indicator",
      },
      port_concentration: {
        top_port: portShares[0]?.name ?? null,
        top_port_share: topPortShare,
        distinct_ports: portShares.length,
        level: portRisk,
        label: "estimated concentration indicator",
      },
      trend_12mo: { direction: trendDirection, points: trend },
      commodity_exposure: {
        commodity: declared.commodity,
        hs_code: declared.hs_code,
        origin_country: declaredOrigin,
        origin_matches_observed: originObserved,
        note: declared.commodity || declared.hs_code
          ? "Declared commodity/HS is shown as context you provided. This tool does not classify goods or determine duty treatment."
          : "No commodity/HS declared — add one to frame the profile. This tool does not classify goods or determine duty treatment.",
      },
      tariff_regulatory_indicator: {
        level: countryRisk,
        basis: "sourcing-country concentration",
        note: "Indicator only, based on where this importer sources — not tariff, duty, or legal advice. Verify any trade-policy impact with a licensed customs broker or trade attorney.",
      },
    },
    locked: {
      supply_chain_concentration: {
        top_supplier_share: topSupplierShare,
        distinct_suppliers: supplierShares.length,
        level: supplierRisk,
        label: "estimated concentration indicator",
      },
      shipment_records_count: recentBols.length,
      suppliers_count: supplierShares.length,
      lanes_count: routes.filter((r) => lmStr(r?.route)).length,
      pulse_monitoring: true,
      change_alerts: true,
    },
    disclaimer:
      "All figures are estimates from public, aggregated shipment records and are labeled as indicators. Nothing here is legal, customs, or tariff advice, and no duty or classification determination is made.",
    data_freshness: snapDate ? `cached as of ${snapDate}` : "cached snapshot",
  };
}

export { slugify as lmSlugify, prettify as lmPrettify };
