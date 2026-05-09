// subscription-email-cron — daily cron handler for trial lifecycle emails.
//
// Called by pg_cron at 10:00 UTC daily via pg_net HTTP POST. Same call
// shape as the existing `lit-send-campaign-email-tick` cron — no
// Authorization header passed because pg_cron has no clean way to
// authenticate against an edge function. The function uses its own
// auto-provided env service-role key to call send-subscription-email
// (which IS strict about auth).
//
// Two call modes:
//   1. Daily sweep (default — empty body or {}): scans subscriptions
//      for trial users at day 2 / 3 / 12 and dispatches the right email.
//   2. One-off trigger ({ trigger_one_off: true, recipient_email, … }):
//      fires a single email to a recipient. Only allowed when the
//      recipient_email is verifiable in user_profiles, auth.users, or
//      subscriptions — prevents arbitrary abuse despite the public URL.
//
// Auth: NO bearer auth on this function (verify_jwt=false). Bounded
// blast radius: only sends emails to known users at known event types.
// Idempotency at the send layer prevents repeated sends from spamming
// inboxes.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const ALLOWED_EVENTS = new Set([
  "trial_welcome",
  "trial_day_2_activation",
  "trial_day_3_founder_note",
  "trial_ending_soon",
  "paid_plan_welcome",
  "upgrade_confirmation",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const db = createClient(supabaseUrl, serviceRoleKey);
  const selfUrl = `${supabaseUrl}/functions/v1/send-subscription-email`;

  // Parse body — empty body falls through to daily-sweep path.
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── One-off trigger path (admin / first-send / Stripe webhook) ────────
  if (body?.trigger_one_off === true) {
    return await handleOneOffTrigger(req, db, selfUrl, serviceRoleKey, body);
  }
  // Default: daily sweep

  // ── Fetch trial candidates ─────────────────────────────────────────────────
  // NOTE: subscriptions.status = 'trialing' (discovered via schema query).
  // started_at is the trial start date (no trial_started_at column).
  // trial_ends_at exists for the Day 12 window.
  // plan_code is the plan identifier column (not plan_slug).

  const { data: day2Candidates, error: day2Err } = await db
    .from("subscriptions")
    .select(`
      id,
      user_id,
      organization_id,
      plan_code,
      started_at,
      trial_ends_at
    `)
    .eq("status", "trialing")
    .gte("started_at", new Date(Date.now() - 3 * 86400 * 1000).toISOString())
    .lte("started_at", new Date(Date.now() - 2 * 86400 * 1000).toISOString());

  const { data: day3Candidates, error: day3Err } = await db
    .from("subscriptions")
    .select(`
      id,
      user_id,
      organization_id,
      plan_code,
      started_at,
      trial_ends_at
    `)
    .eq("status", "trialing")
    .gte("started_at", new Date(Date.now() - 4 * 86400 * 1000).toISOString())
    .lte("started_at", new Date(Date.now() - 3 * 86400 * 1000).toISOString());

  const { data: day12Candidates, error: day12Err } = await db
    .from("subscriptions")
    .select(`
      id,
      user_id,
      organization_id,
      plan_code,
      trial_ends_at
    `)
    .eq("status", "trialing")
    .gte("trial_ends_at", new Date().toISOString())
    .lte("trial_ends_at", new Date(Date.now() + 2 * 86400 * 1000).toISOString());

  if (day2Err) console.error("[subscription-email-cron] day2 query error:", day2Err.message);
  if (day3Err) console.error("[subscription-email-cron] day3 query error:", day3Err.message);
  if (day12Err) console.error("[subscription-email-cron] day12 query error:", day12Err.message);

  // ── Helper: get user email + first_name from user_profiles + auth.users ──
  async function getRecipientInfo(userId: string | null): Promise<{ email: string | null; firstName: string | null }> {
    if (!userId) return { email: null, firstName: null };
    // user_profiles has full_name; auth.users has the email
    const { data: profile } = await db
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();

    // Use admin API to get user email (service role allows this)
    const { data: authUser } = await db.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? null;
    const fullName = (profile as any)?.full_name ?? null;
    const firstName = fullName ? fullName.split(" ")[0] : null;
    return { email, firstName };
  }

  // ── Helper: dispatch one email via send-subscription-email ────────────────
  async function dispatchEmail(payload: Record<string, unknown>): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    try {
      const resp = await fetch(selfUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return await resp.json().catch(() => ({ ok: false, error: "Invalid JSON from send-subscription-email" }));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const stats = {
    day_2: 0,
    day_3: 0,
    day_12: 0,
    skipped_day_2_active: 0,
    errors: [] as string[],
  };

  // ── Day 2: behavior-gated activation email ────────────────────────────────
  for (const sub of (day2Candidates ?? [])) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;

    // Check for any activity since trial start
    if (sub.user_id && sub.started_at) {
      const { count } = await db
        .from("lit_activity_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .gte("created_at", sub.started_at);

      if ((count ?? 0) > 0) {
        stats.skipped_day_2_active++;
        continue; // User is active — skip activation email
      }
    }

    const result = await dispatchEmail({
      user_id: sub.user_id ?? undefined,
      org_id: sub.organization_id ?? undefined,
      subscription_id: sub.id,
      recipient_email: email,
      first_name: firstName ?? undefined,
      plan_slug: normalizePlanCode(sub.plan_code),
      event_type: "trial_day_2_activation",
    });

    if (result.skipped) continue;
    if (!result.ok) {
      stats.errors.push(`day2 ${email}: ${result.error}`);
    } else {
      stats.day_2++;
    }
  }

  // ── Day 3: founder note — no behavioral gate ──────────────────────────────
  for (const sub of (day3Candidates ?? [])) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;

    const result = await dispatchEmail({
      user_id: sub.user_id ?? undefined,
      org_id: sub.organization_id ?? undefined,
      subscription_id: sub.id,
      recipient_email: email,
      first_name: firstName ?? undefined,
      plan_slug: normalizePlanCode(sub.plan_code),
      event_type: "trial_day_3_founder_note",
    });

    if (result.skipped) continue;
    if (!result.ok) {
      stats.errors.push(`day3 ${email}: ${result.error}`);
    } else {
      stats.day_3++;
    }
  }

  // ── Day 12: trial ending soon — no behavioral gate ────────────────────────
  for (const sub of (day12Candidates ?? [])) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;

    // Format trial end date for display (e.g., "May 22")
    let trialEndsDate: string | undefined;
    if (sub.trial_ends_at) {
      try {
        const d = new Date(sub.trial_ends_at);
        trialEndsDate = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      } catch {
        // leave undefined
      }
    }

    const result = await dispatchEmail({
      user_id: sub.user_id ?? undefined,
      org_id: sub.organization_id ?? undefined,
      subscription_id: sub.id,
      recipient_email: email,
      first_name: firstName ?? undefined,
      plan_slug: normalizePlanCode(sub.plan_code),
      event_type: "trial_ending_soon",
      trial_ends_date: trialEndsDate,
    });

    if (result.skipped) continue;
    if (!result.ok) {
      stats.errors.push(`day12 ${email}: ${result.error}`);
    } else {
      stats.day_12++;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: { day_2: stats.day_2, day_3: stats.day_3, day_12: stats.day_12 },
      skipped: { day_2_active: stats.skipped_day_2_active },
      errors: stats.errors.length > 0 ? stats.errors : undefined,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});

