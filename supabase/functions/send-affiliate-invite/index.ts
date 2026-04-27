// send-affiliate-invite
// Super-admin-only: creates a new affiliate invite (or resends an existing
// one) and emails the recipient via Resend.
//
// Body shapes:
//   create new: { email, name?, company?, tier_code?, note?, expires_in_days? }
//   resend:     { invite_id }
//
// Env vars (with fallbacks for compatibility with the existing
// send-org-invite function):
//   RESEND_API_KEY
//   RESEND_FROM_EMAIL || INVITE_FROM_EMAIL
//   APP_BASE_URL || INVITE_BASE_URL || APP_URL    (defaults to https://www.logisticintel.com)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL") ||
    Deno.env.get("INVITE_FROM_EMAIL") ||
    null;
  const appBaseUrl =
    Deno.env.get("APP_BASE_URL") ||
    Deno.env.get("INVITE_BASE_URL") ||
    Deno.env.get("APP_URL") ||
    "https://www.logisticintel.com";
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, resendApiKey, fromEmail, appBaseUrl };
}

async function authenticateSuperAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ ok: false, error: "Missing Authorization header" }, 401) };
  }
  const env = getEnv();
  const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  }
  const { data: adminRow } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!adminRow) {
    return { error: json({ ok: false, error: "Forbidden: super-admin access required" }, 403) };
  }
  return { user: data.user, adminClient, env };
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

