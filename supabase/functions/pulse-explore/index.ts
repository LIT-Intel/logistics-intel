// pulse-explore — Pulse Explorer merged-query backbone.
//
// Returns: lit_company_directory ∪ lit_companies, deduped on
//   (canonicalized name, country, state), with freshness chips, opportunity
//   scores, and the read-time Defend & Grow signal derived from
//   lit_saved_companies (the project's canonical "my saved accounts" table).
//
// Auth: Bearer <user JWT>. Service role is used for elevated reads only.
//
// Plan reference: docs/superpowers/plans/2026-06-16-pulse-explorer.md Task 10.
//
// Deviations from the original plan task (documented):
// - lit_companies has no canonical_name/canonical_domain/country/employee_count
//   columns. We canonicalize at JOIN time via lit_canonicalize_name() and
//   lit_canonicalize_country() (added in 20260616172615_pulse_explorer_geo_canonical).
// - The plan referenced lit_pulse_list_companies for Defend & Grow. The project's
//   canonical "saved by user" table is lit_saved_companies (see CLAUDE.md).
// - Viewport bbox filter is a no-op v1 (no lat/lng on directory rows). Client-side
//   coord lookup + culling handles map rendering. v1.5 will add geocoding.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { canonicalizeName } from "../_shared/canonical_name.ts";
import { expandRegion } from "../_shared/region_presets.ts";
import {
  consolidationScore,
  vulnerableScore,
  velocityScore,
  compositeScore,
} from "../_shared/opportunity_scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Capped at 5k for the v1 UI — the map can't usefully render more
// than that, and dropping from 100k → 5k cuts cold-search latency
// from 30s+ down to ~5s (5 pages × 2 sources, sequential .range()).
// When the underlying dataset has more rows than the cap, we still
// return the top 5000 by opportunity_composite_score.
const MAX_ROWS = 5_000;
const PAGE_SIZE = 1000;

type Geo = {
  region?: string;
  // Multiple regions are supported via `regions: string[]`. The
  // singular `region` field is kept as a legacy back-compat path —
  // expandStates() unions them. Use regions[] going forward.
  regions?: string[];
  states?: string[];
  metros?: string[];
  countries?: string[];
  // Added 2026-06-18 — see docs/superpowers/specs/2026-06-18-pulse-
  // search-dimensions-design.md. cities is filterable on both tables
  // (lit_company_directory.city + lit_companies.city). The other
  // new geo fields are accepted at the API boundary but NOT filtered
  // server-side until schema migrations land:
  //   - zips        → need lit_company_directory.zip column
  //   - counties    → need lit_company_directory.county column
  //   - ports_loading / ports_discharge → need BOL aggregate join
  cities?: string[];
  zips?: string[];
  counties?: string[];
  ports_loading?: string[];
  ports_discharge?: string[];
};

type Filters = {
  // Free-text company-name substring. Matched ILIKE against
  // lit_company_directory.company_name and lit_companies.name. Useful
  // when the user types a specific brand into the search bar.
  name?: string;
  industry?: string[];
  geo?: Geo;
  size?: {
    teu_min?: number;
    teu_max?: number;
    shipments_min?: number;
    shipments_max?: number;
    spend_min?: number;
    spend_max?: number;
  };
  // Commercial signals (revenue / employees / public-listing). Added
  // 2026-06-18 with the 108-dimension parser. revenue + employees are
  // backed by real columns; public_only is accepted but not yet
  // filtered server-side (would need a lit_companies.is_public column).
  commercial?: {
    revenue_min?: number;
    revenue_max?: number;
    employees_min?: number;
    employees_max?: number;
    public_only?: boolean;
  };
  opportunity_types?: ("consolidation" | "vulnerable" | "velocity" | "defend")[];
  // Numeric opportunity-score threshold. Maps to
  // lit_company_directory.opportunity_composite_score.
  opportunity_score_min?: number | null;
  opportunity_score_max?: number | null;
  freshness_state?: ("live" | "saved" | "directory" | "stale")[];
  workflow_state?: string[];
  dataset_filter?: "directory_only" | "live_only" | "all";
  // The following dimensions are accepted at the API boundary so the
  // parser can populate them without crashing the type checker, but
  // are NOT filtered server-side until the underlying data is wired
  // up. Tracked in the spec doc above.
  trade_lane?: { origin?: string | null; destination?: string | null };
  mode?: string[];
  container?: Record<string, unknown>;
  commodity?: { hs_codes?: string[]; names?: string[] };
  time?: Record<string, unknown>;
  carriers?: { ocean?: string[]; forwarder?: string[]; customs_broker?: string[]; nvocc?: string[] };
  counterparties?: { suppliers?: string[] };
  persona?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  crm?: Record<string, unknown>;
  similarity?: { like_company?: string | null };
};

type Body = {
  filters?: Filters;
  // viewport reserved for v1.5 — accepted in payload but ignored server-side.
  viewport?: unknown;
};

