// stripe-connect-onboard
// Approved partner starts (or resumes) Stripe Connect Express onboarding.
//
// Behavior:
//   - Authenticate the user. Require an active affiliate_partners row.
//   - If STRIPE_SECRET_KEY missing, return STRIPE_NOT_CONFIGURED — UI will
//     show an honest "Stripe Connect is not configured yet" message.
//   - If partner.stripe_account_id missing, create a Stripe Express
//     connected account and persist the id.
//   - Create an account link (kind=account_onboarding) with refresh/return
//     URLs pointing back at /app/affiliate.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import {
  authenticate,
  corsHeaders,
  json,
} from "../_shared/affiliate.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    return json({ ok: false, code: "STRIPE_NOT_CONFIGURED" }, 200);
  }

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { user, adminClient } = auth;

  const { data: partner, error: partnerErr } = await adminClient
    .from("affiliate_partners")
    .select(
      "id, user_id, status, stripe_account_id, stripe_status, payout_currency",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (partnerErr) {
    console.error("[stripe-connect-onboard] partner load failed", partnerErr);
    return json({ ok: false, error: "Failed to load partner record" }, 500);
  }
  if (!partner) {
    return json({ ok: false, error: "No active partner record" }, 403);
  }
  if (partner.status !== "active") {
    return json(
      { ok: false, error: `Partner status is ${partner.status}` },
      403,
    );
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

  // 1. Ensure Stripe Express account exists.
  let stripeAccountId = partner.stripe_account_id;
  if (!stripeAccountId) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email ?? undefined,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          supabase_user_id: user.id,
          affiliate_partner_id: partner.id,
        },
      });
      stripeAccountId = account.id;
      const { error: updateErr } = await adminClient
        .from("affiliate_partners")
        .update({
          stripe_account_id: stripeAccountId,
          stripe_status: "onboarding_started",
          updated_at: new Date().toISOString(),
        })
        .eq("id", partner.id);
      if (updateErr) {
        console.error("[stripe-connect-onboard] persist account_id failed", updateErr);
      }
    } catch (err) {
      console.error("[stripe-connect-onboard] account create failed", err);
      return json(
        {
          ok: false,
          error: "Failed to create Stripe Connect account",
          details: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  }

  // 2. Compute return/refresh URLs.
  const origin = req.headers.get("origin");
  const appUrl =
    Deno.env.get("APP_URL") ||
    (origin && origin.startsWith("http") ? origin : "https://www.logisticintel.com");
  const refreshUrl = `${appUrl}/app/affiliate?stripe=refresh`;
  const returnUrl = `${appUrl}/app/affiliate?stripe=return`;

  // 3. Create account link.
  let accountLinkUrl: string;
  try {
    const link = await stripe.accountLinks.create({
      account: stripeAccountId!,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    accountLinkUrl = link.url;
  } catch (err) {
    console.error("[stripe-connect-onboard] account link failed", err);
    return json(
      {
        ok: false,
        error: "Failed to create Stripe onboarding link",
        details: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }

  return json({
    ok: true,
    url: accountLinkUrl,
    stripe_account_id: stripeAccountId,
    stripe_status: partner.stripe_status === "payouts_enabled"
      ? partner.stripe_status
      : "onboarding_started",
  });
});
