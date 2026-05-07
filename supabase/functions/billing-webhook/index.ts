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

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

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
    console.warn("[billing-webhook] claimEvent unexpected status", res.status, txt);
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
    console.warn("[billing-webhook] markEventProcessed failed", err);
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
    console.warn(`[billing-webhook] ${eventLabel}: could not resolve user_id (sub=${sub.id})`);
    return;
  }

  const priceId = getSubscriptionPriceId(sub);
  const planCode = await getPlanCodeForPrice(priceId);
  if (!planCode) {
    console.warn(`[billing-webhook] ${eventLabel}: priceId=${priceId} did not map to a known plan_code; leaving plan_code unchanged for user ${userId}`);
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

  console.log(`[billing-webhook] ${eventLabel}: user=${userId} plan_code=${planCode ?? "(unchanged)"} status=${sub.status}`);
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
    console.error("[billing-webhook] Signature verification failed:", err.message);
    return json({ error: "Invalid signature" }, 400);
  }

  // Idempotency check: if we've already claimed this event.id, treat
  // this delivery as a no-op replay.
  const isFirstDelivery = await claimEvent(event);
  if (!isFirstDelivery) {
    console.log(`[billing-webhook] Replay ignored: ${event.type} ${event.id}`);
    return json({ received: true, replay: true });
  }

  console.log(`[billing-webhook] Processing event: ${event.type} ${event.id}`);

  let handlerError: string | undefined;
  try {
    switch (event.type) {
      // ── Initial activation: checkout completed ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.metadata?.supabase_user_id ||
          session.client_reference_id;
        if (!userId) {
          console.warn("[billing-webhook] checkout.session.completed: no user_id in metadata or client_reference_id");
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
          console.warn(`[billing-webhook] checkout.session.completed: priceId=${stripePriceId} did not map to a known plan_code (sub=${stripeSubscriptionId}); not writing plan_code`);
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

        console.log(`[billing-webhook] checkout.session.completed: user=${userId} -> plan_code=${planCode} (price=${stripePriceId})`);
        break;
      }

      case "customer.subscription.created":
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription, "subscription.created");
        break;

      case "customer.subscription.updated":
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription, "subscription.updated");
        break;

      // ── Subscription cancelled / expired: revert to free_trial ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub);
        if (!userId) {
          console.warn(`[billing-webhook] subscription.deleted: could not resolve user_id (sub=${sub.id})`);
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
        console.log(`[billing-webhook] subscription.deleted: user=${userId} -> plan_code=free_trial`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        const userId = await resolveUserId(sub);
        if (!userId) break;
        await upsertSubscription(userId, { status: "past_due" });
        await updateUserMetadata(userId, { subscription_status: "past_due" });
        console.log(`[billing-webhook] invoice.payment_failed: user=${userId} -> status=past_due`);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
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
        console.log(`[billing-webhook] invoice.payment_succeeded: user=${userId} plan_code=${planCode ?? "(unchanged)"}`);
        break;
      }

      default:
        console.log(`[billing-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    handlerError = err?.message || String(err);
    console.error("[billing-webhook] Handler error:", handlerError, err?.stack);
    // Always 200 to Stripe (no retries); we already claimed the event,
    // so the error is recorded in stripe_webhook_events.processing_error
    // for an operator to investigate.
  } finally {
    await markEventProcessed(event.id, handlerError);
  }

  return json({ received: true, ...(handlerError ? { warning: handlerError } : {}) });
});
