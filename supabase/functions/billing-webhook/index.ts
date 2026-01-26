import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

    if (!stripeWebhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "webhook_secret_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.text();

    // Verify webhook signature
    const textEncoder = new TextEncoder();
    const signatureHeader = signature;
    const [timestamp, signatures] = signatureHeader.split(",").map(item => item.split("=")[1]);

    if (!timestamp || !signatures) {
      return new Response(JSON.stringify({ error: "invalid_signature_format" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signedContent = `${timestamp}.${body}`;
    const encoder = new TextEncoder();
    const algorithm = { name: "HMAC", hash: "SHA-256" };
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(stripeWebhookSecret),
      algorithm,
      false,
      ["sign"]
    );
    const signature_bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
    const computed_signature = btoa(String.fromCharCode(...new Uint8Array(signature_bytes)));

    if (computed_signature !== signatures) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body);

    switch (event.type) {
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find org by stripe customer id
        const { data: billing, error: billingError } = await supabase
          .from("org_billing")
          .select("org_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (billingError || !billing) {
          console.error("Billing record not found for customer:", customerId);
          break;
        }

        // Update subscription info
        const status = subscription.status;
        const planId = subscription.items.data[0]?.price.product;

        const { error: updateError } = await supabase
          .from("org_billing")
          .update({
            stripe_subscription_id: subscription.id,
            status: status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", billing.org_id);

        if (updateError) {
          console.error("Error updating billing:", updateError);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: billing, error: billingError } = await supabase
          .from("org_billing")
          .select("org_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (billingError || !billing) {
          console.error("Billing record not found for customer:", customerId);
          break;
        }

        const { error: updateError } = await supabase
          .from("org_billing")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", billing.org_id);

        if (updateError) {
          console.error("Error updating billing:", updateError);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        // Log successful payment
        console.log("Payment succeeded for invoice:", event.data.object.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const { data: billing, error: billingError } = await supabase
          .from("org_billing")
          .select("org_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (billingError || !billing) {
          console.error("Billing record not found for customer:", customerId);
          break;
        }

        const { error: updateError } = await supabase
          .from("org_billing")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", billing.org_id);

        if (updateError) {
          console.error("Error updating billing:", updateError);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
