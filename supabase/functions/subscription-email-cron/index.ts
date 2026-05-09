// subscription-email-cron — daily cron handler for trial lifecycle emails.
//
// Called by pg_cron at 10:00 UTC daily via pg_net HTTP POST.
// Also safe to call manually with service-role auth.
//
// Auth: service-role only.
//
// Logic:
//   Day 2 candidates (behavior-gated): started_at between now()-3d and now()-2d
//     → skip if user has any lit_activity_events since started_at
//     → send trial_day_2_activation
//
//   Day 3 candidates: started_at between now()-4d and now()-3d
//     → always send trial_day_3_founder_note (no behavioral gate)
//
//   Day 12 candidates: trial_ends_at between now() and now()+2d
//     → always send trial_ending_soon
//
// The send-subscription-email function handles idempotency, so re-running
// the cron is safe — duplicate sends are blocked at the DB level.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth: service-role only
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.slice(7).trim() !== serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const db = createClient(supabaseUrl, serviceRoleKey);
  const selfUrl = `${supabaseUrl}/functions/v1/send-subscription-email`;

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
