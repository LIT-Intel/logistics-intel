// lead-magnet-report
// ---------------------------------------------------------------------------
// PUBLIC edge function (verify_jwt=false — see .verify-jwt-manifest.json) that
// powers the FLAGSHIP "Free Shipper Intelligence Report" lead magnet at the
// marketing route /free-shipper-report.
//
// It is the anonymous, zero-provider-cost sibling of the app's Company Profile:
// it reads the SAME cached, grounded shipment snapshot that Pulse AI uses
// (lit_importyeti_company_snapshot.parsed_summary) and returns a deliberately
// LIMITED, public/aggregated view of it.
//
// ZERO PROVIDER CREDITS — ASSERTION:
//   This function NEVER calls ImportYeti (or any provider). It only READS the
//   already-cached snapshot rows. There is no path here through
//   _shared/importyeti_fetch.ts / _shared/provider_ledger.ts, so an anonymous
//   visitor can never trigger a live provider fetch or spend a credit (§63/§98).
//   If a company has no cached snapshot we return an honest "no_data" state —
//   we do NOT fetch it live and we do NOT fabricate (§62/§97).
//
// Only PUBLIC / aggregated shipment intelligence is ever returned (§67):
// company identity, 12-month volume estimates, top origin countries, top US
// destination ports, one lead trade lane, a monthly trend sparkline. Contacts,
// decision-makers, raw BOL detail, Pulse monitoring, alerts and opportunity
// scoring are NEVER returned pre-signup — only teaser COUNTS are exposed.
//
// Body: { action: "search" | "report" | "cta" | "risk" | "capture",
//         q?, company_key?, commodity?, hs_code?, origin_country?,
//         magnet_slug?, anonymous_id, email?, first_name?, estimate?,
//         landing_page?, referrer?, utm? }
//
// Typed states returned (never a raw 500 for an expected condition, §62):
//   { state: "matched" | "no_data" | "report" | "risk" | "rate_limited"
//           | "captured" | "ok" | "error", ... }
//
// This one public fn now backs THREE snapshot/0-cost lead magnets (Plan §16-20):
//   - free-shipper-report      (flagship: search + report)
//   - import-risk-scanner      (action:"risk" — same resolveCompany + snapshot
//                               parsed_summary → concentration/trend INDICATORS,
//                               NO legal conclusions, §19)
//   - freight-revenue-calculator (action:"capture" — pure client-side math; this
//                               fn only records the session + lead_captured event
//                               and emits view/start/submit funnel events, §18)
// Every path is snapshot-read-only (risk) or math-only (calculator) → 0 provider
// credits for anonymous visitors, same guarantee as the flagship.
//
// Phase-1 primitives reused (already live):
//   - RPC check_anon_rate_limit(p_scope,p_key,p_magnet,p_limit,p_window_secs) -> bool
//   - tables lit_lead_magnet_sessions / lit_lead_magnet_events
//   - canonical event_keys in lit_event_taxonomy
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";
import { sendLeadMagnetEmail } from "../_shared/lead_magnet_email.ts";

const log = createLogger("lead-magnet-report");

// Default magnet (flagship). The risk scanner + revenue calculator pass their
// own magnet_slug so sessions/events attribute to the right funnel. Only these
// three are accepted — anything else falls back to the flagship slug.
const DEFAULT_MAGNET_SLUG = "free-shipper-report";
const ALLOWED_MAGNETS = new Set([
  "free-shipper-report",
  "import-risk-scanner",
  "freight-revenue-calculator",
]);

function resolveMagnetSlug(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return ALLOWED_MAGNETS.has(s) ? s : DEFAULT_MAGNET_SLUG;
}

// Rate limits (§62/§65) — generous enough for real exploration, tight enough
// to stop abuse of the anonymous snapshot read.
const SESSION_LIMIT = 25; // calls per anon session per 24h
const SESSION_WINDOW = 86_400;
const EMAIL_LIMIT = 3; // email submits per email per 24h
const EMAIL_WINDOW = 86_400;

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

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize a typed company name into the ImportYeti-style slug used as the
 * snapshot / company_index primary key (mirrors normalizeCompanyKeyToSlug in
 * _shared/importyeti_fetch.ts so a company_key round-trips cleanly).
 */
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