type Row = Record<string, unknown> & {
  id: string;
  company_name: string;
  canonical_name: string;
  domain: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  vertical: string | null;
  data_sources: ("directory" | "live" | "index")[];
  opportunity_consolidation_score: number;
  opportunity_vulnerable_score: number;
  opportunity_velocity_score: number;
  opportunity_defend_score: number;
  opportunity_composite_score: number;
  freshness: { chip: "live" | "saved" | "directory"; age_hours: number | null; last_refreshed_at: string | null };
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter SQL builders
// ─────────────────────────────────────────────────────────────────────────────

function expandStates(geo: Geo | undefined): string[] {
  if (!geo) return [];
  const regionKeys = (geo.regions && geo.regions.length > 0)
    ? geo.regions
    : (geo.region ? [geo.region] : []);
  const fromRegions = regionKeys.flatMap((k) => expandRegion(k));
  const fromExplicit = geo.states ?? [];
  return Array.from(new Set([...fromRegions, ...fromExplicit].map((s) => s.toUpperCase())));
}

function applyDirectoryFilters(q: any, f: Filters) {
  const states = expandStates(f.geo);
  if (f.name?.trim()) q = q.ilike("company_name", `%${f.name.trim()}%`);
  if (f.industry?.length) q = q.in("industry", f.industry);
  if (states.length) q = q.in("state", statesToFullNames(states));
  if (f.geo?.countries?.length) q = q.in("country", f.geo.countries);
  // City filter — case-insensitive across "Houston" / "houston" / "HOUSTON"
  // so the parser can pass user-typed casing through unchanged.
  if (f.geo?.cities?.length) {
    const orClause = f.geo.cities
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => `city.ilike.${c}`)
      .join(",");
    if (orClause) q = q.or(orClause);
  }
  if (f.size?.teu_min != null) q = q.gte("teu", f.size.teu_min);
  if (f.size?.teu_max != null) q = q.lte("teu", f.size.teu_max);
  if (f.size?.shipments_min != null) q = q.gte("shipments", f.size.shipments_min);
  if (f.size?.shipments_max != null) q = q.lte("shipments", f.size.shipments_max);
  if (f.size?.spend_min != null) q = q.gte("value_usd", f.size.spend_min);
  if (f.size?.spend_max != null) q = q.lte("value_usd", f.size.spend_max);
  // Commercial filters added 2026-06-18 — directory has revenue + employee_count.
  if (f.commercial?.revenue_min != null) q = q.gte("revenue", f.commercial.revenue_min);
  if (f.commercial?.revenue_max != null) q = q.lte("revenue", f.commercial.revenue_max);
  if (f.commercial?.employees_min != null) q = q.gte("employee_count", f.commercial.employees_min);
  if (f.commercial?.employees_max != null) q = q.lte("employee_count", f.commercial.employees_max);
  // Opportunity-score range — only meaningful on the directory because
  // lit_companies doesn't compute the composite score.
  if (f.opportunity_score_min != null) q = q.gte("opportunity_composite_score", f.opportunity_score_min);
  if (f.opportunity_score_max != null) q = q.lte("opportunity_composite_score", f.opportunity_score_max);
  return q;
}

function buildDirectoryQueryBase(admin: any, f: Filters) {
  const q = admin
    .from("lit_company_directory")
    .select(
      "id, company_name, canonical_name, canonical_domain, city, state, country, " +
        "latitude, longitude, " +
        "industry, vertical, employee_count, revenue, teu, shipments, lcl, value_usd, " +
        "top_dimensions, top_forwarders, gp_potential, " +
        "consignee_email_1, consignee_phone_1, " +
        "opportunity_consolidation_score, opportunity_vulnerable_score, " +
        "opportunity_velocity_score, opportunity_composite_score, " +
        "last_opportunity_recompute_at",
    );
  return applyDirectoryFilters(q, f);
}

// True universe count for the same directory filters. head:true returns ONLY
// the count (no row data), so it's cheap and does NOT add to the MAX_ROWS fetch
// time — it lets the UI show the real match total even though we only LOAD the
// top MAX_ROWS for the map/table.
async function countDirectory(admin: any, f: Filters): Promise<number | null> {
  const q = applyDirectoryFilters(
    admin.from("lit_company_directory").select("id", { count: "exact", head: true }),
    f,
  );
  const { count, error } = await q;
  if (error) return null;
  return typeof count === "number" ? count : null;
}

async function fetchDirectory(admin: any, f: Filters): Promise<Row[]> {
  // Paginate via .range() because Supabase's PostgREST gateway caps single
  // .limit() responses at the project default (typically 1000 rows). To
  // return up to MAX_ROWS we walk PAGE_SIZE chunks until the chunk comes
  // back short.
  const out: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const q = buildDirectoryQueryBase(admin, f).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) {
      console.error("[pulse-explore] directory page failed", { from, error });
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data) out.push(normalizeDirectoryRow(r as any));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

