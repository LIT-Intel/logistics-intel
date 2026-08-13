// send-demo-invite — post-demo follow-up from a member of the
// internal (LIT) org to a prospect, with full-funnel tracking.
//
// CTA order (CEO decision 2026-08-13): a "demo invite" goes out AFTER
// we've already spoken with the prospect and shown them the product —
// so the PRIMARY CTA is the app signup link; the 15-min walkthrough
// (book-a-demo) is the secondary text link for anyone who wants a
// second pass on their own lanes.
//
// Auth: user JWT; caller must belong to an organization with
// is_internal = true (the LIT workspace). Sends a branded personal
// invitation via Resend (from the inviter's own @logisticintel.com
// address when available), then records the invite in lit_demo_invites
// with the Resend email id — the funnel triggers resolve delivered/
// opened/clicked/signed_up/trialing/upgraded from there automatically.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("LIT_RESEND_API_KEY") || "";
const FROM = Deno.env.get("LIT_SALES_FROM") || "Gabriel from LIT <sales@logisticintel.com>";
const REPLY_TO = Deno.env.get("LIT_SALES_REPLY_TO") || "sales@logisticintel.com";
const SITE = "https://logisticintel.com";
// Real app signup (marketing /signup is a rewrite-proxy of this route).
const SIGNUP_URL = "https://app.logisticintel.com/signup";
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

