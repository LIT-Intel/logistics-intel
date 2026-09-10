// supabase/functions/billing-webhook/index.ts
//
// 2026-04-29 hardening pass — billing truth fix.
//
// Three guarantees this webhook now provides:
//
// 1. SIGNATURE-VERIFIED ONLY. STRIPE_WEBHOOK_SECRET is required at
//    boot. If missing, the function fails to start. Every request body
//    must verify against constructEventAsync; the previous "parse raw
//    JSON when secret missing" fallback is gone.
//
// 2. IDEMPOTENT. Each event.id is recorded in stripe_webhook_events on
//    first sight. Replays (Stripe retry, network duplication, attacker
//    replay) are short-circuited with a 200 + already-processed marker.
//
// 3. PLAN-CODE DERIVED ONLY FROM STRIPE PRICE ID. Request metadata (the
//    `plan_code` we put into checkout session metadata for telemetry)
//    is NEVER trusted for plan assignment. Every plan_code write loads
//    the active subscription from Stripe, reads items[0].price.id, and
//    looks that price up in the local plans table. If the lookup fails,
//    the row is left at its prior plan_code rather than guessed.
//
// Register this URL in the Stripe Dashboard → Developers → Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/billing-webhook
//
// Subscribe to:
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_succeeded
//   invoice.payment_failed
//   charge.refunded            (affiliate-commission void on refund)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";
import {
  creditAffiliateForInvoice,
  voidAffiliateCommissionsForInvoice,
} from "../_shared/affiliate_commission.ts";

const moduleLog = createLogger("billing-webhook");

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Fail closed at boot — no silent unsigned-event fallback.
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");
if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET — webhook will not accept events without a verified signature.");
if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

// Stripe product id for the CRM per-seat add-on ("LIT CRM"). Subscription
// items on this product drive lit_crm_subscriptions, NOT the main plan.
const CRM_ADDON_PRODUCT_ID = "prod_V4aTX3Q8s58UwQ";

// Service-role Supabase client used ONLY by the additive affiliate-commission
// path (creditAffiliateForInvoice / voidAffiliateCommissionsForInvoice). The
// core subscription writes above still go through raw PostgREST fetch and are
// unchanged. This client never participates in the billing-critical path.
const affiliateAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Idempotency: write a row in stripe_webhook_events keyed on event.id.
// Returns true if this is the first time we've seen this event, false
// if it's a replay.
// ─────────────────────────────────────────────────────────────────────
async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/rest/v1/stripe_webhook_events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      // Insert-or-noop. If the event_id row already exists we get a 409.
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_id: event.id,
      event_type: event.type,
      payload_summary: {
        livemode: event.livemode,
        api_version: event.api_version,
        // Keep this small — we record a few useful fields for audit
        // without storing the full payload (it's recoverable from
        // Stripe). The full event still goes to function logs.
        object_type: (event.data?.object as any)?.object ?? null,
        object_id: (event.data?.object as any)?.id ?? null,
      },
    }),
  });

  if (res.status === 409 || res.status === 200 || res.status === 201) {
    return res.status !== 409;
  }
  // Any other status (RLS, network) — log and allow processing rather
  // than block on idempotency. Worse to drop a real event than to
  // accidentally reprocess one.
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    moduleLog.warn("claim_event_unexpected_status", { err: `HTTP ${res.status}`, status: res.status, body: txt.slice(0, 200) });
  }
  return true;
}

