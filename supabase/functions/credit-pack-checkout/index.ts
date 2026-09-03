// credit-pack-checkout — embedded Stripe Checkout for a one-time LIT Credits
// top-up pack. Mirrors crm-checkout but mode:'payment' (not subscription).
//
// Flow:
//   1. requireUser -> resolve caller's org + role. Purchasing defaults to
//      org admins/owners (brief §77).
//   2. Look up the pack in lit_credit_packages (source of truth for the Stripe
//      price id + credit count). No price IDs hardcoded here.
//   3. Reuse the org's Stripe customer if we have one; else create one.
//   4. Create an EMBEDDED one-time Checkout Session. metadata carries
//      org_id + kind='credit_pack' + credits + pack_id so billing-webhook can
//      grant the credits idempotently on checkout.session.completed.
//   5. Return { ok:true, client_secret }.
//
// The credits are NOT granted here — only a confirmed Stripe webhook may credit
// the workspace (brief §32). This function just starts the paid checkout.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { requireUser, resolveUserOrg, json, handlePreflight } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
const moduleLog = createLogger("credit-pack-checkout");

type Body = { pack_id?: string; return_url?: string };

serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const log = moduleLog.child({ request_id: requestId() });

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  const { orgId, role } = await resolveUserOrg(admin, user.id);
  if (!orgId) return json({ ok: false, error: "No organization found for this user." }, 400);
  // §77 — purchasing credits defaults to admins/owners.
  if (!["owner", "admin"].includes(String(role ?? ""))) {
    return json({ ok: false, error: "Only a workspace admin can purchase credits.", code: "admin_only" }, 403);
  }

  // Fail-closed gate: no credit-pack session is created until the billing-webhook
  // credit_pack grant branch is deployed (flag credits_purchase_enabled flipped
  // on). Without this, a purchase could complete with no working grant path.
  const { data: flag } = await admin
    .from("lit_feature_flags")
    .select("global_kill")
    .eq("key", "credits_purchase_enabled")
    .maybeSingle();
  if (!flag || (flag as { global_kill?: boolean }).global_kill !== false) {
    return json(
      { ok: false, error: "Credit purchases are launching soon.", code: "billing_not_configured" },
      200,
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const packId = String(body.pack_id ?? "").trim();
  if (!packId) return json({ ok: false, error: "pack_id is required." }, 400);

  // 2. Pack lookup (source of truth: lit_credit_packages).
  const { data: pack, error: packErr } = await admin
    .from("lit_credit_packages")
    .select("id, credits, price_usd_cents, stripe_price_id, active")
    .eq("id", packId)
    .eq("active", true)
    .maybeSingle();
  if (packErr || !pack) {
    log.error("pack_lookup_failed", { err: packErr?.message ?? "no pack", pack_id: packId, org_id: orgId });
    return json({ ok: false, error: "That credit pack isn't available.", code: "pack_not_found" }, 200);
  }
  const priceId = String((pack as Record<string, unknown>).stripe_price_id);
  const credits = Number((pack as Record<string, unknown>).credits);

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

  const origin = req.headers.get("origin") || "";
  const base = origin.startsWith("http") ? origin : "https://www.logisticintel.com";
  const returnUrl = body.return_url || `${base}/app/billing?credit_purchase=complete`;

  const sharedMeta = {
    org_id: orgId,
    kind: "credit_pack",
    credits: String(credits),
    pack_id: packId,
    supabase_user_id: user.id,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: returnUrl,
      metadata: sharedMeta,
      payment_intent_data: { metadata: sharedMeta },
    });
    log.info("checkout_created", { user_id: user.id, org_id: orgId, pack_id: packId, credits });
    return json({ ok: true, client_secret: session.client_secret, pack_id: packId, credits });
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (/No such price|a similar object exists in (test|live) mode|does not exist/i.test(msg)) {
      log.warn("price_mismatch", { err: msg, pack_id: packId, price_id: priceId, org_id: orgId });
      return json(
        { ok: false, error: "Credit-pack billing isn't configured for this environment.", code: "billing_not_configured", detail: msg },
        200,
      );
    }
    log.error("checkout_failed", { err: msg, user_id: user.id, org_id: orgId, pack_id: packId });
    return json({ ok: false, error: "Could not start checkout.", detail: msg }, 500);
  }
});
