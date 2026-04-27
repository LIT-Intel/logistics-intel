import Stripe from "npm:stripe@14.25.0";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");

if (!stripeSecretKey) {
  console.error("Missing STRIPE_SECRET_KEY");
}

if (!webhookSecret) {
  console.error("Missing STRIPE_CONNECT_WEBHOOK_SECRET");
}

const stripe = new Stripe(stripeSecretKey ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Connected-account id lives at `event.account` for v1 events and
// `event.context` for v2 events.
function extractConnectedAccountId(event: any): string | null {
  if (typeof event?.account === "string") return event.account;
  if (typeof event?.context === "string") return event.context;
  return null;
}

// Primary object id: v1 puts the full object at event.data.object; v2 puts a
// reference at event.related_object and an inline payload at event.data.
function extractRawObjectId(event: any): string | null {
  const dataObject = event?.data?.object;
  if (dataObject && typeof dataObject === "object" && typeof dataObject.id === "string") {
    return dataObject.id;
  }
  const related = event?.related_object;
  if (related && typeof related === "object" && typeof related.id === "string") {
    return related.id;
  }
  if (typeof event?.data?.id === "string") return event.data.id;
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!stripeSecretKey || !webhookSecret) {
    return new Response(
      JSON.stringify({
        error: "Stripe Connect webhook is not configured",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing Stripe signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  // v1 and v2 webhooks share the same `stripe-signature` HMAC scheme, so
  // constructEventAsync verifies both. The resulting payload is loosely typed
  // for v2 — we extract fields defensively.
  let event: any;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.error("Stripe Connect webhook signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    return new Response(
      JSON.stringify({
        error: "Invalid Stripe signature",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const connectedAccountId = extractConnectedAccountId(event);
  const rawObjectId = extractRawObjectId(event);

  try {
    console.log("Stripe Connect webhook received", {
      id: event.id,
      type: event.type,
      connectedAccountId,
      rawObjectId,
      created: event.created,
    });

    switch (event.type) {
      // Health-check ping from a Stripe v2 event destination.
      case "v2.core.event_destination.ping": {
        console.log("Stripe Connect destination ping", {
          eventId: event.id,
          eventType: event.type,
          connectedAccountId,
          rawObjectId,
        });
        break;
      }

      // v2 account lifecycle.
      case "v2.core.account.created":
      case "v2.core.account.updated":
      case "v2.core.account.closed": {
        const obj = event?.data?.object ?? event?.related_object ?? null;
        console.log("v2 account lifecycle event", {
          eventId: event.id,
          eventType: event.type,
          connectedAccountId,
          accountId: rawObjectId,
          chargesEnabled: obj?.charges_enabled ?? null,
          payoutsEnabled: obj?.payouts_enabled ?? null,
          detailsSubmitted: obj?.details_submitted ?? null,
        });
        break;
      }

      // v2 requirements / identity updates.
      case "v2.core.account[requirements].updated":
      case "v2.core.account[identity].updated": {
        const obj = event?.data?.object ?? event?.related_object ?? null;
        console.log("v2 account requirements/identity update", {
          eventId: event.id,
          eventType: event.type,
          connectedAccountId,
          accountId: rawObjectId,
          disabledReason:
            obj?.disabled_reason ?? obj?.requirements?.disabled_reason ?? null,
          currentlyDue:
            obj?.currently_due ?? obj?.requirements?.currently_due ?? null,
          eventuallyDue:
            obj?.eventually_due ?? obj?.requirements?.eventually_due ?? null,
          pastDue: obj?.past_due ?? obj?.requirements?.past_due ?? null,
        });
        break;
      }

      // v2 configuration updates (recipient + merchant).
      case "v2.core.account[configuration.recipient].updated":
      case "v2.core.account[configuration.merchant].updated": {
        console.log("v2 account configuration update", {
          eventId: event.id,
          eventType: event.type,
          connectedAccountId,
          accountId: rawObjectId,
        });
        break;
      }

      // v2 capability status changes.
      case "v2.core.account[configuration.recipient].capability_status_updated":
      case "v2.core.account[configuration.merchant].capability_status_updated": {
        const obj = event?.data?.object ?? event?.related_object ?? null;
        console.log("v2 account capability status changed", {
          eventId: event.id,
          eventType: event.type,
          connectedAccountId,
          accountId: rawObjectId,
          capability: obj?.capability ?? null,
          status: obj?.status ?? null,
        });
        break;
      }

      // Legacy v1 account.updated kept as a defensive fallback for any
      // legacy destinations that may still be configured.
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        console.log("Connected account updated (v1)", {
          eventId: event.id,
          accountId: account.id,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          disabledReason: account.requirements?.disabled_reason ?? null,
          currentlyDue: account.requirements?.currently_due ?? [],
          eventuallyDue: account.requirements?.eventually_due ?? [],
          pastDue: account.requirements?.past_due ?? [],
        });
        break;
      }

      default:
        console.log("Unhandled Stripe Connect event type", {
          eventId: event.id,
          eventType: event.type,
          connectedAccountId,
          rawObjectId,
        });
        break;
    }

    return new Response(
      JSON.stringify({
        received: true,
        eventId: event.id,
        eventType: event.type,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Stripe Connect webhook processing failed", {
      eventId: event?.id,
      eventType: event?.type,
      error: err instanceof Error ? err.message : String(err),
    });

    return new Response(
      JSON.stringify({
        error: "Webhook processing failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