async function markEventProcessed(eventId: string, error?: string) {
  await fetch(
    `${supabaseUrl}/rest/v1/stripe_webhook_events?event_id=eq.${eventId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        processed_at: new Date().toISOString(),
        processing_error: error ?? null,
      }),
    },
  ).catch((err) => {
    moduleLog.warn("mark_event_processed_failed", { err: String(err), event_id: eventId });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Subscription row writes (service-role; bypasses RLS).
// ─────────────────────────────────────────────────────────────────────
async function upsertSubscription(userId: string, data: Record<string, unknown>) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
    },
  );

  // PATCH returns the affected rows. If empty, no row matched — INSERT a
  // new one with the values we have.
  let touchedRows: unknown[] = [];
  try {
    touchedRows = await res.json();
  } catch {
    touchedRows = [];
  }
  if (Array.isArray(touchedRows) && touchedRows.length > 0) return;

  await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function updateUserMetadata(userId: string, metadata: Record<string, unknown>) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    body: JSON.stringify({ user_metadata: metadata }),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Plan resolution. SOURCE OF TRUTH: the plans table mapping
// stripe_price_id_monthly / stripe_price_id_yearly -> code. Returns
// null when no row matches; callers must NOT fall back to request
// metadata or guesses.
// ─────────────────────────────────────────────────────────────────────
async function getPlanCodeForPrice(priceId: string | null | undefined): Promise<string | null> {
  if (!priceId) return null;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/plans?or=(stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId})&select=code&limit=1`,
    {
      headers: {
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
  const rows: Array<{ code: string }> = await res.json().catch(() => []);
  return rows[0]?.code ?? null;
}

/**
 * Given a Stripe Subscription object, returns its first item's price id
 * (or null). Subscriptions can technically have multiple items (per-seat
 * add-ons later); for now the first item is the package price and that
 * decides plan_code.
 */
function getSubscriptionPriceId(sub: Stripe.Subscription): string | null {
  return (sub as any).items?.data?.[0]?.price?.id ?? null;
}

/** Resolve the supabase user_id for a subscription. Tries metadata
 *  first; falls back to looking up by stripe_customer_id in our
 *  subscriptions table. */
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const metaId = (sub as any).metadata?.supabase_user_id;
  if (metaId) return metaId;
  const customerId = sub.customer as string | undefined;
  if (!customerId) return null;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?stripe_customer_id=eq.${customerId}&select=user_id&limit=1`,
    {
      headers: {
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
  const rows: Array<{ user_id: string }> = await res.json().catch(() => []);
  return rows[0]?.user_id ?? null;
}

/**
 * Resolve the organization_id for a user, preferring Stripe metadata then
 * falling back to the user's earliest org_members row. Returns null when the
 * user has no org membership yet (e.g. signup that hasn't run the org
 * bootstrap trigger). The column on `subscriptions` is `organization_id`
 * (uuid, nullable, FK to organizations(id) ON DELETE CASCADE).
 *
 * Phase 4 of the subscriptions org-keyed migration: every webhook event
 * writes organization_id alongside user_id so future reads can prefer the
 * org-keyed lookup. Forward-compatible — the column is nullable.
 */
async function resolveOrganizationId(
  sub: Stripe.Subscription,
  userId: string,
): Promise<string | null> {
  const metaOrgId = (sub as any).metadata?.supabase_organization_id
    ?? (sub as any).metadata?.supabase_org_id;
  if (metaOrgId) return String(metaOrgId);
  const res = await fetch(
    `${supabaseUrl}/rest/v1/org_members?user_id=eq.${userId}&select=org_id&order=joined_at.asc&limit=1`,
    {
      headers: {
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
  const rows: Array<{ org_id: string }> = await res.json().catch(() => []);
  return rows[0]?.org_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Per-event handlers. Each one writes plan_code ONLY when
// getPlanCodeForPrice returns a non-null code. That guarantees the only
// way a user lands on a paid plan_code is via a Stripe price id we
// recognize in the plans table.
// ─────────────────────────────────────────────────────────────────────
/**
 * Sum of all subscription items' quantity fields. Stripe models
 * per-seat add-ons as additional line items; the sum represents total
 * billed seats. For our current flat-package plans this is always 1,
 * but persisting it now means the seat-cap layer in Settings + the
 * accept-workspace-invite gate can read the truth as soon as add-ons
 * ship.
 */
function getSubscriptionSeatQuantity(sub: Stripe.Subscription): number | null {
  const items = (sub as any).items?.data;
  if (!Array.isArray(items) || items.length === 0) return null;
  return items.reduce((acc: number, item: any) => acc + (item?.quantity ?? 1), 0);
}

async function handleSubscriptionEvent(sub: Stripe.Subscription, eventLabel: string) {
  const userId = await resolveUserId(sub);
  if (!userId) {
    moduleLog.warn("user_id_unresolved", { err: "no user_id", event_label: eventLabel, stripe_sub_id: sub.id });
    return;
  }

  const priceId = getSubscriptionPriceId(sub);
  const planCode = await getPlanCodeForPrice(priceId);
  if (!planCode) {
    moduleLog.warn("price_id_unmapped", { err: `unknown price_id ${priceId}`, event_label: eventLabel, user_id: userId, stripe_price_id: priceId });
  }

  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: sub.customer as string,
    stripe_price_id: priceId,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
  // Only write plan_code when we have a verified mapping.
  if (planCode) update.plan_code = planCode;
  // Period dates may be missing on incomplete subs; handle defensively.
  const periodStart = (sub as any).current_period_start;
  const periodEnd = (sub as any).current_period_end;
  if (periodStart) update.current_period_start = new Date(periodStart * 1000).toISOString();
  if (periodEnd) update.current_period_end = new Date(periodEnd * 1000).toISOString();

  // Stripe-native trial: trial_end is unix seconds when set.
  const trialEnd = (sub as any).trial_end;
  if (trialEnd) {
    update.trial_ends_at = new Date(trialEnd * 1000).toISOString();
  }

  // Per-item quantity sum — drives the seat cap once add-ons ship.
  const seatQuantity = getSubscriptionSeatQuantity(sub);
  if (seatQuantity !== null) {
    update.seat_quantity = seatQuantity;
  }

  // Phase 4 of subscriptions org-keyed migration: also write organization_id.
  // The column already exists on the live table (nullable, FK to
  // organizations(id) — populated for the first time by the 2026-05-30
  // backfill migration). No env-gate needed: writing to an existing nullable
  // column never 400s, and getting org-keyed data in here is the prerequisite
  // for the eventual read-side pivot.
  const organizationId = await resolveOrganizationId(sub, userId);
  if (organizationId) update.organization_id = organizationId;

  await upsertSubscription(userId, update);

  if (planCode) {
    await updateUserMetadata(userId, {
      plan: planCode,
      subscription_status: sub.status,
      stripe_customer_id: sub.customer as string,
    });
  } else {
    await updateUserMetadata(userId, {
      subscription_status: sub.status,
    });
  }

  moduleLog.info("subscription_event_handled", { event_label: eventLabel, user_id: userId, plan_code: planCode ?? "(unchanged)", status: sub.status });
}

// ─────────────────────────────────────────────────────────────────────
// CRM per-seat add-on (product prod_V4aTX3Q8s58UwQ). These events are
// independent of the main plan subscription: they upsert lit_crm_subscriptions
// keyed by org_id (from subscription/session metadata). Idempotent (upsert on
// org_id primary key) and service-role (bypasses RLS).
// ─────────────────────────────────────────────────────────────────────

/** True iff any item on the subscription is the CRM add-on product. */
function subscriptionHasCrmAddon(sub: Stripe.Subscription): boolean {
  const items = (sub as any).items?.data;
  if (!Array.isArray(items)) return false;
  return items.some((it: any) => {
    const prod = it?.price?.product;
    return typeof prod === "string" && prod === CRM_ADDON_PRODUCT_ID;
  });
}

/** Sum quantities of the CRM add-on line items (seats). */
function crmSeatQuantity(sub: Stripe.Subscription): number {
  const items = (sub as any).items?.data;
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc: number, it: any) => {
    const prod = it?.price?.product;
    if (typeof prod === "string" && prod === CRM_ADDON_PRODUCT_ID) {
      return acc + (it?.quantity ?? 1);
    }
    return acc;
  }, 0);
}

async function upsertCrmSubscription(orgId: string, data: Record<string, unknown>) {
  // Upsert on the org_id primary key via PostgREST merge-duplicates.
  await fetch(`${supabaseUrl}/rest/v1/lit_crm_subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceRoleKey!,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      org_id: orgId,
      ...data,
      updated_at: new Date().toISOString(),
    }),
  });
}

