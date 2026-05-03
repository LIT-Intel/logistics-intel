// supabase/functions/upcoming-invoice/index.ts
//
// Returns Stripe's preview of the next invoice if the user upgrades or
// switches to a different plan_code RIGHT NOW. Powers the pre-checkout
// proration confirmation modal so users see "today's charge $X.XX +
// new monthly $Y.YY starting [date]" before they hit the Stripe-hosted
// checkout flow. Reduces sticker-shock abandonment.
//
// When the user has NO existing subscription, falls back to returning
// the plain new-plan price (no proration math — full charge today).

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

// Maps PLAN_LIMITS plan codes → Stripe price IDs. Mirrors the lookup
// the billing-checkout fn does — kept locally so this fn doesn't need
// to import shared deno code that doesn't yet exist.
function priceIdFor(planCode: string, interval: "month" | "year"): string | null {
  const env = (k: string) => Deno.env.get(k) ?? null;
  const map: Record<string, { month: string | null; year: string | null }> = {
    starter: { month: env("STRIPE_PRICE_STARTER_MONTHLY"), year: env("STRIPE_PRICE_STARTER_YEARLY") },
    growth:  { month: env("STRIPE_PRICE_GROWTH_MONTHLY"),  year: env("STRIPE_PRICE_GROWTH_YEARLY")  },
    scale:   { month: env("STRIPE_PRICE_SCALE_MONTHLY"),   year: env("STRIPE_PRICE_SCALE_YEARLY")   },
  };
  return map[planCode]?.[interval] ?? null;
}

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
      plan_code?: string;
      interval?: "month" | "year";
    };
    const planCode = String(body.plan_code || "").toLowerCase();
    const interval = body.interval === "year" ? "year" : "month";

    const newPriceId = priceIdFor(planCode, interval);
    if (!newPriceId) {
      return json({ error: `No Stripe price configured for ${planCode} ${interval}` }, 400);
    }

    // Pull the existing subscription so we can compute proration. When
    // missing, return a no-proration preview so the modal still has
    // something to show.
    const subQuery = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
    subQuery.searchParams.set("select", "stripe_customer_id,stripe_subscription_id");
    subQuery.searchParams.set("user_id", `eq.${userId}`);
    subQuery.searchParams.set("limit", "1");
    const subRes = await fetch(subQuery.toString(), {
      headers: { Authorization: authHeader, apikey: supabaseAnonKey, Accept: "application/json" },
    });
    const sub = subRes.ok ? (await subRes.json())[0] : null;
    const customerId = sub?.stripe_customer_id ?? null;
    const subscriptionId = sub?.stripe_subscription_id ?? null;

    // Fetch the new plan's price object so we can show the monthly/yearly amount.
    const newPrice = await stripe.prices.retrieve(newPriceId);
    const newAmountCents = newPrice.unit_amount ?? 0;
    const newAmountLabel = `$${(newAmountCents / 100).toFixed(2)}`;

    if (!customerId || !subscriptionId) {
      // No active subscription → today's charge is the full new amount.
      return json({
        ok: true,
        prorated: false,
        todayCents: newAmountCents,
        todayLabel: newAmountLabel,
        recurringCents: newAmountCents,
        recurringLabel: newAmountLabel,
        recurringInterval: interval,
        nextChargeDate: null,
      });
    }

    // Active subscription → ask Stripe for the upcoming-invoice preview
    // assuming we swap the existing item to the new price now.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentItem = subscription.items.data[0];
    if (!currentItem) {
      return json({ error: "Existing subscription has no items" }, 500);
    }

    const upcoming = await stripe.invoices.retrieveUpcoming({
      customer: customerId,
      subscription: subscriptionId,
      subscription_items: [
        {
          id: currentItem.id,
          price: newPriceId,
          quantity: 1,
        },
      ],
      subscription_proration_behavior: "create_prorations",
    });

    const todayCents = upcoming.amount_due ?? 0;
    const todayLabel = `$${(todayCents / 100).toFixed(2)}`;
    const nextChargeUnix = subscription.current_period_end ?? null;
    const nextChargeDate = nextChargeUnix
      ? new Date(nextChargeUnix * 1000).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null;

    return json({
      ok: true,
      prorated: true,
      todayCents,
      todayLabel,
      recurringCents: newAmountCents,
      recurringLabel: newAmountLabel,
      recurringInterval: interval,
      nextChargeDate,
    });
  } catch (error) {
    console.error("[upcoming-invoice] fatal", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
