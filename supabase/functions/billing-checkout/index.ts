// supabase/functions/billing-checkout/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CheckoutRequest = {
  plan_code?: string;
  interval?: "month" | "year";
  success_url?: string;
  cancel_url?: string;
};

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}
if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}
if (!supabaseAnonKey) {
  throw new Error("Missing SUPABASE_ANON_KEY");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-06-20",
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizePlanCode(plan?: string | null) {
  const p = String(plan || "").toLowerCase().trim();

  if (!p || p === "free" || p === "free_trial") return "standard";
  if (p === "pro" || p === "starter" || p === "standard") return "standard";
  if (p === "growth" || p === "growth_plus") return "growth";
  if (p.startsWith("enterprise")) return "enterprise";

  return p;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
      },
    });

    if (!userRes.ok) {
      const text = await userRes.text();
      return json(
        { error: "Unauthorized", details: text || "Could not fetch user" },
        401,
      );
    }

    const user = await userRes.json();
    const userId = user?.id as string | undefined;
    const userEmail = user?.email as string | undefined;

    if (!userId || !userEmail) {
      return json({ error: "Authenticated user is missing id or email" }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as CheckoutRequest;

    const requestedPlan = normalizePlanCode(body.plan_code);
    const interval = body.interval === "year" ? "year" : "month";

    if (requestedPlan === "free_trial") {
      return json({ error: "Cannot create checkout for free_trial" }, 400);
    }

    const origin = req.headers.get("origin") || "";
    const fallbackBase =
      origin && origin.startsWith("http")
        ? origin
        : "https://www.logisticintel.com";

    const successUrl =
      body.success_url ||
      `${fallbackBase}/app/billing?checkout=success`;
    const cancelUrl =
      body.cancel_url ||
      `${fallbackBase}/app/billing?checkout=cancelled`;

    // 1) Load the selected plan from Supabase
    const planQuery = new URL(`${supabaseUrl}/rest/v1/plans`);
    planQuery.searchParams.set("select", "*");
    planQuery.searchParams.set("code", `eq.${requestedPlan}`);
    planQuery.searchParams.set("is_active", "eq.true");
    planQuery.searchParams.set("limit", "1");

    const planRes = await fetch(planQuery.toString(), {
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
        Accept: "application/json",
      },
    });

    if (!planRes.ok) {
      const text = await planRes.text();
      return json({ error: "Failed to load plan", details: text }, 500);
    }

    const plans = await planRes.json();
    const plan = Array.isArray(plans) ? plans[0] : null;

    if (!plan) {
      return json({ error: `Active plan not found for code: ${requestedPlan}` }, 404);
    }

    const priceId =
      interval === "year"
        ? plan.stripe_price_id_yearly
        : plan.stripe_price_id_monthly;

    if (!priceId) {
      return json(
        {
          error: `Missing Stripe price id for ${requestedPlan} (${interval})`,
        },
        400,
      );
    }

    // 2) Check for existing subscription/customer record
    const subQuery = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
    subQuery.searchParams.set("select", "*");
    subQuery.searchParams.set("user_id", `eq.${userId}`);
    subQuery.searchParams.set("order", "created_at.desc");
    subQuery.searchParams.set("limit", "1");

    const subRes = await fetch(subQuery.toString(), {
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
        Accept: "application/json",
      },
    });

    if (!subRes.ok) {
      const text = await subRes.text();
      return json({ error: "Failed to load subscription", details: text }, 500);
    }

    const subs = await subRes.json();
    const existingSub = Array.isArray(subs) ? subs[0] : null;

    let stripeCustomerId =
      existingSub?.stripe_customer_id ||
      user?.user_metadata?.stripe_customer_id ||
      null;

    // 3) Create Stripe customer if needed
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          supabase_user_id: userId,
        },
      });

      stripeCustomerId = customer.id;
    }

    // 4) Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      client_reference_id: userId,
      metadata: {
        supabase_user_id: userId,
        plan_code: requestedPlan,
        interval,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: userId,
          plan_code: requestedPlan,
          interval,
        },
      },
    });

    // 5) Upsert a pending subscription row so frontend has a billing anchor
    const upsertPayload = {
      user_id: userId,
      plan_code: requestedPlan,
      stripe_customer_id: stripeCustomerId,
      status: existingSub?.status || "incomplete",
      updated_at: new Date().toISOString(),
    };

    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(upsertPayload),
      },
    );

    if (!upsertRes.ok) {
      const text = await upsertRes.text();
      return json(
        {
          error: "Checkout created, but failed to persist subscription anchor",
          details: text,
          url: session.url,
          sessionId: session.id,
        },
        500,
      );
    }

    return json({
      ok: true,
      url: session.url,
      sessionId: session.id,
      stripe_customer_id: stripeCustomerId,
      plan_code: requestedPlan,
      interval,
    });
  } catch (error) {
    console.error("[billing-checkout] fatal", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
