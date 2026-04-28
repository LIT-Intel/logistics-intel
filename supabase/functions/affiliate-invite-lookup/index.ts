// affiliate-invite-lookup
// PUBLIC endpoint (no auth) used by the /affiliate/onboarding landing page
// to validate an invite token and return the metadata needed to render
// the partner-branded onboarding experience for logged-out recipients.
//
// Body: { token }
// Returns:
//   ok    : { ok: true, invite: { email, name, company, tier_code,
//                                 commission_pct, commission_months,
//                                 attribution_days, expires_at, status } }
//   error : { ok: false, code: 'INVITE_NOT_FOUND' | 'EXPIRED'
//                            | 'REVOKED' | 'ALREADY_CLAIMED' }
//
// Security: the 32-byte URL-safe token IS the authorization. We deliberately
// do NOT echo back the original token. We do return the recipient's email so
// the onboarding form can pre-fill it (the recipient is the email's owner).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Server not configured" }, 500);
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = (typeof body.token === "string" ? body.token.trim() : "");
  if (!token) return json({ ok: false, code: "INVITE_NOT_FOUND" }, 404);

  const { data: invite, error: loadErr } = await adminClient
    .from("affiliate_invites")
    .select(
      "id, email, name, company, tier_code, expires_at, claimed_at, revoked_at",
    )
    .eq("token", token)
    .maybeSingle();
  if (loadErr) {
    console.error("[affiliate-invite-lookup] load failed", loadErr);
    return json({ ok: false, error: "Failed to load invite" }, 500);
  }
  if (!invite) return json({ ok: false, code: "INVITE_NOT_FOUND" }, 404);
  if (invite.revoked_at) return json({ ok: false, code: "REVOKED" }, 409);
  if (invite.claimed_at) return json({ ok: false, code: "ALREADY_CLAIMED" }, 409);
  const expired = new Date(invite.expires_at).getTime() < Date.now();
  if (expired) return json({ ok: false, code: "EXPIRED" }, 409);

  const tierCode = invite.tier_code || "starter";
  const { data: tier } = await adminClient
    .from("affiliate_tiers")
    .select("commission_pct, commission_months, attribution_days, min_payout_cents")
    .eq("code", tierCode)
    .maybeSingle();

  return json({
    ok: true,
    invite: {
      email: invite.email,
      name: invite.name,
      company: invite.company,
      tier_code: tierCode,
      commission_pct: tier?.commission_pct ?? 30,
      commission_months: tier?.commission_months ?? 12,
      attribution_days: tier?.attribution_days ?? 90,
      min_payout_cents: tier?.min_payout_cents ?? 5000,
      expires_at: invite.expires_at,
      status: "pending",
    },
  });
});
