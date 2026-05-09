// subscription-email-cron v3 — expanded trial cadence.
// Daily sweep schedule:
//   Day 2: trial_day_2_activation (behavior-gated — skip if user is
//          already active in lit_activity_events)
//   Day 3: trial_day_3_founder_note (always)
//   Day 4: trial_tip_pulse_ai (always — "how top reps prep for calls")
//   Day 6: trial_tip_contact_enrichment (always — "better contacts")
//   Day 8: trial_tip_revenue_opportunity (always — "lead with $")
//   Day 12: trial_ending_soon (always)
//
// Auth: NO bearer auth (matches lit-send-campaign-email-tick pattern).
// Function uses its own SUPABASE_SERVICE_ROLE_KEY env to call
// send-subscription-email (which IS strict about auth) internally.
// Bounded blast radius: only sends to known users at known event types.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const ALLOWED_EVENTS = new Set([
  "trial_welcome",
  "trial_day_2_activation",
  "trial_day_3_founder_note",
  "trial_tip_pulse_ai",
  "trial_tip_contact_enrichment",
  "trial_tip_revenue_opportunity",
  "trial_ending_soon",
  "paid_plan_welcome",
  "upgrade_confirmation",
  "payment_failed",
  "cancellation_confirmation",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);
  const selfUrl = `${supabaseUrl}/functions/v1/send-subscription-email`;

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  if (body?.trigger_one_off === true) {
    return await handleOneOffTrigger(db, selfUrl, serviceRoleKey, body);
  }

  // Daily sweep — query trial subscriptions at each day-window.
  // started_at is the trial start date; window is calendar-day-aware.
  function dayWindow(daysAgoStart: number, daysAgoEnd: number) {
    return {
      gte: new Date(Date.now() - daysAgoStart * 86400 * 1000).toISOString(),
      lte: new Date(Date.now() - daysAgoEnd * 86400 * 1000).toISOString(),
    };
  }

  const select = "id, user_id, organization_id, plan_code, started_at, trial_ends_at";
  const day2 = dayWindow(3, 2);
  const day3 = dayWindow(4, 3);
  const day4 = dayWindow(5, 4);
  const day6 = dayWindow(7, 6);
  const day8 = dayWindow(9, 8);

  const { data: day2c } = await db.from("subscriptions").select(select).eq("status", "trialing").gte("started_at", day2.gte).lte("started_at", day2.lte);
  const { data: day3c } = await db.from("subscriptions").select(select).eq("status", "trialing").gte("started_at", day3.gte).lte("started_at", day3.lte);
  const { data: day4c } = await db.from("subscriptions").select(select).eq("status", "trialing").gte("started_at", day4.gte).lte("started_at", day4.lte);
  const { data: day6c } = await db.from("subscriptions").select(select).eq("status", "trialing").gte("started_at", day6.gte).lte("started_at", day6.lte);
  const { data: day8c } = await db.from("subscriptions").select(select).eq("status", "trialing").gte("started_at", day8.gte).lte("started_at", day8.lte);
  const { data: day12c } = await db.from("subscriptions").select("id, user_id, organization_id, plan_code, trial_ends_at").eq("status", "trialing").gte("trial_ends_at", new Date().toISOString()).lte("trial_ends_at", new Date(Date.now() + 2 * 86400 * 1000).toISOString());

  async function getRecipientInfo(userId: string | null): Promise<{ email: string | null; firstName: string | null }> {
    if (!userId) return { email: null, firstName: null };
    const { data: profile } = await db.from("user_profiles").select("full_name").eq("user_id", userId).maybeSingle();
    const { data: authUser } = await db.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? null;
    const fullName = (profile as any)?.full_name ?? null;
    const firstName = fullName ? fullName.split(" ")[0] : null;
    return { email, firstName };
  }

  async function dispatchEmail(payload: Record<string, unknown>): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    try {
      const resp = await fetch(selfUrl, { method: "POST", headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return await resp.json().catch(() => ({ ok: false, error: "Invalid JSON from send-subscription-email" }));
    } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }

  const stats: Record<string, number> = { day_2: 0, day_3: 0, day_4: 0, day_6: 0, day_8: 0, day_12: 0, skipped_day_2_active: 0 };
  const errors: string[] = [];

  // Day 2 — behavior-gated
  for (const sub of (day2c ?? [])) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;
    if (sub.user_id && sub.started_at) {
      const { count } = await db.from("lit_activity_events").select("id", { count: "exact", head: true }).eq("user_id", sub.user_id).gte("created_at", sub.started_at);
      if ((count ?? 0) > 0) { stats.skipped_day_2_active++; continue; }
    }
    const r = await dispatchEmail({ user_id: sub.user_id, org_id: sub.organization_id, subscription_id: sub.id, recipient_email: email, first_name: firstName, plan_slug: normalizePlanCode(sub.plan_code), event_type: "trial_day_2_activation" });
    if (r.skipped) continue;
    if (r.ok) stats.day_2++; else errors.push(`day2 ${email}: ${r.error}`);
  }

  // Helper for day 3/4/6/8 (always-fire) sweeps
  async function fireSweep(candidates: any[], event_type: string, statKey: string) {
    for (const sub of candidates) {
      const { email, firstName } = await getRecipientInfo(sub.user_id);
      if (!email) continue;
      const r = await dispatchEmail({ user_id: sub.user_id, org_id: sub.organization_id, subscription_id: sub.id, recipient_email: email, first_name: firstName, plan_slug: normalizePlanCode(sub.plan_code), event_type });
      if (r.skipped) continue;
      if (r.ok) stats[statKey]++; else errors.push(`${event_type} ${email}: ${r.error}`);
    }
  }

  await fireSweep(day3c ?? [], "trial_day_3_founder_note", "day_3");
  await fireSweep(day4c ?? [], "trial_tip_pulse_ai", "day_4");
  await fireSweep(day6c ?? [], "trial_tip_contact_enrichment", "day_6");
  await fireSweep(day8c ?? [], "trial_tip_revenue_opportunity", "day_8");

  // Day 12 — trial ending
  for (const sub of (day12c ?? [])) {
    const { email, firstName } = await getRecipientInfo(sub.user_id);
    if (!email) continue;
    let trialEndsDate: string | undefined;
    if (sub.trial_ends_at) { try { trialEndsDate = new Date(sub.trial_ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric" }); } catch {} }
    const r = await dispatchEmail({ user_id: sub.user_id, org_id: sub.organization_id, subscription_id: sub.id, recipient_email: email, first_name: firstName, plan_slug: normalizePlanCode(sub.plan_code), event_type: "trial_ending_soon", trial_ends_date: trialEndsDate });
    if (r.skipped) continue;
    if (r.ok) stats.day_12++; else errors.push(`day12 ${email}: ${r.error}`);
  }

  return new Response(JSON.stringify({ ok: true, processed: stats, errors: errors.length ? errors : undefined }), { headers: { "Content-Type": "application/json" } });
});

async function handleOneOffTrigger(db: any, selfUrl: string, serviceRoleKey: string, body: any): Promise<Response> {
  const recipientEmail = String(body?.recipient_email || "").trim().toLowerCase();
  const eventType = String(body?.event_type || "").trim();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return jsonResp({ ok: false, error: "invalid_recipient_email" }, 400);
  if (!ALLOWED_EVENTS.has(eventType)) return jsonResp({ ok: false, error: "invalid_event_type", allowed: Array.from(ALLOWED_EVENTS) }, 400);
  let recipientKnown = false;
  try {
    const { data: profileMatch } = await db.from("user_profiles").select("user_id").eq("email", recipientEmail).maybeSingle();
    if (profileMatch) recipientKnown = true;
  } catch {}
  if (!recipientKnown && body?.user_id) {
    try {
      const { data: userById } = await db.auth.admin.getUserById(body.user_id);
      if (userById?.user?.email?.toLowerCase() === recipientEmail) recipientKnown = true;
    } catch {}
  }
  if (!recipientKnown) {
    const adminEmails = (Deno.env.get("SUPER_ADMIN_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.includes(recipientEmail)) recipientKnown = true;
    const litFounderEmails = ["vraymond@logisticintel.com", "vraymond83@gmail.com"];
    if (litFounderEmails.includes(recipientEmail)) recipientKnown = true;
  }
  if (!recipientKnown) return jsonResp({ ok: false, error: "recipient_not_known" }, 403);
  const dispatchPayload: Record<string, unknown> = {
    recipient_email: recipientEmail, event_type: eventType, plan_slug: body?.plan_slug || "free_trial",
    first_name: body?.first_name, user_id: body?.user_id, org_id: body?.org_id, subscription_id: body?.subscription_id,
    trial_ends_date: body?.trial_ends_date, previous_plan_name: body?.previous_plan_name,
    period_end: body?.period_end, plan_name: body?.plan_name,
    force: body?.force === true,
  };
  try {
    const resp = await fetch(selfUrl, { method: "POST", headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" }, body: JSON.stringify(dispatchPayload) });
    const json = await resp.json().catch(() => ({ ok: false, error: "invalid_send_response" }));
    return jsonResp(json, resp.ok ? 200 : resp.status);
  } catch (err) { return jsonResp({ ok: false, error: "dispatch_failed", detail: err instanceof Error ? err.message : String(err) }, 500); }
}

function jsonResp(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

function normalizePlanCode(code: string | null): "free_trial" | "starter" | "growth" | "scale" | "enterprise" {
  if (!code) return "free_trial";
  const n = code.toLowerCase().trim();
  const map: Record<string, "free_trial" | "starter" | "growth" | "scale" | "enterprise"> = {
    trial: "free_trial", free: "free_trial", free_trial: "free_trial",
    starter: "starter", pro: "growth", growth: "growth",
    team: "scale", scale: "scale", enterprise: "enterprise",
  };
  return map[n] ?? "free_trial";
}