// Secure URL-safe random token. 32 bytes -> 43 chars base64url.
function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface InviteRow {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  note: string | null;
  tier_code: string | null;
  token: string;
  expires_at: string;
  invited_by_user_id: string | null;
  invited_by_email: string | null;
  send_count: number;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmail(args: {
  inviteUrl: string;
  recipientName: string | null;
  invitedByEmail: string | null;
  note: string | null;
  appBaseUrl: string;
}) {
  const greeting = args.recipientName ? `Hi ${escapeHtml(args.recipientName)},` : "Hi,";
  const fromLine = args.invitedByEmail
    ? `<strong>${escapeHtml(args.invitedByEmail)}</strong> at Logistic Intel`
    : "The Logistic Intel partnerships team";
  const noteBlock = args.note
    ? `<blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #3b82f6;background:#EFF6FF;color:#1e3a8a;font-size:14px;line-height:1.55;">${escapeHtml(args.note)}</blockquote>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3b82f6;">LIT Partner Program</div>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0F172A;">You're invited to partner with Logistic Intel.</h1>
        </td></tr>
        <tr><td style="padding:16px 32px 0;font-size:14px;line-height:1.6;color:#475569;">
          <p style="margin:0 0 14px;">${greeting}</p>
          <p style="margin:0 0 14px;">${fromLine} has invited you to the Logistic Intel Partner Program — a high-trust, recurring-commission affiliate program for consultants, advisors, and operators in freight and logistics.</p>
          ${noteBlock}
          <p style="margin:0 0 14px;">Click below to accept the invitation. You'll create or sign in to your Logistic Intel account, then connect Stripe Connect Express to enable monthly payouts.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;" align="left">
          <a href="${args.inviteUrl}" style="display:inline-block;padding:12px 22px;background:linear-gradient(180deg,#3B82F6,#2563EB);color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;box-shadow:0 1px 4px rgba(59,130,246,0.3);">Accept invitation →</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px;font-size:12.5px;line-height:1.6;color:#64748b;">
          If the button doesn't work, paste this URL into your browser:<br/>
          <span style="font-family:JetBrains Mono,monospace;color:#0F172A;word-break:break-all;">${escapeHtml(args.inviteUrl)}</span>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #EEF2F7;font-size:12px;line-height:1.55;color:#94a3b8;">
          This invitation expires in 14 days and can only be claimed once. Program terms (commission rate, attribution window, payout minimum) are set at the time you accept and are listed in your partner agreement. If you weren't expecting this email, you can safely ignore it.
        </td></tr>
      </table>
      <div style="margin-top:14px;font-size:11.5px;color:#94a3b8;">
        Logistic Intel · ${escapeHtml(args.appBaseUrl)}
      </div>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `${args.recipientName ? `Hi ${args.recipientName},` : "Hi,"}`,
    "",
    `${args.invitedByEmail ? args.invitedByEmail : "The Logistic Intel partnerships team"} has invited you to the Logistic Intel Partner Program.`,
    "",
    args.note ? `Note: ${args.note}\n` : "",
    "Accept the invitation here:",
    args.inviteUrl,
    "",
    "This invitation expires in 14 days and can only be claimed once.",
    "If you weren't expecting this email, you can safely ignore it.",
    "",
    "— Logistic Intel",
  ].filter(Boolean).join("\n");

  return { html, text };
}

async function sendInviteEmail(args: {
  resendApiKey: string;
  fromEmail: string;
  to: string;
  recipientName: string | null;
  inviteUrl: string;
  invitedByEmail: string | null;
  note: string | null;
  appBaseUrl: string;
}) {
  const { html, text } = renderEmail({
    inviteUrl: args.inviteUrl,
    recipientName: args.recipientName,
    invitedByEmail: args.invitedByEmail,
    note: args.note,
    appBaseUrl: args.appBaseUrl,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.fromEmail,
      to: args.to,
      subject: "You're invited to the Logistic Intel Partner Program",
      html,
      text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Resend error ${res.status}: ${typeof data?.message === "string" ? data.message : "send failed"}`,
    );
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authenticateSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { user, adminClient, env } = auth;

  if (!env.resendApiKey) {
    return json({ ok: false, code: "RESEND_NOT_CONFIGURED", error: "Missing RESEND_API_KEY" }, 500);
  }
  if (!env.fromEmail) {
    return json({
      ok: false,
      code: "RESEND_NOT_CONFIGURED",
      error: "Missing RESEND_FROM_EMAIL or INVITE_FROM_EMAIL",
    }, 500);
  }

  const body = (await req.json().catch(() => ({}))) as {
    invite_id?: string;
    email?: string;
    name?: string;
    company?: string;
    note?: string;
    tier_code?: string;
    expires_in_days?: number;
  };

  // ── RESEND mode (existing invite) ──────────────────────────────
  if (body.invite_id) {
    const { data: existing, error: loadErr } = await adminClient
      .from("affiliate_invites")
      .select("id, email, name, company, note, tier_code, token, expires_at, invited_by_user_id, invited_by_email, send_count, claimed_at, revoked_at")
      .eq("id", body.invite_id)
      .maybeSingle();
    if (loadErr) return json({ ok: false, error: loadErr.message }, 500);
    if (!existing) return json({ ok: false, error: "Invite not found" }, 404);
    if (existing.claimed_at) return json({ ok: false, code: "ALREADY_CLAIMED" }, 409);
    if (existing.revoked_at) return json({ ok: false, code: "REVOKED" }, 409);

    const expired = new Date(existing.expires_at).getTime() < Date.now();
    let token = existing.token;
    let expiresAt = existing.expires_at;
    if (expired) {
      // Roll a fresh token + extend.
      token = generateInviteToken();
      expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    }

    const inviteUrl = `${env.appBaseUrl.replace(/\/$/, "")}/app/affiliate/invite?token=${encodeURIComponent(token)}`;

    let emailResp;
    try {
      emailResp = await sendInviteEmail({
        resendApiKey: env.resendApiKey,
        fromEmail: env.fromEmail,
        to: existing.email,
        recipientName: existing.name,
        inviteUrl,
        invitedByEmail: existing.invited_by_email,
        note: existing.note,
        appBaseUrl: env.appBaseUrl,
      });
    } catch (err) {
      console.error("[send-affiliate-invite] resend email failed", err);
      return json({
        ok: false,
        error: "Failed to send email",
        details: err instanceof Error ? err.message : String(err),
      }, 502);
    }

    const { error: updErr } = await adminClient
      .from("affiliate_invites")
      .update({
        token,
        expires_at: expiresAt,
        send_count: (existing.send_count ?? 0) + 1,
        last_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updErr) {
      console.error("[send-affiliate-invite] resend persist failed", updErr);
    }

    return json({
      ok: true,
      mode: "resent",
      invite_id: existing.id,
      email_id: emailResp?.id ?? null,
    });
  }

  // ── CREATE mode ─────────────────────────────────────────────────
  const email = (nonEmptyString(body.email) || "").toLowerCase();
  if (!email || !email.includes("@")) {
    return json({ ok: false, error: "Valid email is required" }, 400);
  }

  const expiresInDays =
    typeof body.expires_in_days === "number" && body.expires_in_days > 0 && body.expires_in_days <= 60
      ? body.expires_in_days
      : 14;

  const tierCode = nonEmptyString(body.tier_code) ?? "starter";
  // Validate tier_code if provided.
  const { data: tier } = await adminClient
    .from("affiliate_tiers")
    .select("code")
    .eq("code", tierCode)
    .maybeSingle();
  if (!tier) {
    return json({ ok: false, error: `Unknown tier: ${tierCode}` }, 400);
  }

  // Block if there's already an active partner for that email's user.
  // (We can only check if the user already exists; if not, skip.)
  // Skipped to keep the invite-first flow simple — duplicate partners are
  // prevented at claim time by the partial unique index.

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000).toISOString();

  const { data: invite, error: insErr } = await adminClient
    .from("affiliate_invites")
    .insert({
      email,
      name: nonEmptyString(body.name),
      company: nonEmptyString(body.company),
      note: nonEmptyString(body.note),
      tier_code: tierCode,
      token,
      expires_at: expiresAt,
      invited_by_user_id: user.id,
      invited_by_email: user.email ?? null,
      last_sent_at: new Date().toISOString(),
      send_count: 1,
    })
    .select("id, email, name, token")
    .maybeSingle();
  if (insErr || !invite) {
    console.error("[send-affiliate-invite] insert failed", insErr);
    return json({
      ok: false,
      error: "Failed to create invite",
      details: insErr?.message,
    }, 500);
  }

  const inviteUrl = `${env.appBaseUrl.replace(/\/$/, "")}/app/affiliate/invite?token=${encodeURIComponent(token)}`;

  let emailResp;
  try {
    emailResp = await sendInviteEmail({
      resendApiKey: env.resendApiKey,
      fromEmail: env.fromEmail,
      to: email,
      recipientName: invite.name,
      inviteUrl,
      invitedByEmail: user.email ?? null,
      note: nonEmptyString(body.note),
      appBaseUrl: env.appBaseUrl,
    });
  } catch (err) {
    console.error("[send-affiliate-invite] email send failed", err);
    // The invite row exists; admin can resend.
    return json({
      ok: true,
      mode: "created_email_failed",
      invite_id: invite.id,
      email: invite.email,
      error: err instanceof Error ? err.message : String(err),
    }, 200);
  }

  return json({
    ok: true,
    mode: "created",
    invite_id: invite.id,
    email: invite.email,
    email_id: emailResp?.id ?? null,
  });
});
