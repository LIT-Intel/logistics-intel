// supabase/functions/list-invoices/index.ts
//
// Lists Stripe invoices for the authenticated user's customer record.
// Powers the inline invoice table on /app/billing so users no longer
// have to bounce out to the Stripe portal just to see "what did you
// charge me last month."
//
// Auth + customer-id resolution mirror billing-portal so the edge fn
// stays consistent with the rest of the billing surface.

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: supabaseAnonKey },
    });
    if (!userRes.ok) return json({ error: "Unauthorized" }, 401);
    const user = await userRes.json();
    const userId = user?.id as string | undefined;
    if (!userId) return json({ error: "Authenticated user missing id" }, 400);

    const subQuery = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
    subQuery.searchParams.set("select", "stripe_customer_id");
    subQuery.searchParams.set("user_id", `eq.${userId}`);
    subQuery.searchParams.set("limit", "1");
    const subRes = await fetch(subQuery.toString(), {
      headers: { Authorization: authHeader, apikey: supabaseAnonKey, Accept: "application/json" },
    });
    let stripeCustomerId: string | null = null;
    if (subRes.ok) {
      const subs = await subRes.json();
      stripeCustomerId = (Array.isArray(subs) ? subs[0] : null)?.stripe_customer_id ?? null;
    }
    if (!stripeCustomerId) {
      // No Stripe customer yet — return empty list so the client renders
      // its own empty state instead of erroring.
      return json({ ok: true, invoices: [] });
    }

    const body = await req.json().catch(() => ({})) as { limit?: number };
    const limit = Math.max(1, Math.min(50, Number(body.limit) || 12));

    const list = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit,
      expand: ["data.charge"],
    });

    const invoices = list.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? inv.id,
      date: inv.created
        ? new Date(inv.created * 1000).toISOString().slice(0, 10)
        : null,
      description: inv.lines?.data?.[0]?.description ?? "Subscription charge",
      amount:
        typeof inv.amount_paid === "number"
          ? `$${(inv.amount_paid / 100).toFixed(2)}`
          : "—",
      amountCents: inv.amount_paid ?? 0,
      currency: inv.currency ?? "usd",
      status: (inv.status ?? "open") as
        | "paid"
        | "open"
        | "void"
        | "uncollectible"
        | "draft",
      hostedUrl: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
    }));

    // Compute spend totals so the page can show MTD / YTD without a
    // second round-trip. Includes only `paid` invoices to avoid
    // double-counting refunds / voids.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime() / 1000;
    let mtdCents = 0;
    let ytdCents = 0;
    for (const inv of list.data) {
      if (inv.status !== "paid") continue;
      const paidAt = inv.status_transitions?.paid_at ?? inv.created ?? 0;
      if (paidAt >= monthStart) mtdCents += inv.amount_paid ?? 0;
      if (paidAt >= yearStart) ytdCents += inv.amount_paid ?? 0;
    }

    return json({
      ok: true,
      invoices,
      totals: {
        mtdCents,
        mtdLabel: `$${(mtdCents / 100).toFixed(2)}`,
        ytdCents,
        ytdLabel: `$${(ytdCents / 100).toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error("[list-invoices] fatal", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
