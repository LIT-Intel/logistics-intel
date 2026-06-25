// admin-create-test-invoice — platform-admin-only billing smoke test.
// Creates a $1.00 one-off Stripe invoice on the CALLER'S OWN Stripe customer
// (resolving/creating it + persisting stripe_customer_id back to subscriptions
// so the LIT billing page finds it), finalizes it, and returns the hosted
// invoice URL to pay. Safety: refuses to create a LIVE charge unless the caller
// passes { confirm_live: true } — a first call just reports the Stripe mode.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  if (!SUPABASE_URL || !ANON || !SERVICE || !STRIPE_KEY) return json({ ok: false, error: "server_misconfigured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!pa) return json({ ok: false, error: "forbidden_platform_admin_only" }, 403);

  const mode = STRIPE_KEY.startsWith("sk_live") ? "live" : "test";
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  if (mode === "live" && body?.confirm_live !== true) {
    return json({
      ok: false, mode, needs_confirmation: true,
      message: "Stripe is in LIVE mode — this will charge a REAL $1.00 to whatever card you enter. Re-run with { confirm_live: true } to proceed, or switch Stripe to test mode first.",
    });
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

  // Find or create the caller's Stripe customer; persist it so the billing page sees it.
  let customerId: string | null = null;
  const { data: sub } = await admin
    .from("subscriptions").select("stripe_customer_id")
    .eq("user_id", user.id).not("stripe_customer_id", "is", null).limit(1).maybeSingle();
  customerId = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    const cust = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id, source: "admin-create-test-invoice" },
    });
    customerId = cust.id;
    await admin.from("subscriptions").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
  }

  await stripe.invoiceItems.create({
    customer: customerId, amount: 100, currency: "usd",
    description: "LIT billing smoke test — $1.00",
  });
  const draft = await stripe.invoices.create({
    customer: customerId, collection_method: "send_invoice", days_until_due: 7, auto_advance: true,
    description: "LIT billing smoke test ($1.00)",
  });
  const inv = await stripe.invoices.finalizeInvoice(draft.id);

  return json({
    ok: true, mode, customer: customerId,
    invoice_id: inv.id, status: inv.status, amount_due: inv.amount_due,
    hosted_invoice_url: inv.hosted_invoice_url, pdf: inv.invoice_pdf,
    note: "Open hosted_invoice_url to pay $1.00, then check /app/billing → Invoice history.",
  });
});
