import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("send-org-invite");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteRequest = {
  // Legacy "resend an existing invite" mode.
  inviteId?: string;
  // Primary "create + send" mode — the frontend passes these and the row is
  // created here (service-role), not inserted from the browser.
  org_id?: string;
  email?: string;
  role?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function formatExpiry(dateValue: string | null | undefined) {
  if (!dateValue) return "soon";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // Project standard is LIT_RESEND_API_KEY (see CLAUDE.md); keep RESEND_API_KEY
    // as a fallback. Reading only RESEND_API_KEY was a silent break — the invite
    // row got created but the email never sent ("Missing RESEND_API_KEY" 500).
    const resendApiKey = Deno.env.get("LIT_RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY");
    // Fallback chain mirrors send-affiliate-invite. Default targets the APP
    // domain (not marketing) — invite links land on /accept-invite which
    // only exists on app.logisticintel.com.
    const inviteBaseUrl =
      Deno.env.get("APP_BASE_URL") ||
      Deno.env.get("INVITE_BASE_URL") ||
      Deno.env.get("APP_URL") ||
      "https://app.logisticintel.com";
    const inviteFromEmail =
      Deno.env.get("INVITE_FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }

    if (!resendApiKey) {
      return json({ error: "Missing RESEND_API_KEY" }, 500);
    }

    if (!inviteFromEmail) {
      return json({ error: "Missing INVITE_FROM_EMAIL or RESEND_FROM_EMAIL" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as InviteRequest;
    const inviteId = String(body?.inviteId || "").trim();
    const bodyOrgId = String(body?.org_id || "").trim();
    const bodyEmail = String(body?.email || "").trim().toLowerCase();
    const bodyRole = String(body?.role || "member").trim().toLowerCase() || "member";

    const inviteCols = `
        id,
        org_id,
        email,
        role,
        token,
        status,
        expires_at,
        invited_by_user_id
      `;

    // Two modes:
    //   - resend: { inviteId }            -> load the existing invite, use its org
    //   - create: { org_id, email, role } -> create the invite row server-side
    // Create is the primary path. The frontend used to insert into org_invites
    // directly under the user's JWT, which failed silently whenever the
    // inviter's own org_members.status drifted off 'active' (the INSERT RLS
    // policy hard-requires is_org_admin(org_id) → status='active' AND
    // role in owner/admin). Creating it here with the service-role client after
    // an explicit admin check removes that fragility.
    let invite: any = null;
    let targetOrgId = "";

    if (inviteId) {
      const { data: existing, error: inviteError } = await adminClient
        .from("org_invites")
        .select(inviteCols)
        .eq("id", inviteId)
        .maybeSingle();
      if (inviteError) {
        log.error("invite_load_failed", { err: String(inviteError?.message ?? inviteError) });
        return json({ error: inviteError.message || "Failed loading invite" }, 500);
      }
      if (!existing) {
        return json({ error: "Invite not found" }, 404);
      }
      if (existing.status !== "pending") {
        return json({ error: "Only pending invites can be emailed" }, 400);
      }
      invite = existing;
      targetOrgId = existing.org_id;
    } else {
      if (!bodyOrgId || !bodyEmail) {
        return json({ error: "org_id and email are required" }, 400);
      }
      targetOrgId = bodyOrgId;
    }

    // ── Permission: caller must be owner/admin of targetOrgId, or a platform admin. ──
    const { data: membership, error: membershipError } = await adminClient
      .from("org_members")
      .select("org_id, role, status")
      .eq("org_id", targetOrgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) {
      log.error("membership_check_failed", { err: String(membershipError?.message ?? membershipError) });
      return json({ error: membershipError.message || "Failed checking membership" }, 500);
    }

    const inviterEmail = (user.email || "").toLowerCase();
    // Platform-admin bypass via the platform_admins table (no hardcoded emails).
    // Fail-safe to false so a missing table never blocks the org-admin path.
    let isPlatformAdmin = false;
    try {
      const { data: pa } = await adminClient
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      isPlatformAdmin = Boolean(pa);
    } catch (_e) {
      isPlatformAdmin = false;
    }

    const allowedRoles = ["owner", "admin"];
    const membershipRole = String(membership?.role || "").toLowerCase();
    const canManageInvites = isPlatformAdmin || allowedRoles.includes(membershipRole);

    log.info("permission_check", {
      inviter_email: inviterEmail,
      membership_role: membershipRole,
      invite_org_id: targetOrgId,
      is_platform_admin: isPlatformAdmin,
      can_manage_invites: canManageInvites,
      mode: inviteId ? "resend" : "create",
    });

    if (!canManageInvites) {
      log.error("permission_denied", {
        inviter_email: inviterEmail,
        membership_role: membershipRole,
        invite_org_id: targetOrgId,
      });

      return json(
        { error: "You do not have permission to send invites for this workspace" },
        403
      );
    }

    // ── Create mode: create (or reuse an existing pending) invite row. ──
    if (!invite) {
      const { data: existingPending, error: existingErr } = await adminClient
        .from("org_invites")
        .select(inviteCols)
        .eq("org_id", targetOrgId)
        .eq("email", bodyEmail)
        .eq("status", "pending")
        .maybeSingle();
      if (existingErr) {
        log.error("existing_invite_check_failed", { err: String(existingErr?.message ?? existingErr) });
        return json({ error: existingErr.message || "Failed checking existing invite" }, 500);
      }

      if (existingPending) {
        invite = existingPending;
      } else {
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: created, error: createErr } = await adminClient
          .from("org_invites")
          .insert({
            org_id: targetOrgId,
            email: bodyEmail,
            role: bodyRole,
            token,
            status: "pending",
            expires_at: expiresAt,
            invited_by_user_id: user.id,
          })
          .select(inviteCols)
          .single();
        if (createErr || !created) {
          log.error("invite_create_failed", { err: String(createErr?.message ?? createErr) });
          return json({ error: createErr?.message || "Failed creating invite" }, 500);
        }
        invite = created;
      }
    }

    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, name, support_email")
      .eq("id", invite.org_id)
      .maybeSingle();

    if (orgError || !org) {
      log.error("org_lookup_failed", { err: String(orgError?.message ?? orgError) });
      return json({ error: "Organization not found" }, 404);
    }

    const inviterName =
      String(user.user_metadata?.full_name || "").trim() ||
      inviterEmail ||
      "A workspace admin";

    const workspaceName = String(org?.name || "Logistic Intel").trim();
    const normalizedBaseUrl = inviteBaseUrl.endsWith("/")
      ? inviteBaseUrl.slice(0, -1)
      : inviteBaseUrl;
    const acceptUrl = `${normalizedBaseUrl}/accept-invite?token=${encodeURIComponent(invite.token)}&email=${encodeURIComponent(invite.email)}`;
    const formattedExpiry = formatExpiry(invite.expires_at);

    // Update this path only if your public asset path is different.
    const logoUrl = "https://<your-project-ref>.supabase.co/storage/v1/object/public/public-assets/logo_email.png";

    const emailHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>You’ve been invited to ${workspaceName}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f7fb; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7fb; margin:0; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:18px; overflow:hidden; box-shadow:0 12px 40px rgba(15,23,42,0.08);">

            <tr>
              <td style="background:linear-gradient(180deg,#081225 0%, #0f172a 100%); padding:28px 32px 24px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle" style="width:56px;">
                      <img
                        src="${logoUrl}"
                        alt="Logistic Intel"
                        width="220"
                        style="display:block; border:0; outline:none; text-decoration:none;"
                      />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:36px 32px 12px 32px;">
                <div style="display:inline-block; font-size:12px; line-height:18px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#1d4ed8; background-color:#dbeafe; padding:6px 10px; border-radius:999px; margin-bottom:18px;">
                  Private invitation
                </div>

                <h1 style="margin:0 0 14px 0; font-size:30px; line-height:36px; color:#0f172a; font-weight:700;">
                  You’ve been invited to join ${workspaceName}
                </h1>

                <p style="margin:0 0 16px 0; font-size:16px; line-height:27px; color:#334155;">
                  <strong>${inviterName}</strong> invited you to join <strong>${workspaceName}</strong>.
                </p>

                <p style="margin:0 0 16px 0; font-size:16px; line-height:27px; color:#334155;">
                  You’ll get access to freight intelligence, workspace collaboration, and outreach tools built to help your team move faster.
                </p>

                <div style="margin:0 0 18px 0; display:inline-block; font-size:12px; line-height:18px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#4338ca; background-color:#eef2ff; padding:8px 12px; border-radius:999px;">
                  ${String(invite.role || "member").toUpperCase()} ACCESS
                </div>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:10px 0 22px 0;">
                  <tr>
                    <td align="center" style="background:linear-gradient(180deg,#5b5cf0 0%, #4f46e5 100%); border-radius:12px;">
                      <a href="${acceptUrl}" target="_blank" style="display:inline-block; padding:16px 28px; font-size:16px; line-height:20px; font-weight:700; color:#ffffff; text-decoration:none;">
                        Accept Invite
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="margin:0 0 24px 0; padding:16px 18px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                  <div style="font-size:13px; line-height:20px; font-weight:700; color:#0f172a; margin-bottom:6px;">
                    Invitation details
                  </div>
                  <div style="font-size:14px; line-height:24px; color:#475569;">
                    Workspace: <strong>${workspaceName}</strong><br />
                    Email: <strong>${invite.email}</strong><br />
                    Expires: <strong>${formattedExpiry}</strong>
                  </div>
                </div>

                <p style="margin:0 0 10px 0; font-size:14px; line-height:22px; color:#64748b;">
                  If the button doesn’t work, copy and paste this link into your browser:
                </p>

                <p style="margin:0 0 26px 0; font-size:14px; line-height:22px; word-break:break-word;">
                  <a href="${acceptUrl}" target="_blank" style="color:#2563eb; text-decoration:underline;">
                    ${acceptUrl}
                  </a>
                </p>

                <p style="margin:0; font-size:13px; line-height:22px; color:#94a3b8;">
                  If this invite reached you by mistake, you can safely ignore this email.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px; background-color:#f8fafc; border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 6px 0; font-size:12px; line-height:18px; color:#475569; font-weight:700;">
                  Logistic Intel
                </p>
                <p style="margin:0; font-size:12px; line-height:18px; color:#94a3b8;">
                  Trusted access. Smarter freight decisions.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim();

    const textBody = [
      `You've been invited to join ${workspaceName}`,
      ``,
      `${inviterName} invited you to join ${workspaceName}.`,
      `Role: ${String(invite.role || "member").toUpperCase()}`,
      `Email: ${invite.email}`,
      `Accept Invite: ${acceptUrl}`,
      `Expires: ${formattedExpiry}`,
      ``,
      `If you were not expecting this email, you can ignore it.`,
    ].join("\n");

    log.info("sending_email", {
      to: invite.email,
      from: `Logistics Intel <${inviteFromEmail}>`,
      workspace_name: workspaceName,
      logo_url: logoUrl,
    });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Logistics Intel <${inviteFromEmail}>`,
        to: [invite.email],
        subject: `You’ve been invited to join ${workspaceName}`,
        html: emailHtml,
        text: textBody,
        reply_to: org?.support_email || inviterEmail,
      }),
    });

    const resendResult = await resendResponse.json();

    log.info("resend_response", { detail: resendResult });

    if (!resendResponse.ok) {
      log.error("resend_failed", { detail: resendResult });

      return json(
        {
          error: resendResult?.message || "Failed sending invite email",
          resend: resendResult,
        },
        502
      );
    }

    await adminClient
      .from("org_invites")
      .update({
        email_sent_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    return json({
      ok: true,
      message: "Invite email sent successfully",
      emailId: resendResult?.id ?? null,
    });
  } catch (error) {
    log.error("fatal", { err: String((error as Error)?.message ?? error) });

    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      500
    );
  }
});
