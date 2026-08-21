// Reverse-engineered from deployed v5 of subscription-email-cron on
// 2026-06-09 (drift audit found this hand-minified version live in
// production. Git previously held a v3 that imported from _shared
// modules; the deployed v5 inlines verifyCronAuth/logger to avoid
// _shared import resolution during force-redeploy). Reformatted to
// multi-line for readability; behavior verified line-by-line against
// deployed EZBR sha256 4b13242eeed404da30629d79db54ab3f42c3bc77ed337e6f6fe293abba06d27d.
//
// v6 — 7-day trial (2026-08-12, was 14): dropped the Day-8
// trial_tip_revenue_opportunity sweep (would land after expiry; the
// template stays available for one-off triggers). trial_ending_soon is
// driven by trial_ends_at (fires when the trial ends within 2 days =
// day 5+ of a 7-day trial), so it needed no change.
// v5 — force redeploy to refresh gateway verify_jwt config; inlined
// cron auth + logger so the function deploys standalone (no _shared
// dependency). Daily sweep schedule:
//   Day 2: trial_day_2_activation (behavior-gated)
//   Day 3: trial_day_3_founder_note
//   Day 4: trial_tip_pulse_ai
//   Day 5: trial_book_demo (sales@ sender)
//   Day 6: trial_tip_contact_enrichment
//   trial_ends_at within 2 days: trial_ending_soon
//   + inactivity check-in for trials >= 3 days with zero activity

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

function verifyCronAuth(
  req: Request,
): { ok: true } | { ok: false; response: Response } {
  const expected = Deno.env.get("LIT_CRON_SECRET") || "";
  const provided = req.headers.get("X-Internal-Cron") || "";
  if (!expected) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "subscription-email-cron",
        event: "cron_secret_unset",
      }),
    );
    return {
      ok: false,
      response: new Response("server misconfigured", { status: 500 }),
    };
  }
  if (provided !== expected) {
    return { ok: false, response: new Response("forbidden", { status: 403 }) };
  }
  return { ok: true };
}

function requestId(): string {
  return crypto.randomUUID().split("-")[0];
}

function logInfo(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      fn: "subscription-email-cron",
      event,
      ...fields,
    }),
  );
}

function logWarn(event: string, fields: Record<string, unknown> = {}) {
  console.warn(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "warn",
      fn: "subscription-email-cron",
      event,
      ...fields,
    }),
  );
}

function logError(event: string, fields: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      fn: "subscription-email-cron",
      event,
      ...fields,
    }),
  );
}

const ALLOWED_EVENTS = new Set([
  "trial_welcome",
  "trial_day_2_activation",
  "trial_day_3_founder_note",
  "trial_tip_pulse_ai",
  "trial_tip_contact_enrichment",
  "trial_tip_revenue_opportunity",
  "trial_ending_soon",
  "trial_book_demo",
  "trial_check_in_inactive",
  "day1_run_first_search",
  "paid_plan_welcome",
  "upgrade_confirmation",
  "payment_failed",
  "cancellation_confirmation",
]);

const INACTIVE_DAYS_THRESHOLD = 3;

