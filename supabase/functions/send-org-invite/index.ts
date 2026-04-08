import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteRequest = {
  inviteId?: string;
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const inviteBaseUrl = Deno.env.get("INVITE_BASE_URL");
    const inviteFromEmail = Deno.env.get("INVITE_FROM_EMAIL");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }

    if (!resendApiKey) {
      return json({ error: "Missing RESEND_API_KEY" }, 500);
    }

    if (!inviteBaseUrl) {
      return json({ error: "Missing INVITE_BASE_URL" }, 500);
    }

    if (!inviteFromEmail) {
      return json({ error: "Missing INVITE_FROM_EMAIL" }, 500);
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

    if (!inviteId) {
      return json({ error: "inviteId is required" }, 400);
    }

    const { data: invite, error: inviteError } = await adminClient
      .from("org_invites")
      .select(`
        id,
        org_id,
        email,
        role,
        token,
        status,
        expires_at,
        invited_by_user_id
      `)
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError) {
      return json({ error: inviteError.message || "Failed loading invite" }, 500);
    }

    if (!invite) {
      return json({ error: "Invite not found" }, 404);
    }

    if (invite.status !== "pending") {
      return json({ error: "Only pending invites can be emailed" }, 400);
    }

    const { data: membership, error: membershipError } = await adminClient
      .from("org_members")
      .select("org_id, role, status")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) {
      return json({ error: membershipError.message || "Failed checking membership" }, 500);
    }

    const inviterEmail = (user.email || "").toLowerCase();
    const isPlatformAdmin = inviterEmail === "vraymond@sparkfusiondigital.com";

    const allowedRoles = ["owner", "admin"];
    const membershipRole = String(membership?.role || "").toLowerCase();
    const canManageInvites = isPlatformAdmin || allowedRoles.includes(membershipRole);

    if (!canManageInvites) {
      return json({ error: "You do not have permission to send invites for this workspace" }, 403);
    }

    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, name, support_email")
      .eq("id", invite.org_id)
      .maybeSingle();

    if (orgError) {
      return json({ error: orgError.message || "Failed loading workspace" }, 500);
    }

    const inviterName =
      String(user.user_metadata?.full_name || "").trim() ||
      inviterEmail ||
      "A workspace admin";

    const workspaceName = String(org?.name || "Your workspace").trim();
    const acceptUrl = `${inviteBaseUrl.replace(/\/$/, "")}?token=${encodeURIComponent(invite.token)}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 8px;">You’ve been invited to join ${workspaceName}</h2>
        <p style="margin: 0 0 16px 0;">
          ${inviterName} invited you to join <strong>${workspaceName}</strong> on LIT.
        </p>
        <p style="margin: 0 0 16px 0;">
          Role: <strong>${invite.role}</strong>
        </p>
        <p style="margin: 0 0 24px 0;">
          Click the button below to accept your invite.
        </p>
        <p style="margin: 0 0 24px 0;">
          <a
            href="${acceptUrl}"
            style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;"
          >
            Accept Invite
          </a>
        </p>
        <p style="margin: 0 0 12px 0; color: #475569;">
          This invite will expire on ${invite.expires_at}.
        </p>
        <p style="margin: 0; color: #475569;">
          If you were not expecting this email, you can ignore it.
        </p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: inviteFromEmail,
        to: [invite.email],
        subject: `You’ve been invited to join ${workspaceName} on LIT`,
        html: emailHtml,
        reply_to: org?.support_email || inviterEmail,
      }),
    });

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
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
    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      500
    );
  }
});
