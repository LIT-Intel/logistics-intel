// pulse-digest-draft-send — one-shot founder review utility.
//
// Sends a single representative weekly digest email to a specified address,
// using synthetic alerts so we don't pollute lit_pulse_alerts. Auth via the
// shared X-Internal-Cron header (LIT_CRON_SECRET). Not scheduled; not exposed
// in any UI. Manual invocation only.
//
// Body params:
//   to              required string — destination email
//   first_name      optional string — used in salutation (default "there")
//   subject_prefix  optional string — prepends to subject, e.g. "[DRAFT] "
//
// HTML render comes from the same shared renderer as the live cron digest,
// so what you see in the draft is byte-identical to what subscribers receive.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { renderDigestHtml } from "../_shared/digest_render.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("PULSE_DIGEST_FROM_EMAIL") || "Pulse <pulse@logisticintel.com>";

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY not set", { status: 500 });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* allow empty body */ }
  const to = String(body?.to || "").trim();
  if (!to) return json({ ok: false, error: "missing_to" }, 400);

  const firstName = String(body?.first_name || "there");
  const subjectPrefix = String(body?.subject_prefix || "");

  const alerts = sampleAlerts();
  const html = renderDigestHtml({
    firstName,
    alerts,
    unsubscribeToken: "DRAFT-PREVIEW-TOKEN",
  });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject: `${subjectPrefix}Your weekly Pulse digest`,
      html,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return json({ ok: false, error: `resend_${resp.status}`, detail: text.slice(0, 300) }, 502);
  }

  const out = await resp.json().catch(() => ({}));
  return json({ ok: true, to, resend_id: out?.id || null, alert_count: alerts.length });
});

function sampleAlerts() {
  return [
    {
      alert_type: "volume" as const,
      severity: "critical",
      payload: {
        company_name: "Acme Logistics Co.",
        city: "Long Beach",
        state: "CA",
        before: 42,
        after: 78,
        pct_delta: 0.857,
        pod: "USLGB",
        final_dest: "Chicago, IL",
        next_arrival_date: "2026-05-25T00:00:00Z",
        drayage_est_usd: 12600,
        drayage_est_low_usd: 9450,
        drayage_est_high_usd: 15750,
        drayage_container_count: 6,
      },
    },
    {
      alert_type: "volume" as const,
      severity: "warning",
      payload: {
        company_name: "Pacific Trade Imports",
        city: "Newark",
        state: "NJ",
        before: 31,
        after: 22,
        pct_delta: -0.29,
        pod: "USNYC",
        final_dest: "Columbus, OH",
        next_arrival_date: "2026-05-30T00:00:00Z",
        drayage_est_usd: 4200,
        drayage_est_low_usd: 3150,
        drayage_est_high_usd: 5250,
        drayage_container_count: 2,
      },
    },
    {
      alert_type: "shipment" as const,
      severity: "warning",
      payload: {
        company_name: "Northgate Industries",
        city: "Houston",
        state: "TX",
        new_shipments: 14,
      },
    },
    {
      alert_type: "lane" as const,
      severity: "warning",
      payload: {
        company_name: "Coastline Apparel Group",
        city: "Los Angeles",
        state: "CA",
        origin: "Ho Chi Minh City, VN",
        destination: "Long Beach, CA",
        new_shipments: 6,
      },
    },
    {
      alert_type: "benchmark" as const,
      severity: "warning",
      payload: {
        index_code: "FBX",
        lane: "China/East Asia → North America West Coast",
        before: 2480,
        after: 2890,
        pct_delta: 0.165,
        unit: "per 40HC",
      },
    },
  ];
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
