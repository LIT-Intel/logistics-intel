// supabase/functions/billing-portal/index.ts
//
// Creates a Stripe Customer Portal session for the authenticated user.
// Reads stripe_customer_id from the `subscriptions` table (user-centric,
// same model used by billing-checkout).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");
if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing SUPABASE_ANON_KEY");

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    // --- Auth ---
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
      return json({ error: "Unauthorized", details: text }, 401);
    }

    const user = await userRes.json();
    const userId = user?.id as string | undefined;
    const userEmail = user?.email as string | undefined;

    if (!userId || !userEmail) {
      return json({ error: "Authenticated user is missing id or email" }, 400);
    }

    // --- Look up subscription for stripe_customer_id ---
    const subQuery = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
    subQuery.searchParams.set("select", "stripe_customer_id,status,plan_code");
    subQuery.searchParams.set("user_id", `eq.${userId}`);
    subQuery.searchParams.set("limit", "1");

    const subRes = await fetch(subQuery.toString(), {
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
        Accept: "application/json",
      },
    });

    let stripeCustomerId: string | null = null;

    if (subRes.ok) {
      const subs = await subRes.json();
      const sub = Array.isArray(subs) ? subs[0] : null;
      stripeCustomerId =
        sub?.stripe_customer_id ||
        user?.user_metadata?.stripe_customer_id ||
        null;
    } else {
      // subscriptions query failed — fall back to user_metadata
      stripeCustomerId = user?.user_metadata?.stripe_customer_id || null;
    }

    // --- Determine return URL ---
    const body = await req.json().catch(() => ({})) as { return_url?: string };
    const origin = req.headers.get("origin") || "";
    const fallbackBase =
      origin && origin.startsWith("http")
        ? origin
        : "https://www.logisticintel.com";
    const returnUrl = body.return_url || `${fallbackBase}/app/settings?tab=billing`;

    // --- If no customer exists yet, create one in Stripe ---
    // 2026-04-29 hardening: when seeding a fresh subscriptions row we
    // anchor it as free_trial. We never assume any other plan from the
    // portal flow — paid access only ever activates from a verified
    // Stripe webhook. The previous upsert was harmless (plan_code:
    // free_trial) but used merge-duplicates which would silently
    // overwrite an existing paid plan_code if a row had already been
    // updated by the webhook. Switch to insert-only-on-conflict so we
    // never clobber webhook-owned fields.
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      });
      stripeCustomerId = customer.id;

      // Insert ONLY if no row exists. Postgres RLS will reject this if
      // the user has no permission to insert; that's fine — the customer
      // id is at least set in Stripe and the webhook will create the row
      // on payment confirmation.
      await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id&ignore_duplicates=true`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            apikey: supabaseAnonKey,
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify({
            user_id: userId,
            plan_code: "free_trial",
            stripe_customer_id: stripeCustomerId,
            status: "incomplete",
            updated_at: new Date().toISOString(),
          }),
        }
      );
    }

    // --- Create Stripe portal session ---
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    return json({ ok: true, url: portalSession.url });
  } catch (error) {
    console.error("[billing-portal] fatal", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
