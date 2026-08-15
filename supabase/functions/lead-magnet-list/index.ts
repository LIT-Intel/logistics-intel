// lead-magnet-list
// ---------------------------------------------------------------------------
// PUBLIC edge function (verify_jwt=false — see .verify-jwt-manifest.json) that
// powers TWO list lead magnets sharing ONE engine (Plan §21):
//   * Top 25 Shippers            → marketing /top-shippers
//   * Free Freight Prospect List → marketing /free-freight-prospects
//
// Both magnets return the SAME shape (5 visible ranked companies + 20 locked
// teasers); only the marketing copy differs. This is the anonymous, zero-
// provider-cost sibling of the app's Pulse Explorer.
//
// ENGINE REUSE (Plan §21 — "do NOT build a new data engine"):
//   This function REPLICATES the read-only cached-directory query from
//   supabase/functions/pulse-explore/index.ts against lit_company_directory
//   (~78K cached rows). pulse-explore itself requires a user JWT and is coupled
//   to user-scoped features (Defend & Grow, lit_saved_companies), so it can't be
//   called as-is from an anonymous magnet. Instead we reuse:
//     - the SAME cached table (lit_company_directory) → identical corpus,
//     - the SAME shared modules: _shared/region_presets.ts (expandRegion) and
//       _shared/opportunity_scoring.ts (compositeScore) for ranking,
//     - the SAME filter semantics (name/industry/geo/size) and the SAME
//       state-code→full-name mapping pulse-explore uses.
//   No live/index sources, no defend join, no auth — a lean read of the top
//   matches ranked by opportunity_composite_score.
//
// ZERO PROVIDER CREDITS — ASSERTION:
//   This function ONLY reads the already-cached lit_company_directory table.
//   There is no path here through any provider fetch (ImportYeti / Apollo /
//   Lusha). An anonymous visitor can never trigger a live fetch or spend a
//   credit. If no rows match we return an honest "no_results" state — we do NOT
//   fabricate companies (§97).
//
// Only PUBLIC / aggregated intel is ever returned (§67): company name,
// industry, estimated shipment volume, modeled TEU, a qualitative growth trend,
// top lane, opportunity score. Contacts, emails, phones, raw BOL detail and the
// LOCKED companies' identities are NEVER returned pre-signup — locked rows carry
// only a blurred teaser (masked name + rank), no real data.
//
// Body: {
//   magnet_slug: "top-shippers" | "free-freight-prospects",
//   filters: { industry?, origin_country?/region?, destination_region?/port?,
//              mode?, volume_range? },   // none required (§14/§21)
//   anonymous_id, email?, first_name?, landing_page?, referrer?, utm?
// }
//
// Typed states (never a raw 500 for an expected condition, §62):
//   { state: "list" | "no_results" | "rate_limited" | "error", ... }
//
// Phase-1 primitives reused (already live):
//   - RPC check_anon_rate_limit(p_scope,p_key,p_magnet,p_limit,p_window_secs)
//   - tables lit_lead_magnet_sessions / lit_lead_magnet_events
//   - stitch_lead_magnet_session() reads metadata.saved_query post-signup (§15)
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";
import { expandRegion } from "../_shared/region_presets.ts";
import { compositeScore } from "../_shared/opportunity_scoring.ts";

const log = createLogger("lead-magnet-list");

const VALID_SLUGS = new Set(["top-shippers", "free-freight-prospects"]);

// Total context (visible + locked) — Plan §14 caps at 25.
const VISIBLE_COUNT = 5;
const LOCKED_COUNT = 20;
const TOTAL_COUNT = VISIBLE_COUNT + LOCKED_COUNT;

// Rate limits (§62/§65) — mirror lead-magnet-report.
const SESSION_LIMIT = 25; // calls per anon session per 24h
const SESSION_WINDOW = 86_400;
const EMAIL_LIMIT = 3; // email submits per email per 24h
const EMAIL_WINDOW = 86_400;

// Cap the directory read. We only need the top TOTAL_COUNT after ranking, but
// pull a wider window so ranking is meaningful even with sparse filters.
const READ_CAP = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function strArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x)).filter((x): x is string => Boolean(x));
  const s = str(v);
  return s ? [s] : [];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// State-code → full-name map (mirrors pulse-explore — the directory stores full
