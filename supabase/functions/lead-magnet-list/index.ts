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
import {
  parseFilters,
  resolveProspectList,
  buildListResult,
} from "../_shared/lead_magnet_builders.ts";
import { sendLeadMagnetEmail } from "../_shared/lead_magnet_email.ts";

const log = createLogger("lead-magnet-list");

const VALID_SLUGS = new Set(["top-shippers", "free-freight-prospects"]);

// Rate limits (§62/§65) — mirror lead-magnet-report.
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// NOTE: filter parsing, the directory query engine (hard filters + soft lane
// refinement + global fallback), ranking, and the visible/locked row shapes all
// live in ../_shared/lead_magnet_builders.ts so the fulfillment cron builds the
// identical list for the email. This file only orchestrates rate-limits,
// sessions, events, and the HTTP response.

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
  // resolveProspectList applies hard filters (industry/volume/state), a SOFT
  // lane refinement for origin/destination (never zeroes), and a global
  // top-ranked fallback so a common query never dead-ends (Bug 1 fix).
  const { rows, usedFallback } = await resolveProspectList(admin, filters);

  // Rank + split into 5 visible / 20 locked via the SHARED builder (identical
  // to what the fulfillment cron emails).
  const listResult = buildListResult(rows);
  const visibleRows = listResult.visible;
  const lockedRows = listResult.locked;

  await emitEvent(admin, magnetSlug, {
    sessionId: session,
    eventName: "lead_magnet_submitted",
    anonymousId,
    metadata: { filters: savedQuery.raw, matched: listResult.total_count, used_fallback: usedFallback },
  });

  // With the global fallback, this is only ever empty if the directory table
  // itself is empty (won't happen in prod) — keep the honest state just in case.
  if (visibleRows.length === 0) {
    log.info("no_results", { request_id: rid, magnet: magnetSlug });
    return json({
      state: "no_results",
      email_captured: emailCaptured,
      message: "The prospect directory is temporarily unavailable. Please try again shortly.",
    });
  }

  // ---- best-effort immediate email delivery on capture (§ email wiring) ----
  // A send failure must NOT break the API response; the fulfillment cron retries.
  if (emailCaptured && email && session) {
    try {
      await sendLeadMagnetEmail(admin, {
        magnetSlug,
        email,
        firstName,
        payload: { visible: visibleRows, locked_count: lockedRows.length, total_count: listResult.total_count, saved_query: savedQuery },
      });
      await admin.from("lit_lead_magnet_sessions")
        .update({ report_emailed_at: new Date().toISOString() })
        .eq("id", session);
    } catch (err) {
      log.warn("immediate_email_failed", { request_id: rid, err: String(err) });
      try {
        await admin.from("lit_lead_magnet_sessions")
          .update({ last_email_error: String(err).slice(0, 500) })
          .eq("id", session);
      } catch { /* ignore */ }
    }
  }

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
    locked_count: listResult.locked_count,
    total_count: listResult.total_count,
    // echo the saved_query so the client can build the signup deep-link (§15)
    // without re-deriving the mapping.
    saved_query: savedQuery,
    data_freshness: listResult.data_freshness,
  });
});