/**
 * Resolve org_id for a CRM add-on subscription. Prefers subscription metadata
 * (org_id / supabase_org_id), then falls back to the customer's earliest org
 * membership via the subscriptions table's stripe_customer_id link.
 */
async function resolveCrmOrgId(sub: Stripe.Subscription): Promise<string | null> {
  const meta = (sub as any).metadata ?? {};
  const metaOrg = meta.org_id ?? meta.supabase_org_id ?? meta.supabase_organization_id;
  if (metaOrg) return String(metaOrg);
  const customerId = sub.customer as string | undefined;
  if (!customerId) return null;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?stripe_customer_id=eq.${customerId}&select=organization_id&not.organization_id=is.null&limit=1`,
    {
      headers: {
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
  const rows: Array<{ organization_id: string }> = await res.json().catch(() => []);
  return rows[0]?.organization_id ?? null;
}

/** Handle a CRM add-on subscription create/update. Writes lit_crm_subscriptions. */
async function handleCrmSubscriptionEvent(sub: Stripe.Subscription, eventLabel: string) {
  const orgId = await resolveCrmOrgId(sub);
  if (!orgId) {
    moduleLog.warn("crm_org_unresolved", { err: "no org_id", event_label: eventLabel, stripe_sub_id: sub.id });
    return;
  }
  const seats = crmSeatQuantity(sub) || 1;
  const update: Record<string, unknown> = {
    status: sub.status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: sub.customer as string,
    seats,
  };
  const periodEnd = (sub as any).current_period_end;
  if (periodEnd) update.current_period_end = new Date(periodEnd * 1000).toISOString();
  await upsertCrmSubscription(orgId, update);
  moduleLog.info("crm_subscription_event_handled", { event_label: eventLabel, org_id: orgId, status: sub.status, seats });
}

// ─────────────────────────────────────────────────────────────────────
// LIT catalog ADD-ONS (lit_addons table — e.g. 'mx_trade' Mexico Trade
// Intelligence, $99/mo). Add-on purchases are SEPARATE Stripe subscriptions
// started by billing-checkout { addon_key } with metadata.kind='lit_addon'.
// They must NEVER flow into the main-plan path: `subscriptions` is
// one-row-per-user (unique user_id), so letting handleSubscriptionEvent
// process an add-on event would overwrite the base plan's
// stripe_subscription_id / stripe_price_id — and the next base-plan renewal
// would clobber it back, breaking the add-on entitlement mid-cycle.
// Mirrors the CRM add-on pattern above, but detection is by PRICE ID looked
// up in lit_addons (the owner pastes the Stripe price id into that table;
// routing activates the moment it lands — no product-id constant, no
// redeploy) with subscription metadata.addon_key as fallback.
// ─────────────────────────────────────────────────────────────────────

let addonPriceCache: { at: number; map: Record<string, string> } | null = null;

/** price_id -> addon_key for all active lit_addons rows (60s cache). */
async function getAddonPriceMap(): Promise<Record<string, string>> {
  if (addonPriceCache && Date.now() - addonPriceCache.at < 60_000) return addonPriceCache.map;
  const map: Record<string, string> = {};
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/lit_addons?select=addon_key,stripe_price_id&active=eq.true&stripe_price_id=not.is.null`,
      {
        headers: {
          apikey: supabaseServiceRoleKey!,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
      },
    );
    const rows: Array<{ addon_key: string; stripe_price_id: string }> = await res.json().catch(() => []);
    for (const r of rows) if (r.stripe_price_id) map[r.stripe_price_id] = r.addon_key;
  } catch (e) {
    moduleLog.warn("addon_price_map_failed", { err: String(e) });
  }
  addonPriceCache = { at: Date.now(), map };
  return map;
}

