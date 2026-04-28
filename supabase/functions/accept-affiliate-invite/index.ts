// accept-affiliate-invite
// Logged-in user claims a pending affiliate invite token. Creates the
// affiliate_partners row with status='invited' (not 'active' — the user
// still needs to connect Stripe to activate). Idempotent: if the same
// user re-claims a token they already claimed, returns the existing
// partner.
//
// Body: { token }
// Returns: { ok, partner } | { ok: false, code, error }

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
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

async function authenticate(req: Request) {
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
  return { user: data.user, adminClient };
}

const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function generateRefCode(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return out;
}
async function generateUniqueRefCode(adminClient: SupabaseClient, attempts = 6): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const code = generateRefCode(8);
    const { data, error } = await adminClient
      .from("affiliate_partners")
      .select("id")
      .eq("ref_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error("Unable to allocate unique ref_code");
}

const TIER_DEFAULTS: Record<string, { commission_pct: number; commission_months: number }> = {
  starter:      { commission_pct: 30, commission_months: 12 },
  launch_promo: { commission_pct: 40, commission_months: 12 },
  partner:      { commission_pct: 30, commission_months: 12 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { user, adminClient } = auth;

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = (typeof body.token === "string" ? body.token.trim() : "");
  if (!token) return json({ ok: false, error: "token is required" }, 400);

  // Look up the invite (service role bypasses RLS).
  const { data: invite, error: loadErr } = await adminClient
    .from("affiliate_invites")
    .select("id, email, name, company, tier_code, expires_at, claimed_at, claimed_by_user_id, revoked_at, partner_id")
    .eq("token", token)
    .maybeSingle();
  if (loadErr) {
    console.error("[accept-affiliate-invite] load failed", loadErr);
    return json({ ok: false, error: "Failed to load invite" }, 500);
  }
  if (!invite) return json({ ok: false, code: "INVITE_NOT_FOUND" }, 404);

  // Already claimed.
  if (invite.claimed_at) {
    if (invite.claimed_by_user_id === user.id && invite.partner_id) {
      // Idempotent re-claim by the same user — return current partner state.
      const { data: partner } = await adminClient
        .from("affiliate_partners")
        .select("id, ref_code, tier, status, stripe_status, joined_at")
        .eq("id", invite.partner_id)
        .maybeSingle();
      return json({ ok: true, mode: "already_claimed", partner: partner ?? null });
    }
    return json({ ok: false, code: "ALREADY_CLAIMED" }, 409);
  }
  if (invite.revoked_at) return json({ ok: false, code: "REVOKED" }, 409);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ ok: false, code: "EXPIRED" }, 409);
  }

  // Block if user already has an active (non-deleted) partner.
  const { data: existingPartner } = await adminClient
    .from("affiliate_partners")
    .select("id, status, ref_code, deleted_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingPartner) {
    return json({
      ok: false,
      code: "ALREADY_PARTNER",
      partner: existingPartner,
    }, 409);
  }

  // Allocate ref_code.
  let refCode: string;
  try {
    refCode = await generateUniqueRefCode(adminClient);
  } catch (err) {
    console.error("[accept-affiliate-invite] ref_code allocation failed", err);
    return json({ ok: false, error: "Failed to allocate ref_code" }, 500);
  }

  const tierCode = invite.tier_code || "starter";
  const tierConf = TIER_DEFAULTS[tierCode] || TIER_DEFAULTS.starter;

  // Insert partner with status='invited'. referral_link_status stays
  // 'inactive' until status flips to 'active' (admin approval, or
  // automatically once Stripe payouts are enabled — Phase C work).
  const { data: partner, error: partnerErr } = await adminClient
    .from("affiliate_partners")
    .insert({
      user_id: user.id,
      invite_id: invite.id,
      ref_code: refCode,
      tier: tierCode,
      status: "invited",
      commission_pct: tierConf.commission_pct,
      commission_months: tierConf.commission_months,
      joined_at: new Date().toISOString(),
      referral_link_status: "inactive",
    })
    .select("id, user_id, ref_code, tier, status, commission_pct, commission_months, stripe_status, joined_at, referral_link_status")
    .maybeSingle();
  if (partnerErr || !partner) {
    console.error("[accept-affiliate-invite] partner insert failed", partnerErr);
    return json({
      ok: false,
      error: "Failed to create partner record",
      details: partnerErr?.message,
    }, 500);
  }

  // Mark invite as claimed.
  const { error: invUpdErr } = await adminClient
    .from("affiliate_invites")
    .update({
      claimed_at: new Date().toISOString(),
      claimed_by_user_id: user.id,
      partner_id: partner.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
  if (invUpdErr) {
    console.error("[accept-affiliate-invite] invite update failed", invUpdErr);
    // Partner is created — surface a warning rather than hard fail.
  }

  return json({ ok: true, mode: "claimed", partner });
});
