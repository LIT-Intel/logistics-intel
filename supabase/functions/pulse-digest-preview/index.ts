// pulse-digest-preview — dry-run digest renderer for the settings panel's
// "Preview my next digest" button.
//
// Auth: user JWT (NOT cron-auth). Caller is the logged-in user clicking the
// preview button in the dashboard notifications/settings panel.
//
// Behavior:
//   1. Resolve caller's user_id from JWT
//   2. Pull that user's alerts from past 14 days
//   3. Load their lit_user_alert_prefs (defaults if missing)
//   4. Filter alerts by their prefs (same rules as pulse-alert-digest)
//   5. Render HTML via the shared renderDigestHtml() so what the user sees
//      in the preview is BYTE-IDENTICAL to what they'd receive Monday morning
//   6. Return JSON { ok, html, alert_count } so the frontend can iframe it
//      via srcDoc

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { renderDigestHtml } from "../_shared/digest_render.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_token" }, 401);

  // Resolve caller's user from JWT via service-role client.
  const supaAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userResp, error: userErr } = await supaAuth.auth.getUser(token);
  if (userErr || !userResp?.user?.id) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const userId = userResp.user.id;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Pull this user's alerts from past 14d. Unlike the cron digest, we DON'T
  // filter on digest_sent_at — the preview shows what the next digest would
  // look like, including alerts that have already been sent recently.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: alerts, error: alertsErr } = await supabase
    .from("lit_pulse_alerts")
    .select("id, alert_type, severity, payload, created_at")
    .eq("user_id", userId)
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: false });

  if (alertsErr) {
    console.error("[pulse-digest-preview] alerts query failed", alertsErr);
    return json({ ok: false, error: "alerts_query_failed" }, 500);
  }

  // Load prefs (with sane defaults if the row doesn't exist yet).
  const { data: prefsRow } = await supabase
    .from("lit_user_alert_prefs")
    .select("volume_alerts, shipment_alerts, lane_alerts, benchmark_alerts, paused_until, unsubscribe_token")
    .eq("user_id", userId)
    .maybeSingle();

  const prefs = prefsRow || {
    volume_alerts: true,
    shipment_alerts: true,
    lane_alerts: true,
    benchmark_alerts: false,
    paused_until: null,
    unsubscribe_token: "",
  };

  // Apply the same per-bucket filter the cron digest uses.
  const filtered = (alerts || []).filter((a: any) =>
    (a.alert_type === "volume"    && prefs.volume_alerts) ||
    (a.alert_type === "shipment"  && prefs.shipment_alerts) ||
    (a.alert_type === "lane"      && prefs.lane_alerts) ||
    (a.alert_type === "benchmark" && prefs.benchmark_alerts) ||
    (a.alert_type === "baseline")
  );

  // Pull full_name for the salutation (we derive the first token).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const html = renderDigestHtml({
    firstName: (profile?.full_name || "").split(/\s+/)[0] || "there",
    alerts: filtered.map((a: any) => ({
      alert_type: a.alert_type,
      severity: a.severity,
      payload: a.payload || {},
    })),
    unsubscribeToken: prefs.unsubscribe_token || "",
  });

  return json({ ok: true, html, alert_count: filtered.length });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
