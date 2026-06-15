// recipient-exit-manual — authed endpoint for flipping a single recipient
// to status='manual_exit' + null next_send_at. Used by the "Remove from
// sequence" button in the EngagementDrillIn UI.
//
// Authorization: requires a Supabase user JWT. Caller must be one of:
//   - The campaign's owner (campaign.user_id === auth.uid())
//   - A platform admin
//   - An active member of the campaign's org
//
// Body: { campaign_id: string, recipient_id: string, reason?: string }
//
// Self-contained (no _shared imports) so MCP-deploy with a single file works.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "Missing Authorization header" }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const user = userData.user;
  const admin = createClient(supabaseUrl, serviceKey);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const campaignId = String(body?.campaign_id || "").trim();
  const recipientId = String(body?.recipient_id || "").trim();
  const reason = body?.reason ? String(body.reason).slice(0, 200) : "manual_exit";
  if (!campaignId || !recipientId) {
    return json({ ok: false, error: "missing_params", needs: ["campaign_id", "recipient_id"] }, 400);
  }

  const { data: campaign, error: campErr } = await admin
    .from("lit_campaigns")
    .select("id, org_id, user_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (campErr || !campaign) return json({ ok: false, error: "campaign_not_found" }, 404);

  // Authorization.
  let allowed = false;
  if (campaign.user_id === user.id) allowed = true;
  if (!allowed) {
    const { data: adminRow } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (adminRow?.user_id) allowed = true;
  }
  if (!allowed && campaign.org_id) {
    const { data: member } = await admin
      .from("org_members")
      .select("user_id, status")
      .eq("org_id", campaign.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (member?.user_id) allowed = true;
  }
  if (!allowed) return json({ ok: false, error: "forbidden" }, 403);

  // Verify recipient ↔ campaign.
  const { data: recipient, error: recipErr } = await admin
    .from("lit_campaign_contacts")
    .select("id, campaign_id, email, status")
    .eq("id", recipientId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (recipErr || !recipient) return json({ ok: false, error: "recipient_not_found" }, 404);

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("lit_campaign_contacts")
    .update({
      status: "manual_exit",
      next_send_at: null,
      last_error: reason,
      updated_at: nowIso,
    })
    .eq("id", recipientId);
  if (updErr) return json({ ok: false, error: "update_failed", detail: updErr.message }, 500);

  await admin.from("lit_outreach_history").insert({
    user_id: user.id,
    campaign_id: campaignId,
    contact_id: null,
    channel: "system",
    event_type: "manual_exit",
    status: "manual_exit",
    occurred_at: nowIso,
    metadata: {
      recipient_id: recipientId,
      recipient_email: recipient.email,
      previous_status: recipient.status,
      removed_by_user_id: user.id,
      reason,
      source: "recipient-exit-manual",
    },
  });

  return json({
    ok: true,
    recipient_id: recipientId,
    previous_status: recipient.status,
    new_status: "manual_exit",
  });
});
