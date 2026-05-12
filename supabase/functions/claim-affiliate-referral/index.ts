// claim-affiliate-referral v1
//
// Records an affiliate attribution: links the authenticated caller's user
// account to the partner identified by ref_code. Idempotent: a row in
// affiliate_referrals keyed to (partner_id, referred_user_id) blocks
// re-insert and returns status=duplicate. Self-referrals, expired codes,
// inactive partners, and conversions outside the attribution window all
// short-circuit to a definitive status the client can use to stop
// retrying. attribution_expires_at is set from the tier's attribution_days
// (default 90), so commission logic downstream can filter on it.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonRes(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return jsonRes(405, { ok: false, status: "method_not_allowed" });

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  let body: any = {};
  try { body = await req.json(); } catch {}
  const refCodeRaw = String(body?.ref_code || "").trim();
  if (!refCodeRaw || !/^[A-Za-z0-9_-]{4,32}$/.test(refCodeRaw)) {
    return jsonRes(400, { ok: false, status: "invalid_ref", reason: "ref_code_malformed" });
  }

  // Authenticate the caller. The user JWT is required — we will not
  // record attributions for anonymous calls.
  const supaAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  let userId = "";
  let userEmail: string | null = null;
  let userCreatedAt: string | null = null;
  try {
    const { data } = await supaAuth.auth.getUser(token);
    userId = data?.user?.id || "";
    userEmail = (data?.user?.email as string) || null;
    userCreatedAt = (data?.user?.created_at as string) || null;
  } catch {}
  if (!userId) return jsonRes(401, { ok: false, status: "unauthorized" });

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Resolve the partner. Match the ref_code case-insensitively because
  //    URL params can be normalized by intermediaries.
  const { data: partner, error: partnerErr } = await supa
    .from("affiliate_partners")
    .select("id, user_id, ref_code, status, referral_link_status, tier, commission_pct, commission_months, attribution_days, deleted_at")
    .ilike("ref_code", refCodeRaw)
    .is("deleted_at", null)
    .maybeSingle();
  if (partnerErr) {
    console.warn("[claim-affiliate-referral] partner lookup err", partnerErr);
    return jsonRes(500, { ok: false, status: "server_error" });
  }
  if (!partner) return jsonRes(404, { ok: false, status: "invalid_ref", reason: "unknown_code" });
  if (partner.status !== "active") {
    return jsonRes(409, { ok: false, status: "invalid_ref", reason: `partner_${partner.status}` });
  }
  if (partner.referral_link_status && partner.referral_link_status !== "active") {
    return jsonRes(409, { ok: false, status: "invalid_ref", reason: `link_${partner.referral_link_status}` });
  }

  // 2. Block self-referral.
  if (partner.user_id === userId) return jsonRes(409, { ok: false, status: "self_referral" });

  // 3. Block attribution for users who joined > 1 year ago.
  if (userCreatedAt) {
    const ageDays = (Date.now() - new Date(userCreatedAt).getTime()) / 86400000;
    if (ageDays > 365) return jsonRes(409, { ok: false, status: "too_late", reason: "user_too_old" });
  }

  // 4. Idempotency: if we already have a referral row for this user, return
  //    duplicate (and which partner currently owns the attribution).
  const { data: existing } = await supa
    .from("affiliate_referrals")
    .select("id, partner_id, ref_code, signed_up_at, attribution_expires_at")
    .eq("referred_user_id", userId)
    .maybeSingle();
  if (existing) {
    return jsonRes(200, {
      ok: true,
      status: "duplicate",
      referral_id: existing.id,
      owned_by_partner_id: existing.partner_id,
      current_ref_code: existing.ref_code,
    });
  }

  // 5. Resolve the attribution window. Prefer the partner's override; fall
  //    back to the tier default; final fallback is 90 days.
  let attributionDays = Number(partner.attribution_days) || 0;
  if (!attributionDays) {
    try {
      const { data: tier } = await supa
        .from("affiliate_tiers")
        .select("attribution_days")
        .eq("code", partner.tier)
        .maybeSingle();
      attributionDays = Number(tier?.attribution_days) || 0;
    } catch {}
  }
  if (!attributionDays) attributionDays = 90;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + attributionDays * 86400000);

  // 6. Insert. uniq_affiliate_referrals_user keeps us idempotent if a
  //    race inserted between step 4 and now.
  const insertPayload = {
    partner_id: partner.id,
    ref_code: partner.ref_code,
    referred_user_id: userId,
    referred_email: userEmail,
    subscription_status: "prospect",
    first_seen_at: now.toISOString(),
    signed_up_at: now.toISOString(),
    attribution_expires_at: expiresAt.toISOString(),
  };
  const { data: inserted, error: insertErr } = await supa
    .from("affiliate_referrals")
    .insert(insertPayload)
    .select("id, partner_id, ref_code, attribution_expires_at")
    .single();

  if (insertErr) {
    // Unique-violation race — someone else just claimed.
    if (String(insertErr.code) === "23505") {
      return jsonRes(200, { ok: true, status: "duplicate" });
    }
    console.warn("[claim-affiliate-referral] insert err", insertErr);
    return jsonRes(500, { ok: false, status: "server_error", detail: insertErr.message });
  }

  return jsonRes(200, {
    ok: true,
    status: "claimed",
    referral_id: inserted.id,
    partner_id: inserted.partner_id,
    ref_code: inserted.ref_code,
    attribution_expires_at: inserted.attribution_expires_at,
    commission_pct: partner.commission_pct,
    commission_months: partner.commission_months,
  });
});
