// admin-assign-affiliate
//
// Platform-admin-only manual affiliate attribution. When a subscriber signs up
// WITHOUT the ?ref= link, the ref-capture flow (claim-affiliate-referral) never
// runs, so the partner who actually sent them gets no credit. This lets an admin
// attribute an existing user/org to a partner after the fact, writing the SAME
// row shape claim-affiliate-referral produces — so the existing commission path
// (_shared/affiliate_commission.ts, keyed on affiliate_referrals.referred_user_id
// -> active partner -> unexpired attribution window) credits the partner with no
// other change.
//
// Auth: JWT must belong to a row in public.platform_admins (server-side; the UI
//       gate is a hint only).
//
// Idempotent: the unique index uniq_affiliate_referrals_user(referred_user_id)
//       means a user can only be attributed once. If they already have a
//       referral row we return status='duplicate' with the current owner — we
//       NEVER silently re-point an existing attribution to a different partner
//       (that would move money). Re-pointing is a deliberate, separate action.
//
// Rows created here are tagged source='manual_admin' and carry an audit trail in
// metadata (assigned_by_user_id / assigned_by_email / assigned_at).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, status: "method_not_allowed" }, 405);

  // ── Authenticate: real user JWT required. ──
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ ok: false, status: "unauthorized" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, status: "unauthorized" }, 401);
  const actor = userData.user;

  // ── Gate to platform_admins (server-side is the security boundary). ──
  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", actor.id)
    .maybeSingle();
  if (!adminRow) return json({ ok: false, status: "forbidden" }, 403);

  // ── Parse body. ──
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const partnerId = nonEmpty(body.partner_id);
  const targetUserIdRaw = nonEmpty(body.user_id);
  const targetEmailRaw = nonEmpty(body.email);

  if (!partnerId || !UUID_RE.test(partnerId)) {
    return json({ ok: false, status: "invalid_request", reason: "partner_id_required" }, 400);
  }
  if (!targetUserIdRaw && !targetEmailRaw) {
    return json({ ok: false, status: "invalid_request", reason: "user_id_or_email_required" }, 400);
  }

  // ── Resolve the target subscriber (user_id preferred; else look up by email). ──
  let targetUserId: string | null = null;
  let targetEmail: string | null = null;
  if (targetUserIdRaw) {
    if (!UUID_RE.test(targetUserIdRaw)) {
      return json({ ok: false, status: "invalid_request", reason: "user_id_malformed" }, 400);
    }
    const { data: got, error } = await admin.auth.admin.getUserById(targetUserIdRaw);
    if (error || !got?.user) {
      return json({ ok: false, status: "user_not_found", reason: "unknown_user_id" }, 404);
    }
    targetUserId = got.user.id;
    targetEmail = (got.user.email as string) || null;
  } else if (targetEmailRaw) {
    // auth.admin has no getUserByEmail; page through users and match.
    const wanted = targetEmailRaw.toLowerCase();
    let page = 1;
    const perPage = 200;
    // Cap the scan so a huge user table can't run forever. 20 pages * 200 = 4000.
    for (; page <= 20 && !targetUserId; page++) {
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return json({ ok: false, status: "server_error", reason: "user_lookup_failed" }, 500);
      const users = list?.users ?? [];
      const hit = users.find((u) => (u.email || "").toLowerCase() === wanted);
      if (hit) { targetUserId = hit.id; targetEmail = hit.email ?? null; break; }
      if (users.length < perPage) break; // last page
    }
    if (!targetUserId) {
      return json({ ok: false, status: "user_not_found", reason: "unknown_email" }, 404);
    }
  }

  if (!targetUserId) {
    return json({ ok: false, status: "user_not_found" }, 404);
  }

  // ── Resolve the partner. Must be active + not deleted (same rule as claim). ──
  const { data: partner, error: partnerErr } = await admin
    .from("affiliate_partners")
    .select("id, user_id, ref_code, status, referral_link_status, tier, commission_pct, commission_months, attribution_days, deleted_at")
    .eq("id", partnerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (partnerErr) return json({ ok: false, status: "server_error", reason: "partner_lookup_failed" }, 500);
  if (!partner) return json({ ok: false, status: "invalid_partner", reason: "unknown_partner" }, 404);
  if (partner.status !== "active") {
    return json({ ok: false, status: "invalid_partner", reason: `partner_${partner.status}` }, 409);
  }

  // ── Block self-attribution (partner cannot be credited for their own account). ──
  if (partner.user_id === targetUserId) {
    return json({ ok: false, status: "self_referral" }, 409);
  }

  // ── Idempotency: if the user is already attributed, do NOT re-point. ──
  const { data: existing } = await admin
    .from("affiliate_referrals")
    .select("id, partner_id, ref_code, source, signed_up_at, attribution_expires_at")
    .eq("referred_user_id", targetUserId)
    .maybeSingle();
  if (existing) {
    const samePartner = existing.partner_id === partner.id;
    return json({
      ok: true,
      status: "duplicate",
      already_assigned: true,
      same_partner: samePartner,
      referral_id: existing.id,
      owned_by_partner_id: existing.partner_id,
      current_ref_code: existing.ref_code,
      current_source: existing.source,
    });
  }

  // ── Resolve the attribution window (partner override -> tier -> 90). ──
  let attributionDays = Number(partner.attribution_days) || 0;
  if (!attributionDays) {
    try {
      const { data: tier } = await admin
        .from("affiliate_tiers")
        .select("attribution_days")
        .eq("code", partner.tier)
        .maybeSingle();
      attributionDays = Number(tier?.attribution_days) || 0;
    } catch { /* ignore */ }
  }
  if (!attributionDays) attributionDays = 90;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + attributionDays * 86400000);

  // ── Insert the attribution row — SAME shape claim-affiliate-referral writes,
  //    plus source='manual_admin' and an audit trail in metadata. ──
  const insertPayload = {
    partner_id: partner.id,
    ref_code: partner.ref_code,
    referred_user_id: targetUserId,
    referred_email: targetEmail,
    subscription_status: "prospect",
    source: "manual_admin",
    first_seen_at: now.toISOString(),
    signed_up_at: now.toISOString(),
    attribution_expires_at: expiresAt.toISOString(),
    metadata: {
      assigned_by_user_id: actor.id,
      assigned_by_email: actor.email ?? null,
      assigned_at: now.toISOString(),
    },
  };

  const { data: inserted, error: insertErr } = await admin
    .from("affiliate_referrals")
    .insert(insertPayload)
    .select("id, partner_id, ref_code, source, attribution_expires_at")
    .single();

  if (insertErr) {
    // Unique-violation race — someone (or the claim fn) inserted first.
    if (String((insertErr as { code?: string }).code) === "23505") {
      const { data: raced } = await admin
        .from("affiliate_referrals")
        .select("id, partner_id, ref_code, source")
        .eq("referred_user_id", targetUserId)
        .maybeSingle();
      return json({
        ok: true,
        status: "duplicate",
        already_assigned: true,
        same_partner: raced?.partner_id === partner.id,
        referral_id: raced?.id ?? null,
        owned_by_partner_id: raced?.partner_id ?? null,
        current_ref_code: raced?.ref_code ?? null,
        current_source: raced?.source ?? null,
      });
    }
    console.error("[admin-assign-affiliate] insert err", insertErr);
    return json({ ok: false, status: "server_error", reason: "insert_failed", detail: insertErr.message }, 500);
  }

  console.log(JSON.stringify({
    fn: "admin-assign-affiliate",
    event: "manual_assignment_created",
    referral_id: inserted.id,
    partner_id: partner.id,
    referred_user_id: targetUserId,
    assigned_by: actor.id,
  }));

  return json({
    ok: true,
    status: "assigned",
    referral_id: inserted.id,
    partner_id: inserted.partner_id,
    ref_code: inserted.ref_code,
    source: inserted.source,
    referred_user_id: targetUserId,
    referred_email: targetEmail,
    attribution_expires_at: inserted.attribution_expires_at,
    commission_pct: partner.commission_pct,
    commission_months: partner.commission_months,
  });
});
