// admin-stripe-setup — one-time (idempotent) creation of the LIT Credits
// pricing objects in Stripe: the 4 plan prices (Starter/Growth/Scale/Enterprise)
// and the 5 credit-pack one-time prices. Platform-admin only.
//
// Idempotency: every price carries a stable `lookup_key`. On each run we first
// look the price up by that key and reuse it if present, so re-running never
// creates duplicates. Products are matched by metadata via the Search API, then
// created with a deterministic Idempotency-Key as a backstop.
//
// It does NOT touch the 73 existing subscriptions or their price IDs — these are
// brand-new prices for the new model (existing customers are grandfathered).
//
// Deployed via MCP (CI edge deploy is unreliable). verify_jwt=true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";

const STRIPE_KEY = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
const STRIPE_BASE = "https://api.stripe.com/v1";

// The target catalog. amount_cents is USD. Plans are recurring monthly; packs
// are one-time. lookup_key is the idempotency anchor for the price.
const PLANS = [
  { code: "starter", name: "LIT Starter", amount: 15000, credits: "300", lookup: "lit_plan_starter_monthly_v2" },
  { code: "growth", name: "LIT Growth", amount: 49900, credits: "1500", lookup: "lit_plan_growth_monthly_v2" },
  { code: "scale", name: "LIT Scale", amount: 125000, credits: "4000", lookup: "lit_plan_scale_monthly_v2" },
  // Enterprise base reference price ($2,500). Sales-assisted; not self-serve.
  { code: "enterprise", name: "LIT Enterprise", amount: 250000, credits: "unlimited", lookup: "lit_plan_enterprise_monthly_v2" },
] as const;

const PACKS = [
  { key: "250", name: "LIT Credits — 250", amount: 2900, credits: "250", lookup: "lit_pack_250" },
  { key: "750", name: "LIT Credits — 750", amount: 6900, credits: "750", lookup: "lit_pack_750" },
  { key: "2000", name: "LIT Credits — 2,000", amount: 14900, credits: "2000", lookup: "lit_pack_2000" },
  { key: "5000", name: "LIT Credits — 5,000", amount: 29900, credits: "5000", lookup: "lit_pack_5000" },
  { key: "15000", name: "LIT Credits — 15,000", amount: 69900, credits: "15000", lookup: "lit_pack_15000" },
] as const;