// state names). Used only when a caller passes explicit US states.
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

// ---------------------------------------------------------------------------
// filter mapping — magnet payload → directory query filters
// ---------------------------------------------------------------------------
//
// The magnet exposes a simplified filter surface (§14). We map each field onto
// the SAME lit_company_directory columns pulse-explore filters, and preserve
// the raw payload so it can be stored as metadata.saved_query (§15) and later
// rehydrated into the Explorer's `explore` URL state post-signup.

type MagnetFilters = {
  industry: string[];
  // origin_country and region both feed geo. region → US states via
  // expandRegion (shared with pulse-explore); explicit states supported too.
  regions: string[];
  states: string[];
  countries: string[];
  // volume_range → shipments floor. Buckets picked to be honest & coarse.
  shipments_min: number | null;
  // destination_region/port + mode are accepted at the boundary and PRESERVED
  // in saved_query, but are NOT filterable on lit_company_directory (no
  // destination/port/mode columns) — same limitation pulse-explore documents.
  destination_hint: string[];
  mode: string[];
};

const VOLUME_FLOORS: Record<string, number> = {
  low: 0,
  small: 0,
  medium: 25,
  mid: 25,
  high: 100,
  large: 100,
  enterprise: 500,
};

function volumeFloor(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const key = s.toLowerCase().trim();
  if (key in VOLUME_FLOORS) return VOLUME_FLOORS[key];
  // Accept a raw numeric floor too ("50", "100+").
  const n = Number(key.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseFilters(raw: unknown): MagnetFilters {
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

// Expand region keys + explicit states to the directory's full-name form
// (mirrors pulse-explore's expandStates → statesToFullNames pipeline).
function expandedStateNames(f: MagnetFilters): string[] {
  const fromRegions = f.regions.flatMap((k) => expandRegion(k));
  const all = Array.from(new Set([...fromRegions, ...f.states].map((s) => s.toUpperCase())));
  return statesToFullNames(all);
}

// ---------------------------------------------------------------------------
// directory read — cached table only, 0 provider cost.
// Applies the same filter semantics as pulse-explore's applyDirectoryFilters.
// ---------------------------------------------------------------------------

type DirRow = {
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

async function fetchDirectory(admin: SupabaseClient, f: MagnetFilters): Promise<DirRow[]> {
  let q = admin
    .from("lit_company_directory")
    .select(
      "id, company_name, industry, vertical, state, country, city, teu, shipments, value_usd, " +
        "top_dimensions, opportunity_consolidation_score, opportunity_vulnerable_score, " +
        "opportunity_velocity_score, opportunity_composite_score",
    )
    // Rank at the DB so READ_CAP captures the strongest matches (the magnet only
    // shows the top 25 anyway). Same ordering key pulse-explore sorts on.
    .order("opportunity_composite_score", { ascending: false, nullsFirst: false })
    .limit(READ_CAP);

  if (f.industry.length) q = q.in("industry", f.industry);
  const stateNames = expandedStateNames(f);
  if (stateNames.length) q = q.in("state", stateNames);
  if (f.countries.length) q = q.in("country", f.countries);
  if (f.shipments_min != null && f.shipments_min > 0) q = q.gte("shipments", f.shipments_min);

  const { data, error } = await q;
  if (error) {
    log.error("directory_read_failed", { err: error.message });
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String((r as any).id),
    company_name: str((r as any).company_name) ?? "",
    industry: str((r as any).industry),
    vertical: str((r as any).vertical),
    state: str((r as any).state),
    country: str((r as any).country),
    city: str((r as any).city),
    teu: numOrNull((r as any).teu),
    shipments: numOrNull((r as any).shipments),
    value_usd: numOrNull((r as any).value_usd),
    top_dimensions: (r as any).top_dimensions ?? null,
    opportunity_consolidation_score: Number((r as any).opportunity_consolidation_score ?? 0),
    opportunity_vulnerable_score: Number((r as any).opportunity_vulnerable_score ?? 0),
    opportunity_velocity_score: Number((r as any).opportunity_velocity_score ?? 0),
    opportunity_composite_score: Number((r as any).opportunity_composite_score ?? 0),
  }));
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// row → public shape.  VISIBLE = aggregated/estimated public intel only.
// ---------------------------------------------------------------------------

// Pull the lead lane label out of top_dimensions ([{ lane, teu, percent }, ...]).
function topLane(dims: unknown): string | null {
  if (!Array.isArray(dims) || dims.length === 0) return null;
  const first = dims[0] as Record<string, unknown>;
  return str(first?.lane) ?? str(first?.route) ?? null;
}

// Honest, DERIVED growth trend — NOT fabricated. velocity score already encodes
// recency + volume percentile (see _shared/opportunity_scoring.ts). Bucket it
// into a coarse, clearly-qualitative label.
function growthTrend(velocity: number): "accelerating" | "steady" | "cooling" {
  if (velocity >= 55) return "accelerating";
  if (velocity >= 25) return "steady";
  return "cooling";
}

// Compute (or trust) the composite score using the SAME shared scorer
// pulse-explore uses, so ranking is consistent across surfaces.
function composite(r: DirRow): number {
  if (r.opportunity_composite_score > 0) return r.opportunity_composite_score;
  return compositeScore({
    consolidation: r.opportunity_consolidation_score,
    vulnerable: r.opportunity_vulnerable_score,
    velocity: r.opportunity_velocity_score,
    defend: 0, // no user context in the anonymous magnet
  });
}

function toVisible(r: DirRow, rank: number) {
  return {
    rank,
    company_name: r.company_name,
    industry: r.industry ?? r.vertical ?? null,
    region: [r.city, r.state, r.country].filter(Boolean).join(", ") || null,
    // clearly-labeled estimates (§10/§97)
    shipments_12m: r.shipments != null ? Math.round(r.shipments) : null,
    shipments_12m_label: "estimated · trailing 12 months",
    teu: r.teu != null ? Math.round(r.teu) : null,
    teu_label: "modeled estimate",
    growth_trend: growthTrend(r.opportunity_velocity_score),
    top_lane: topLane(r.top_dimensions),
    opportunity_score: Math.round(composite(r)),
  };
}

// LOCKED rows expose NO real data — only rank + a masked-name teaser so the
// visitor sees there are more, without leaking any company intel (§67).
function toLocked(r: DirRow, rank: number) {
  return {
    rank,
    // blurred teaser: first char + length-appropriate mask, never the real name.
    name_teaser: maskName(r.company_name),
    industry: r.industry ?? r.vertical ?? null, // industry is a coarse public hint, safe
    locked: true as const,
  };
}

function maskName(name: string): string {
  const clean = name.trim();
  if (!clean) return "•••••••";
  const first = clean[0].toUpperCase();
  return `${first}${"•".repeat(Math.max(4, Math.min(10, clean.length - 1)))}`;
}

// ---------------------------------------------------------------------------
// session + events
// ---------------------------------------------------------------------------

async function emitEvent(
  admin: SupabaseClient,
  magnetSlug: string,
  opts: { sessionId: string | null; eventName: string; anonymousId: string; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await admin.from("lit_lead_magnet_events").insert({
      session_id: opts.sessionId,
      magnet_slug: magnetSlug,
      event_name: opts.eventName,
      anonymous_id: opts.anonymousId,
      metadata: opts.metadata ?? {},
    });
  } catch (err) {
    log.warn("event_emit_failed", { event: opts.eventName, err: String(err) });
  }
}

// Get-or-create the session AND persist the generated query (§15) so it can
// become a saved search post-signup. savedQuery is stored under
// metadata.saved_query — stitch_lead_magnet_session claims the row to the user,
// and the app rehydrates saved_query into the Explorer.
async function ensureSession(
  admin: SupabaseClient,
  magnetSlug: string,
  anonymousId: string,
  ctx: {
    landing_page?: string | null;
    referrer?: string | null;
    utm?: Record<string, unknown> | null;
    savedQuery: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const { data: existing } = await admin
      .from("lit_lead_magnet_sessions")
      .select("id, metadata")
      .eq("magnet_slug", magnetSlug)
      .eq("anonymous_id", anonymousId)
      .maybeSingle();

    if (existing?.id) {
      // Refresh the saved_query on each search so the LATEST filter set wins.
      const prevMeta = (existing.metadata && typeof existing.metadata === "object"
        ? existing.metadata
        : {}) as Record<string, unknown>;
      try {
        await admin
          .from("lit_lead_magnet_sessions")
          .update({ metadata: { ...prevMeta, saved_query: ctx.savedQuery }, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } catch (err) {
        log.warn("session_saved_query_update_failed", { err: String(err) });
      }
      return existing.id as string;
    }

    const utm = ctx.utm ?? {};
    const { data: inserted, error } = await admin
      .from("lit_lead_magnet_sessions")
      .insert({
        magnet_slug: magnetSlug,
        anonymous_id: anonymousId,
        landing_page: ctx.landing_page ?? null,
        referrer: ctx.referrer ?? null,
        utm_source: str((utm as any).utm_source) ?? str((utm as any).source),
        utm_medium: str((utm as any).utm_medium) ?? str((utm as any).medium),
        utm_campaign: str((utm as any).utm_campaign) ?? str((utm as any).campaign),
        utm_term: str((utm as any).utm_term),
        utm_content: str((utm as any).utm_content),
        metadata: { saved_query: ctx.savedQuery },
      })
      .select("id")
      .single();
    if (error) {
      log.warn("session_insert_failed", { err: error.message });
      return null;
    }
    return (inserted?.id as string) ?? null;
  } catch (err) {
    log.warn("session_ensure_failed", { err: String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ state: "error", message: "Method not allowed." }, 405);
  }

  const rid = requestId();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    log.error("missing_env", { request_id: rid });
    return json({ state: "error", message: "This list is temporarily unavailable. Please try again shortly." }, 200);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const magnetSlug = str(body.magnet_slug) ?? "";
  const anonymousId = str(body.anonymous_id);

  if (!VALID_SLUGS.has(magnetSlug)) {
    return json({ state: "error", message: "Unknown list." }, 200);
  }
  if (!anonymousId) {
    return json({ state: "error", message: "Missing session. Please reload and try again." }, 200);
  }

  // ---- per-session rate limit on EVERY call (§62/§65) ----
  try {
    const { data: within } = await admin.rpc("check_anon_rate_limit", {
      p_scope: "anon_session",
      p_key: anonymousId,
      p_magnet: magnetSlug,
      p_limit: SESSION_LIMIT,
      p_window_secs: SESSION_WINDOW,
    });
    if (within === false) {
      log.info("rate_limited_session", { request_id: rid, magnet: magnetSlug });
      return json({
        state: "rate_limited",
        message: "You've hit today's free lookup limit. Create a free account to keep exploring.",
      });
    }
  } catch (err) {
    // fail-open: a rate-limit RPC hiccup must not break the magnet.
    log.warn("rate_limit_rpc_failed", { request_id: rid, err: String(err) });
  }

  const filters = parseFilters(body.filters);

  // saved_query (§15): the exact filter set the visitor built, stored so it can
  // be rehydrated into the Explorer post-signup. Keep it in the magnet's own
  // vocabulary AND include a pre-mapped explorer_filters block the app can drop
  // straight into useExploreState (filters.industry / filters.geo.*).
  const savedQuery = {
    magnet_slug: magnetSlug,
    raw: (body.filters && typeof body.filters === "object" ? body.filters : {}),
    explorer_filters: {
      ...(filters.industry.length ? { industry: filters.industry } : {}),
      ...(filters.regions.length || filters.states.length || filters.countries.length
        ? {
            geo: {
              ...(filters.regions.length ? { regions: filters.regions } : {}),
              ...(filters.states.length ? { states: filters.states } : {}),
              ...(filters.countries.length ? { countries: filters.countries } : {}),
            },
          }
        : {}),
      ...(filters.shipments_min != null && filters.shipments_min > 0
        ? { size: { shipments_min: filters.shipments_min } }
        : {}),
    },
  };

  const session = await ensureSession(admin, magnetSlug, anonymousId, {
    landing_page: str(body.landing_page),
    referrer: str(body.referrer),
    utm: (body.utm && typeof body.utm === "object" ? (body.utm as Record<string, unknown>) : null),
    savedQuery,
  });

  await emitEvent(admin, magnetSlug, {
    sessionId: session,
    eventName: "lead_magnet_started",
    anonymousId,
    metadata: { filters: savedQuery.raw },
  });

  // ---- optional email capture (§11: value first, email to reveal the list) ----
  const email = str(body.email)?.toLowerCase() ?? null;
  const firstName = str(body.first_name);
  let emailCaptured = false;

  if (email && EMAIL_RE.test(email)) {
    let emailWithin = true;
    try {
      const { data } = await admin.rpc("check_anon_rate_limit", {
        p_scope: "email",
        p_key: email,
        p_magnet: magnetSlug,
        p_limit: EMAIL_LIMIT,
        p_window_secs: EMAIL_WINDOW,
      });
      emailWithin = data !== false;
    } catch (err) {
      log.warn("email_rate_limit_rpc_failed", { request_id: rid, err: String(err) });
    }
    if (!emailWithin) {
      log.info("rate_limited_email", { request_id: rid });
      return json({
        state: "rate_limited",
        message: "Too many submissions for that email today. Create a free account to continue.",
      });
    }

    try {
      if (session) {
        const { data: sess } = await admin
          .from("lit_lead_magnet_sessions")
          .select("email_captured_at, metadata")
          .eq("id", session)
          .maybeSingle();
        const prevMeta = (sess?.metadata && typeof sess.metadata === "object"
          ? sess.metadata
          : {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {
          email,
          metadata: { ...prevMeta, saved_query: savedQuery, ...(firstName ? { first_name: firstName } : {}) },
        };
        if (!sess?.email_captured_at) patch.email_captured_at = new Date().toISOString();
        await admin.from("lit_lead_magnet_sessions").update(patch).eq("id", session);
      }
      emailCaptured = true;
      await emitEvent(admin, magnetSlug, {
        sessionId: session,
        eventName: "lead_captured",
        anonymousId,
        metadata: { email, first_name: firstName },
      });
    } catch (err) {
      log.warn("email_capture_failed", { request_id: rid, err: String(err) });
    }
  }

  // ---- run the cached engine (0 provider credits) ----
  const rows = await fetchDirectory(admin, filters);

  // Rank by the shared composite scorer (DB already pre-sorted, but re-rank so
  // any zero-score rows that needed recomputation land correctly).
  const ranked = [...rows].sort((a, b) => composite(b) - composite(a)).slice(0, TOTAL_COUNT);

  await emitEvent(admin, magnetSlug, {
    sessionId: session,
    eventName: "lead_magnet_submitted",
    anonymousId,
    metadata: { filters: savedQuery.raw, matched: ranked.length },
  });

  if (ranked.length === 0) {
    log.info("no_results", { request_id: rid, magnet: magnetSlug });
    return json({
      state: "no_results",
      email_captured: emailCaptured,
      message: "No companies match those filters yet — try widening them.",
    });
  }

  const visibleRows = ranked.slice(0, VISIBLE_COUNT).map((r, i) => toVisible(r, i + 1));
  const lockedRows = ranked.slice(VISIBLE_COUNT).map((r, i) => toLocked(r, VISIBLE_COUNT + i + 1));

  // Total matched context (capped at 25 for the magnet). The real universe is
  // larger; we surface the honest "showing top 25" framing in the UI.
  await emitEvent(admin, magnetSlug, {
    sessionId: session,
    eventName: "lead_result_viewed",
    anonymousId,
    metadata: { visible: visibleRows.length, email_captured: emailCaptured },
  });
  await emitEvent(admin, magnetSlug, {
    sessionId: session,
    eventName: "lead_result_locked",
    anonymousId,
    metadata: { locked: lockedRows.length },
  });

  log.info("list_served", {
    request_id: rid,
    magnet: magnetSlug,
    visible: visibleRows.length,
    locked: lockedRows.length,
    email_captured: emailCaptured,
  });

  return json({
    state: "list",
    magnet_slug: magnetSlug,
    email_captured: emailCaptured,
    visible: visibleRows,
    locked: lockedRows,
    locked_count: lockedRows.length,
    total_count: visibleRows.length + lockedRows.length,
    // echo the saved_query so the client can build the signup deep-link (§15)
    // without re-deriving the mapping.
    saved_query: savedQuery,
    data_freshness: "cached directory · aggregated public intel",
  });
});
