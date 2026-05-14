import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanityWriteClient } from "@/sanity/lib/client";
import { sendEmail, escapeHtml } from "@/lib/email";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/partner-invite — bridges a Sanity `partnerApplication`
 * into the existing Supabase affiliate pipeline.
 *
 * Flow:
 *   1. Auth: shared bearer secret PARTNER_INVITE_SECRET.
 *   2. Load the Sanity partnerApplication doc by id. Validate it has not
 *      already been invited (idempotency).
 *   3. Insert an `affiliate_invites` row in Supabase (service role).
 *   4. Send the invite email via Resend using the same copy/template
 *      shape as supabase/functions/send-affiliate-invite.
 *   5. Patch the Sanity doc with inviteSent / inviteId / inviteSentAt /
 *      status="reviewing" so the partnerships team sees the dispatch.
 *
 * Body: { sanityId: string, tierCode?: 'starter'|'launch_promo'|'partner', note?: string }
 *
 * Auth: Authorization: Bearer <PARTNER_INVITE_SECRET>
 *
 * Required env (production):
 *   PARTNER_INVITE_SECRET              shared secret for this endpoint
 *   SUPABASE_SERVICE_ROLE_KEY          to write affiliate_invites
 *   NEXT_PUBLIC_SUPABASE_URL or
 *     VITE_SUPABASE_URL                Supabase project URL
 *   RESEND_API_KEY                     email
 *   RESEND_FROM_EMAIL                  email
 *   SANITY_API_WRITE_TOKEN             already set — used by sanityWriteClient
 *
 * Optional env:
 *   APP_BASE_URL                       default "https://logisticintel.com"
 *   PARTNER_INVITE_EXPIRY_DAYS         default 14
 */

const APP_BASE_URL =
  (process.env.APP_BASE_URL || "https://logisticintel.com").replace(/\/$/, "");
const INVITE_EXPIRY_DAYS = Number(process.env.PARTNER_INVITE_EXPIRY_DAYS || "14") || 14;
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Logistic Intel <partnerships@logisticintel.com>";

