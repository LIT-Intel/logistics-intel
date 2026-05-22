// email-unsubscribe — RFC 8058 one-click unsubscribe endpoint.
//
// Linked from the List-Unsubscribe header injected by send-campaign-email
// (per Gmail/Yahoo Feb 2024 bulk-sender policy). Recipients clicking the
// link in their mail client carry no JWT, so this function is deployed
// with verify_jwt=false and authenticates via the campaign+recipient
// pair (an attacker would need both UUIDs to flip the bit).
//
// Behaviour:
//   1. Resolve the campaign_contact row by recipient id.
//   2. Upsert lit_email_preferences with unsubscribed_all=true.
//      (Table uses unsubscribed_all, not unsubscribed — confirmed Step 1.)
//   3. Mark lit_campaign_contacts.status='suppressed' so the dispatcher
//      skips this recipient on the next tick.
//   4. POST → 200 JSON (RFC 8058 requires 2xx on one-click POST).
//      GET  → 200 HTML confirmation page (mail clients hitting the link
//             in a browser need a human-readable response).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign");
  const recipientId = url.searchParams.get("recipient");
  if (!campaignId || !recipientId) {
    return new Response("missing_params", {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Resolve recipient → email. We scope by campaign as a weak auth
  //    check so a leaked recipient id can't be reused across campaigns.
  const { data: recipient, error: recipientErr } = await supa
    .from("lit_campaign_contacts")
    .select("id, email, campaign_id, status")
    .eq("id", recipientId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (recipientErr) {
    console.error("[email-unsubscribe] recipient_lookup_failed", recipientErr);
    return new Response("lookup_failed", {
      status: 500,
      headers: corsHeaders(),
    });
  }
  if (!recipient?.email) {
    return new Response("recipient_not_found", {
      status: 404,
      headers: corsHeaders(),
    });
  }

  const nowIso = new Date().toISOString();
  const emailLower = recipient.email.toLowerCase();

  // 2. Write the global unsubscribe. Table shape (per Step 1 audit):
  //    email PK, per-sequence booleans default true, unsubscribed_all bool,
  //    updated_at timestamptz. NO unsubscribed_at, NO source column.
  //    One-click unsub is a global opt-out, so flip every channel false
  //    AND set unsubscribed_all=true.
  const { error: prefErr } = await supa.from("lit_email_preferences").upsert(
    {
      email: emailLower,
      trial_welcome: false,
      top_100_followup: false,
      partner_onboarding: false,
      comparison_nurture: false,
      unsubscribed_all: true,
      updated_at: nowIso,
    },
    { onConflict: "email" },
  );
  if (prefErr) {
    console.error("[email-unsubscribe] preferences_upsert_failed", prefErr);
    // Don't fail the request — still mark the campaign contact suppressed
    // below. Otherwise the recipient may click again and again with no
    // confirmation. RFC 8058 wants 2xx on one-click POST.
  }

  // 3. Mark the campaign recipient suppressed so the dispatcher skips them
  //    on the next tick. Status='suppressed' + suppressed_reason matches
  //    the suppression branch already enforced in send-campaign-email.
  const { error: recipUpdateErr } = await supa
    .from("lit_campaign_contacts")
    .update({
      status: "suppressed",
      suppressed_reason: "unsubscribed",
      updated_at: nowIso,
    })
    .eq("id", recipientId);
  if (recipUpdateErr) {
    console.error("[email-unsubscribe] recipient_suppress_failed", recipUpdateErr);
  }

  // 4. Response. POST → JSON 200 (RFC 8058). GET → HTML confirmation page.
  if (req.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribed</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 520px; margin: 120px auto; padding: 0 24px; text-align: center; color: #0f172a; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    p { color: #475569; font-size: 15px; line-height: 1.55; }
  </style>
</head>
<body>
  <h1>You've been unsubscribed.</h1>
  <p>You will not receive further emails from this sequence.</p>
</body>
</html>`,
    { status: 200, headers: { ...corsHeaders(), "Content-Type": "text/html; charset=utf-8" } },
  );
});
