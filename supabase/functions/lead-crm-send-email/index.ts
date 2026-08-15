// lead-crm-send-email — Lead-CRM Phase 3 one-off email to a lead.
//
// A team member, working a lead in the internal Lead-CRM drawer, sends a single
// branded email to the lead's email address. This REUSES the app's outbound
// stack rather than building a new mailer:
//   - Resend via LIT_RESEND_API_KEY + the verified from-domain (same as
//     send-campaign-email / send-demo-invite).
//   - Suppression respected via the lit_email_suppression_status RPC (the exact
//     check send-campaign-email uses: unsubscribed / bounced / complained).
//   - The send is recorded to lit_outreach_history (channel='email',
//     event_type='sent', provider='resend') so the Resend webhook can attach
//     opens/clicks by message_id — the same lifecycle table campaigns use.
//   - The touch is logged to lit_lead_activity via lit_leadcrm_log_email_sent so
//     it surfaces in the lead timeline immediately (kind='email_sent').
//
// Auth: user JWT (verify_jwt=true — NOT in .verify-jwt-manifest no_verify_jwt).
// Additionally gated on is_lead_crm_member(auth.uid()) server-side.
//
// Request:  POST { lead_id: uuid, subject: string, body: string }
//           body is plain text / light HTML entered by the rep; we wrap it in a
//           minimal branded shell + escape when it's plain text.
// Response: { ok, sent, message_id } | { ok:false, error, code }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("LIT_RESEND_API_KEY") || "";
// Same verified-domain identity family used by send-demo-invite.
const FROM = Deno.env.get("LIT_SALES_FROM") || "Gabriel from LIT <sales@logisticintel.com>";
const REPLY_TO = Deno.env.get("LIT_SALES_REPLY_TO") || "sales@logisticintel.com";
const ICON = "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Wrap the rep's message in the LIT branded shell. If the body looks like plain
// text (no tags), escape + convert newlines to <br>; otherwise trust it as HTML.
function brandedHtml(subject: string, rawBody: string, senderName: string): string {
  const looksHtml = /<[a-z][\s\S]*>/i.test(rawBody);
  const inner = looksHtml
    ? rawBody
    : esc(rawBody).replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(subject)}</title></head><body style="margin:0;padding:0;background-color:#F1F5F9;color:#0F172A;font-family:${FONT};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F1F5F9" style="border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#FFFFFF" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);"><tr><td bgcolor="#0A1024" style="background-color:#0A1024;padding:24px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:13px;"><img src="${ICON}" width="34" height="34" alt="LIT" style="display:block;width:34px;height:34px;border-radius:9px;border:0;" /></td><td valign="middle" style="font-family:${FONT};font-size:19px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">Logistic Intel</td></tr></table></td></tr><tr><td style="padding:30px 40px 8px 40px;font-family:${FONT};font-size:16px;line-height:1.65;color:#0F172A;">${inner}</td></tr><tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E2E8F0;font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:20px 40px 30px 40px;font-family:${FONT};font-size:12.5px;line-height:1.7;color:#94A3B8;"><span style="color:#475569;font-weight:600;">Logistic Intel</span> — freight revenue intelligence for logistics sales teams.<br/>Sent personally by ${esc(senderName)}. Reply anytime — a human reads it.</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // User-scoped client so RPCs see auth.uid() (membership gate runs there).
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

    // Membership gate (server-authoritative).
    const { data: access } = await userClient.rpc("lit_my_lead_crm_access");
    const accessRow = Array.isArray(access) ? access[0] : access;
    if (!accessRow || accessRow.is_member !== true) {
      return json({ ok: false, error: "Lead-CRM access required", code: "NOT_MEMBER" }, 403);
    }

    if (!RESEND_KEY) return json({ ok: false, error: "Email not configured", code: "RESEND_KEY_MISSING" }, 503);

    const body = await req.json().catch(() => ({}));
    const leadId = String(body.lead_id || "").trim();
    const subject = String(body.subject || "").trim();
    const messageBody = String(body.body || "").trim();
    if (!leadId) return json({ ok: false, error: "lead_id required", code: "BAD_REQUEST" }, 400);
    if (!subject) return json({ ok: false, error: "Subject required", code: "SUBJECT_REQUIRED" }, 400);
    if (!messageBody) return json({ ok: false, error: "Message body required", code: "BODY_REQUIRED" }, 400);

    // Resolve the lead's email via the gated RPC (also returns suppression state).
    const { data: emailInfo, error: emailErr } = await userClient.rpc("lit_leadcrm_lead_email", {
      p_lead_id: leadId,
    });
    if (emailErr) return json({ ok: false, error: emailErr.message, code: "LOOKUP_FAILED" }, 400);
    const info = emailInfo as any;
    if (!info || info.ok === false) return json({ ok: false, error: "Lead not found", code: "NOT_FOUND" }, 404);
    if (!info.has_email || !info.email) {
      return json({ ok: false, error: "Enrich to get an email first.", code: "NO_EMAIL" }, 422);
    }
    if (info.suppressed) {
      return json({
        ok: false,
        error: `Cannot send — recipient is ${info.suppressed_reason || "suppressed"}.`,
        code: "SUPPRESSED",
      }, 422);
    }

    const to = String(info.email).toLowerCase();
    const senderName =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.email || "The LIT team").split("@")[0];
    const from = String(user.email || "").toLowerCase().endsWith("@logisticintel.com")
      ? `${senderName} <${String(user.email).toLowerCase()}>`
      : FROM;

    const html = brandedHtml(subject, messageBody, senderName);

    // Send via Resend (same endpoint + key as the rest of the app).
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: user.email || REPLY_TO,
        subject,
        html,
        text: messageBody,
      }),
    });
    const resendData: any = await resendResp.json().catch(() => null);
    if (!resendResp.ok) {
      return json({
        ok: false,
        error: resendData?.message || `Send failed (${resendResp.status})`,
        code: "SEND_FAILED",
      }, 502);
    }
    const messageId: string | null = resendData?.id ?? null;

    // Record to lit_outreach_history so Resend open/click webhooks attach by
    // message_id (mirrors send-campaign-email's lifecycle row). Service-role
    // insert; best-effort — the email already went out.
    try {
      await admin.from("lit_outreach_history").insert({
        user_id: user.id,
        channel: "email",
        event_type: "sent",
        status: "sent",
        provider: "resend",
        subject,
        message_id: messageId,
        provider_event_id: messageId,
        occurred_at: new Date().toISOString(),
        metadata: {
          recipient_email: to,
          source: "lead_crm_oneoff",
          lead_id: leadId,
        },
      });
    } catch (e) {
      console.error("[lead-crm-send-email] outreach_history insert failed", (e as any)?.message || e);
    }

    // Log to the lead timeline (kind='email_sent', source='email').
    const { error: logErr } = await userClient.rpc("lit_leadcrm_log_email_sent", {
      p_lead_id: leadId,
      p_subject: subject,
      p_preview: messageBody,
      p_message_id: messageId,
      p_provider: "resend",
    });
    if (logErr) {
      console.error("[lead-crm-send-email] timeline log failed", logErr.message);
      return json({ ok: true, sent: true, logged: false, message_id: messageId, warning: logErr.message });
    }

    return json({ ok: true, sent: true, logged: true, message_id: messageId });
  } catch (e: any) {
    console.error("[lead-crm-send-email] error", e?.message || e);
    return json({ ok: false, error: e?.message || "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
});
