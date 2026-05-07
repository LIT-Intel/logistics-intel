// supabase/functions/get-billing-status/index.ts
//
// Single canonical "tell me everything billing-related" read for the
// authenticated user. Combines:
//   - subscriptions row (plan_code, status, period dates, cancel_at_period_end)
//   - REAL default payment method from Stripe (NOT inferred from
//     stripe_customer_id existence — fixes the false "card on file" bug)
//   - trial_ends_at (from subscriptions or derived from auth.users.created_at + plan.trial_days)
//   - seat snapshot (included from plan, used = confirmed org_members)
//
// Why this exists:
//   The Billing page used to render a card on file for any user with a
//   stripe_customer_id, even if no payment method was ever attached.
//   This function asks Stripe for customer.invoice_settings.
//   default_payment_method, falls back to the active subscription's
//   default_payment_method, and reports brand/last4/exp ONLY if Stripe
//   returns one. No card on file -> hasPaymentMethod=false, period.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");
if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!anonKey) throw new Error("Missing SUPABASE_ANON_KEY");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type PaymentMethodSummary = {
  hasPaymentMethod: boolean;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  source: "customer_default" | "subscription_default" | "none";
};

async function resolveDefaultPaymentMethod(customerId: string): Promise<PaymentMethodSummary> {
  // Customer-level default first (set in Stripe portal / via API).
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });

  if (customer.deleted) {
    return { hasPaymentMethod: false, brand: null, last4: null, expMonth: null, expYear: null, source: "none" };
  }

  const customerDefault = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
  if (customerDefault && typeof customerDefault !== "string") {
    const card = customerDefault.card;
    if (card) {
      return {
        hasPaymentMethod: true,
        brand: card.brand ?? null,
        last4: card.last4 ?? null,
        expMonth: card.exp_month ?? null,
        expYear: card.exp_year ?? null,
        source: "customer_default",
      };
    }
  }

  // Fall back to the latest active/trialing subscription's
  // default_payment_method. This is what Stripe actually charges if no
  // customer-level default is set.
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 5,
    expand: ["data.default_payment_method"],
  });

  const live = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
  const subDefault = live?.default_payment_method;
  if (subDefault && typeof subDefault !== "string") {
    const card = subDefault.card;
    if (card) {
      return {
        hasPaymentMethod: true,
        brand: card.brand ?? null,
        last4: card.last4 ?? null,
        expMonth: card.exp_month ?? null,
        expYear: card.exp_year ?? null,
        source: "subscription_default",
      };
    }
  }

  return { hasPaymentMethod: false, brand: null, last4: null, expMonth: null, expYear: null, source: "none" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "Missing Authorization header" }, 401);

  const userClient = createClient(supabaseUrl!, anonKey!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl!, serviceKey!);

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const user = authData.user;

  // Subscription row (user-keyed).
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_code, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, trial_ends_at, seat_quantity")
    .eq("user_id", user.id)
    .maybeSingle();

  // Plan row for trial_days + included_seats.
  const planCode = sub?.plan_code || "free_trial";
  const { data: plan } = await admin
    .from("plans")
    .select("code, name, included_seats, trial_days, price_monthly, price_yearly, stripe_price_id_monthly, stripe_price_id_yearly")
    .eq("code", planCode)
    .maybeSingle();

  // Trial end derivation: explicit column wins; otherwise free_trial users
  // get auth.users.created_at + plan.trial_days.
  let trialEndsAt: string | null = sub?.trial_ends_at ?? null;
  if (!trialEndsAt && planCode === "free_trial" && (plan?.trial_days ?? 0) > 0) {
    const created = (user as { created_at?: string }).created_at;
    if (created) {
      const end = new Date(created);
      end.setDate(end.getDate() + (plan!.trial_days || 30));
      trialEndsAt = end.toISOString();
    }
  }

  // Org + seat snapshot.
  let orgId: string | null = null;
  let seatsUsed = 0;
  const { data: membership } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  orgId = membership?.org_id ?? null;
  if (orgId) {
    const { count } = await admin
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId);
    seatsUsed = count ?? 0;
  }

  // Payment method — REAL Stripe lookup, only if a customer id exists.
  let paymentMethod: PaymentMethodSummary = {
    hasPaymentMethod: false, brand: null, last4: null, expMonth: null, expYear: null, source: "none",
  };
  if (sub?.stripe_customer_id) {
    try {
      paymentMethod = await resolveDefaultPaymentMethod(sub.stripe_customer_id);
    } catch (err) {
      console.warn("[get-billing-status] Stripe PM lookup failed:", err);
    }
  }

  return json({
    ok: true,
    user_id: user.id,
    org_id: orgId,
    plan: {
      code: planCode,
      name: plan?.name ?? null,
      included_seats: plan?.included_seats ?? null,
      trial_days: plan?.trial_days ?? 0,
      price_monthly: plan?.price_monthly ?? null,
      price_yearly: plan?.price_yearly ?? null,
      stripe_price_id_monthly: plan?.stripe_price_id_monthly ?? null,
      stripe_price_id_yearly: plan?.stripe_price_id_yearly ?? null,
    },
    subscription: {
      status: sub?.status ?? null,
      stripe_customer_id: sub?.stripe_customer_id ?? null,
      stripe_subscription_id: sub?.stripe_subscription_id ?? null,
      current_period_start: sub?.current_period_start ?? null,
      current_period_end: sub?.current_period_end ?? null,
      cancel_at_period_end: Boolean(sub?.cancel_at_period_end),
      trial_ends_at: trialEndsAt,
      seat_quantity: sub?.seat_quantity ?? null,
    },
    payment_method: paymentMethod,
    seats: {
      included: plan?.included_seats ?? null,
      used: seatsUsed,
    },
  });
});