// x-www-form-urlencoded body builder with Stripe's bracket notation for nested
// objects (metadata[x], recurring[interval]).
function form(obj: Record<string, unknown>, prefix = "", out: string[][] = []): string[][] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) form(v as Record<string, unknown>, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

async function stripe(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const init: RequestInit = { method, headers };
  if (method === "POST" && params) {
    init.body = new URLSearchParams(form(params) as unknown as string[][]).toString();
  }
  const res = await fetch(`${STRIPE_BASE}/${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${data?.error?.message || res.status}`);
  return data;
}

async function findPriceByLookup(lookup: string): Promise<any | null> {
  const data = await stripe("GET", `prices?lookup_keys[]=${encodeURIComponent(lookup)}&active=true&limit=1&expand[]=data.product`);
  return Array.isArray(data.data) && data.data.length ? data.data[0] : null;
}

async function findProductByKey(objKey: string): Promise<any | null> {
  try {
    const q = encodeURIComponent(`metadata['lit_object']:'${objKey}' AND active:'true'`);
    const data = await stripe("GET", `products/search?query=${q}&limit=1`);
    return Array.isArray(data.data) && data.data.length ? data.data[0] : null;
  } catch {
    return null; // Search API not enabled / eventual-consistency miss — fall through to create
  }
}

async function ensureProduct(objKey: string, name: string): Promise<string> {
  const existing = await findProductByKey(objKey);
  if (existing) return existing.id;
  const created = await stripe(
    "POST",
    "products",
    { name, metadata: { lit_object: objKey } },
    `lit-product-${objKey}`,
  );
  return created.id;
}

// Returns { price_id, product_id, reused }.
async function ensurePrice(opts: {
  objKey: string;
  productName: string;
  lookup: string;
  amount: number;
  recurring: boolean;
  interval?: "month" | "year";
  metadata: Record<string, string>;
}): Promise<{ price_id: string; product_id: string; reused: boolean }> {
  const existing = await findPriceByLookup(opts.lookup);
  if (existing) {
    const productId = typeof existing.product === "string" ? existing.product : existing.product?.id;
    return { price_id: existing.id, product_id: productId, reused: true };
  }
  const productId = await ensureProduct(opts.objKey, opts.productName);
  const params: Record<string, unknown> = {
    product: productId,
    currency: "usd",
    unit_amount: opts.amount,
    lookup_key: opts.lookup,
    transfer_lookup_key: "true",
    metadata: opts.metadata,
  };
  if (opts.recurring) params.recurring = { interval: opts.interval ?? "month" };
  const price = await stripe("POST", "prices", params, `lit-price-${opts.lookup}`);
  return { price_id: price.id, product_id: productId, reused: false };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!STRIPE_KEY) return json({ ok: false, error: "stripe_not_configured" }, 503);

  // Auth: a platform-admin JWT OR the shared internal-cron secret (so setup can
  // be driven server-side via net.http_post without a user session). This fn only
  // creates Stripe catalog objects and returns their ids — it writes no DB rows.
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const isCron = Boolean(cronSecret) && req.headers.get("X-Internal-Cron") === cronSecret;
  if (!isCron) {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { data: admin } = await auth.admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!admin) return json({ ok: false, error: "forbidden_platform_admin_only" }, 403);
  }

  // Report the mode so we can confirm LIVE vs TEST before relying on the IDs.
  const mode = STRIPE_KEY.startsWith("sk_live_") ? "live" : STRIPE_KEY.startsWith("sk_test_") ? "test" : "unknown";

  // Optional dry-run: POST { "dry_run": true } just reports the mode + plan,
  // creating nothing.
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body */ }
  if (body?.dry_run === true) {
    return json({ ok: true, mode, dry_run: true, plans: PLANS.map((p) => p.code), packs: PACKS.map((p) => p.key) });
  }

  try {
    const plans: Record<string, unknown> = {};
    for (const p of PLANS) {
      const r = await ensurePrice({
        objKey: `plan:${p.code}`,
        productName: p.name,
        lookup: p.lookup,
        amount: p.amount,
        recurring: true,
        metadata: { lit_plan_code: p.code, lit_monthly_credits: p.credits, lit_model: "credits_v2" },
      });
      plans[p.code] = { ...r, amount: p.amount, monthly_credits: p.credits, lookup_key: p.lookup };
    }

    // Annual (yearly) recurring prices — 25% off the v2 monthly, on the SAME
    // products (objKey plan:<code> reuses each plan's existing product). Idempotent
    // by lookup_key. Enterprise annual is sales-assisted, so it's omitted here.
    const ANNUAL_PLANS = [
      { code: "starter", name: "LIT Starter", amount: 135000, credits: "300", lookup: "lit_plan_starter_annual_v2" },
      { code: "growth", name: "LIT Growth", amount: 449100, credits: "1500", lookup: "lit_plan_growth_annual_v2" },
      { code: "scale", name: "LIT Scale", amount: 1125000, credits: "4000", lookup: "lit_plan_scale_annual_v2" },
    ] as const;
    const plansAnnual: Record<string, unknown> = {};
    for (const p of ANNUAL_PLANS) {
      const r = await ensurePrice({
        objKey: `plan:${p.code}`,
        productName: p.name,
        lookup: p.lookup,
        amount: p.amount,
        recurring: true,
        interval: "year",
        metadata: { lit_plan_code: p.code, lit_monthly_credits: p.credits, lit_model: "credits_v2", lit_interval: "year" },
      });
      plansAnnual[p.code] = { ...r, amount: p.amount, lookup_key: p.lookup };
    }

    const packs: Record<string, unknown> = {};
    for (const p of PACKS) {
      const r = await ensurePrice({
        objKey: `pack:${p.key}`,
        productName: p.name,
        lookup: p.lookup,
        amount: p.amount,
        recurring: false,
        metadata: { lit_credits: p.credits, lit_object: "credit_pack", lit_model: "credits_v2" },
      });
      packs[p.key] = { ...r, amount: p.amount, credits: p.credits, lookup_key: p.lookup };
    }

    return json({ ok: true, mode, plans, plans_annual: plansAnnual, packs });
  } catch (err) {
    return json({ ok: false, mode, error: String((err as Error)?.message ?? err) }, 500);
  }
});
