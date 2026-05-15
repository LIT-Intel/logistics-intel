// pulse-alert-digest — weekly Monday email digest.
// Runs hourly Mon 09–17 UTC; idempotent via digest_sent_at stamp.
//
// Vendor-neutral copy: HTML render lives in ../_shared/digest_render.ts,
// which is the single source of truth for the digest HTML (also used by
// pulse-digest-preview for the settings-panel dry-run button).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { renderDigestHtml } from "../_shared/digest_render.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("PULSE_DIGEST_FROM_EMAIL") || "Pulse <pulse@logisticintel.com>";

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY not set", { status: 500 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Pull unsent alerts from past 14d.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: alerts, error: alertsErr } = await supabase
    .from("lit_pulse_alerts")
    .select("id, user_id, source_company_key, alert_type, severity, payload, created_at, digest_send_attempts")
    .is("digest_sent_at", null)
    .gte("created_at", fourteenDaysAgo);
  if (alertsErr) {
    console.error("[pulse-alert-digest] alerts query failed", alertsErr);
    return new Response("alerts query failed", { status: 500 });
  }
  if (!alerts || alerts.length === 0) {
    return json({ ok: true, sent: 0, reason: "no_alerts" });
  }

  // 2. Group by user_id.
  const byUser = new Map<string, any[]>();
  for (const a of alerts) {
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
    byUser.get(a.user_id)!.push(a);
  }

  // 3. Fetch prefs + emails for these users.
  const userIds = Array.from(byUser.keys());
  const { data: prefsRows } = await supabase
    .from("lit_user_alert_prefs")
    .select("user_id, volume_alerts, shipment_alerts, lane_alerts, benchmark_alerts, paused_until, unsubscribe_token")
    .in("user_id", userIds);
  const prefsByUser = new Map((prefsRows || []).map((r: any) => [r.user_id, r]));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  const profileByUser = new Map((profiles || []).map((r: any) => [r.id, r]));

  // 4. For each user, filter, render, send.
  let sent = 0;
  const sentAlertIds: string[] = [];
  const suppressedAlertIds: string[] = [];

  for (const [userId, userAlerts] of byUser.entries()) {
    const prefs = prefsByUser.get(userId) || {
      volume_alerts: true, shipment_alerts: true, lane_alerts: true,
      benchmark_alerts: false, paused_until: null, unsubscribe_token: null,
    };
    const profile = profileByUser.get(userId);
    if (!profile?.email) continue;

    // Paused? Treat all this user's alerts as suppressed (stamp digest_sent_at
    // so they don't pile up forever, with an explanatory digest_last_error).
    if (prefs.paused_until && new Date(prefs.paused_until) > new Date()) {
      suppressedAlertIds.push(...userAlerts.map((a: any) => a.id));
      continue;
    }

    const filtered = userAlerts.filter((a: any) =>
      (a.alert_type === "volume"    && prefs.volume_alerts) ||
      (a.alert_type === "shipment"  && prefs.shipment_alerts) ||
      (a.alert_type === "lane"      && prefs.lane_alerts) ||
      (a.alert_type === "benchmark" && prefs.benchmark_alerts) ||
      (a.alert_type === "baseline")
    );

    const suppressed = userAlerts.filter((a: any) => !filtered.includes(a));
    suppressedAlertIds.push(...suppressed.map((a: any) => a.id));

    if (filtered.length === 0) continue;

    const html = renderDigestHtml({
      firstName: (profile.full_name || "").split(/\s+/)[0] || "there",
      alerts: filtered.map((a: any) => ({
        alert_type: a.alert_type,
        severity: a.severity,
        payload: a.payload || {},
      })),
      unsubscribeToken: prefs.unsubscribe_token || "",
    });
    const result = await sendResend(profile.email, html, prefs.unsubscribe_token || "");
    if (result.ok) {
      sentAlertIds.push(...filtered.map((a: any) => a.id));
      sent++;
    } else {
      // Bump send attempts.
      await supabase.from("lit_pulse_alerts").update({
        digest_send_attempts: (filtered[0].digest_send_attempts || 0) + 1,
        digest_last_error: result.error,
      }).in("id", filtered.map((a: any) => a.id));
    }
  }

  // 5. Mark sent + suppressed.
  if (sentAlertIds.length > 0) {
    await supabase.from("lit_pulse_alerts").update({ digest_sent_at: new Date().toISOString() }).in("id", sentAlertIds);
  }
  if (suppressedAlertIds.length > 0) {
    await supabase.from("lit_pulse_alerts").update({
      digest_sent_at: new Date().toISOString(),
      digest_last_error: "suppressed_by_user_pref",
    }).in("id", suppressedAlertIds);
  }

  return json({ ok: true, sent, alerts_sent: sentAlertIds.length, suppressed: suppressedAlertIds.length });
});

// ---------------------------------------------------------------------------
// Resend send + helpers
// ---------------------------------------------------------------------------

async function sendResend(toEmail: string, html: string, unsubscribeToken: string): Promise<{ ok: boolean; error?: string }> {
  const unsubUrl = `https://www.logisticintel.com/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: toEmail,
      subject: "Your weekly Pulse digest",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>, <mailto:unsubscribe@logisticintel.com>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (resp.ok) return { ok: true };
  const text = await resp.text().catch(() => "");
  return { ok: false, error: `resend_${resp.status}: ${text.slice(0, 200)}` };
}

function json(body: any) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
