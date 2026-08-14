// supabase/functions/crm-checkout/index.ts
//
// Embedded Stripe Checkout for the CRM per-seat add-on (product
// prod_V4aTX3Q8s58UwQ, "LIT CRM"). Called from the Pipeline page's
// CrmCheckoutModal when a non-entitled user clicks "Unlock CRM".
//
// Flow:
//   1. requireUser (JWT-verified) -> resolve caller's org + current plan_code.
//   2. Look up lit_crm_addon_pricing for that plan_code (source of truth for the
//      Stripe price id + forced_seats). No price IDs hardcoded here.
//   3. Reuse the org's Stripe customer if we have one (from subscriptions);
//      else create one.
//   4. Create an EMBEDDED Checkout Session (ui_mode:'embedded',
//      mode:'subscription'), quantity = forced_seats||1, adjustable_quantity
//      DISABLED when forced_seats is set. metadata carries org_id + kind.
//   5. Return { ok:true, client_secret }.
//
// On a Stripe price/mode mismatch ("No such price" / test-vs-live price)
// return { ok:false, error, code:'billing_not_configured' } with 200 so the
// UI can render "billing not configured for this environment" instead of a
// generic failure.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { requireUser, resolveUserOrg, json, handlePreflight } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

const moduleLog = createLogger("crm-checkout");

type CheckoutBody = {
  return_url?: string;
};

serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const log = moduleLog.child({ request_id: requestId() });

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  // 1. Resolve org + plan.
  const { orgId } = await resolveUserOrg(admin, user.id);
  if (!orgId) {
    return json({ ok: false, error: "No organization found for this user." }, 400);
  }

  // Current plan_code for the org drives which per-seat price the CRM add-on
  // uses. resolve_plan_code is the same SQL fn get_entitlements uses.
  let planCode = "free_trial";
  try {
    const { data: pc } = await admin.rpc("resolve_plan_code", {
      p_org_id: orgId,
      p_user_id: user.id,
    });
    if (typeof pc === "string" && pc) planCode = pc;
  } catch (_) {
    // Fall back to free_trial pricing (Starter price) on RPC error.
  }

  // 2. Pricing lookup (source of truth: lit_crm_addon_pricing).
  const { data: pricing, error: pricingErr } = await admin
    .from("lit_crm_addon_pricing")
    .select("stripe_price_id, per_seat_cents, forced_seats")
    .eq("plan_code", planCode)
    .maybeSingle();

  if (pricingErr || !pricing) {
    log.error("pricing_lookup_failed", {
      err: pricingErr?.message ?? "no pricing row",
      user_id: user.id,
      org_id: orgId,
      plan_code: planCode,
    });
    return json(
      { ok: false, error: "CRM add-on pricing is not configured for this plan.", code: "billing_not_configured" },
      200,
    );
  }

  const priceId = String((pricing as Record<string, unknown>).stripe_price_id);
  const forcedSeatsRaw = (pricing as Record<string, unknown>).forced_seats;
  const forcedSeats = forcedSeatsRaw == null ? null : Number(forcedSeatsRaw);
  const quantity = forcedSeats && forcedSeats > 0 ? forcedSeats : 1;

  // 3. Reuse the org's Stripe customer if we have one.
  let stripeCustomerId: string | null = null;
  try {
    const { data: subRow } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", orgId)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    stripeCustomerId = (subRow as Record<string, unknown> | null)?.stripe_customer_id as string ?? null;
  } catch (_) {
    stripeCustomerId = null;
  }

  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id, supabase_org_id: orgId },
      });
      stripeCustomerId = customer.id;
    } catch (e: any) {
      log.error("customer_create_failed", { err: e?.message || String(e), user_id: user.id, org_id: orgId });
      return json({ ok: false, error: "Could not create billing customer." }, 500);
    }
  }

  const body = (await req.json().catch(() => ({}))) as CheckoutBody;
  const origin = req.headers.get("origin") || "";
  const base = origin.startsWith("http") ? origin : "https://www.logisticintel.com";
  const returnUrl = body.return_url || `${base}/app/command-center?crm_checkout=complete`;

  // 4. Embedded Checkout Session. adjustable_quantity is DISABLED when the
  // plan forces a seat count (growth/scale/enterprise); enabled otherwise.
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
    price: priceId,
    quantity,
  };
  if (!forcedSeats) {
    lineItem.adjustable_quantity = { enabled: true, minimum: 1, maximum: 100 };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [lineItem],
      return_url: returnUrl,
      metadata: { org_id: orgId, kind: "crm_addon", plan_code: planCode, supabase_user_id: user.id },
      subscription_data: {
        metadata: { org_id: orgId, kind: "crm_addon", plan_code: planCode, supabase_user_id: user.id },
      },
    });

    log.info("checkout_created", { user_id: user.id, org_id: orgId, plan_code: planCode, quantity });
    return json({ ok: true, client_secret: session.client_secret, plan_code: planCode, seats: quantity });
  } catch (e: any) {
    const msg = e?.message || String(e);
    // "No such price" / test-vs-live mismatch => surface a config-mismatch the
    // UI can render gracefully, rather than a 500.
    if (/No such price|a similar object exists in (test|live) mode|does not exist/i.test(msg)) {
      log.warn("price_mismatch", { err: msg, user_id: user.id, org_id: orgId, plan_code: planCode, price_id: priceId });
      return json(
        {
          ok: false,
          error: "CRM billing is not configured for this environment (Stripe price not found).",
          code: "billing_not_configured",
          detail: msg,
        },
        200,
      );
    }
    log.error("checkout_failed", { err: msg, user_id: user.id, org_id: orgId, plan_code: planCode });
    return json({ ok: false, error: "Could not start checkout.", detail: msg }, 500);
  }
});
