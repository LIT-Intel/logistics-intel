// lifecycle-nudge-tick — Phase 7 lifecycle behavioral messaging + Phase 9
// reactivation dispatcher.
//
// SAFETY / OWNER GATE (non-negotiable): this function sends NOTHING to a real
// user until the owner enables the corresponding flag. Both entry paths are
// gated server-side by SECURITY DEFINER RPCs that return an EMPTY batch when the
// flag is off:
//   * daily lifecycle drip  -> lit_lifecycle_pick_batch  (gated on lit_internal_meta['lifecycle_messaging_enabled'])
//   * reactivation segment  -> lit_reactivation_pick_batch (gated on lit_internal_meta['reactivation_enabled'])
// So even a manual/cron invocation while the flags default OFF is a no-op:
// pick_batch returns [], the send loop never runs, exit 0 ("skipped").
//
// Auth: cron-only via X-Internal-Cron / LIT_CRON_SECRET (verifyCronAuth). The
// admin "send reactivation now" button calls this with body {mode:"reactivation",
// segment:"A".."D"} through admin-api (service role) — same gate applies.
//
// Reuse: send-subscription-email (the branded mailer; it independently re-checks
// unsubscribe + its own once-per-(event_type,plan,user) dedup), lit_lifecycle_*
// RPCs (eligibility + suppression + once-per-stage dedup + record), the standard
// LIT cron pattern (pulse-refresh-tick / subscription-email-cron).
//
// Idempotent: lit_lifecycle_record_send is ON CONFLICT DO NOTHING, and the
// batch picker already excludes anyone recorded, so re-running the tick never
// double-sends. Per-run cap defaults to 100 (lifecycle) to bound blast radius.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

function verifyCronAuth(
  req: Request,
): { ok: true } | { ok: false; response: Response } {
  const expected = Deno.env.get("LIT_CRON_SECRET") || "";
  const provided = req.headers.get("X-Internal-Cron") || "";
  if (!expected) {
    console.error(
      JSON.stringify({ level: "error", fn: "lifecycle-nudge-tick", event: "cron_secret_unset" }),
    );
    return { ok: false, response: new Response("server misconfigured", { status: 500 }) };
  }
  if (provided !== expected) {
    return { ok: false, response: new Response("forbidden", { status: 403 }) };
  }
  return { ok: true };
}

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  console[level === "info" ? "log" : level](
    JSON.stringify({ ts: new Date().toISOString(), level, fn: "lifecycle-nudge-tick", event, ...fields }),
  );
}

interface BatchUser {
  user_id: string;
  email: string;
  stage: string;
  event_type: string;
  deep_link: string | null;
  recent_company_key?: string | null;
}

const LIFECYCLE_PER_RUN_CAP = 100;
const REACTIVATION_PER_RUN_CAP = 500;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Internal-Cron",
      },
    });
  }

  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);

  // Parse optional body: {mode:"lifecycle"|"reactivation", segment?, limit?}.
  let body: { mode?: string; segment?: string; limit?: number } = {};
  try {
    if (req.headers.get("content-length") && req.headers.get("content-length") !== "0") {
      body = await req.json();
    }
  } catch {
    body = {};
  }
  const mode = body.mode === "reactivation" ? "reactivation" : "lifecycle";
  const campaign = mode; // 'lifecycle' | 'reactivation'

  // ── GATE PRE-CHECK (defense-in-depth; the RPC also enforces it) ───────────
  const flagKey =
    mode === "reactivation" ? "reactivation_enabled" : "lifecycle_messaging_enabled";
  const { data: flagOn, error: flagErr } = await db.rpc("lit_lifecycle_flag", { p_key: flagKey });
  if (flagErr) {
    log("error", "flag_read_failed", { mode, err: flagErr.message });
    return new Response(JSON.stringify({ ok: false, error: "flag_read_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (flagOn !== true) {
    log("info", "skipped_flag_off", { mode, flag: flagKey });
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "flag_off", mode, sent: 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Pick the eligible batch (RPC re-checks the gate + suppression + dedup) ─
  let batch: BatchUser[] = [];
  if (mode === "reactivation") {
    const segment = String(body.segment || "").toUpperCase();
    if (!["A", "B", "C", "D"].includes(segment)) {
      return new Response(
        JSON.stringify({ ok: false, error: "reactivation requires segment A|B|C|D" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const limit = Math.min(Math.max(Number(body.limit) || REACTIVATION_PER_RUN_CAP, 1), 1000);
    const { data, error } = await db.rpc("lit_reactivation_pick_batch", {
      p_segment: segment,
      p_limit: limit,
    });
    if (error) {
      log("error", "pick_batch_failed", { mode, segment, err: error.message });
      return new Response(JSON.stringify({ ok: false, error: "pick_batch_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    batch = (data as BatchUser[]) || [];
  } else {
    const limit = Math.min(Math.max(Number(body.limit) || LIFECYCLE_PER_RUN_CAP, 1), 500);
    const { data, error } = await db.rpc("lit_lifecycle_pick_batch", { p_limit: limit });
    if (error) {
      log("error", "pick_batch_failed", { mode, err: error.message });
      return new Response(JSON.stringify({ ok: false, error: "pick_batch_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    batch = (data as BatchUser[]) || [];
  }

  if (batch.length === 0) {
    log("info", "no_eligible_users", { mode });
    return new Response(
      JSON.stringify({ ok: true, skipped: false, mode, sent: 0, eligible: 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // Resolve first names in bulk (best-effort; email personalization only).
  const userIds = batch.map((b) => b.user_id);
  const firstNames = new Map<string, string>();
  try {
    const { data: profs } = await db
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);
    for (const p of (profs as any[]) || []) {
      const fn = String(p.full_name || "").trim().split(/\s+/)[0];
      if (fn) firstNames.set(p.user_id, fn);
    }
  } catch {
    // non-fatal — templates fall back to "there"
  }

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ user_id: string; reason: string }> = [];

  for (const u of batch) {
    if (!u.email || !u.event_type) {
      skipped++;
      continue;
    }
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-subscription-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: u.user_id,
          recipient_email: u.email,
          first_name: firstNames.get(u.user_id),
          plan_slug: "free_trial",
          event_type: u.event_type,
          cta_url: u.deep_link ?? undefined,
        }),
      });
      const r: any = await resp.json().catch(() => ({}));
      if (r?.skipped) {
        // Mailer skipped (unsubscribed / already_sent). Still record so we
        // don't retry this stage every tick.
        skipped++;
        await db.rpc("lit_lifecycle_record_send", {
          p_user: u.user_id,
          p_stage: u.stage,
          p_campaign: campaign,
          p_event_type: u.event_type,
        });
        continue;
      }
      if (r?.ok) {
        sent++;
        await db.rpc("lit_lifecycle_record_send", {
          p_user: u.user_id,
          p_stage: u.stage,
          p_campaign: campaign,
          p_event_type: u.event_type,
        });
      } else {
        errors.push({ user_id: u.user_id, reason: String(r?.error || resp.status) });
      }
    } catch (err) {
      errors.push({
        user_id: u.user_id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log("info", "tick_complete", { mode, eligible: batch.length, sent, skipped, errors: errors.length });
  return new Response(
    JSON.stringify({
      ok: true,
      mode,
      eligible: batch.length,
      sent,
      skipped,
      errors: errors.length ? errors : undefined,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
