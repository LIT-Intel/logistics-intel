// supabase/functions/cancel-subscription/index.ts
//
// Server-side cancellation flow that lets users cancel inside the app
// without bouncing to the Stripe customer portal. Sets cancel_at_period_end
// = true on the active subscription so the user keeps access until the
// current period ends; we never hard-delete or refund here. The caller
// reload's their subscription afterward and the canonical state machine
// flips to `canceled` once cancel_at_period_end is set.
//
// Accepts an optional `reason` string + `feedback` string from the
// retention prompt — both are written to subscription metadata for
// later analysis. No PII; the user already knows what they typed.

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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: supabaseAnonKey },
    });
    if (!userRes.ok) return json({ error: "Unauthorized" }, 401);
    const user = await userRes.json();
    const userId = user?.id as string | undefined;
    if (!userId) return json({ error: "Authenticated user missing id" }, 400);

    const body = (await req.json().catch(() => ({}))) as {
      reason?: string;
      feedback?: string;
      action?: "cancel" | "reactivate";
    };
    const action = body.action === "reactivate" ? "reactivate" : "cancel";
    const reason = String(body.reason || "").slice(0, 120);
    const feedback = String(body.feedback || "").slice(0, 500);

    const subQuery = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
    subQuery.searchParams.set("select", "stripe_subscription_id,stripe_customer_id");
    subQuery.searchParams.set("user_id", `eq.${userId}`);
    subQuery.searchParams.set("limit", "1");
    const subRes = await fetch(subQuery.toString(), {
      headers: { Authorization: authHeader, apikey: supabaseAnonKey, Accept: "application/json" },
    });
    const sub = subRes.ok ? (await subRes.json())[0] : null;
    const subscriptionId = sub?.stripe_subscription_id ?? null;
    if (!subscriptionId) {
      return json({ error: "No active subscription to cancel" }, 400);
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: action === "cancel",
      metadata:
        action === "cancel"
          ? {
              cancellation_reason: reason || "unspecified",
              cancellation_feedback: feedback || "",
              cancelled_via: "in_app",
              cancelled_at: new Date().toISOString(),
            }
          : { reactivated_via: "in_app", reactivated_at: new Date().toISOString() },
    });

    // The billing-webhook will mirror cancel_at_period_end into the
    // subscriptions row, but for snappier UI feedback we also update
    // it here directly. Service-role write isn't safe from the user
    // JWT, so we PATCH via PostgREST under the user's RLS — they own
    // their own row.
    await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          cancel_at_period_end: action === "cancel",
          updated_at: new Date().toISOString(),
        }),
      },
    );

    return json({
      ok: true,
      action,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_end: updated.current_period_end,
    });
  } catch (error) {
    console.error("[cancel-subscription] fatal", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