// Directory rows store full state names ('California'); convert state codes
// from filter chips back to full names so the IN-list match works without
// rewriting every existing directory row.
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

// Normalize a single state value (code OR full name OR null) to the
// directory's full-name form. Two-letter codes map via STATE_CODE_TO_NAME;
// anything else (already-full names like 'California', non-US regions like
// 'British Columbia', or null) passes through unchanged. Used to align
// lit_companies (codes/null) with lit_company_directory (full names) before
// dedup so the same real company doesn't split into two rows.
function normalizeStateToFullName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length === 2) return STATE_CODE_TO_NAME[s.toUpperCase()] ?? s;
  return s;
}

function normalizeDirectoryRow(r: any): Row {
  return {
    id: r.id,
    company_name: r.company_name ?? "",
    canonical_name: r.canonical_name ?? canonicalizeName(r.company_name ?? ""),
    domain: r.canonical_domain ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    country: r.country ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    industry: r.industry ?? null,
    vertical: r.vertical ?? null,
    employee_count: r.employee_count ?? null,
    revenue: r.revenue ?? null,
    teu: r.teu ?? null,
    shipments: r.shipments ?? null,
    lcl: r.lcl ?? null,
    value_usd: r.value_usd ?? null,
    top_dimensions: r.top_dimensions ?? null,
    top_forwarders: r.top_forwarders ?? null,
    gp_potential: r.gp_potential ?? null,
    // DCS seed contact data — surfaces in the QuickCard. Live-only
    // rows don't have these (lit_companies has no consignee_*),
    // so the mergeAndDedup pass preserves whatever the directory
    // brought in.
    consignee_email_1: r.consignee_email_1 ?? null,
    consignee_phone_1: r.consignee_phone_1 ?? null,
    opportunity_consolidation_score: Number(r.opportunity_consolidation_score ?? 0),
    opportunity_vulnerable_score: Number(r.opportunity_vulnerable_score ?? 0),
    opportunity_velocity_score: Number(r.opportunity_velocity_score ?? 0),
    opportunity_defend_score: 0,
    opportunity_composite_score: Number(r.opportunity_composite_score ?? 0),
    data_sources: ["directory"],
    last_refreshed_at: null,
    freshness: { chip: "directory", age_hours: null, last_refreshed_at: null },
  };
}

async function fetchLive(
  admin: any,
  f: Filters,
): Promise<Row[]> {
  const states = expandStates(f.geo);
  // Pull the live KPIs from lit_companies (shipments_12m / teu_12m /
  // est_spend_12m / fcl + lcl / top_route_12m) so saved companies
  // contribute REAL values to the Explorer KPI strip + account table,
  // not nulls. Paginated for parity with the directory query.
  const select = "id, name, domain, website, city, state, country_code, " +
    "industry, revenue, source_company_key, updated_at, " +
    "shipments_12m, teu_12m, fcl_shipments_12m, lcl_shipments_12m, " +
    "est_spend_12m, top_route_12m, recent_route, " +
    "most_recent_shipment_date";
  const out: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let q = admin.from("lit_companies").select(select);
    if (f.name?.trim()) q = q.ilike("name", `%${f.name.trim()}%`);
    if (f.industry?.length) q = q.in("industry", f.industry);
    if (states.length) q = q.in("state", states);
    // City + revenue filters added 2026-06-18 — lit_companies has both;
    // it does NOT have employee_count, so that filter applies to
    // directory rows only.
    if (f.geo?.cities?.length) {
      const orClause = f.geo.cities
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => `city.ilike.${c}`)
        .join(",");
      if (orClause) q = q.or(orClause);
    }
    if (f.commercial?.revenue_min != null) q = q.gte("revenue", f.commercial.revenue_min);
    if (f.commercial?.revenue_max != null) q = q.lte("revenue", f.commercial.revenue_max);
    q = q.range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) { console.error("[pulse-explore] live page failed", { from, error }); break; }
    if (!data || data.length === 0) break;
    for (const r of data) out.push(normalizeLiveRow(r as any));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

