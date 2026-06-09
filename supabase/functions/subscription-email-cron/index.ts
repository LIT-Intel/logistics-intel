// Reverse-engineered from deployed v5 of subscription-email-cron on
// 2026-06-09 (drift audit found this hand-minified version live in
// production. Git previously held a v3 that imported from _shared
// modules; the deployed v5 inlines verifyCronAuth/logger to avoid
// _shared import resolution during force-redeploy). Reformatted to
// multi-line for readability; behavior verified line-by-line against
// deployed EZBR sha256 4b13242eeed404da30629d79db54ab3f42c3bc77ed337e6f6fe293abba06d27d.
//
// v5 — force redeploy to refresh gateway verify_jwt config; inlined
// cron auth + logger so the function deploys standalone (no _shared
// dependency). Daily sweep schedule:
//   Day 2: trial_day_2_activation (behavior-gated)
//   Day 3: trial_day_3_founder_note
//   Day 4: trial_tip_pulse_ai
//   Day 5: trial_book_demo (sales@ sender)
//   Day 6: trial_tip_contact_enrichment
//   Day 8: trial_tip_revenue_opportunity
//   Day 12: trial_ending_soon
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
    return await handleOneOffTrigger(db, selfUrl, serviceRoleKey, body);
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
  const day2 = dayWindow(3, 2);
  const day3 = dayWindow(4, 3);
  const day4 = dayWindow(5, 4);
  const day5 = dayWindow(6, 5);
  const day6 = dayWindow(7, 6);
  const day8 = dayWindow(9, 8);

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
  const { data: day8c } = await db
    .from("subscriptions")
    .select(select)
    .eq("status", "trialing")
    .gte("started_at", day8.gte)
    .lte("started_at", day8.lte);
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

  const stats: Record<string, number> = {
    day_2: 0,
    day_3: 0,
    day_4: 0,
    day_5_book_demo: 0,
    day_6: 0,
    day_8: 0,
    day_12: 0,
    check_in_inactive: 0,
    skipped_day_2_active: 0,
    skipped_check_in_active: 0,
  };
  const errors: string[] = [];

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
  await fireSweep(day8c ?? [], "trial_tip_revenue_opportunity", "day_8");

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
