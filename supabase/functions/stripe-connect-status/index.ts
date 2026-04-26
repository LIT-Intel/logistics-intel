// stripe-connect-status
// Refresh the partner's Stripe Connect account status after onboarding
// return, or on demand from the dashboard.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import {
  authenticate,
  corsHeaders,
  json,
  mapStripeAccountStatus,
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
      "id, user_id, status, stripe_account_id, stripe_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (partnerErr) {
    console.error("[stripe-connect-status] partner load failed", partnerErr);
    return json({ ok: false, error: "Failed to load partner record" }, 500);
  }
  if (!partner) return json({ ok: false, error: "No partner record" }, 403);

  if (!partner.stripe_account_id) {
    return json({
      ok: true,
      stripe_status: "not_connected",
      stripe_account_id: null,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
    });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

  let account;
  try {
    account = await stripe.accounts.retrieve(partner.stripe_account_id);
  } catch (err) {
    console.error("[stripe-connect-status] account retrieve failed", err);
    return json(
      {
        ok: false,
        error: "Failed to retrieve Stripe account",
        details: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }

  const newStatus = mapStripeAccountStatus({
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    requirements: account.requirements
      ? {
          currently_due: account.requirements.currently_due ?? [],
          past_due: account.requirements.past_due ?? [],
          disabled_reason: account.requirements.disabled_reason ?? null,
        }
      : undefined,
  });

  const update = {
    stripe_status: newStatus,
    stripe_charges_enabled: Boolean(account.charges_enabled),
    stripe_payouts_enabled: Boolean(account.payouts_enabled),
    stripe_details_submitted: Boolean(account.details_submitted),
    updated_at: new Date().toISOString(),
  };

  const changed =
    partner.stripe_status !== update.stripe_status ||
    partner.stripe_charges_enabled !== update.stripe_charges_enabled ||
    partner.stripe_payouts_enabled !== update.stripe_payouts_enabled ||
    partner.stripe_details_submitted !== update.stripe_details_submitted;

  if (changed) {
    const { error: updateErr } = await adminClient
      .from("affiliate_partners")
      .update(update)
      .eq("id", partner.id);
    if (updateErr) {
      console.error("[stripe-connect-status] update failed", updateErr);
    }
  }

  return json({
    ok: true,
    stripe_status: update.stripe_status,
    stripe_account_id: partner.stripe_account_id,
    stripe_charges_enabled: update.stripe_charges_enabled,
    stripe_payouts_enabled: update.stripe_payouts_enabled,
    stripe_details_submitted: update.stripe_details_submitted,
    requirements: account.requirements
      ? {
          currently_due: account.requirements.currently_due ?? [],
          past_due: account.requirements.past_due ?? [],
          disabled_reason: account.requirements.disabled_reason ?? null,
        }
      : null,
  });
});
