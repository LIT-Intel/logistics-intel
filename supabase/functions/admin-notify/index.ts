// admin-notify — single notification spine for the founder feed.
//
// Public POST endpoint (verify_jwt: false). Authentication is enforced
// via a bearer token (LIT_ADMIN_NOTIFY_SECRET) so only trusted server-
// side callers can fire notifications. Public clients can't reach it.
//
// Why a Supabase function and not the marketing-site sender:
//   - The marketing-site Vercel project owns its own RESEND_API_KEY +
//     env. When it's misconfigured, demo / signup notifications go
//     silent and we don't find out until someone complains.
//   - This function uses the SAME LIT_RESEND_API_KEY the campaign
//     dispatcher (send-campaign-email) uses, so one credential covers
//     both transactional notifications and outbound marketing.
//   - It writes every attempt into lit_outreach_history so the admin
//     dashboard can surface "you missed 3 notifications today" instead
//     of failing in a log nobody reads.
//
// Body:
//   {
//     "event": "demo_request" | "signup" | "affiliate_apply" | "test" | string,
//     "subject": "Required — email subject the founder sees",
//     "summary": "Required — one-line summary surfaced above details",
//     "details"?: Record<string, string|number|boolean|null>,
//     "cta_url"?: "Optional URL the email button points at",
//     "cta_label"?: "Optional button label (default: Open)"
//   }
//
// Header:
//   Authorization: Bearer <LIT_ADMIN_NOTIFY_SECRET>
//
// Returns: { ok, sent_to, message_id } on success;
//          { ok: false, error } on failure.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const NOTIFICATION_TO = "support@logisticintel.com";
const NOTIFICATION_CC = "vraymond@sparkfusiondigital.com";
const FROM_ADDRESS = "Logistic Intel Ops <ops@updates.logisticintel.com>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(args: {
  event: string;
  subject: string;
  summary: string;
  details?: Record<string, unknown>;
  cta_url?: string;
  cta_label?: string;
}): string {
  const rows = Object.entries(args.details || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;font-size:12px;color:#94a3b8;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td>
          <td style="padding:6px 0;font-size:14px;color:#0b1220;">${escapeHtml(String(v))}</td>
        </tr>`,
    )
    .join("");

  const cta = args.cta_url
    ? `<a href="${escapeHtml(args.cta_url)}" style="display:inline-block;margin-top:20px;background:linear-gradient(180deg,#3b82f6,#2563eb);color:#fff;font-weight:600;font-size:13px;text-decoration:none;padding:10px 18px;border-radius:8px;">${escapeHtml(args.cta_label || "Open")}</a>`
    : "";

  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0b1220;line-height:1.55;">
  <div style="background:#fff;border:1px solid #e5ebf5;border-radius:12px;padding:24px;box-shadow:0 2px 6px rgba(15,23,42,0.04);">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#2563eb;">${escapeHtml(args.event.replace(/_/g, " "))}</div>
    <h2 style="font-size:20px;font-weight:600;margin:8px 0 4px;">${escapeHtml(args.summary)}</h2>
    ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:18px;">${rows}</table>` : ""}
    ${cta}
  </div>
  <p style="font-size:11px;color:#94a3b8;margin:20px 4px 0;">Sent via admin-notify · Logistic Intel ops feed</p>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const adminSecret = Deno.env.get("LIT_ADMIN_NOTIFY_SECRET");
  const resendKey = Deno.env.get("LIT_RESEND_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!resendKey) return json({ ok: false, error: "resend_key_missing" }, 500);
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  // Bearer auth. The function MUST refuse anonymous traffic — this is a
  // founder-only notification path. If LIT_ADMIN_NOTIFY_SECRET is unset,
  // we fail closed.
  if (!adminSecret) return json({ ok: false, error: "admin_secret_unset" }, 500);
  const auth = req.headers.get("Authorization") || "";
  const expected = `Bearer ${adminSecret}`;
  if (auth !== expected) {
    console.warn("[admin-notify] auth failed");
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const event = String(body?.event || "").trim();
  const subject = String(body?.subject || "").trim();
  const summary = String(body?.summary || "").trim();
  if (!event || !subject || !summary) {
    return json({ ok: false, error: "missing_event_subject_or_summary" }, 400);
  }

  const html = renderHtml({
    event,
    subject,
    summary,
    details: body?.details,
    cta_url: typeof body?.cta_url === "string" ? body.cta_url : undefined,
    cta_label: typeof body?.cta_label === "string" ? body.cta_label : undefined,
  });

  let resendId: string | null = null;
  let resendError: string | null = null;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [NOTIFICATION_TO],
        cc: [NOTIFICATION_CC],
        subject,
        html,
        reply_to: NOTIFICATION_CC,
      }),
    });
    const respJson: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      resendError = `resend_${resp.status}:${respJson?.message || respJson?.name || ""}`.slice(0, 500);
      console.error("[admin-notify] resend non-2xx", resendError);
    } else {
      resendId = respJson?.id ?? null;
    }
  } catch (e) {
    resendError = e instanceof Error ? e.message.slice(0, 500) : "resend_threw";
    console.error("[admin-notify] resend threw", resendError);
  }

  // Audit row in lit_outreach_history so admin dashboard can surface
  // "founder notification failures." Best-effort — if this fails we
  // still return the resend result.
  try {
    const admin = createClient(supabaseUrl, serviceKey);
    await admin.from("lit_outreach_history").insert({
      user_id: null,
      campaign_id: null,
      contact_id: null,
      channel: "email",
      event_type: resendError ? "admin_notify_failed" : "admin_notify_sent",
      status: resendError ? "failed" : "sent",
      subject,
      message_id: resendId,
      provider: "resend",
      occurred_at: new Date().toISOString(),
      failed_at: resendError ? new Date().toISOString() : null,
      error_message: resendError,
      metadata: {
        admin_notify_event: event,
        recipient: NOTIFICATION_TO,
        cc: NOTIFICATION_CC,
        summary,
        details: body?.details ?? null,
      },
    });
  } catch (auditErr) {
    console.error("[admin-notify] audit insert threw", auditErr);
  }

  if (resendError) return json({ ok: false, error: resendError }, 502);
  return json({ ok: true, sent_to: NOTIFICATION_TO, cc: NOTIFICATION_CC, message_id: resendId });
});