/** Best-effort event emit — never throws, never blocks the response (§62). */
async function emitEvent(
  admin: SupabaseClient,
  opts: {
    sessionId: string | null;
    magnetSlug: string;
    eventName: string;
    anonymousId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("lit_lead_magnet_events").insert({
      session_id: opts.sessionId,
      magnet_slug: opts.magnetSlug,
      event_name: opts.eventName,
      anonymous_id: opts.anonymousId,
      metadata: opts.metadata ?? {},
    });
  } catch (err) {
    log.warn("event_emit_failed", { event: opts.eventName, err: String(err) });
  }
}

/**
 * Best-effort immediate email delivery for a captured lead. Sends the branded
 * magnet email (shared template + Resend + suppression gate) and stamps
 * report_emailed_at on success. A failure NEVER throws to the response path —
 * it records last_email_error / increments attempts so the fulfillment cron
 * retries. No-op if there is no session id.
 */
async function deliverMagnetEmail(
  admin: SupabaseClient,
  session: string | null,
  magnetSlug: string,
  email: string,
  firstName: string | null,
  payload: Record<string, unknown>,
  rid: string,
): Promise<void> {
  if (!session) return;
  try {
    const res = await sendLeadMagnetEmail(admin, { magnetSlug, email, firstName, payload });
    if (res.skipped) {
      // Suppressed/internal — mark as "handled" so the cron doesn't retry forever.
      await admin.from("lit_lead_magnet_sessions")
        .update({ report_emailed_at: new Date().toISOString(), last_email_error: `skipped:${res.reason}` })
        .eq("id", session);
    } else {
      await admin.from("lit_lead_magnet_sessions")
        .update({ report_emailed_at: new Date().toISOString() })
        .eq("id", session);
    }
  } catch (err) {
    log.warn("immediate_email_failed", { request_id: rid, magnet: magnetSlug, err: String(err) });
    try {
      await admin.from("lit_lead_magnet_sessions")
        .update({ last_email_error: String(err).slice(0, 500) })
        .eq("id", session);
    } catch { /* ignore */ }
  }
}

/**
 * Upsert (get-or-create) the lead-magnet session for this anon visitor +
 * magnet. Returns the session id (or null on failure — callers degrade
 * gracefully and still serve the report).
 */
