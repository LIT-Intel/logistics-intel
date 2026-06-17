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

const MAX_ROWS = 100_000;
const PAGE_SIZE = 1000;

type Geo = {
  region?: string;
  states?: string[];
  metros?: string[];
  countries?: string[];
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
  opportunity_types?: ("consolidation" | "vulnerable" | "velocity" | "defend")[];
  freshness_state?: ("live" | "saved" | "directory" | "stale")[];
  workflow_state?: string[];
  dataset_filter?: "directory_only" | "live_only" | "all";
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
  data_sources: ("directory" | "live")[];
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
  const fromRegion = geo.region ? expandRegion(geo.region) : [];
  const fromExplicit = geo.states ?? [];
  return Array.from(new Set([...fromRegion, ...fromExplicit].map((s) => s.toUpperCase())));
}

function buildDirectoryQueryBase(admin: any, f: Filters) {
  const states = expandStates(f.geo);
  let q = admin
    .from("lit_company_directory")
    .select(
      "id, company_name, canonical_name, canonical_domain, city, state, country, " +
        "latitude, longitude, " +
        "industry, vertical, employee_count, revenue, teu, shipments, lcl, value_usd, " +
        "top_dimensions, top_forwarders, gp_potential, " +
        "opportunity_consolidation_score, opportunity_vulnerable_score, " +
        "opportunity_velocity_score, opportunity_composite_score, " +
        "last_opportunity_recompute_at",
    );
  if (f.name?.trim()) q = q.ilike("company_name", `%${f.name.trim()}%`);
  if (f.industry?.length) q = q.in("industry", f.industry);
  if (states.length) q = q.in("state", statesToFullNames(states));
  if (f.geo?.countries?.length) q = q.in("country", f.geo.countries);
  if (f.size?.teu_min != null) q = q.gte("teu", f.size.teu_min);
  if (f.size?.teu_max != null) q = q.lte("teu", f.size.teu_max);
  if (f.size?.shipments_min != null) q = q.gte("shipments", f.size.shipments_min);
  if (f.size?.shipments_max != null) q = q.lte("shipments", f.size.shipments_max);
  if (f.size?.spend_min != null) q = q.gte("value_usd", f.size.spend_min);
  if (f.size?.spend_max != null) q = q.lte("value_usd", f.size.spend_max);
  return q;
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
  return {
    id: r.id,
    company_name: r.name ?? "",
    canonical_name: canonical,
    domain: r.domain ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
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
// Dedup (directory + live → unified)
// ─────────────────────────────────────────────────────────────────────────────

function dedupKey(r: Row): string {
  if (r.domain) return `d:${r.domain.toLowerCase()}`;
  const cn = r.canonical_name || canonicalizeName(r.company_name);
  return `n:${cn}|${(r.country ?? "").toLowerCase()}|${(r.state ?? "").toLowerCase()}`;
}

function mergeAndDedup(directory: Row[], live: Row[]): Row[] {
  const out = new Map<string, Row>();
  // Insert live first so directory merges INTO live rows (live wins on shared fields).
  for (const r of live) out.set(dedupKey(r), r);
  for (const dRow of directory) {
    const k = dedupKey(dRow);
    const existing = out.get(k);
    if (!existing) {
      out.set(k, dRow);
      continue;
    }
    // Merge: live row wins on shared identity fields; directory fills the
    // V6/BOL-derived fields that lit_companies doesn't store.
    out.set(k, {
      ...existing,
      vertical: existing.vertical ?? dRow.vertical,
      teu: existing.teu ?? dRow.teu,
      shipments: existing.shipments ?? dRow.shipments,
      lcl: existing.lcl ?? dRow.lcl,
      value_usd: existing.value_usd ?? dRow.value_usd,
      top_dimensions: existing.top_dimensions ?? dRow.top_dimensions,
      gp_potential: existing.gp_potential ?? dRow.gp_potential,
      employee_count: existing.employee_count ?? dRow.employee_count,
      opportunity_consolidation_score:
        existing.opportunity_consolidation_score || dRow.opportunity_consolidation_score,
      opportunity_vulnerable_score:
        existing.opportunity_vulnerable_score || dRow.opportunity_vulnerable_score,
      opportunity_velocity_score:
        existing.opportunity_velocity_score || dRow.opportunity_velocity_score,
      opportunity_composite_score:
        existing.opportunity_composite_score || dRow.opportunity_composite_score,
      data_sources: ["directory", "live"],
    });
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
    out = out.filter((r) => !r.data_sources.includes("live"));
  } else if (f.dataset_filter === "live_only") {
    out = out.filter((r) => r.data_sources.includes("live"));
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

  const dataset = filters.dataset_filter ?? "all";

  const [directoryRows, liveRows] = await Promise.all([
    dataset === "live_only" ? Promise.resolve([] as Row[]) : fetchDirectory(admin, filters),
    dataset === "directory_only" ? Promise.resolve([] as Row[]) : fetchLive(admin, filters),
  ]);

  let rows = mergeAndDedup(directoryRows, liveRows);
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
      returned: sorted.length,
      directory: directoryRows.length,
      live: liveRows.length,
      sources: tally(sorted),
    },
    truncated,
  });
});
