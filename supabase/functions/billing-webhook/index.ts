// supabase/functions/billing-webhook/index.ts
// Handles Stripe webhook events to keep the subscriptions table and user metadata in sync.
//
// Register this URL in the Stripe Dashboard → Developers → Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/billing-webhook
//
// Subscribe to events:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//   invoice.payment_succeeded

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");
if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Upsert subscription row using service-role key (bypasses RLS)
async function upsertSubscription(userId: string, data: Record<string, unknown>) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceRoleKey!,
        "Authorization": `Bearer ${supabaseServiceRoleKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
    }
  );

  // If no rows matched (user_id not found), insert instead
  if (res.status === 404 || (res.headers.get("content-range") === "*/0")) {
    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceRoleKey!,
        "Authorization": `Bearer ${supabaseServiceRoleKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ user_id: userId, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
  }
}

// Update auth.users metadata via the admin API
async function updateUserMetadata(userId: string, metadata: Record<string, unknown>) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseServiceRoleKey!,
      "Authorization": `Bearer ${supabaseServiceRoleKey}`,
    },
    body: JSON.stringify({ user_metadata: metadata }),
  });
}

// Map a Stripe price ID to a plan_code by querying the plans table
async function getPlanCodeForPrice(priceId: string): Promise<string | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/plans?or=(stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId})&select=code&limit=1`,
    {
      headers: {
        "apikey": supabaseServiceRoleKey!,
        "Authorization": `Bearer ${supabaseServiceRoleKey}`,
      },
    }
  );
  const rows: Array<{ code: string }> = await res.json().catch(() => []);
  return rows[0]?.code ?? null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  // Verify webhook signature (skip if STRIPE_WEBHOOK_SECRET not set — useful for local dev)
  let event: Stripe.Event;
  if (webhookSecret && sig) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err: any) {
      console.error("[billing-webhook] Signature verification failed:", err.message);
      return json({ error: "Invalid signature" }, 400);
    }
  } else {
    // No webhook secret configured — parse raw body (dev/testing only)
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  console.log(`[billing-webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {

      // ── Checkout completed: payment succeeded, subscription is now active ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id || session.client_reference_id;
        if (!userId) {
          console.warn("[billing-webhook] checkout.session.completed: no user_id in metadata");
          break;
        }

        const planCode = session.metadata?.plan_code || "standard";
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        // Fetch the subscription from Stripe to get period dates
        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        let stripePriceId: string | null = null;
        if (stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          periodStart = new Date((sub as any).current_period_start * 1000).toISOString();
          periodEnd = new Date((sub as any).current_period_end * 1000).toISOString();
          stripePriceId = (sub as any).items?.data?.[0]?.price?.id ?? null;
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
        });

        await updateUserMetadata(userId, {
          plan: planCode,
          stripe_customer_id: stripeCustomerId,
          subscription_status: "active",
        });

        console.log(`[billing-webhook] Activated subscription for user ${userId} → ${planCode}`);
        break;
      }

      // ── Subscription updated (upgrade, downgrade, renewal) ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub as any).metadata?.supabase_user_id;
        if (!userId) {
          // Try to find user by stripe_customer_id
          console.warn("[billing-webhook] subscription.updated: no user_id in metadata — skipping metadata update");
          break;
        }

        const priceId = sub.items?.data?.[0]?.price?.id ?? null;
        const planCode = priceId ? await getPlanCodeForPrice(priceId) : null;

        await upsertSubscription(userId, {
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer as string,
          stripe_price_id: priceId,
          plan_code: planCode ?? undefined,
          status: sub.status,
          current_period_start: new Date((sub as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        });

        if (planCode) {
          await updateUserMetadata(userId, {
            plan: planCode,
            subscription_status: sub.status,
          });
        }

        console.log(`[billing-webhook] Updated subscription for user ${userId} → status=${sub.status}`);
        break;
      }

      // ── Subscription cancelled or expired ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub as any).metadata?.supabase_user_id;
        if (!userId) {
          console.warn("[billing-webhook] subscription.deleted: no user_id in metadata — skipping");
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

        console.log(`[billing-webhook] Cancelled subscription for user ${userId}`);
        break;
      }

      // ── Payment failed ──
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        // Look up subscription to get user_id
        const sub = await stripe.subscriptions.retrieve(subId);
        const userId = (sub as any).metadata?.supabase_user_id;
        if (!userId) break;

        await upsertSubscription(userId, {
          status: "past_due",
        });

        await updateUserMetadata(userId, {
          subscription_status: "past_due",
        });

        console.log(`[billing-webhook] Payment failed for user ${userId}`);
        break;
      }

      // ── Payment succeeded (renewal) ──
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const userId = (sub as any).metadata?.supabase_user_id;
        if (!userId) break;

        await upsertSubscription(userId, {
          status: "active",
          current_period_start: new Date((sub as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
        });

        await updateUserMetadata(userId, {
          subscription_status: "active",
        });

        console.log(`[billing-webhook] Payment succeeded for user ${userId}`);
        break;
      }

      default:
        console.log(`[billing-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error("[billing-webhook] Handler error:", err.message, err.stack);
    // Always return 200 to Stripe to avoid retries on handler errors
    return json({ received: true, warning: err.message });
  }

  return json({ received: true });
});