async function ensureSession(
  admin: SupabaseClient,
  magnetSlug: string,
  anonymousId: string,
  ctx: { landing_page?: string | null; referrer?: string | null; utm?: Record<string, unknown> | null },
): Promise<string | null> {
  try {
    const { data: existing } = await admin
      .from("lit_lead_magnet_sessions")
      .select("id")
      .eq("magnet_slug", magnetSlug)
      .eq("anonymous_id", anonymousId)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

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
// company resolution — ONLY companies that already have a cached snapshot.
// Never triggers a live fetch. Searches lit_company_index (whose company_id is
// the snapshot key) then confirms a lit_importyeti_company_snapshot row exists.
// Falls back to lit_company_directory.source_company_key for a wider name pool,
// again gated on snapshot presence.
// ---------------------------------------------------------------------------

type ResolvedCompany = { key: string; name: string; country: string | null };

async function resolveCompany(
  admin: SupabaseClient,
  q: string,
): Promise<ResolvedCompany | null> {
  const raw = q.trim();
  if (!raw) return null;
  const slug = slugify(raw);

  // 1. Exact slug hit on the index (fastest, and index_id == snapshot key).
  {
    const { data } = await admin
      .from("lit_company_index")
      .select("company_id, company_name, country")
      .eq("company_id", slug)
      .maybeSingle();
    if (data?.company_id) {
      const confirmed = await snapshotExists(admin, data.company_id);
      if (confirmed) {
        return {
          key: data.company_id,
          name: str(data.company_name) ?? prettify(data.company_id),
          country: str(data.country),
        };
      }
    }
  }

  // 2. Name search on the index (ilike), best match that HAS a snapshot.
  {
    const like = `%${raw.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const { data } = await admin
      .from("lit_company_index")
      .select("company_id, company_name, country, total_shipments")
      .or(`company_name.ilike.${like},company_id.ilike.${like}`)
      .order("total_shipments", { ascending: false, nullsFirst: false })
      .limit(15);
    for (const row of data ?? []) {
      if (!row?.company_id) continue;
      if (await snapshotExists(admin, row.company_id)) {
        return {
          key: row.company_id,
          name: str(row.company_name) ?? prettify(row.company_id),
          country: str(row.country),
        };
      }
    }
  }

  // 3. Directory fallback (wider name pool) → confirm snapshot on source_company_key.
  {
    const like = `%${raw.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const { data } = await admin
      .from("lit_company_directory")
      .select("company_name, source_company_key, company_key, country")
      .not("source_company_key", "is", null)
      .or(`company_name.ilike.${like},source_company_key.ilike.${like}`)
      .order("shipments", { ascending: false, nullsFirst: false })
      .limit(15);
    for (const row of data ?? []) {
      const candidate =
        slugify(str(row.source_company_key) ?? str(row.company_key) ?? "");
      if (!candidate) continue;
      if (await snapshotExists(admin, candidate)) {
        return {
          key: candidate,
          name: str(row.company_name) ?? prettify(candidate),
          country: str(row.country),
        };
      }
    }
  }

  return null;
}

async function snapshotExists(admin: SupabaseClient, companyKey: string): Promise<boolean> {
  const { data } = await admin
    .from("lit_importyeti_company_snapshot")
    .select("company_id")
    .eq("company_id", companyKey)
    .maybeSingle();
  return Boolean(data?.company_id);
}

function prettify(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// report builder — turns a cached parsed_summary into the LIMITED public view.
// VISIBLE = aggregated / estimated only. LOCKED = counts + teasers, no data.
// ---------------------------------------------------------------------------

/** Pull "Country" out of a route-endpoint label like "Xa Tung Ba, Vietnam". */
function endpointCountry(label: string): string | null {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : (label.trim() || null);
}

/** Pull the US destination port/city out of the right side of a route label. */
function endpointCity(label: string): string | null {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[0] : (label.trim() || null);
}

function buildReport(companyKey: string, ps: Record<string, unknown>, snapDate: string | null) {
  const routes = Array.isArray(ps.top_routes) ? (ps.top_routes as any[]) : [];
  const suppliers = Array.isArray(ps.top_suppliers) ? (ps.top_suppliers as any[]) : [];
  const monthly = (ps.monthly_volumes && typeof ps.monthly_volumes === "object"
    ? ps.monthly_volumes
    : {}) as Record<string, any>;
  const recentBols = Array.isArray(ps.recent_bols) ? (ps.recent_bols as any[]) : [];

  // ---- top origin countries (from the origin side of each route label) ----
  const originCounts = new Map<string, number>();
  for (const r of routes) {
    const label = str(r?.route);
    if (!label) continue;
    const [originLabel] = label.split(/→|->|—/).map((s: string) => s.trim());
    const country = originLabel ? endpointCountry(originLabel) : null;
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (num(r?.shipments) ?? 1));
  }
  // supplement with supplier countries (more reliable origin signal)
  for (const s of suppliers) {
    const country = str(s?.country);
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (num(s?.shipment_count) ?? 1));
  }
  const topOriginCountries = [...originCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  // ---- top US destination ports (destination side of route labels) ----
  const destCounts = new Map<string, number>();
  for (const r of routes) {
    const label = str(r?.route);
    if (!label) continue;
    const parts = label.split(/→|->|—/).map((s: string) => s.trim());
    const destLabel = parts.length > 1 ? parts[parts.length - 1] : null;
    const city = destLabel ? endpointCity(destLabel) : null;
    if (!city) continue;
    destCounts.set(city, (destCounts.get(city) ?? 0) + (num(r?.shipments) ?? 1));
  }
  const topDestPorts = [...destCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  // ---- one lead trade lane ----
  const leadRoute = routes[0] ? str(routes[0]?.route) : null;

  // ---- 12-month sparkline (chronological, last 12 months present) ----
  const monthKeys = Object.keys(monthly)
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort();
  const last12 = monthKeys.slice(-12);
  const trend = last12.map((k) => ({
    month: k,
    shipments: num(monthly[k]?.shipments) ?? 0,
  }));

  const shipments12m = num(ps.shipments_last_12m) ?? num(ps.total_shipments) ?? 0;
  const totalTeu = num(ps.total_teu) ?? 0;

  // ---- LOCKED teasers: counts only, never the underlying rows (§11/§67) ----
  const lanesCount = routes.filter((r) => str(r?.route)).length;
  // contacts are NOT in the public snapshot; estimate a teaser from company scale.
  const contactsEstimate = shipments12m > 0
    ? Math.max(3, Math.min(120, Math.round(Math.sqrt(shipments12m))))
    : 0;
  const bolCount = recentBols.length;
  const suppliersCount = suppliers.length;

  return {
    visible: {
      company_key: companyKey,
      company_name: str(ps.company_name) ?? prettify(companyKey),
      country: str(ps.country),
      // clearly-labeled estimates (§10)
      shipments_last_12m: shipments12m,
      shipments_last_12m_label: "estimated · trailing 12 months",
      total_teu: Math.round(totalTeu),
      total_teu_label: "modeled estimate",
      last_shipment_date: str(ps.last_shipment_date),
      top_origin_countries: topOriginCountries,
      top_destination_ports: topDestPorts,
      lead_trade_lane: leadRoute,
      trend, // [{ month, shipments }] — 12-mo sparkline
    },
    locked: {
      // counts + teasers ONLY — the data itself stays locked until trial.
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

// ---------------------------------------------------------------------------
// RISK builder (MAGNET 5 — Import & Tariff Risk Scanner, Plan §19-20).
//
// Reads the SAME cached parsed_summary as the flagship (0 provider credits) and
// derives CONCENTRATION / TREND INDICATORS only. NON-LEGAL by construction:
//   - No tariff rates, no duty calculations, no HTS interpretation, no "you owe"
//     / "this is exempt" style conclusions. We surface *concentration* and
//     *exposure* signals a freight seller can use as conversation starters and
//     label every one as an indicator/estimate (§19 CRITICAL, §97).
//   - Commodity / HS / origin inputs are echoed back as declared context only;
//     they do NOT drive any legal or duty determination.
//
// Indicators (all from public aggregated intel, §67):
//   primary_sourcing_countries, import_concentration (top-country share %),
//   port_concentration (top-port share %), country_risk_level (Low/Moderate/High
//   from an HHI-style concentration score), trend_12mo (accelerating/steady/
//   cooling + sparkline), commodity_exposure (declared), supply_chain_note.
// ---------------------------------------------------------------------------

/** Herfindahl-style top-share → qualitative concentration band (NON-legal). */
function concentrationBand(topSharePct: number, distinctCount: number): "Low" | "Moderate" | "High" {
  // High if a single source dominates OR very few distinct sources.
  if (topSharePct >= 65 || distinctCount <= 1) return "High";
  if (topSharePct >= 40 || distinctCount <= 3) return "Moderate";
  return "Low";
}

function shareMap(counts: Map<string, number>): { name: string; share: number; count: number }[] {
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, share: Math.round((count / total) * 100), count }));
}

function buildRisk(
  companyKey: string,
  ps: Record<string, unknown>,
  snapDate: string | null,
  declared: { commodity: string | null; hs_code: string | null; origin_country: string | null },
) {
  const routes = Array.isArray(ps.top_routes) ? (ps.top_routes as any[]) : [];
  const suppliers = Array.isArray(ps.top_suppliers) ? (ps.top_suppliers as any[]) : [];
  const monthly = (ps.monthly_volumes && typeof ps.monthly_volumes === "object"
    ? ps.monthly_volumes
    : {}) as Record<string, any>;
  const recentBols = Array.isArray(ps.recent_bols) ? (ps.recent_bols as any[]) : [];

  // ---- sourcing-country concentration (origin side of routes + suppliers) ----
  const originCounts = new Map<string, number>();
  for (const r of routes) {
    const label = str(r?.route);
    if (!label) continue;
    const [originLabel] = label.split(/→|->|—/).map((s: string) => s.trim());
    const country = originLabel ? endpointCountry(originLabel) : null;
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (num(r?.shipments) ?? 1));
  }
  for (const s of suppliers) {
    const country = str(s?.country);
    if (!country) continue;
    originCounts.set(country, (originCounts.get(country) ?? 0) + (num(s?.shipment_count) ?? 1));
  }
  const originShares = shareMap(originCounts);
  const primarySourcing = originShares.slice(0, 4);
  const topCountryShare = originShares[0]?.share ?? 0;
  const countryRisk = concentrationBand(topCountryShare, originShares.length);

  // ---- port concentration (destination side of routes) ----
  const destCounts = new Map<string, number>();
  for (const r of routes) {
    const label = str(r?.route);
    if (!label) continue;
    const parts = label.split(/→|->|—/).map((s: string) => s.trim());
    const destLabel = parts.length > 1 ? parts[parts.length - 1] : null;
    const city = destLabel ? endpointCity(destLabel) : null;
    if (!city) continue;
    destCounts.set(city, (destCounts.get(city) ?? 0) + (num(r?.shipments) ?? 1));
  }
  const portShares = shareMap(destCounts);
  const topPortShare = portShares[0]?.share ?? 0;
  const portRisk = concentrationBand(topPortShare, portShares.length);

  // ---- supplier concentration (supply-chain dependency) ----
  const supplierCounts = new Map<string, number>();
  for (const s of suppliers) {
    const nm = str(s?.name) ?? str(s?.supplier_name);
    if (!nm) continue;
    supplierCounts.set(nm, (supplierCounts.get(nm) ?? 0) + (num(s?.shipment_count) ?? 1));
  }
  const supplierShares = shareMap(supplierCounts);
  const topSupplierShare = supplierShares[0]?.share ?? 0;
  const supplierRisk = concentrationBand(topSupplierShare, supplierShares.length);

  // ---- 12-month shipment trend (chronological sparkline + direction) ----
  const monthKeys = Object.keys(monthly).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  const last12 = monthKeys.slice(-12);
  const trend = last12.map((k) => ({ month: k, shipments: num(monthly[k]?.shipments) ?? 0 }));
  let trendDirection: "accelerating" | "steady" | "cooling" = "steady";
  if (trend.length >= 4) {
    const half = Math.floor(trend.length / 2);
    const early = trend.slice(0, half).reduce((a, p) => a + p.shipments, 0) / Math.max(1, half);
    const late = trend.slice(half).reduce((a, p) => a + p.shipments, 0) / Math.max(1, trend.length - half);
    if (late > early * 1.15) trendDirection = "accelerating";
    else if (late < early * 0.85) trendDirection = "cooling";
  }

  const shipments12m = num(ps.shipments_last_12m) ?? num(ps.total_shipments) ?? 0;

  // ---- declared commodity/HS exposure — ECHOED context, NOT a determination.
  const declaredCommodity = declared.commodity;
  const declaredHs = declared.hs_code;
  const declaredOrigin = declared.origin_country;
  // Is the declared origin one of their observed primary sourcing countries?
  const originObserved = declaredOrigin
    ? originShares.some((o) => o.name.toLowerCase().includes(declaredOrigin.toLowerCase()))
    : null;

  return {
    visible: {
      company_key: companyKey,
      company_name: str(ps.company_name) ?? prettify(companyKey),
      country: str(ps.country),
      shipments_last_12m: shipments12m,
      // --- concentration indicators (VISIBLE pre-signup, §85 gating) ---
      primary_sourcing_countries: primarySourcing, // [{name, share, count}]
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
      // --- declared context, echoed only (NO legal/duty determination, §19) ---
      commodity_exposure: {
        commodity: declaredCommodity,
        hs_code: declaredHs,
        origin_country: declaredOrigin,
        origin_matches_observed: originObserved,
        note: declaredCommodity || declaredHs
          ? "Declared commodity/HS is shown as context you provided. This tool does not classify goods or determine duty treatment."
          : "No commodity/HS declared — add one to frame the profile. This tool does not classify goods or determine duty treatment.",
      },
      // NON-LEGAL tariff/regulatory INDICATOR — framed as an attention flag only.
      tariff_regulatory_indicator: {
        level: countryRisk,
        basis: "sourcing-country concentration",
        note: "Indicator only, based on where this importer sources — not tariff, duty, or legal advice. Verify any trade-policy impact with a licensed customs broker or trade attorney.",
      },
    },
    // LOCKED (deeper detail behind signup, §85): supplier-level dependency,
    // per-lane contact routing, alerting. Counts/levels only pre-signup.
    locked: {
      supply_chain_concentration: {
        top_supplier_share: topSupplierShare,
        distinct_suppliers: supplierShares.length,
        level: supplierRisk,
        label: "estimated concentration indicator",
      },
      shipment_records_count: recentBols.length,
      suppliers_count: supplierShares.length,
      lanes_count: routes.filter((r) => str(r?.route)).length,
      pulse_monitoring: true,
      change_alerts: true,
    },
    disclaimer:
      "All figures are estimates from public, aggregated shipment records and are labeled as indicators. Nothing here is legal, customs, or tariff advice, and no duty or classification determination is made.",
    data_freshness: snapDate ? `cached as of ${snapDate}` : "cached snapshot",
  };
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
    return json({ state: "error", message: "Report service is temporarily unavailable. Please try again shortly." }, 200);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = str(body.action);
  const anonymousId = str(body.anonymous_id);
  // Which magnet funnel this call belongs to (defaults to the flagship).
  const magnetSlug = resolveMagnetSlug(body.magnet_slug ?? body.magnet);

  if (!anonymousId) {
    return json({ state: "error", message: "Missing session. Please reload and try again." }, 200);
  }
  const ALLOWED_ACTIONS = ["search", "report", "cta", "risk", "capture"];
  if (!action || !ALLOWED_ACTIONS.includes(action)) {
    return json({ state: "error", message: "Unknown action." }, 200);
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
        message: "You've hit today's free lookup limit. Start a free trial to keep exploring.",
      });
    }
  } catch (err) {
    // fail-open: a rate-limit RPC hiccup must not break the magnet.
    log.warn("rate_limit_rpc_failed", { request_id: rid, err: String(err) });
  }

  const session = await ensureSession(admin, magnetSlug, anonymousId, {
    landing_page: str(body.landing_page),
    referrer: str(body.referrer),
    utm: (body.utm && typeof body.utm === "object" ? (body.utm as Record<string, unknown>) : null),
  });

  // =========================================================================
  // ACTION: cta — visitor clicked the trial CTA; record the funnel exit.
  // Fire-and-forget from the client (navigation to app signup continues).
  // =========================================================================
  if (action === "cta") {
    const companyKey = slugify(str(body.company_key) ?? "");
    await emitEvent(admin, {
      sessionId: session,
      magnetSlug,
      eventName: "lead_trial_cta_clicked",
      anonymousId,
      metadata: { company_key: companyKey || null },
    });
    await emitEvent(admin, {
      sessionId: session,
      magnetSlug,
      eventName: "lead_signup_started",
      anonymousId,
      metadata: { company_key: companyKey || null },
    });
    log.info("cta_clicked", { request_id: rid, company_key: companyKey });
    return json({ state: "ok" });
  }

  // =========================================================================
  // ACTION: search  — resolve typed name → cached company (snapshot-backed)
  // =========================================================================
  if (action === "search") {
    const q = str(body.q);
    if (!q) return json({ state: "no_data", message: "Type a company name to search." });

    await emitEvent(admin, { sessionId: session, magnetSlug, eventName: "lead_magnet_started", anonymousId, metadata: { q } });

    const company = await resolveCompany(admin, q);

    await emitEvent(admin, {
      sessionId: session,
      magnetSlug,
      eventName: "lead_magnet_submitted",
      anonymousId,
      metadata: { q, matched: Boolean(company), company_key: company?.key ?? null },
    });

    if (!company) {
      log.info("search_no_data", { request_id: rid });
      return json({
        state: "no_data",
        message: "We're still building this importer's profile. Try another company name.",
      });
    }

    log.info("search_matched", { request_id: rid, company_key: company.key });
    return json({ state: "matched", company });
  }

  // =========================================================================
  // ACTION: capture — MAGNET 4 (Freight Revenue Calculator, §18). The math is
  // 100% client-side; this path ONLY records the session + a lead_captured
  // event (and best-effort funnel events). 0 provider cost, no company data.
  // Body: { event? ("viewed"|"started"|"submitted"), email?, first_name?,
  //         estimate? } — email optional ("Send this estimate to my email").
  // =========================================================================
  if (action === "capture") {
    const captureEvent = str(body.event); // funnel breadcrumb, optional
    if (captureEvent === "viewed" || captureEvent === "started" || captureEvent === "submitted") {
      await emitEvent(admin, {
        sessionId: session,
        magnetSlug,
        eventName: `lead_magnet_${captureEvent}`,
        anonymousId,
        metadata: { estimate: body.estimate ?? null },
      });
      return json({ state: "ok" });
    }

    const email = str(body.email)?.toLowerCase() ?? null;
    const firstName = str(body.first_name);
    if (!email || !EMAIL_RE.test(email)) {
      return json({ state: "error", message: "Enter a valid email to receive your estimate." });
    }

    // email-scoped rate limit (§65)
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
      return json({
        state: "rate_limited",
        message: "Too many submissions for that email today. Start a free trial to continue.",
      });
    }

    try {
      const patch: Record<string, unknown> = {
        email,
        metadata: { first_name: firstName ?? null, estimate: body.estimate ?? null },
      };
      if (session) {
        const { data: sess } = await admin
          .from("lit_lead_magnet_sessions")
          .select("email_captured_at")
          .eq("id", session)
          .maybeSingle();
        if (!sess?.email_captured_at) patch.email_captured_at = new Date().toISOString();
        await admin.from("lit_lead_magnet_sessions").update(patch).eq("id", session);
      }
      await emitEvent(admin, {
        sessionId: session,
        magnetSlug,
        eventName: "lead_captured",
        anonymousId,
        metadata: { email, first_name: firstName, estimate: body.estimate ?? null },
      });
    } catch (err) {
      log.warn("capture_failed", { request_id: rid, err: String(err) });
      return json({ state: "error", message: "We couldn't save that just now. Please try again." });
    }

    // Best-effort immediate delivery of the estimate email (cron retries).
    await deliverMagnetEmail(admin, session, magnetSlug, email, firstName, {
      estimate: body.estimate ?? null,
    }, rid);

    log.info("estimate_captured", { request_id: rid });
    return json({ state: "captured", email_captured: true });
  }

  // =========================================================================
  // ACTION: risk — MAGNET 5 (Import & Tariff Risk Scanner, §19-20). Resolves
  // the company (reusing resolveCompany), reads the CACHED snapshot only, and
  // returns NON-LEGAL concentration/trend INDICATORS. 0 provider credits — no
  // live fetch anywhere on this path (identical guarantee to `report`).
  // =========================================================================
  if (action === "risk") {
    const q = str(body.company_key) ?? str(body.q) ?? str(body.company);
    const declared = {
      commodity: str(body.commodity),
      hs_code: str(body.hs_code),
      origin_country: str(body.origin_country),
    };
    if (!q) {
      return json({ state: "no_data", message: "Enter a company to scan its import profile." });
    }

    await emitEvent(admin, {
      sessionId: session,
      magnetSlug,
      eventName: "lead_magnet_started",
      anonymousId,
      metadata: { q, ...declared },
    });

    // resolve → snapshot-backed company only (never a live fetch).
    const resolved = (await snapshotExists(admin, slugify(q)))
      ? { key: slugify(q) }
      : await resolveCompany(admin, q);

    await emitEvent(admin, {
      sessionId: session,
      magnetSlug,
      eventName: "lead_magnet_submitted",
      anonymousId,
      metadata: { q, matched: Boolean(resolved), company_key: resolved?.key ?? null, ...declared },
    });

    if (!resolved) {
      log.info("risk_no_data", { request_id: rid });
      return json({
        state: "no_data",
        message: "We're still building this importer's profile. Try another company name.",
      });
    }

    // 0-CREDIT snapshot READ only.
    const { data: snap, error: snapErr } = await admin
      .from("lit_importyeti_company_snapshot")
      .select("company_id, parsed_summary, updated_at")
      .eq("company_id", resolved.key)
      .maybeSingle();

    if (snapErr) {
      log.error("risk_snapshot_read_failed", { request_id: rid, err: snapErr.message });
      return json({ state: "error", message: "We couldn't load this scan right now. Please try again." }, 200);
    }
    const rps = snap?.parsed_summary as Record<string, unknown> | null | undefined;
    if (!snap || !rps || typeof rps !== "object") {
      return json({
        state: "no_data",
        message: "We're still building this importer's profile. Try another company name.",
      });
    }

    const rSnapDate = snap.updated_at ? String(snap.updated_at).slice(0, 10) : null;
    const risk = buildRisk(resolved.key, rps, rSnapDate, declared);

    // optional email capture (same value-first pattern as report, §11)
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
        return json({
          state: "rate_limited",
          message: "Too many submissions for that email today. Start a free trial to continue.",
        });
      }
      try {
        const patch: Record<string, unknown> = {
          email,
          metadata: { first_name: firstName ?? null, last_company_key: resolved.key },
        };
        if (session) {
          const { data: sess } = await admin
            .from("lit_lead_magnet_sessions")
            .select("email_captured_at")
            .eq("id", session)
            .maybeSingle();
          if (!sess?.email_captured_at) patch.email_captured_at = new Date().toISOString();
          await admin.from("lit_lead_magnet_sessions").update(patch).eq("id", session);
        }
        emailCaptured = true;
        await emitEvent(admin, {
          sessionId: session,
          magnetSlug,
          eventName: "lead_captured",
          anonymousId,
          metadata: { email, first_name: firstName, company_key: resolved.key },
        });
      } catch (err) {
        log.warn("risk_email_capture_failed", { request_id: rid, err: String(err) });
      }
      // Best-effort immediate delivery of the risk-scan email (cron retries).
      await deliverMagnetEmail(admin, session, magnetSlug, email, firstName, {
        visible: risk.visible,
      }, rid);
    }

    await emitEvent(admin, {
      sessionId: session,
      magnetSlug,
      eventName: "lead_result_viewed",
      anonymousId,
      metadata: { company_key: resolved.key, email_captured: emailCaptured },
    });
    await emitEvent(admin, {
      sessionId: session,
      magnetSlug,
      eventName: "lead_result_locked",
      anonymousId,
      metadata: { company_key: resolved.key, locked: Object.keys(risk.locked) },
    });

    log.info("risk_served", { request_id: rid, company_key: resolved.key, email_captured: emailCaptured });
    return json({ state: "risk", email_captured: emailCaptured, ...risk });
  }

  // =========================================================================
  // ACTION: report — read cached snapshot → LIMITED public report
  // =========================================================================
  const companyKeyRaw = str(body.company_key) ?? str(body.q);
  if (!companyKeyRaw) {
    return json({ state: "no_data", message: "Choose a company to see its report." });
  }
  const companyKey = slugify(companyKeyRaw);

  // 0-CREDIT: snapshot READ only. No provider fetch anywhere in this path.
  const { data: snap, error: snapErr } = await admin
    .from("lit_importyeti_company_snapshot")
    .select("company_id, parsed_summary, updated_at")
    .eq("company_id", companyKey)
    .maybeSingle();

  if (snapErr) {
    log.error("snapshot_read_failed", { request_id: rid, err: snapErr.message });
    return json({ state: "error", message: "We couldn't load this report right now. Please try again." }, 200);
  }

  const ps = snap?.parsed_summary as Record<string, unknown> | null | undefined;
  if (!snap || !ps || typeof ps !== "object") {
    log.info("report_no_data", { request_id: rid, company_key: companyKey });
    return json({
      state: "no_data",
      message: "We're still building this importer's profile. Try another company name.",
    });
  }

  const snapDate = snap.updated_at ? String(snap.updated_at).slice(0, 10) : null;
  const report = buildReport(companyKey, ps, snapDate);

  // ---- optional email capture (§11: value first, email to "see full picture")
  const email = str(body.email)?.toLowerCase() ?? null;
  const firstName = str(body.first_name);
  let emailCaptured = false;

  if (email && EMAIL_RE.test(email)) {
    // email-scoped rate limit on submit (§65)
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
        message: "Too many submissions for that email today. Start a free trial to continue.",
      });
    }

    // Persist capture on the session (idempotent-ish: only set the timestamp once).
    try {
      const patch: Record<string, unknown> = { email };
      if (firstName) {
        patch.metadata = { first_name: firstName, last_company_key: companyKey };
      } else {
        patch.metadata = { last_company_key: companyKey };
      }
      if (session) {
        // Only stamp email_captured_at if not already set.
        const { data: sess } = await admin
          .from("lit_lead_magnet_sessions")
          .select("email_captured_at")
          .eq("id", session)
          .maybeSingle();
        if (!sess?.email_captured_at) patch.email_captured_at = new Date().toISOString();
        await admin.from("lit_lead_magnet_sessions").update(patch).eq("id", session);
      }
      emailCaptured = true;
      await emitEvent(admin, {
        sessionId: session,
        magnetSlug,
        eventName: "lead_captured",
        anonymousId,
        metadata: { email, first_name: firstName, company_key: companyKey },
      });
    } catch (err) {
      log.warn("email_capture_failed", { request_id: rid, err: String(err) });
    }

    // Best-effort immediate delivery of the report email (cron retries on fail).
    await deliverMagnetEmail(admin, session, magnetSlug, email, firstName, {
      visible: report.visible,
    }, rid);
  }

  // ---- funnel events: the visitor SAW value and hit a lock (§11) ----
  await emitEvent(admin, {
    sessionId: session,
    magnetSlug,
    eventName: "lead_result_viewed",
    anonymousId,
    metadata: { company_key: companyKey, email_captured: emailCaptured },
  });
  await emitEvent(admin, {
    sessionId: session,
    magnetSlug,
    eventName: "lead_result_locked",
    anonymousId,
    metadata: { company_key: companyKey, locked: Object.keys(report.locked) },
  });

  log.info("report_served", { request_id: rid, company_key: companyKey, email_captured: emailCaptured });
  return json({
    state: "report",
    email_captured: emailCaptured,
    ...report,
  });
});