serve(async (req: Request) => {
  const reqId = requestId();
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, X-Internal-Cron",
      },
    });
  }
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    logWarn("cron_auth_failed", {
      request_id: reqId,
      err: "X-Internal-Cron mismatch or missing",
    });
    return auth.response;
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);
  const selfUrl = `${supabaseUrl}/functions/v1/send-subscription-email`;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.trigger_one_off === true) {
    // One-off (manual/webhook) sends still work regardless of the handoff flag.
    // These include the TRANSACTIONAL events (paid_plan_welcome,
    // upgrade_confirmation, payment_failed, cancellation_confirmation,
    // trial_limit_reached) which Harvey does NOT own. Do NOT gate this path.
    return await handleOneOffTrigger(db, selfUrl, serviceRoleKey, body);
  }

  // ── HANDOFF: Harvey owns TRIAL NURTURE ──────────────────────────────────────
  // If lit_internal_meta['harvey_owns_trial_nurture'] is true, the BEHAVIORAL
  // trial sweeps below (day1 run_first_search, day2 activation, day3 founder
  // note, day4/day6 tips, day5 book_demo, inactivity check-in, day12
  // trial_ending_soon) are now handled by harvey-nurture. Skip ALL of them.
  //
  // This does NOT affect the pure TRANSACTIONAL emails — those only fire via the
  // one-off trigger path above (paid_plan_welcome / upgrade_confirmation /
  // payment_failed / cancellation_confirmation / trial_limit_reached) and are
  // deliberately left untouched: Harvey does not own them.
  let harveyOwnsTrialNurture = false;
  try {
    const { data: metaRow } = await db
      .from("lit_internal_meta")
      .select("meta_value")
      .eq("meta_key", "harvey_owns_trial_nurture")
      .maybeSingle();
    const v = (metaRow as { meta_value?: unknown } | null)?.meta_value;
    harveyOwnsTrialNurture = v === true || v === "true" ||
      (typeof v === "string" && v.trim().toLowerCase() === "true");
  } catch (err) {
    // Fail OPEN for the legacy drip: if we cannot read the flag, keep the old
    // behavior (send the behavioral sweeps) rather than silently going dark.
    logWarn("harvey_ownership_flag_read_failed", {
      request_id: reqId,
      err: err instanceof Error ? err.message : String(err),
    });
    harveyOwnsTrialNurture = false;
  }
  if (harveyOwnsTrialNurture) {
    logInfo("skipped_harvey_owns_trial_nurture", {
      request_id: reqId,
      note:
        "skipped: harvey owns trial nurture — behavioral trial sweeps handed off to harvey-nurture; transactional emails unaffected",
    });
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: "harvey owns trial nurture",
        processed: {},
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  function dayWindow(daysAgoStart: number, daysAgoEnd: number) {
    return {
      gte: new Date(Date.now() - daysAgoStart * 86400 * 1000).toISOString(),
      lte: new Date(Date.now() - daysAgoEnd * 86400 * 1000).toISOString(),
    };
  }

  const select =
    "id, user_id, organization_id, plan_code, started_at, trial_ends_at";
  const day12Columns =
    "id, user_id, organization_id, plan_code, trial_ends_at";
  // Day-1 activation window: signups from 24-48h ago. Distinct from the
  // day2 activation sweep (2-3d) — this fires ONCE, ~24-48h after signup,
  // only for users who confirmed email but have taken ZERO action (no
  // activity events AND no company_search / company_profile_view usage).
  const day1 = dayWindow(2, 1);
  const day2 = dayWindow(3, 2);
  const day3 = dayWindow(4, 3);
  const day4 = dayWindow(5, 4);
  const day5 = dayWindow(6, 5);
  const day6 = dayWindow(7, 6);

  const { data: day1c } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing")
    .gte("started_at", day1.gte)
    .lte("started_at", day1.lte);
  const { data: day2c } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing")
    .gte("started_at", day2.gte)
    .lte("started_at", day2.lte);
  const { data: day3c } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing")
    .gte("started_at", day3.gte)
    .lte("started_at", day3.lte);
  const { data: day4c } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing")
    .gte("started_at", day4.gte)
    .lte("started_at", day4.lte);
  const { data: day5c } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing")
    .gte("started_at", day5.gte)
    .lte("started_at", day5.lte);
  const { data: day6c } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing")
    .gte("started_at", day6.gte)
    .lte("started_at", day6.lte);
  const { data: day12c } = await db
    .from("subscriptions")
    .select(day12Columns)
    .eq("status", "trialing")
    .gte("trial_ends_at", new Date().toISOString())
    .lte(
      "trial_ends_at",
      new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
    );
  const { data: inactiveCandidates } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing");

  async function getRecipientInfo(
    userId: string | null,
  ): Promise<{ email: string | null; firstName: string | null }> {
    if (!userId) return { email: null, firstName: null };
    const { data: profile } = await db
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: authUser } = await db.auth.admin.getUserById(userId);
    // Confirmation gate (2026-08-08): never drip to users who haven't
    // confirmed their email. trial_welcome is already held until the
    // confirm click (see migration trial_welcome_after_email_confirm);
    // returning null here makes every calendar-driven day-N loop skip
    // unconfirmed users the same way.
    if (!authUser?.user?.email_confirmed_at) {
      return { email: null, firstName: null };
    }
    const email = authUser?.user?.email ?? null;
    const fullName = (profile as any)?.full_name ?? null;
    const firstName = fullName ? fullName.split(" ")[0] : null;
    return { email, firstName };
  }

  async function dispatchEmail(
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    try {
      const resp = await fetch(selfUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return await resp.json().catch(() => ({
        ok: false,
        error: "Invalid JSON",
      }));
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // True when the user has ANY measurable activity: an activity event OR a
  // company_search / company_profile_view usage-ledger row (searches are
  // free but still instrumented into lit_usage_ledger). Used to hold the
  // Day-1 nudge back from anyone who has already acted.
  async function hasAnyActivity(userId: string): Promise<boolean> {
    const { count: activityCount } = await db
      .from("lit_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((activityCount ?? 0) > 0) return true;
    const { count: usageCount } = await db
      .from("lit_usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("feature_key", ["company_search", "company_profile_view"]);
    return (usageCount ?? 0) > 0;
  }

  const stats: Record<string, number> = {
    day_1_first_search: 0,
    skipped_day_1_active: 0,
    day_2: 0,
    day_3: 0,
    day_4: 0,
    day_5_book_demo: 0,
    day_6: 0,
    day_12: 0,
    check_in_inactive: 0,
    skipped_day_2_active: 0,
    skipped_check_in_active: 0,
  };
  const errors: string[] = [];

  // Day-1 "run your first search" nudge. Confirmed-but-inactive users
  // 24-48h post-signup. getRecipientInfo already gates on
  // email_confirmed_at; hasAnyActivity gates on zero activity/usage.
  // send-subscription-email dedups on (event_type, plan_slug, user_id)
  // so this fires at most ONCE per user even across repeated cron runs.
  for (const sub of day1c ?? []) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;
    if (!sub.user_id) continue;
    if (await hasAnyActivity(sub.user_id)) {
      stats.skipped_day_1_active++;
      continue;
    }
    const r = await dispatchEmail({
      user_id: sub.user_id,
      org_id: sub.organization_id,
      subscription_id: sub.id,
      recipient_email: email,
      first_name: firstName,
      plan_slug: normalizePlanCode(sub.plan_code),
      event_type: "day1_run_first_search",
    });
    if (r.skipped) continue;
    if (r.ok) stats.day_1_first_search++;
    else errors.push(`day1 ${email}: ${r.error}`);
  }

  for (const sub of day2c ?? []) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;
    if (sub.user_id && sub.started_at) {
      const { count } = await db
        .from("lit_activity_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .gte("created_at", sub.started_at);
      if ((count ?? 0) > 0) {
        stats.skipped_day_2_active++;
        continue;
      }
    }
    const r = await dispatchEmail({
      user_id: sub.user_id,
      org_id: sub.organization_id,
      subscription_id: sub.id,
      recipient_email: email,
      first_name: firstName,
      plan_slug: normalizePlanCode(sub.plan_code),
      event_type: "trial_day_2_activation",
    });
    if (r.skipped) continue;
    if (r.ok) stats.day_2++;
    else errors.push(`day2 ${email}: ${r.error}`);
  }

  async function fireSweep(
    candidates: any[],
    event_type: string,
    statKey: string,
  ) {
    for (const sub of candidates) {
      const { email, firstName } = await getRecipientInfo(sub.user_id);
      if (!email) continue;
      const r = await dispatchEmail({
        user_id: sub.user_id,
        org_id: sub.organization_id,
        subscription_id: sub.id,
        recipient_email: email,
        first_name: firstName,
        plan_slug: normalizePlanCode(sub.plan_code),
        event_type,
      });
      if (r.skipped) continue;
      if (r.ok) stats[statKey]++;
      else errors.push(`${event_type} ${email}: ${r.error}`);
    }
  }
  await fireSweep(day3c ?? [], "trial_day_3_founder_note", "day_3");
  await fireSweep(day4c ?? [], "trial_tip_pulse_ai", "day_4");
  await fireSweep(day5c ?? [], "trial_book_demo", "day_5_book_demo");
  await fireSweep(day6c ?? [], "trial_tip_contact_enrichment", "day_6");

  const inactiveCutoff = new Date(
    Date.now() - INACTIVE_DAYS_THRESHOLD * 86400 * 1000,
  ).toISOString();
  for (const sub of inactiveCandidates ?? []) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;
    if (
      sub.started_at &&
      new Date(sub.started_at).getTime() >
        Date.now() - INACTIVE_DAYS_THRESHOLD * 86400 * 1000
    ) {
      continue;
    }
    if (!sub.user_id) continue;
    const { count } = await db
      .from("lit_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", sub.user_id)
      .gte("created_at", inactiveCutoff);
    if ((count ?? 0) > 0) {
      stats.skipped_check_in_active++;
      continue;
    }
    const r = await dispatchEmail({
      user_id: sub.user_id,
      org_id: sub.organization_id,
      subscription_id: sub.id,
      recipient_email: email,
      first_name: firstName,
      plan_slug: normalizePlanCode(sub.plan_code),
      event_type: "trial_check_in_inactive",
    });
    if (r.skipped) continue;
    if (r.ok) stats.check_in_inactive++;
    else errors.push(`check_in ${email}: ${r.error}`);
  }

  for (const sub of day12c ?? []) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;
    let trialEndsDate: string | undefined;
    if (sub.trial_ends_at) {
      try {
        trialEndsDate = new Date(sub.trial_ends_at).toLocaleDateString(
          "en-US",
          { month: "long", day: "numeric" },
        );
      } catch {
        // ignore date parse failures
      }
    }
    const r = await dispatchEmail({
      user_id: sub.user_id,
      org_id: sub.organization_id,
      subscription_id: sub.id,
      recipient_email: email,
      first_name: firstName,
      plan_slug: normalizePlanCode(sub.plan_code),
      event_type: "trial_ending_soon",
      trial_ends_date: trialEndsDate,
    });
    if (r.skipped) continue;
    if (r.ok) stats.day_12++;
    else errors.push(`day12 ${email}: ${r.error}`);
  }

  if (errors.length > 0) {
    logError("cron_dispatch_errors", {
      request_id: reqId,
      err: `${errors.length} dispatch failures`,
      errors: errors.slice(0, 5),
      stats,
    });
  } else {
    logInfo("cron_swept_clean", { request_id: reqId, stats });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      processed: stats,
      errors: errors.length ? errors : undefined,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});

async function handleOneOffTrigger(
  db: any,
  selfUrl: string,
  serviceRoleKey: string,
  body: any,
): Promise<Response> {
  const recipientEmail = String(body?.recipient_email || "").trim().toLowerCase();
  const eventType = String(body?.event_type || "").trim();
  if (
    !recipientEmail ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
  ) {
    return jsonResp({ ok: false, error: "invalid_recipient_email" }, 400);
  }
  if (!ALLOWED_EVENTS.has(eventType)) {
    return jsonResp(
      {
        ok: false,
        error: "invalid_event_type",
        allowed: Array.from(ALLOWED_EVENTS),
      },
      400,
    );
  }
  let recipientKnown = false;
  try {
    const { data: profileMatch } = await db
      .from("user_profiles")
      .select("user_id")
      .eq("email", recipientEmail)
      .maybeSingle();
    if (profileMatch) recipientKnown = true;
  } catch {
    // ignore lookup errors; fall through to other checks
  }
  if (!recipientKnown && body?.user_id) {
    try {
      const { data: userById } = await db.auth.admin.getUserById(body.user_id);
      if (userById?.user?.email?.toLowerCase() === recipientEmail) {
        recipientKnown = true;
      }
    } catch {
      // ignore lookup errors
    }
  }
  if (!recipientKnown) {
    const adminEmails = (Deno.env.get("SUPER_ADMIN_EMAILS") || "")
      .split(",")
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.includes(recipientEmail)) recipientKnown = true;
    const litFounderEmails = [
      "vraymond@logisticintel.com",
      "vraymond83@gmail.com",
    ];
    if (litFounderEmails.includes(recipientEmail)) recipientKnown = true;
  }
  if (!recipientKnown) {
    return jsonResp({ ok: false, error: "recipient_not_known" }, 403);
  }
  const dispatchPayload: Record<string, unknown> = {
    recipient_email: recipientEmail,
    event_type: eventType,
    plan_slug: body?.plan_slug || "free_trial",
    first_name: body?.first_name,
    user_id: body?.user_id,
    org_id: body?.org_id,
    subscription_id: body?.subscription_id,
    trial_ends_date: body?.trial_ends_date,
    previous_plan_name: body?.previous_plan_name,
    period_end: body?.period_end,
    plan_name: body?.plan_name,
    force: body?.force === true,
  };
  try {
    const resp = await fetch(selfUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dispatchPayload),
    });
    const json = await resp.json().catch(() => ({
      ok: false,
      error: "invalid_send_response",
    }));
    return jsonResp(json, resp.ok ? 200 : resp.status);
  } catch (err) {
    return jsonResp(
      {
        ok: false,
        error: "dispatch_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePlanCode(
  code: string | null,
): "free_trial" | "starter" | "growth" | "scale" | "enterprise" {
  if (!code) return "free_trial";
  const n = code.toLowerCase().trim();
  const map: Record<
    string,
    "free_trial" | "starter" | "growth" | "scale" | "enterprise"
  > = {
    trial: "free_trial",
    free: "free_trial",
    free_trial: "free_trial",
    starter: "starter",
    pro: "growth",
    growth: "growth",
    team: "scale",
    scale: "scale",
    enterprise: "enterprise",
  };
  return map[n] ?? "free_trial";
}