/** addon_key when any item on the subscription is a lit_addons price (or the
 *  subscription metadata carries addon_key — safety net if the table read
 *  hiccups; either way the event is kept OUT of the main-plan path). */
async function subscriptionAddonKey(sub: Stripe.Subscription): Promise<string | null> {
  const map = await getAddonPriceMap();
  const items = (sub as any).items?.data;
  if (Array.isArray(items)) {
    for (const it of items) {
      const pid = it?.price?.id;
      if (typeof pid === "string" && map[pid]) return map[pid];
    }
  }
  const metaKey = (sub as any).metadata?.addon_key;
  return typeof metaKey === "string" && metaKey ? metaKey : null;
}

/** Upsert the org's add-on entitlement row (merge on (org_id, addon_key)). */
async function upsertAddonSubscription(
  orgId: string,
  addonKey: string,
  data: Record<string, unknown>,
) {
  await fetch(
    `${supabaseUrl}/rest/v1/lit_org_addon_subscriptions?on_conflict=org_id,addon_key`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        org_id: orgId,
        addon_key: addonKey,
        ...data,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

/** Org resolution for an add-on subscription: metadata first (billing-checkout
 *  writes org_id), then customer-link fallback via the buyer's user_id. */
async function resolveAddonOrgId(sub: Stripe.Subscription): Promise<string | null> {
  const meta = (sub as any).metadata ?? {};
  const metaOrg = meta.org_id ?? meta.supabase_org_id ?? meta.supabase_organization_id;
  if (metaOrg) return String(metaOrg);
  const userId = await resolveUserId(sub);
  if (!userId) return null;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/org_members?user_id=eq.${userId}&select=org_id&order=joined_at.asc&limit=1`,
    {
      headers: {
        apikey: supabaseServiceRoleKey!,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
  const rows: Array<{ org_id: string }> = await res.json().catch(() => []);
  return rows[0]?.org_id ?? null;
}

/** Handle an add-on subscription create/update/renewal — writes ONLY
 *  lit_org_addon_subscriptions; never touches `subscriptions`. */
async function handleAddonSubscriptionEvent(
  sub: Stripe.Subscription,
  addonKey: string,
  eventLabel: string,
) {
  const orgId = await resolveAddonOrgId(sub);
  if (!orgId) {
    moduleLog.warn("addon_org_unresolved", { err: "no org_id", event_label: eventLabel, addon_key: addonKey, stripe_sub_id: sub.id });
    return;
  }
  const update: Record<string, unknown> = {
    status: sub.status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: sub.customer as string,
  };
  const periodEnd = (sub as any).current_period_end;
  if (periodEnd) update.current_period_end = new Date(periodEnd * 1000).toISOString();
  await upsertAddonSubscription(orgId, addonKey, update);
  moduleLog.info("addon_subscription_event_handled", { event_label: eventLabel, addon_key: addonKey, org_id: orgId, status: sub.status });
}

/** Grant the add-on's included monthly LIT credits for a PAID invoice.
 *  Idempotent: lit_credit_grant_purchase dedups on p_ref
 *  (`addon:<key>:<invoice_id>`), and this webhook dedups on event.id.
 *  Best-effort — a grant failure never fails the billing write. */
async function grantAddonIncludedCredits(orgId: string, addonKey: string, invoiceId: string) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/lit_addons?addon_key=eq.${encodeURIComponent(addonKey)}&select=included_credits`,
      {
        headers: {
          apikey: supabaseServiceRoleKey!,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
      },
    );
    const rows: Array<{ included_credits: number }> = await res.json().catch(() => []);
    const credits = Number(rows[0]?.included_credits ?? 0);
    if (!(credits > 0)) return;
    const { error } = await affiliateAdmin.rpc("lit_credit_grant_purchase", {
      p_org_id: orgId,
      p_credits: credits,
      p_ref: `addon:${addonKey}:${invoiceId}`,
      p_metadata: { source: "addon_included_credits", addon_key: addonKey, stripe_invoice: invoiceId },
    });
    if (error) {
      moduleLog.warn("addon_credit_grant_failed", { err: error.message, org_id: orgId, addon_key: addonKey, invoice_id: invoiceId });
    } else {
      moduleLog.info("addon_credits_granted", { org_id: orgId, addon_key: addonKey, credits, invoice_id: invoiceId });
    }
  } catch (e) {
    moduleLog.warn("addon_credit_grant_failed", { err: String(e), org_id: orgId, addon_key: addonKey });
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return json({ error: "Missing stripe-signature header" }, 400);
  }

  // Signature is required. webhookSecret is checked at boot, so this
  // path is reached only when the secret is configured.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret!);
  } catch (err: any) {
    moduleLog.error("signature_verification_failed", { err: err?.message || String(err) });
    return json({ error: "Invalid signature" }, 400);
  }

  const log = moduleLog.child({ request_id: requestId(), event_id: event.id, event_type: event.type });

  // Idempotency check: if we've already claimed this event.id, treat
  // this delivery as a no-op replay.
  const isFirstDelivery = await claimEvent(event);
  if (!isFirstDelivery) {
    log.info("replay_ignored");
    return json({ received: true, replay: true });
  }

  log.info("processing_event");

  let handlerError: string | undefined;
  try {
    switch (event.type) {
      // ── Initial activation: checkout completed ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // ── CRM add-on checkout ──
        // Embedded CRM checkout carries metadata.kind='crm_addon'. Retrieve the
        // resulting subscription (expanded for price.product) and upsert
        // lit_crm_subscriptions. Separate from the main-plan path below.
        if (session.metadata?.kind === "crm_addon") {
          const orgId = session.metadata?.org_id ?? null;
          const subId = session.subscription as string | null;
          if (!subId) {
            log.warn("crm_checkout_no_subscription", { err: "no subscription on session", org_id: orgId });
            break;
          }
          const sub = await stripe.subscriptions.retrieve(subId, {
            expand: ["items.data.price.product"],
          });
          // Prefer the org_id from the session metadata; handler falls back to
          // sub metadata / customer link.
          if (orgId && !(sub as any).metadata?.org_id) {
            (sub as any).metadata = { ...((sub as any).metadata ?? {}), org_id: orgId };
          }
          await handleCrmSubscriptionEvent(sub, "crm_checkout.completed");
          break;
        }

        // ── Catalog add-on checkout (metadata.kind='lit_addon') ──
        // e.g. 'mx_trade' Mexico Trade Intelligence. Routes into
        // lit_org_addon_subscriptions; must never reach the main-plan path.
        if (session.metadata?.kind === "lit_addon") {
          const addonKey = String(session.metadata?.addon_key || "");
          const subId = session.subscription as string | null;
          if (!subId || !addonKey) {
            log.warn("addon_checkout_missing_fields", { err: "no subscription/addon_key on session", addon_key: addonKey });
            break;
          }
          const sub = await stripe.subscriptions.retrieve(subId);
          // Prefer the org_id from session metadata; handler falls back to
          // sub metadata / customer link.
          if (session.metadata?.org_id && !(sub as any).metadata?.org_id) {
            (sub as any).metadata = { ...((sub as any).metadata ?? {}), org_id: session.metadata.org_id };
          }
          await handleAddonSubscriptionEvent(sub, addonKey, "addon_checkout.completed");
          break;
        }

        // ── Credit-pack top-up (one-time payment) ──
        // Embedded credit-pack checkout carries metadata.kind='credit_pack'.
        // Grant the credits idempotently — lit_credit_grant_purchase dedups on
        // the session id, and this webhook already dedups on event.id. Fully
        // isolated from the plan/CRM flows: only fires for credit_pack sessions.
        if (session.metadata?.kind === "credit_pack") {
          const orgId = session.metadata?.org_id ?? null;
          const credits = Number(session.metadata?.credits ?? 0);
          const paid = !session.payment_status || session.payment_status === "paid";
          if (!orgId || !Number.isFinite(credits) || credits <= 0) {
            log.warn("credit_pack_bad_metadata", { org_id: orgId, credits: session.metadata?.credits });
            break;
          }
          if (!paid) {
            log.warn("credit_pack_unpaid", { org_id: orgId, payment_status: session.payment_status });
            break;
          }
          // (2026-09-10 fix: this previously called `supabase.rpc` — a
          // variable that was never defined in this module, so every
          // credit-pack grant threw a ReferenceError caught by the outer
          // handler and recorded as processing_error. affiliateAdmin is the
          // module's service-role client.)
          const { data: grant, error: grantErr } = await affiliateAdmin.rpc("lit_credit_grant_purchase", {
            p_org_id: orgId,
            p_credits: credits,
            p_ref: session.id,
            p_metadata: {
              pack_id: session.metadata?.pack_id ?? null,
              stripe_session: session.id,
              stripe_customer: (session.customer as string) ?? null,
              source: "credit_pack_checkout",
            },
          });
          if (grantErr) {
            log.error("credit_pack_grant_failed", { err: grantErr.message, org_id: orgId, credits });
          } else {
            log.info("credit_pack_granted", { org_id: orgId, credits, duplicate: (grant as any)?.duplicate ?? false });
          }
          break;
        }

        const userId =
          session.metadata?.supabase_user_id ||
          session.client_reference_id;
        if (!userId) {
          log.warn("checkout_no_user_id", { err: "no user_id in metadata or client_reference_id" });
          break;
        }

        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        // Plan code MUST come from the Stripe-side subscription's
        // price id, not from session metadata. Fetch the subscription
        // and map its price -> plan_code via the plans table.
        let planCode: string | null = null;
        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        let stripePriceId: string | null = null;
        let trialEndsAt: string | null = null;
        let seatQuantity: number | null = null;
        if (stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          stripePriceId = getSubscriptionPriceId(sub);
          planCode = await getPlanCodeForPrice(stripePriceId);
          const ps = (sub as any).current_period_start;
          const pe = (sub as any).current_period_end;
          const tEnd = (sub as any).trial_end;
          if (ps) periodStart = new Date(ps * 1000).toISOString();
          if (pe) periodEnd = new Date(pe * 1000).toISOString();
          if (tEnd) trialEndsAt = new Date(tEnd * 1000).toISOString();
          seatQuantity = getSubscriptionSeatQuantity(sub);
        }

        if (!planCode) {
          // Without a verified price -> plan_code mapping we still
          // record the customer/subscription IDs so the next webhook
          // event can reconcile, but we DO NOT write a paid plan_code.
          log.warn("checkout_price_unmapped", { err: `unknown price_id ${stripePriceId}`, user_id: userId, stripe_price_id: stripePriceId, stripe_sub_id: stripeSubscriptionId });
          await upsertSubscription(userId, {
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_price_id: stripePriceId,
            status: "active",
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
            ...(seatQuantity !== null ? { seat_quantity: seatQuantity } : {}),
          });
          await updateUserMetadata(userId, {
            stripe_customer_id: stripeCustomerId,
            subscription_status: "active",
          });
          break;
        }

        await upsertSubscription(userId, {
          plan_code: planCode,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_price_id: stripePriceId,
          status: "active",
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
          ...(seatQuantity !== null ? { seat_quantity: seatQuantity } : {}),
        });

        await updateUserMetadata(userId, {
          plan: planCode,
          stripe_customer_id: stripeCustomerId,
          subscription_status: "active",
        });

        log.info("checkout_session_completed", { user_id: userId, plan_code: planCode, stripe_price_id: stripePriceId });
        break;
      }

      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        if (subscriptionHasCrmAddon(sub)) {
          await handleCrmSubscriptionEvent(sub, "subscription.created");
          break;
        }
        {
          const addonKey = await subscriptionAddonKey(sub);
          if (addonKey) {
            await handleAddonSubscriptionEvent(sub, addonKey, "subscription.created");
            break;
          }
        }
        await handleSubscriptionEvent(sub, "subscription.created");
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        if (subscriptionHasCrmAddon(sub)) {
          await handleCrmSubscriptionEvent(sub, "subscription.updated");
          break;
        }
        {
          const addonKey = await subscriptionAddonKey(sub);
          if (addonKey) {
            await handleAddonSubscriptionEvent(sub, addonKey, "subscription.updated");
            break;
          }
        }
        await handleSubscriptionEvent(sub, "subscription.updated");
        break;
      }

      // ── Subscription cancelled / expired ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        // CRM add-on cancellation: mark the org's CRM subscription cancelled
        // (crm_enabled -> false) rather than touching the main plan.
        if (subscriptionHasCrmAddon(sub)) {
          const orgId = await resolveCrmOrgId(sub);
          if (orgId) {
            await upsertCrmSubscription(orgId, {
              status: "canceled",
              stripe_subscription_id: sub.id,
            });
            log.info("crm_subscription_deleted", { org_id: orgId });
          } else {
            log.warn("crm_subscription_deleted_no_org", { err: "no org_id", stripe_sub_id: sub.id });
          }
          break;
        }

        // Catalog add-on cancellation: mark the org's add-on row canceled
        // rather than touching the main plan (which would wrongly downgrade
        // the base subscription to free_trial).
        {
          const addonKey = await subscriptionAddonKey(sub);
          if (addonKey) {
            const orgId = await resolveAddonOrgId(sub);
            if (orgId) {
              await upsertAddonSubscription(orgId, addonKey, {
                status: "canceled",
                stripe_subscription_id: sub.id,
              });
              log.info("addon_subscription_deleted", { addon_key: addonKey, org_id: orgId });
            } else {
              log.warn("addon_subscription_deleted_no_org", { err: "no org_id", addon_key: addonKey, stripe_sub_id: sub.id });
            }
            break;
          }
        }

        const userId = await resolveUserId(sub);
        if (!userId) {
          log.warn("subscription_deleted_no_user_id", { err: "no user_id", stripe_sub_id: sub.id });
          break;
        }
        await upsertSubscription(userId, {
          status: "cancelled",
          plan_code: "free_trial",
          cancel_at_period_end: false,
        });
        await updateUserMetadata(userId, {
          plan: "free_trial",
          subscription_status: "cancelled",
        });
        log.info("subscription_deleted", { user_id: userId, plan_code: "free_trial" });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        // CRM add-on invoice failure: reflect status on the org's CRM row.
        if (subscriptionHasCrmAddon(sub)) {
          const orgId = await resolveCrmOrgId(sub);
          if (orgId) await upsertCrmSubscription(orgId, { status: sub.status, stripe_subscription_id: sub.id });
          log.warn("crm_invoice_payment_failed", { err: "payment_failed", org_id: orgId, status: sub.status });
          break;
        }
        // Catalog add-on invoice failure: reflect Stripe's status on the
        // org's add-on row; never touch the main plan.
        {
          const addonKey = await subscriptionAddonKey(sub);
          if (addonKey) {
            await handleAddonSubscriptionEvent(sub, addonKey, "invoice.payment_failed");
            break;
          }
        }
        const userId = await resolveUserId(sub);
        if (!userId) break;
        await upsertSubscription(userId, { status: "past_due" });
        await updateUserMetadata(userId, { subscription_status: "past_due" });
        log.warn("invoice_payment_failed", { err: "payment_failed", user_id: userId, status: "past_due" });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        // CRM add-on renewal: refresh the org's CRM row (period end + status)
        // and skip the main-plan path entirely.
        if (subscriptionHasCrmAddon(sub)) {
          await handleCrmSubscriptionEvent(sub, "invoice.payment_succeeded");
          break;
        }
        // Catalog add-on renewal (or first invoice): refresh the org's
        // add-on row and grant the included monthly LIT credits (idempotent
        // per invoice via lit_credit_grant_purchase p_ref dedup).
        {
          const addonKey = await subscriptionAddonKey(sub);
          if (addonKey) {
            await handleAddonSubscriptionEvent(sub, addonKey, "invoice.payment_succeeded");
            const orgId = await resolveAddonOrgId(sub);
            if (orgId && invoice.id) {
              await grantAddonIncludedCredits(orgId, addonKey, invoice.id);
            }
            break;
          }
        }
        const userId = await resolveUserId(sub);
        if (!userId) break;

        // Payment renewal — update period dates and re-confirm the plan
        // from the current price id (price might have been swapped
        // mid-period via Stripe portal).
        const priceId = getSubscriptionPriceId(sub);
        const planCode = await getPlanCodeForPrice(priceId);

        const update: Record<string, unknown> = {
          status: "active",
          stripe_price_id: priceId,
        };
        const ps = (sub as any).current_period_start;
        const pe = (sub as any).current_period_end;
        if (ps) update.current_period_start = new Date(ps * 1000).toISOString();
        if (pe) update.current_period_end = new Date(pe * 1000).toISOString();
        if (planCode) update.plan_code = planCode;

        await upsertSubscription(userId, update);
        await updateUserMetadata(userId, {
          subscription_status: "active",
          ...(planCode ? { plan: planCode } : {}),
        });
        log.info("invoice_payment_succeeded", { user_id: userId, plan_code: planCode ?? "(unchanged)" });

        // ── Affiliate money path (additive, never breaks billing) ──
        // Credit a pending affiliate commission for this paid invoice. The
        // helper is fully self-wrapped and returns a structured result instead
        // of throwing; the extra try/catch here is belt-and-suspenders so an
        // unexpected throw can never affect the 200-to-Stripe response.
        try {
          const result = await creditAffiliateForInvoice(
            affiliateAdmin,
            invoice as unknown as Parameters<typeof creditAffiliateForInvoice>[1],
          );
          log.info("affiliate_credit_result", { invoice_id: invoice.id, ...result });
        } catch (e: any) {
          log.error("affiliate_credit_failed", { err: e?.message || String(e), invoice_id: invoice.id });
        }
        break;
      }

      // ── Refund: void any non-paid affiliate commissions for the invoice ──
      // The endpoint subscribes to charge.refunded. A charge carries the
      // originating invoice id (when it came from a subscription invoice).
      // This is additive only — it never touches the subscription rows.
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const invoiceId = (charge as any).invoice as string | null;
        if (!invoiceId) {
          log.info("charge_refunded_no_invoice", { charge_id: charge.id });
          break;
        }
        try {
          const result = await voidAffiliateCommissionsForInvoice(
            affiliateAdmin,
            invoiceId,
            `refund:${charge.id}`,
          );
          log.info("affiliate_void_result", { invoice_id: invoiceId, charge_id: charge.id, ...result });
        } catch (e: any) {
          log.error("affiliate_void_failed", { err: e?.message || String(e), invoice_id: invoiceId, charge_id: charge.id });
        }
        break;
      }

      default:
        log.info("unhandled_event_type");
    }
  } catch (err: any) {
    handlerError = err?.message || String(err);
    log.error("handler_error", { err: handlerError, stack: err?.stack });
    // Always 200 to Stripe (no retries); we already claimed the event,
    // so the error is recorded in stripe_webhook_events.processing_error
    // for an operator to investigate.
  } finally {
    await markEventProcessed(event.id, handlerError);
  }

  return json({ received: true, ...(handlerError ? { warning: handlerError } : {}) });
});