export async function POST(req: NextRequest) {
  // 1. Auth — shared secret
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.PARTNER_INVITE_SECRET;
  if (!secret) {
    return json({ ok: false, error: "endpoint_not_configured" }, 500);
  }
  if (auth !== `Bearer ${secret}`) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Parse body
  let body: { sanityId?: string; tierCode?: string; note?: string };
  try {
    body = (await req.json()) as any;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const sanityId = body.sanityId?.trim();
  if (!sanityId) return json({ ok: false, error: "missing_sanityId" }, 400);

  const tierCode = ["starter", "launch_promo", "partner"].includes(body.tierCode || "")
    ? body.tierCode
    : "starter";
  const note = typeof body.note === "string" ? body.note.slice(0, 1000) : undefined;

  // 2. Load the Sanity application
  type App = {
    _id: string;
    name?: string;
    email?: string;
    companyOrBrand?: string;
    inviteSent?: boolean;
    inviteId?: string;
  };
  let app: App | null;
  try {
    app = await sanityWriteClient.fetch(
      `*[_type == "partnerApplication" && _id == $id][0]{
        _id, name, email, companyOrBrand, inviteSent, inviteId
      }`,
      { id: sanityId },
    );
  } catch (e: any) {
    console.error("[partner-invite] sanity load failed", e?.message || e);
    return json({ ok: false, error: "sanity_load_failed" }, 500);
  }
  if (!app) return json({ ok: false, error: "application_not_found" }, 404);
  if (!app.email) return json({ ok: false, error: "application_missing_email" }, 400);
  if (app.inviteSent && app.inviteId) {
    return json(
      { ok: false, error: "already_invited", inviteId: app.inviteId },
      409,
    );
  }

  // 3. Insert affiliate_invites row via service role
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "supabase_not_configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 86400 * 1000).toISOString();

  const inviteInsert: Record<string, unknown> = {
    email: app.email,
    name: app.name || null,
    company: app.companyOrBrand || null,
    note: note || null,
    tier_code: tierCode,
    token,
    expires_at: expiresAt,
    invited_by_email: "partnerships@logisticintel.com",
    metadata: { source: "sanity_bridge", sanity_application_id: sanityId },
  };

  const { data: invite, error: insertErr } = await supabase
    .from("affiliate_invites")
    .insert(inviteInsert)
    .select("id, email, name, token, expires_at")
    .maybeSingle();

  if (insertErr || !invite) {
    console.error("[partner-invite] supabase insert failed", insertErr);
    return json(
      {
        ok: false,
        error: "invite_insert_failed",
        details: insertErr?.message,
      },
      500,
    );
  }

  // 4. Send the invite email
  const inviteUrl = `${APP_BASE_URL}/affiliate/onboarding?token=${encodeURIComponent(token)}`;
  let emailOk = true;
  let emailDetails: any = null;
  try {
    const result = await sendEmail({
      from: FROM_EMAIL,
      to: invite.email,
      replyTo: "partnerships@logisticintel.com",
      subject: "You're invited to the Logistic Intel Partner Program",
      html: renderInviteHtml({
        recipientName: invite.name,
        inviteUrl,
        note: note || null,
      }),
      text: renderInviteText({
        recipientName: invite.name,
        inviteUrl,
        note: note || null,
      }),
    });
    emailDetails = result;
    emailOk = (result as any)?.ok !== false;
  } catch (e: any) {
    emailOk = false;
    emailDetails = { error: e?.message || String(e) };
    console.error("[partner-invite] resend send failed", e?.message || e);
  }

  // 5. Patch the Sanity doc — even if email failed, we mark inviteId so
  //    partnerships can manually resend without duplicating the row.
  try {
    await sanityWriteClient
      .patch(sanityId)
      .set({
        inviteSent: emailOk,
        inviteId: invite.id,
        inviteSentAt: new Date().toISOString(),
        status: "reviewing",
        inviteEmailLog: JSON.stringify({ ok: emailOk, ...emailDetails }, null, 2).slice(
          0,
          1900,
        ),
      })
      .commit();
  } catch (e: any) {
    console.error("[partner-invite] sanity patch failed", e?.message || e);
    // The Supabase row + email succeeded; the audit trail in Sanity didn't.
    // Surface the success but flag the audit miss.
    return json(
      {
        ok: true,
        warning: "sanity_patch_failed",
        inviteId: invite.id,
        emailOk,
      },
      200,
    );
  }

  return json({ ok: true, inviteId: invite.id, emailOk });
}

// ----- helpers ---------------------------------------------------------------

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** URL-safe base64 of 32 random bytes — matches the token shape used by
 *  supabase/functions/send-affiliate-invite. */
function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function renderInviteHtml(args: {
  recipientName: string | null;
  inviteUrl: string;
  note: string | null;
}) {
  const greeting = args.recipientName ? `Hi ${escapeHtml(args.recipientName)},` : "Hi,";
  const noteBlock = args.note
    ? `<blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #3b82f6;background:#EFF6FF;color:#1e3a8a;font-size:14px;line-height:1.55;">${escapeHtml(args.note)}</blockquote>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3b82f6;">LIT Partner Program</div>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0F172A;">You're invited to partner with Logistic Intel.</h1>
        </td></tr>
        <tr><td style="padding:16px 32px 0;font-size:14px;line-height:1.6;color:#475569;">
          <p style="margin:0 0 14px;">${greeting}</p>
          <p style="margin:0 0 14px;">Thanks for applying to the Logistic Intel Partner Program. We reviewed your application and would like to invite you to join.</p>
          ${noteBlock}
          <p style="margin:0 0 14px;">Click below to accept. You'll create or sign in to your Logistic Intel account, then connect Stripe Connect Express to enable monthly payouts.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;" align="left">
          <a href="${args.inviteUrl}" style="display:inline-block;padding:12px 22px;background:linear-gradient(180deg,#3B82F6,#2563EB);color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;box-shadow:0 1px 4px rgba(59,130,246,0.3);">Accept invitation →</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px;font-size:12.5px;line-height:1.6;color:#64748b;">
          If the button doesn't work, paste this URL into your browser:<br/>
          <span style="font-family:JetBrains Mono,monospace;color:#0F172A;word-break:break-all;">${escapeHtml(args.inviteUrl)}</span>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #EEF2F7;font-size:12px;line-height:1.55;color:#94a3b8;">
          This invitation expires in ${INVITE_EXPIRY_DAYS} days and can only be claimed once. Commission rate, attribution window, and payout minimum are confirmed at acceptance. Questions? Reply to this email.
        </td></tr>
      </table>
      <div style="margin-top:14px;font-size:11.5px;color:#94a3b8;">
        Logistic Intel · partnerships@logisticintel.com
      </div>
    </td></tr>
  </table>
</body></html>`;
}

function renderInviteText(args: {
  recipientName: string | null;
  inviteUrl: string;
  note: string | null;
}) {
  return [
    `${args.recipientName ? `Hi ${args.recipientName},` : "Hi,"}`,
    "",
    "Thanks for applying to the Logistic Intel Partner Program. We reviewed your application and would like to invite you to join.",
    "",
    args.note ? `Note: ${args.note}\n` : "",
    "Accept the invitation here:",
    args.inviteUrl,
    "",
    `This invitation expires in ${INVITE_EXPIRY_DAYS} days and can only be claimed once.`,
    "",
    "— Logistic Intel partnerships team",
  ]
    .filter(Boolean)
    .join("\n");
}