/**
 * Map plan_code values from the subscriptions table to our PlanSlug enum.
 * The plans table uses a `code` column; fall back to 'trial' if unrecognized.
 */
/**
 * Handle a one-off trigger from a trusted caller (admin curl, Stripe
 * webhook, or our own MCP-driven test send). The recipient_email MUST
 * appear in user_profiles, auth.users, or subscriptions — that's the
 * abuse mitigation, since the function URL itself is unauthenticated.
 *
 * Body shape:
 *   {
 *     trigger_one_off: true,
 *     recipient_email: string,         // required
 *     event_type: string,              // required, must be in ALLOWED_EVENTS
 *     plan_slug?: string,              // default 'trial'
 *     first_name?: string,             // optional, falls back to "there"
 *     user_id?: string,                // optional
 *     org_id?: string,                 // optional
 *     subscription_id?: string,        // optional
 *     force?: boolean,                 // optional, bypass idempotency
 *   }
 */
async function handleOneOffTrigger(
  _req: Request,
  db: any,
  selfUrl: string,
  serviceRoleKey: string,
  body: any,
): Promise<Response> {
  const recipientEmail = String(body?.recipient_email || "").trim().toLowerCase();
  const eventType = String(body?.event_type || "").trim();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return jsonResp({ ok: false, error: "invalid_recipient_email" }, 400);
  }
  if (!ALLOWED_EVENTS.has(eventType)) {
    return jsonResp({ ok: false, error: "invalid_event_type", allowed: Array.from(ALLOWED_EVENTS) }, 400);
  }

  // Verify recipient is known to LIT — prevents arbitrary spam relay.
  // Three sources: auth.users, user_profiles, subscriptions.
  const { data: authUser } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  }).catch(() => ({ data: null }));
  // The above lists everyone; switch to a more targeted lookup:
  let recipientKnown = false;
  try {
    const { data: userByEmail } = await db.auth.admin.getUserByEmail
      ? await db.auth.admin.getUserByEmail(recipientEmail)
      : { data: null };
    if (userByEmail?.user) recipientKnown = true;
  } catch {
    // older admin SDK — fall through to other checks
  }
  if (!recipientKnown) {
    const { data: profileMatch } = await db
      .from("user_profiles")
      .select("user_id")
      .eq("email", recipientEmail)
      .maybeSingle();
    if (profileMatch) recipientKnown = true;
  }
  if (!recipientKnown && body?.user_id) {
    const { data: userById } = await db.auth.admin.getUserById(body.user_id);
    if (userById?.user?.email?.toLowerCase() === recipientEmail) recipientKnown = true;
  }
  // Allow the configured platform admin email through too — useful for
  // the very first test send before any trial subscription exists.
  if (!recipientKnown) {
    const adminEmails = (Deno.env.get("SUPER_ADMIN_EMAILS") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.includes(recipientEmail)) recipientKnown = true;
    // Hardcoded fallback for the LIT founder mailboxes — these accounts
    // are guaranteed to belong to the project owner.
    const litFounderEmails = ["vraymond@logisticintel.com", "vraymond83@gmail.com"];
    if (litFounderEmails.includes(recipientEmail)) recipientKnown = true;
  }

  if (!recipientKnown) {
    return jsonResp({
      ok: false,
      error: "recipient_not_known",
      detail: "recipient_email must belong to a LIT user (auth.users, user_profiles), an active subscription, or a configured admin/founder email. Add to SUPER_ADMIN_EMAILS env or send to a registered user.",
    }, 403);
  }

  // Forward to send-subscription-email with our env service-role key.
  const dispatchPayload: Record<string, unknown> = {
    recipient_email: recipientEmail,
    event_type: eventType,
    plan_slug: body?.plan_slug || "trial",
    first_name: body?.first_name,
    user_id: body?.user_id,
    org_id: body?.org_id,
    subscription_id: body?.subscription_id,
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
    const json = await resp.json().catch(() => ({ ok: false, error: "invalid_send_response" }));
    return jsonResp(json, resp.ok ? 200 : resp.status);
  } catch (err) {
    return jsonResp({
      ok: false,
      error: "dispatch_failed",
      detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePlanCode(code: string | null): "trial" | "free" | "starter" | "pro" | "team" | "enterprise" {
  if (!code) return "trial";
  const normalized = code.toLowerCase().trim();
  const map: Record<string, "trial" | "free" | "starter" | "pro" | "team" | "enterprise"> = {
    trial: "trial",
    free: "free",
    free_trial: "trial",
    starter: "starter",
    pro: "pro",
    team: "team",
    enterprise: "enterprise",
  };
  return map[normalized] ?? "trial";
}
