// affiliate-review
// Privileged review of an affiliate application.
//
// Auth: caller must EITHER
//   (a) be a platform_admin (super-admin) — verified via JWT + platform_admins, OR
//   (b) present the AFFILIATE_REVIEW_SECRET shared secret in
//       x-affiliate-review-secret (for server-to-server / scripted review).
//
// On approve: creates the affiliate_partners row with a unique ref_code.
// On reject: writes rejection_reason and unblocks the user's "active"
// uniqueness window so they can reapply.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import {
  authenticate,
  corsHeaders,
  generateUniqueRefCode,
  getSupabaseEnv,
  isPlatformAdmin,
  json,
  nonEmptyString,
} from "../_shared/affiliate.ts";

interface ReviewBody {
  application_id?: string;
  action?: "approve" | "reject";
  rejection_reason?: string;
  tier?: string;
  commission_pct?: number;
  commission_months?: number;
}

const TIER_DEFAULTS = {
  starter:      { commission_pct: 30, commission_months: 12 },
  launch_promo: { commission_pct: 40, commission_months: 12 },
  partner:      { commission_pct: 30, commission_months: 12 },
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // Authenticate by either shared secret OR super-admin JWT.
  const reviewSecret = Deno.env.get("AFFILIATE_REVIEW_SECRET");
  const providedSecret = req.headers.get("x-affiliate-review-secret");

  let reviewerLabel = "system";
  let reviewerUserId: string | null = null;
  let adminClient;

  if (reviewSecret && providedSecret && providedSecret === reviewSecret) {
    const env = getSupabaseEnv();
    adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  } else {
    const auth = await authenticate(req);
    if ("error" in auth) return auth.error;
    const { user, adminClient: ac } = auth;
    const isAdmin = await isPlatformAdmin(ac, user.id);
    if (!isAdmin) {
      return json(
        { ok: false, error: "Forbidden: super-admin access required" },
        403,
      );
    }
    adminClient = ac;
    reviewerUserId = user.id;
    reviewerLabel = user.email ?? user.id;
  }

  const body = (await req.json().catch(() => ({}))) as ReviewBody;
  const applicationId = nonEmptyString(body.application_id);
  const action = body.action;

  if (!applicationId) {
    return json({ ok: false, error: "application_id required" }, 400);
  }
  if (action !== "approve" && action !== "reject") {
    return json({ ok: false, error: "action must be approve or reject" }, 400);
  }

  // Load application.
  const { data: app, error: appErr } = await adminClient
    .from("affiliate_applications")
    .select("id, user_id, status, full_name, company_or_brand")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr) {
    console.error("[affiliate-review] load failed", appErr);
    return json({ ok: false, error: "Failed to load application" }, 500);
  }
  if (!app) return json({ ok: false, error: "Application not found" }, 404);
  if (app.status !== "pending") {
    return json(
      { ok: false, error: `Application is already ${app.status}` },
      409,
    );
  }

  if (action === "reject") {
    const reason = nonEmptyString(body.rejection_reason);
    const { data, error } = await adminClient
      .from("affiliate_applications")
      .update({
        status: "rejected",
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerUserId,
        reviewer: reviewerLabel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", app.id)
      .select(
        "id, status, rejection_reason, reviewed_at, reviewer",
      )
      .maybeSingle();
    if (error) {
      console.error("[affiliate-review] reject failed", error);
      return json({ ok: false, error: "Failed to reject application" }, 500);
    }
    return json({ ok: true, application: data });
  }

  // === approve ===
  const tier = nonEmptyString(body.tier) ?? "starter";
  const tierConfig = TIER_DEFAULTS[tier as keyof typeof TIER_DEFAULTS];
  if (!tierConfig) {
    return json({ ok: false, error: `Unknown tier: ${tier}` }, 400);
  }
  const commissionPct =
    typeof body.commission_pct === "number" ? body.commission_pct : tierConfig.commission_pct;
  const commissionMonths =
    typeof body.commission_months === "number"
      ? body.commission_months
      : tierConfig.commission_months;

  // Make sure the user doesn't already have a partner row (defensive).
  const { data: existingPartner } = await adminClient
    .from("affiliate_partners")
    .select("id, ref_code, status")
    .eq("user_id", app.user_id)
    .maybeSingle();
  if (existingPartner) {
    return json(
      {
        ok: false,
        code: "ALREADY_PARTNER",
        partner: existingPartner,
      },
      409,
    );
  }

  let refCode: string;
  try {
    refCode = await generateUniqueRefCode(adminClient);
  } catch (err) {
    console.error("[affiliate-review] ref_code allocation failed", err);
    return json({ ok: false, error: "Failed to allocate ref_code" }, 500);
  }

  const { data: partner, error: partnerErr } = await adminClient
    .from("affiliate_partners")
    .insert({
      user_id: app.user_id,
      application_id: app.id,
      ref_code: refCode,
      tier,
      status: "active",
      commission_pct: commissionPct,
      commission_months: commissionMonths,
      joined_at: new Date().toISOString(),
    })
    .select(
      "id, user_id, ref_code, tier, status, commission_pct, commission_months, stripe_status, joined_at",
    )
    .maybeSingle();

  if (partnerErr) {
    console.error("[affiliate-review] partner insert failed", partnerErr);
    return json(
      { ok: false, error: "Failed to create partner record", details: partnerErr.message },
      500,
    );
  }

  const { error: appUpdateErr } = await adminClient
    .from("affiliate_applications")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerUserId,
      reviewer: reviewerLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", app.id);

  if (appUpdateErr) {
    console.error("[affiliate-review] application status update failed", appUpdateErr);
    // Partner is created; surface a warning rather than fail the request.
    return json(
      {
        ok: true,
        partner,
        warning: "Partner created but application status update failed",
        details: appUpdateErr.message,
      },
      200,
    );
  }

  return json({ ok: true, partner });
});
