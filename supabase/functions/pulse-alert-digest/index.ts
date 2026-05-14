// pulse-alert-digest — weekly Monday email digest.
// Runs hourly Mon 09–17 UTC; idempotent via digest_sent_at stamp.
//
// Vendor-neutral copy: NEVER renders payload.matched_reasons (those strings
// can leak data-source vendor names like Apollo / ImportYeti). The only
// permitted vendor name in the rendered email is "Freightos", which is the
// legally-required attribution for the Freightos Baltic Index benchmarks.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

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
    .select("id, email, first_name")
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

    const html = renderDigestHtml(profile, filtered, prefs.unsubscribe_token || "");
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
// HTML render — mirrors docs/mockups/pulse-digest-sample.html structurally.
// ---------------------------------------------------------------------------

function renderDigestHtml(profile: any, alerts: any[], unsubscribeToken: string): string {
  const buckets = {
    volume: alerts.filter(a => a.alert_type === "volume"),
    shipment: alerts.filter(a => a.alert_type === "shipment"),
    lane: alerts.filter(a => a.alert_type === "lane"),
    benchmark: alerts.filter(a => a.alert_type === "benchmark"),
    baseline: alerts.filter(a => a.alert_type === "baseline"),
  };
  const firstName = profile.first_name || "there";
  const unsubUrl = `https://www.logisticintel.com/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return buildDigestHtml({ firstName, buckets, unsubUrl, dateLabel, totalCount: alerts.length });
}

interface DigestArgs {
  firstName: string;
  buckets: {
    volume: any[];
    shipment: any[];
    lane: any[];
    benchmark: any[];
    baseline: any[];
  };
  unsubUrl: string;
  dateLabel: string;
  totalCount: number;
}

function buildDigestHtml(args: DigestArgs): string {
  const { firstName, buckets, unsubUrl, dateLabel, totalCount } = args;

  const safeFirst = htmlEscape(firstName);
  const safeDate = htmlEscape(dateLabel);

  const sections: string[] = [];

  if (buckets.volume.length > 0) {
    sections.push(renderSection({
      label: `VOLUME ALERTS · ${buckets.volume.length}`,
      labelColor: "#3B82F6",
      rows: buckets.volume.map(renderVolumeRow),
    }));
  }

  if (buckets.shipment.length > 0) {
    sections.push(renderSection({
      label: `SHIPMENT ACTIVITY · ${buckets.shipment.length}`,
      labelColor: "#0EA5E9",
      rows: buckets.shipment.map(renderShipmentRow),
    }));
  }

  if (buckets.lane.length > 0) {
    sections.push(renderSection({
      label: `NEW TRADE LANES · ${buckets.lane.length}`,
      labelColor: "#8B5CF6",
      rows: buckets.lane.map(renderLaneRow),
    }));
  }

  if (buckets.baseline.length > 0) {
    sections.push(renderSection({
      label: `BASELINE SHIFTS · ${buckets.baseline.length}`,
      labelColor: "#F59E0B",
      rows: buckets.baseline.map(renderBaselineRow),
    }));
  }

  if (buckets.benchmark.length > 0) {
    sections.push(renderSection({
      label: `BENCHMARK RATE MOVERS · ${buckets.benchmark.length}`,
      labelColor: "#0891B2",
      rows: buckets.benchmark.map(renderBenchmarkRow),
    }));
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Pulse Digest — Logistic Intel</title>
</head>
<body style="margin:0; padding:0; background:#F8FAFC; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background:#ffffff; border-radius:14px; box-shadow:0 4px 16px rgba(15,23,42,0.06); overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%); padding:24px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <div style="display:inline-block; width:32px; height:32px; background:radial-gradient(circle at 30% 30%, rgba(0,240,255,0.32), transparent 65%), linear-gradient(135deg,#0F172A 0%,#1E293B 100%); border-radius:8px; vertical-align:middle; text-align:center; line-height:32px; color:#00F0FF; font-weight:bold;">L</div>
                  <span style="color:#ffffff; font-size:18px; font-weight:bold; margin-left:10px; vertical-align:middle;">Logistic Intel</span>
                </td>
                <td align="right" style="color:#94A3B8; font-size:12px;">Weekly digest · ${safeDate}</td>
              </tr>
            </table>
            <h1 style="color:#ffffff; font-size:24px; line-height:30px; margin:18px 0 4px 0;">Hi ${safeFirst} — ${totalCount} ${totalCount === 1 ? "signal" : "signals"} across your saved companies this week</h1>
            <p style="color:#CBD5E1; font-size:14px; line-height:20px; margin:0;">Volume changes, new shipment activity, and trade-lane shifts from the past 14 days.</p>
          </td>
        </tr>

        ${sections.join("\n")}

        <!-- Footer -->
        <tr>
          <td style="padding:24px 28px; background:#F8FAFC; border-top:1px solid #E2E8F0;">
            <p style="font-size:12px; line-height:18px; color:#64748B; margin:0 0 8px 0;">Logistic Intel · Atlanta, GA</p>
            <p style="font-size:11px; line-height:16px; color:#94A3B8; margin:0;">
              You're receiving this weekly digest because you have saved companies in your Pulse Library.
              <a href="https://app.logisticintel.com/app/notifications" style="color:#3B82F6;">Manage preferences</a> ·
              <a href="${htmlEscape(unsubUrl)}" style="color:#3B82F6;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function renderSection(opts: { label: string; labelColor: string; rows: string[] }): string {
  // Stitch row HTMLs together inside the bordered card. Each rendered row
  // already contains its own border-bottom for separation except the last.
  const rowCount = opts.rows.length;
  const stitched = opts.rows.map((row, i) => {
    const isLast = i === rowCount - 1;
    return `
              <tr>
                <td style="padding:14px 16px;${isLast ? "" : " border-bottom:1px solid #F1F5F9;"}">
                  ${row}
                </td>
              </tr>`;
  }).join("");

  return `
        <tr>
          <td style="padding:16px 28px 8px 28px;">
            <div style="display:inline-block; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:${opts.labelColor};">${htmlEscape(opts.label)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 16px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E2E8F0; border-radius:10px;">${stitched}
            </table>
          </td>
        </tr>`;
}

// ---------------------------------------------------------------------------
// Row renderers — ONLY structured payload fields. NEVER matched_reasons.
// ---------------------------------------------------------------------------

function renderVolumeRow(alert: any): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const before = formatNum(p.before);
  const after = formatNum(p.after);
  const pctStr = formatPct(p.pct_delta);
  const pctColor = (typeof p.pct_delta === "number" && p.pct_delta < 0) ? "#DC2626" : "#16A34A";
  const sevTag = renderSeverity(alert.severity);
  const locPart = loc ? `${loc} · ` : "";
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${locPart}${before} → ${after} shipments · <span style="color:${pctColor}; font-weight:bold;">${pctStr}</span>${sevTag}</div>
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderShipmentRow(alert: any): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const newCount = formatNum(p.new_shipments ?? p.after ?? p.abs_delta);
  const sevTag = renderSeverity(alert.severity);
  const locPart = loc ? `${loc} · ` : "";
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${locPart}<strong style="color:#0F172A;">${newCount}</strong> new shipments in the past 14 days${sevTag}</div>
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderLaneRow(alert: any): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const origin = htmlEscape(p.origin || p.lane_origin || "new origin");
  const dest = htmlEscape(p.destination || p.lane_destination || p.destination_city || "destination");
  const newCount = formatNum(p.new_shipments ?? p.after ?? p.abs_delta);
  const sevTag = renderSeverity(alert.severity);
  const prefix = loc ? `${loc} started shipping from ` : "started shipping from ";
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${prefix}<strong style="color:#0F172A;">${origin} → ${dest}</strong> · ${newCount} new shipments${sevTag}</div>
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderBaselineRow(alert: any): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const before = formatNum(p.before);
  const after = formatNum(p.after);
  const pctStr = formatPct(p.pct_delta);
  const sevTag = renderSeverity(alert.severity);
  const locPart = loc ? `${loc} · ` : "";
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${locPart}Baseline shift · ${before} → ${after} shipments · <span style="color:#0F172A; font-weight:bold;">${pctStr}</span>${sevTag}</div>
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderBenchmarkRow(alert: any): string {
  const p = alert.payload || {};
  const indexCode = htmlEscape(p.index_code || p.code || "FBX");
  const lane = htmlEscape(p.lane || p.lane_name || "");
  const title = lane ? `${indexCode} · ${lane}` : indexCode;
  const before = formatMoney(p.before);
  const after = formatMoney(p.after);
  const unit = htmlEscape(p.unit || "per 40HC");
  const pctStr = formatPct(p.pct_delta);
  const pctColor = (typeof p.pct_delta === "number" && p.pct_delta < 0) ? "#16A34A" : "#DC2626";
  // Freightos attribution is MANDATORY for benchmark rows (legal ToS).
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${title}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${before} → ${after} ${unit} · <span style="color:${pctColor}; font-weight:bold;">${pctStr}</span> WoW</div>
                  <div style="font-size:11px; color:#94A3B8; margin-top:6px;">Source: <a href="https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/" style="color:#94A3B8; text-decoration:underline;">Freightos Baltic Index</a></div>`;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatLocation(payload: any): string {
  const city = payload?.city ? String(payload.city).trim() : "";
  const state = payload?.state ? String(payload.state).trim() : "";
  if (city && state) return htmlEscape(`${city}, ${state}`);
  if (city) return htmlEscape(city);
  if (state) return htmlEscape(state);
  return "";
}

function formatNum(n: any): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return htmlEscape(Math.round(n).toLocaleString("en-US"));
}

function formatMoney(n: any): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return htmlEscape(`$${Math.round(n).toLocaleString("en-US")}`);
}

function formatPct(n: any): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return htmlEscape(`${sign}${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`);
}

function renderSeverity(sev: any): string {
  if (sev === "critical") return ` · <span style="color:#DC2626; font-weight:bold;">HIGH</span>`;
  if (sev === "warning") return ``;
  return ``;
}

function htmlEscape(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