function normalizeLiveRow(r: any): Row {
  const canonical = canonicalizeName(r.name ?? "");
  const country = r.country_code === "US" ? "United States"
    : r.country_code === "CA" ? "Canada"
    : r.country_code ?? null;
  // Normalize state to the directory's full-name form ('TX' → 'Texas') BEFORE
  // dedup so a live row and a directory row for the same real company collapse
  // instead of rendering twice. lit_companies stores codes (or null); the
  // directory stores full names. Pass through anything we don't recognize
  // (already a full name, a non-US region, etc.).
  const state = normalizeStateToFullName(r.state);
  return {
    id: r.id,
    company_name: r.name ?? "",
    canonical_name: canonical,
    domain: r.domain ?? null,
    city: r.city ?? null,
    state,
    country,
    industry: r.industry ?? null,
    vertical: null,
    employee_count: null,
    revenue: r.revenue ?? null,
    // Real KPIs from lit_companies — populated by the IY refresh path.
    teu: r.teu_12m ?? null,
    shipments: r.shipments_12m ?? null,
    lcl: r.lcl_shipments_12m ?? null,
    value_usd: r.est_spend_12m ?? null,
    top_dimensions: r.top_route_12m
      ? [{ lane: r.top_route_12m, teu: null, percent: null }]
      : null,
    gp_potential: null,
    opportunity_consolidation_score: 0,
    opportunity_vulnerable_score: 0,
    opportunity_velocity_score: 0,
    opportunity_defend_score: 0,
    opportunity_composite_score: 0,
    data_sources: ["live"],
    source_company_key: r.source_company_key ?? null,
    last_refreshed_at: r.updated_at ?? null,
    freshness: { chip: "saved", age_hours: null, last_refreshed_at: r.updated_at ?? null },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Third source: lit_company_index (free IY search cache)
// ─────────────────────────────────────────────────────────────────────────────
//
// lit_company_index caches every ImportYeti Company-Search hit (written
// 25/search by importyeti-proxy, ZERO extra IY credits). Surfacing it here is
// what makes "no company missed": anything a user has ever searched in Company
// Search becomes discoverable in the Explorer.
//
// The table is firmographically SPARSE: it has company_id (slug),
// company_name, country (as an ISO-ish code like 'US'), a free-text `city`
// blob (often a full address), shipment/TEU counts, and FCL/LCL splits. It has
// NO state, industry, vertical, domain, revenue, or opportunity columns. So:
//   * We apply ONLY the filters the columns can satisfy (name + country +
//     shipments/teu size). Filters the table can't satisfy (state, industry,
//     revenue, employees, opportunity score, cities) are SKIPPED for this
//     source rather than dropping the row — the directory/live sources still
//     enforce those, and an index row that survives is a lowest-priority,
//     "basic entry" fallback.
//   * It is inserted LAST in mergeAndDedup, so directory/live always win on
//     every shared field (richer firmographics never get overwritten).

// Map the index's country code to the directory's full-name form so merged
// rows read consistently. Mirrors normalizeLiveRow's country handling.
function indexCountryToName(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (c === "US" || c === "USA") return "United States";
  if (c === "CA" || c === "CAN") return "Canada";
  return String(code).trim() || null;
}

function normalizeIndexRow(r: any): Row {
  const name = r.company_name ?? "";
  return {
    id: `idx:${r.company_id}`,
    company_name: name,
    // Prefer the migration's generated column; derive it if the column isn't
    // present yet (pre-migration) so the function never depends on the DDL.
    canonical_name: r.canonical_name ?? canonicalizeName(name),
    domain: null,
    // The index `city` is a free-text address blob; keep it as-is for display
    // but it is NOT used for the city filter (which only the structured
    // directory/live columns can satisfy reliably).
    city: r.city ?? null,
    state: null,
    country: indexCountryToName(r.country),
    latitude: null,
    longitude: null,
    industry: null,
    vertical: null,
    employee_count: null,
    revenue: null,
    teu: r.total_teu != null ? Number(r.total_teu) : (r.latest_year_teu != null ? Number(r.latest_year_teu) : null),
    shipments: r.total_shipments != null ? Number(r.total_shipments) : null,
    lcl: r.lcl_shipments != null ? Number(r.lcl_shipments) : null,
    value_usd: null,
    top_dimensions: null,
    top_forwarders: null,
    gp_potential: null,
    consignee_email_1: null,
    consignee_phone_1: null,
    opportunity_consolidation_score: 0,
    opportunity_vulnerable_score: 0,
    opportunity_velocity_score: 0,
    opportunity_defend_score: 0,
    opportunity_composite_score: 0,
    data_sources: ["index"] as any,
    // source_company_key lets freshness + defend joins work for index rows
    // exactly like live rows (both key off the IY slug).
    source_company_key: r.company_id ?? null,
    last_refreshed_at: r.updated_at ?? null,
    freshness: { chip: "directory", age_hours: null, last_refreshed_at: r.updated_at ?? null },
  } as Row;
}

// True only when EVERY active filter is one lit_company_index can satisfy
// (name, country, city, total_teu, total_shipments). The index has no state /
// region / industry / vertical / revenue / employees / opportunity columns, so
// the presence of any of those filters means index rows can't be confirmed to
// match -> exclude the index entirely rather than leak non-matching companies.
function indexCanSatisfy(f: Filters): boolean {
  if (f.geo?.states?.length) return false;
  if (f.geo?.regions?.length) return false;
  if (f.geo?.region) return false;
  if (f.geo?.metros?.length) return false;
  if (f.industry?.length) return false;
  if (
    f.commercial &&
    (f.commercial.revenue_min != null || f.commercial.revenue_max != null ||
      f.commercial.employees_min != null || f.commercial.employees_max != null)
  ) return false;
  if (f.opportunity_score_min != null || f.opportunity_score_max != null) return false;
  if (f.opportunity_types?.length) return false;
  return true;
}

async function fetchIndex(admin: any, f: Filters): Promise<Row[]> {
  // Caller decides whether to invoke this at all (skipped for
  // dataset_filter === "directory_only"). Here we only build the query.
  const indexColumns =
    "company_id, company_name, country, city, total_shipments, total_teu, " +
    "latest_year_teu, lcl_shipments, updated_at, canonical_name";
  // Country filter: the index stores codes, so translate the requested
  // full-name countries back to the codes the column holds (best-effort).
  const countryCodes = (f.geo?.countries ?? [])
    .map((c) => {
      const v = c.trim().toLowerCase();
      if (v === "united states" || v === "usa" || v === "us") return "US";
      if (v === "canada" || v === "ca") return "CA";
      return c.trim();
    })
    .filter(Boolean);

  const out: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let q = admin.from("lit_company_index").select(indexColumns);
    if (f.name?.trim()) q = q.ilike("company_name", `%${f.name.trim()}%`);
    if (countryCodes.length) q = q.in("country", countryCodes);
    // Size filters the index CAN satisfy (totals, not 12m — close enough for a
    // fallback entry; richer sources override on merge).
    if (f.size?.shipments_min != null) q = q.gte("total_shipments", f.size.shipments_min);
    if (f.size?.shipments_max != null) q = q.lte("total_shipments", f.size.shipments_max);
    if (f.size?.teu_min != null) q = q.gte("total_teu", f.size.teu_min);
    if (f.size?.teu_max != null) q = q.lte("total_teu", f.size.teu_max);
    q = q.range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) {
      // Most likely cause pre-migration: canonical_name column missing. Retry
      // once without it so the Explorer keeps working before the DDL lands.
      if (/canonical_name/i.test(error.message ?? "")) {
        const fallback = await fetchIndexWithoutCanonical(admin, f, countryCodes, from);
        out.push(...fallback);
        break;
      }
      console.error("[pulse-explore] index page failed", { from, error });
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data) out.push(normalizeIndexRow(r as any));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

// Pre-migration safety net: same query minus the generated column.
async function fetchIndexWithoutCanonical(
  admin: any,
  f: Filters,
  countryCodes: string[],
  startFrom: number,
): Promise<Row[]> {
  const cols =
    "company_id, company_name, country, city, total_shipments, total_teu, " +
    "latest_year_teu, lcl_shipments, updated_at";
  const out: Row[] = [];
  for (let from = startFrom; from < MAX_ROWS; from += PAGE_SIZE) {
    let q = admin.from("lit_company_index").select(cols);
    if (f.name?.trim()) q = q.ilike("company_name", `%${f.name.trim()}%`);
    if (countryCodes.length) q = q.in("country", countryCodes);
    if (f.size?.shipments_min != null) q = q.gte("total_shipments", f.size.shipments_min);
    if (f.size?.shipments_max != null) q = q.lte("total_shipments", f.size.shipments_max);
    if (f.size?.teu_min != null) q = q.gte("total_teu", f.size.teu_min);
    if (f.size?.teu_max != null) q = q.lte("total_teu", f.size.teu_max);
    q = q.range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) { console.error("[pulse-explore] index fallback page failed", { from, error }); break; }
    if (!data || data.length === 0) break;
    for (const r of data) out.push(normalizeIndexRow(r as any));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedup (directory + live → unified)
// ─────────────────────────────────────────────────────────────────────────────

// Dedup key: domain first (the only truly reliable identity field), else
// canonical-name ONLY.
//
// Geo is deliberately NOT part of the key. lit_companies stores state as a
// code or null while lit_company_directory stores the full name, and the same
// real company frequently has a populated state on one source and a null/
// mismatched state on the other. Including state (or country) in the key split
// ~138 real companies into duplicate rows. Canonical-name-only collapses them.
//
// Country/state survive on the merged row (see mergeAndDedup, where the
// non-null value wins) so they remain a *soft* attribute, just not a key.
function dedupKey(r: Row): string {
  if (r.domain) return `d:${r.domain.toLowerCase()}`;
  const cn = r.canonical_name || canonicalizeName(r.company_name);
  const st = normalizeStateToFullName(r.state);
  // Geo-qualify the key WHEN a state is known, so two genuinely DISTINCT
  // companies that share a name but sit in different states stay separate.
  // (Pure name-only over-merged ~1,063 real directory companies.) Rows with a
  // null/blank state — common on lit_companies (live) — use a name-only key and
  // are reconciled into their single matching geo group in mergeAndDedup.
  return st ? `n:${cn}|${st.toLowerCase()}` : `n:${cn}`;
}

// Union the data_sources tags of two rows that collapsed onto one key, in a
// stable order, without duplicates.
function unionSources(a: any[], b: any[]): ("directory" | "live" | "index")[] {
  const set = new Set<string>([...(a ?? []), ...(b ?? [])]);
  return (["directory", "live", "index"] as const).filter((s) => set.has(s));
}

// Merge two rows that collapsed onto one dedup key. `winner` keeps identity
// (its non-null fields take precedence); `filler` only backfills gaps via ??
// coalesce. So directory/live firmographics are NEVER overwritten by a sparse
// index row, and a directory's full-name geo can backfill a live row's null
// state. data_sources is the union of both.
function mergeRows(winner: Row, filler: Row): Row {
  return {
    ...filler,
    ...winner,
    // Coalesce: gap in the winner is filled by the filler rather than nulled.
    domain: winner.domain ?? filler.domain,
    city: winner.city ?? filler.city,
    state: winner.state ?? filler.state,
    country: winner.country ?? filler.country,
    industry: winner.industry ?? filler.industry,
    latitude: (winner as any).latitude ?? (filler as any).latitude,
    longitude: (winner as any).longitude ?? (filler as any).longitude,
    vertical: winner.vertical ?? filler.vertical,
    teu: winner.teu ?? filler.teu,
    shipments: winner.shipments ?? filler.shipments,
    lcl: winner.lcl ?? filler.lcl,
    value_usd: winner.value_usd ?? filler.value_usd,
    top_dimensions: winner.top_dimensions ?? filler.top_dimensions,
    top_forwarders: (winner as any).top_forwarders ?? (filler as any).top_forwarders,
    gp_potential: winner.gp_potential ?? filler.gp_potential,
    employee_count: winner.employee_count ?? filler.employee_count,
    revenue: (winner as any).revenue ?? (filler as any).revenue,
    consignee_email_1: (winner as any).consignee_email_1 ?? (filler as any).consignee_email_1 ?? null,
    consignee_phone_1: (winner as any).consignee_phone_1 ?? (filler as any).consignee_phone_1 ?? null,
    // Keep whichever row carries the IY slug (live or index).
    source_company_key: (winner as any).source_company_key ?? (filler as any).source_company_key ?? null,
    opportunity_consolidation_score:
      winner.opportunity_consolidation_score || filler.opportunity_consolidation_score,
    opportunity_vulnerable_score:
      winner.opportunity_vulnerable_score || filler.opportunity_vulnerable_score,
    opportunity_velocity_score:
      winner.opportunity_velocity_score || filler.opportunity_velocity_score,
    opportunity_composite_score:
      winner.opportunity_composite_score || filler.opportunity_composite_score,
    data_sources: unionSources(winner.data_sources as any, filler.data_sources as any),
  };
}

function mergeAndDedup(directory: Row[], live: Row[], index: Row[] = []): Row[] {
  const out = new Map<string, Row>();
  // Priority for identity (lowest → highest): index < directory < live.
  // Directory's V6/BOL firmographics still backfill live gaps via coalesce.

  // 1. Seed with index cache rows (lowest priority "basic entries").
  for (const r of index) {
    const k = dedupKey(r);
    const existing = out.get(k);
    out.set(k, existing ? mergeRows(existing, r) : r);
  }
  // 2. Live wins over index.
  for (const r of live) {
    const k = dedupKey(r);
    const existing = out.get(k);
    // existing here can only be an index row → live wins identity.
    out.set(k, existing ? mergeRows(r, existing) : r);
  }
  // 3. Directory. If a live row already holds the key, live keeps identity and
  //    directory backfills (live = winner). Otherwise directory is the richest
  //    source present (index-only or new) → directory wins identity.
  for (const dRow of directory) {
    const k = dedupKey(dRow);
    const existing = out.get(k);
    if (!existing) { out.set(k, dRow); continue; }
    const existingIsLive = (existing.data_sources as any[])?.includes("live");
    out.set(k, existingIsLive ? mergeRows(existing, dRow) : mergeRows(dRow, existing));
  }

  // Reconcile null-state rows into a same-name geo group when UNAMBIGUOUS.
  // A live company with a null state keys as `n:cn`; the SAME real company in
  // the directory keys as `n:cn|texas`. If exactly ONE geo-qualified group
  // shares the canonical name, fold them together (live keeps identity). If
  // several do — genuinely distinct same-name companies in different states —
  // leave the null-state row standalone rather than guess which it belongs to.
  const geoKeysByCanon = new Map<string, string[]>();
  for (const k of out.keys()) {
    const m = /^n:(.+)\|[^|]*$/.exec(k);
    if (m) {
      const arr = geoKeysByCanon.get(m[1]) ?? [];
      arr.push(k);
      geoKeysByCanon.set(m[1], arr);
    }
  }
  for (const [k, row] of [...out]) {
    if (!k.startsWith("n:") || k.includes("|")) continue; // name-only keys only
    const cn = k.slice(2);
    const geoKeys = geoKeysByCanon.get(cn);
    if (geoKeys && geoKeys.length === 1) {
      const gk = geoKeys[0];
      const geoRow = out.get(gk)!;
      const nullStateIsLive = (row.data_sources as any[])?.includes("live");
      out.set(gk, nullStateIsLive ? mergeRows(row, geoRow) : mergeRows(geoRow, row));
      out.delete(k);
    }
  }
  return Array.from(out.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// Freshness attachment from lit_importyeti_company_snapshot
// ─────────────────────────────────────────────────────────────────────────────

async function attachFreshness(admin: any, rows: Row[]): Promise<Row[]> {
  if (rows.length === 0) return rows;
  // Snapshot keys are slugs in `company_id`. Match via source_company_key for
  // live rows (when present) and via canonicalize-into-slug for directory rows.
  const slugs = new Set<string>();
  for (const r of rows) {
    const slug = (r as any).source_company_key as string | undefined
      ?? slugify(r.company_name);
    if (slug) slugs.add(slug);
  }
  if (slugs.size === 0) return rows;

  const { data, error } = await admin
    .from("lit_importyeti_company_snapshot")
    .select("company_id, updated_at")
    .in("company_id", Array.from(slugs));
  if (error) {
    console.error("[pulse-explore] freshness join failed", error);
    return rows;
  }
  const freshMap = new Map<string, string>(
    (data ?? []).map((d: any) => [d.company_id, d.updated_at]),
  );

  return rows.map((r) => {
    const slug = (r as any).source_company_key as string | undefined
      ?? slugify(r.company_name);
    const last = slug ? freshMap.get(slug) ?? null : null;
    if (!last) {
      // Live rows without a snapshot still keep their 'saved' chip via
      // updated_at; directory-only rows stay 'directory'.
      return r;
    }
    const ageHours = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60);
    const chip = ageHours < 24 ? "live" : "saved";
    return {
      ...r,
      last_refreshed_at: last,
      freshness: { chip, age_hours: ageHours, last_refreshed_at: last },
    };
  });
}

function slugify(name: string | null | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Defend & Grow score (read-time, derived from lit_saved_companies)
// ─────────────────────────────────────────────────────────────────────────────

async function attachDefendScore(
  admin: any,
  userId: string,
  rows: Row[],
): Promise<Row[]> {
  // Live-side rows have UUID ids that are FKs to lit_companies; the saved table
  // references those UUIDs directly via company_id. For directory-only rows we
  // can't currently link (no FK from directory → companies). v1: defend score
  // = 80 for any row whose id is in the user's saved set OR whose
  // source_company_key matches a saved row's source_company_key.
  const liveIds: string[] = [];
  const slugs: string[] = [];
  for (const r of rows) {
    if (r.data_sources.includes("live")) liveIds.push(r.id);
    const slug = (r as any).source_company_key as string | undefined;
    if (slug) slugs.push(slug);
  }
  if (liveIds.length === 0 && slugs.length === 0) return rows;

  const [savedById, savedBySlug] = await Promise.all([
    liveIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .from("lit_saved_companies")
          .select("company_id")
          .eq("user_id", userId)
          .in("company_id", liveIds),
    slugs.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .from("lit_saved_companies")
          .select("source_company_key")
          .eq("user_id", userId)
          .in("source_company_key", slugs),
  ]);

  const savedIdSet = new Set<string>((savedById.data ?? []).map((d: any) => d.company_id));
  const savedSlugSet = new Set<string>(
    (savedBySlug.data ?? []).map((d: any) => d.source_company_key),
  );

  return rows.map((r) => {
    const slug = (r as any).source_company_key as string | undefined;
    const isSaved = savedIdSet.has(r.id) || (!!slug && savedSlugSet.has(slug));
    const defend = isSaved ? 80 : 0;
    const composite = compositeScore({
      consolidation: r.opportunity_consolidation_score,
      vulnerable: r.opportunity_vulnerable_score,
      velocity: r.opportunity_velocity_score,
      defend,
    });
    return {
      ...r,
      opportunity_defend_score: defend,
      opportunity_composite_score: composite,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-filter: opportunity_types + freshness_state
// ─────────────────────────────────────────────────────────────────────────────

function postFilter(rows: Row[], f: Filters): Row[] {
  let out = rows;
  if (f.opportunity_types?.length) {
    const types = new Set(f.opportunity_types);
    out = out.filter((r) => {
      if (types.has("consolidation") && r.opportunity_consolidation_score >= 40) return true;
      if (types.has("vulnerable") && r.opportunity_vulnerable_score >= 40) return true;
      if (types.has("velocity") && r.opportunity_velocity_score >= 40) return true;
      if (types.has("defend") && r.opportunity_defend_score >= 40) return true;
      return false;
    });
  }
  if (f.freshness_state?.length) {
    const wanted = new Set(f.freshness_state);
    out = out.filter((r) => {
      if (wanted.has("stale")) {
        if (r.freshness.chip !== "live" && r.freshness.age_hours == null) return true;
        if (r.freshness.age_hours != null && r.freshness.age_hours > 24 * 14) return true;
      }
      return wanted.has(r.freshness.chip);
    });
  }
  if (f.dataset_filter === "directory_only") {
    // Curated corpus only: drop anything carrying IY-sourced provenance
    // (live OR index cache).
    out = out.filter((r) =>
      !r.data_sources.includes("live") && !r.data_sources.includes("index"));
  } else if (f.dataset_filter === "live_only") {
    // IY-sourced surfaces: saved/live companies AND the free search cache.
    out = out.filter((r) =>
      r.data_sources.includes("live") || r.data_sources.includes("index"));
  }
  return out;
}

function tally(rows: Row[]) {
  return {
    live: rows.filter((r) => r.freshness.chip === "live").length,
    saved: rows.filter((r) => r.freshness.chip === "saved").length,
    directory: rows.filter((r) => r.freshness.chip === "directory").length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP entry
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: "supabase_env_missing" }, 500);
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let userId: string | null = null;
  try {
    const { data: u } = await admin.auth.getUser(token);
    userId = u?.user?.id ?? null;
  } catch (_e) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  if (!userId) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { /* keep defaults */ }
  const filters: Filters = body.filters ?? {};

  // Per-search usage gate via the existing `pulse_search` feature key
  // (plans.pulse_search_limit: free_trial=5 / starter=0 / growth=100 /
  // scale=500 / enterprise=null). Trial users get 5 Explorer searches
  // so they feel the product; Coach + PDF are locked separately.
  // Platform admins bypass automatically inside check_usage_limit.
  const { data: orgRow } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const orgId = (orgRow as any)?.org_id ?? null;
  const { data: gate, error: gateErr } = await admin.rpc("check_usage_limit", {
    p_org_id: orgId,
    p_user_id: userId,
    p_feature_key: "pulse_search",
    p_quantity: 1,
  });
  if (!gateErr && gate && (gate as any).ok === false) {
    return jsonResponse(gate as Record<string, unknown>, 403);
  }
  await admin.from("lit_usage_ledger").insert({
    org_id: orgId,
    user_id: userId,
    feature_key: "pulse_search",
    action_key: "explore_search",
    quantity: 1,
  });

  const dataset = filters.dataset_filter ?? "all";

  // The index cache (lit_company_index) is IY-search-sourced, so it counts as
  // "live-ish" provenance. Surface it on "all" and "live_only", skip it on
  // "directory_only" (which means curated-corpus-only).
  //
  // CRUCIAL: lit_company_index has only name/country/city/total_teu/
  // total_shipments — NO state, region, industry, vertical, revenue, employees
  // or opportunity scores. So if the search filters on any of those, index rows
  // can't be confirmed to match and would POLLUTE the result (e.g. a non-Texas
  // IY company leaking into "companies in texas"). Include the index ONLY when
  // every active filter is one the index can actually satisfy.
  const includeIndex = dataset !== "directory_only" && indexCanSatisfy(filters);

  const [directoryRows, liveRows, indexRows, directoryTotal] = await Promise.all([
    dataset === "live_only" ? Promise.resolve([] as Row[]) : fetchDirectory(admin, filters),
    dataset === "directory_only" ? Promise.resolve([] as Row[]) : fetchLive(admin, filters),
    includeIndex ? fetchIndex(admin, filters) : Promise.resolve([] as Row[]),
    // True universe count (cheap head-count, runs in parallel). Lets the UI show
    // the real match total even though we only LOAD the top MAX_ROWS.
    dataset === "live_only" ? Promise.resolve(null) : countDirectory(admin, filters),
  ]);

  let rows = mergeAndDedup(directoryRows, liveRows, indexRows);
  rows = await attachFreshness(admin, rows);
  rows = await attachDefendScore(admin, userId, rows);
  rows = postFilter(rows, filters);

  const truncated = rows.length > MAX_ROWS;
  const sorted = truncated
    ? [...rows]
        .sort((a, b) => b.opportunity_composite_score - a.opportunity_composite_score)
        .slice(0, MAX_ROWS)
    : rows;

  return jsonResponse({
    ok: true,
    rows: sorted,
    totals: {
      total: rows.length,
      // The real number of matching accounts in the universe (not capped at
      // MAX_ROWS). Floored at the merged row count so live/index extras can't
      // make it smaller than what we actually returned.
      total_matched: directoryTotal != null
        ? Math.max(directoryTotal, rows.length)
        : rows.length,
      returned: sorted.length,
      directory: directoryRows.length,
      live: liveRows.length,
      index: indexRows.length,
      sources: tally(sorted),
    },
    truncated,
  });
});
