// supabase/functions/billing-portal/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    if (!userId) {
      return json({ error: "Authenticated user is missing id" }, 400);
    }

    // 1) Load user's subscription to get Stripe customer ID
    const subQuery = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
    subQuery.searchParams.set("select", "*");
    subQuery.searchParams.set("user_id", `eq.${userId}`);
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
      return json(
        { error: "Failed to load subscription", details: text },
        500,
      );
    }

    const subs = await subRes.json();
    const subscription = Array.isArray(subs) ? subs[0] : null;

    if (!subscription?.stripe_customer_id) {
      return json(
        {
          error: "No active subscription found. Please create a subscription first.",
        },
        404,
      );
    }

    // 2) Create billing portal session
    const origin = req.headers.get("origin") || "";
    const fallbackBase =
      origin && origin.startsWith("http")
        ? origin
        : "https://www.logisticintel.com";
    const returnUrl = `${fallbackBase}/app/settings?tab=billing`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    return json({
      ok: true,
      url: portalSession.url,
    });
  } catch (error) {
    console.error("[billing-portal] fatal", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
