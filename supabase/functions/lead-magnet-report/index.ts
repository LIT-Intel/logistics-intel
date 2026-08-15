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
// Body: { action: "search" | "report", q?, company_key?, anonymous_id,
//         email?, first_name?, landing_page?, referrer?, utm? }
//
// Typed states returned (never a raw 500 for an expected condition, §62):
//   { state: "matched" | "no_data" | "report" | "rate_limited" | "error", ... }
//
// Phase-1 primitives reused (already live):
//   - RPC check_anon_rate_limit(p_scope,p_key,p_magnet,p_limit,p_window_secs) -> bool
//   - tables lit_lead_magnet_sessions / lit_lead_magnet_events
//   - canonical event_keys in lit_event_taxonomy
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";

const log = createLogger("lead-magnet-report");

const MAGNET_SLUG = "free-shipper-report";

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
    eventName: string;
    anonymousId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("lit_lead_magnet_events").insert({
      session_id: opts.sessionId,
      magnet_slug: MAGNET_SLUG,
      event_name: opts.eventName,
      anonymous_id: opts.anonymousId,
      metadata: opts.metadata ?? {},
    });
  } catch (err) {
    log.warn("event_emit_failed", { event: opts.eventName, err: String(err) });
  }
}

/**
 * Upsert (get-or-create) the lead-magnet session for this anon visitor +
 * magnet. Returns the session id (or null on failure — callers degrade
 * gracefully and still serve the report).
 */
async function ensureSession(
  admin: SupabaseClient,
  anonymousId: string,
  ctx: { landing_page?: string | null; referrer?: string | null; utm?: Record<string, unknown> | null },
): Promise<string | null> {
  try {
    const { data: existing } = await admin
      .from("lit_lead_magnet_sessions")
      .select("id")
      .eq("magnet_slug", MAGNET_SLUG)
      .eq("anonymous_id", anonymousId)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const utm = ctx.utm ?? {};
    const { data: inserted, error } = await admin
      .from("lit_lead_magnet_sessions")
      .insert({
        magnet_slug: MAGNET_SLUG,
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

  if (!anonymousId) {
    return json({ state: "error", message: "Missing session. Please reload and try again." }, 200);
  }
  if (action !== "search" && action !== "report" && action !== "cta") {
    return json({ state: "error", message: "Unknown action." }, 200);
  }

  // ---- per-session rate limit on EVERY call (§62/§65) ----
  try {
    const { data: within } = await admin.rpc("check_anon_rate_limit", {
      p_scope: "anon_session",
      p_key: anonymousId,
      p_magnet: MAGNET_SLUG,
      p_limit: SESSION_LIMIT,
      p_window_secs: SESSION_WINDOW,
    });
    if (within === false) {
      log.info("rate_limited_session", { request_id: rid });
      return json({
        state: "rate_limited",
        message: "You've hit today's free lookup limit. Start a free trial to keep exploring.",
      });
    }
  } catch (err) {
    // fail-open: a rate-limit RPC hiccup must not break the magnet.
    log.warn("rate_limit_rpc_failed", { request_id: rid, err: String(err) });
  }

  const session = await ensureSession(admin, anonymousId, {
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
      eventName: "lead_trial_cta_clicked",
      anonymousId,
      metadata: { company_key: companyKey || null },
    });
    await emitEvent(admin, {
      sessionId: session,
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

    await emitEvent(admin, { sessionId: session, eventName: "lead_magnet_started", anonymousId, metadata: { q } });

    const company = await resolveCompany(admin, q);

    await emitEvent(admin, {
      sessionId: session,
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
        p_magnet: MAGNET_SLUG,
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
        eventName: "lead_captured",
        anonymousId,
        metadata: { email, first_name: firstName, company_key: companyKey },
      });
    } catch (err) {
      log.warn("email_capture_failed", { request_id: rid, err: String(err) });
    }
  }

  // ---- funnel events: the visitor SAW value and hit a lock (§11) ----
  await emitEvent(admin, {
    sessionId: session,
    eventName: "lead_result_viewed",
    anonymousId,
    metadata: { company_key: companyKey, email_captured: emailCaptured },
  });
  await emitEvent(admin, {
    sessionId: session,
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