function buildEmail(opts: {
  prospectName: string;
  senderName: string;
  note: string | null;
}): { subject: string; html: string; text: string } {
  const hi = opts.prospectName ? `Hi ${esc(opts.prospectName)},` : "Hi there,";
  const noteBlock = opts.note
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:0 0 18px 0;"><tr><td style="background:#EFF6FF;border:1px solid #DBEAFE;border-left:3px solid #2563EB;border-radius:10px;padding:14px 18px;font-family:${FONT};font-size:15px;line-height:1.6;color:#0F172A;font-style:italic;">&ldquo;${esc(opts.note)}&rdquo;<div style="margin-top:6px;font-style:normal;font-size:12.5px;color:#64748B;">— ${esc(opts.senderName)}</div></td></tr></table>`
    : "";
  const bodyHtml = `<p style="margin:0 0 18px 0;font-family:${FONT};font-size:16px;line-height:1.65;color:#0F172A;">${hi}</p><p style="margin:0 0 18px 0;font-family:${FONT};font-size:16px;line-height:1.65;color:#0F172A;">Great talking with you — as promised, here's your access to Logistic Intel. Everything ${esc(opts.senderName)} walked you through is ready to run on your own lanes the moment you sign up.</p>${noteBlock}<p style="margin:0 0 8px 0;font-family:${FONT};font-size:16px;line-height:1.65;color:#0F172A;">From your first session you can:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 18px 0;"><tr><td valign="top" style="padding:5px 12px 5px 0;font-family:${FONT};font-size:15px;color:#2563EB;font-weight:700;">✓</td><td valign="top" style="padding:5px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:#0F172A;">See every active shipper on the lanes you sell into, ranked by volume</td></tr><tr><td valign="top" style="padding:5px 12px 5px 0;font-family:${FONT};font-size:15px;color:#2563EB;font-weight:700;">✓</td><td valign="top" style="padding:5px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:#0F172A;">Reach the verified logistics decision-maker at each one</td></tr><tr><td valign="top" style="padding:5px 12px 5px 0;font-family:${FONT};font-size:15px;color:#2563EB;font-weight:700;">✓</td><td valign="top" style="padding:5px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:#0F172A;">Size what each account likely spends on freight — before you ever call</td></tr></table>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Your LIT access</title></head><body style="margin:0;padding:0;background-color:#F1F5F9;color:#0F172A;font-family:${FONT};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F1F5F9" style="border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#FFFFFF" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);"><tr><td bgcolor="#0A1024" style="background-color:#0A1024;padding:28px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding-right:13px;"><img src="${ICON}" width="38" height="38" alt="LIT" style="display:block;width:38px;height:38px;border-radius:9px;border:0;outline:none;" /></td><td valign="middle" style="font-family:${FONT};font-size:21px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">Logistic Intel</td></tr></table></td></tr><tr><td style="padding:34px 40px 4px 40px;"><h1 style="margin:0 0 8px 0;font-family:${FONT};font-size:26px;font-weight:800;color:#0F172A;line-height:1.2;letter-spacing:-0.02em;">Great talking with you — here's your access.</h1></td></tr><tr><td style="padding:22px 40px 8px 40px;">${bodyHtml}</td></tr><tr><td style="padding:10px 40px 10px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="#2563EB" valign="middle" style="background-color:#2563EB;border-radius:10px;border-bottom:2px solid #1E40AF;"><a href="${SIGNUP_URL}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;line-height:1;">Create your free account →</a></td></tr></table></td></tr><tr><td style="padding:0 40px 32px 40px;font-family:${FONT};font-size:13.5px;line-height:1.6;color:#64748B;">Unlimited shipper search, no credit card. Want a second pass on your lanes together? <a href="${SITE}/book-a-demo" style="color:#2563EB;text-decoration:underline;">Book a 15-min walkthrough</a>.</td></tr><tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E2E8F0;font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:22px 40px 30px 40px;font-family:${FONT};font-size:12.5px;line-height:1.7;color:#94A3B8;"><span style="color:#475569;font-weight:600;">Logistic Intel</span> — freight revenue intelligence for logistics sales teams.<br/>This invitation was sent personally by ${esc(opts.senderName)}. Reply anytime — a human reads it.</td></tr></table></td></tr></table></body></html>`;

  const text = [
    opts.prospectName ? `Hi ${opts.prospectName},` : "Hi there,",
    "",
    `Great talking with you — as promised, here's your access to Logistic Intel. Everything ${opts.senderName} walked you through is ready to run on your own lanes the moment you sign up.`,
    opts.note ? `\n"${opts.note}" — ${opts.senderName}` : "",
    "",
    "From your first session you can:",
    "  - See every active shipper on the lanes you sell into, ranked by volume",
    "  - Reach the verified logistics decision-maker at each one",
    "  - Size what each account likely spends on freight — before you ever call",
    "",
    `Create your free account (unlimited search, no card): ${SIGNUP_URL}`,
    `Want a second pass on your lanes together? Book a 15-min walkthrough: ${SITE}/book-a-demo`,
    "",
    "— Logistic Intel",
  ].filter(Boolean).join("\n");

  return { subject: "Great talking with you — your LIT access is ready", html, text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);
    const { data: { user }, error: userErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

    // Internal-org gate: only members of LIT's own workspace(s) may send.
    const { data: internalMembership } = await admin
      .from("org_members")
      .select("org_id, organizations!inner(is_internal)")
      .eq("user_id", user.id)
      .eq("organizations.is_internal", true)
      .limit(1)
      .maybeSingle();
    if (!internalMembership) {
      return json({ ok: false, error: "Demo invites are limited to the LIT team.", code: "NOT_INTERNAL" }, 403);
    }

    if (!RESEND_KEY) return json({ ok: false, error: "Email not configured", code: "RESEND_KEY_MISSING" }, 503);

    const body = await req.json().catch(() => ({}));
    const prospectEmail = String(body.email || "").trim().toLowerCase();
    const prospectName = String(body.name || "").trim();
    const prospectCompany = String(body.company || "").trim();
    const note = String(body.note || "").trim() || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospectEmail)) {
      return json({ ok: false, error: "Valid prospect email required", code: "INVALID_EMAIL" }, 400);
    }

    const senderName =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.email || "The LIT team").split("@")[0];

    const { subject, html, text } = buildEmail({
      prospectName: prospectName.split(" ")[0] || "",
      senderName,
      note,
    });

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Owner decision 2026-08-12: invites come FROM the inviter, not a
        // generic sales@ — any @logisticintel.com sender is covered by the
        // Resend domain verification. Others fall back to the sales identity;
        // replies always route to the actual inviter.
        from: String(user.email || "").toLowerCase().endsWith("@logisticintel.com")
          ? `${senderName} <${String(user.email).toLowerCase()}>`
          : FROM,
        to: [prospectEmail],
        reply_to: user.email || REPLY_TO,
        subject,
        html,
        text,
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

    const { data: invite, error: insErr } = await admin
      .from("lit_demo_invites")
      .insert({
        org_id: (internalMembership as any).org_id,
        sender_user_id: user.id,
        sender_email: user.email,
        prospect_email: prospectEmail,
        prospect_name: prospectName || null,
        prospect_company: prospectCompany || null,
        personal_note: note,
        resend_email_id: resendData?.id ?? null,
        status: "sent",
      })
      .select()
      .single();
    if (insErr) {
      console.error("[send-demo-invite] insert failed", insErr.message);
      // Email already went out — report success with a persistence warning.
      return json({ ok: true, sent: true, persisted: false, warning: insErr.message });
    }

    return json({ ok: true, sent: true, persisted: true, invite });
  } catch (e: any) {
    console.error("[send-demo-invite] error", e?.message || e);
    return json({ ok: false, error: e?.message || "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
});
