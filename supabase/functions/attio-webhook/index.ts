// attio-webhook — receives Attio outbound webhooks for Deal record.updated
// events. When a deal's stage moves into the org's configured Won list,
// every active recipient matching the deal's email is flipped to
// status='funnel_exited' + next_send_at=NULL.
//
// Wire-up (one-time): Attio Dashboard → Settings → Webhooks
//   URL:        https://<project>.supabase.co/functions/v1/attio-webhook
//   Events:     record.updated (Deals object)
//   Secret:     copy into ATTIO_WEBHOOK_SECRET on Supabase Edge Functions
//
// Auth: HMAC-SHA256 of the raw JSON body using ATTIO_WEBHOOK_SECRET.
// Signature is sent as the `X-Attio-Signature` header (hex lowercase).
// If no signature header is present AND the secret is unset, we accept
// the payload — this lets ops wire up the webhook before configuring the
// secret without hitting 401s. Once the secret is set, signature is required.
//
// Idempotency: Attio's record.updated events are idempotent on (record_id,
// new_stage) by design — we don't dedupe further. A repeat-fire of the same
// event reissues the same UPDATE on lit_campaign_contacts, which is a no-op
// after the first.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = { ts: new Date().toISOString(), level, fn: "attio-webhook", event, ...fields };
  const json = JSON.stringify(line);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Attio webhook envelope shapes vary slightly by event type. We try multiple
// paths to find the canonical fields without being brittle.
function extractStage(record: any): string | null {
  // 1. attributes.stage.value (typical "record.updated" shape)
  if (record?.attributes?.stage?.value) return String(record.attributes.stage.value);
  // 2. values.stage[0].value (full record-fetch shape)
  if (Array.isArray(record?.values?.stage) && record.values.stage[0]?.value) {
    return String(record.values.stage[0].value);
  }
  // 3. attributes.stage as plain string
  if (typeof record?.attributes?.stage === "string") return record.attributes.stage;
  return null;
}

function extractEmail(record: any, ev: any): string | null {
  // 1. attributes.email
  if (record?.attributes?.email) return String(record.attributes.email).toLowerCase();
  // 2. values.email[0].email_address (Attio's email-attribute shape)
  if (Array.isArray(record?.values?.email) && record.values.email[0]) {
    const e = record.values.email[0];
    if (e?.email_address) return String(e.email_address).toLowerCase();
    if (e?.value) return String(e.value).toLowerCase();
  }
  // 3. values.primary_email_address
  if (Array.isArray(record?.values?.primary_email_address) && record.values.primary_email_address[0]?.value) {
    return String(record.values.primary_email_address[0].value).toLowerCase();
  }
  // 4. ev.data.email shortcut
  if (ev?.data?.email) return String(ev.data.email).toLowerCase();
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Attio-Signature",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const secret = Deno.env.get("ATTIO_WEBHOOK_SECRET") || "";
  const rawBody = await req.text();
  const sig = (req.headers.get("X-Attio-Signature") || req.headers.get("x-attio-signature") || "").trim();

  if (secret) {
    const expected = await hmacSha256Hex(secret, rawBody);
    const provided = sig.toLowerCase().replace(/^sha256=/, "");
    if (!constantTimeEqual(expected, provided)) {
      log("warn", "signature_invalid", { provided_len: sig.length });
      return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
  } else {
    log("warn", "secret_unset_accepting_anyway");
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const events: any[] = Array.isArray(body?.events) ? body.events : [body];

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);

  let exited = 0;
  let evaluated = 0;
  const errors: string[] = [];

  for (const ev of events) {
    const evType = String(ev?.type || ev?.event_type || "").toLowerCase();
    // Accept multiple Attio event-type names; if absent (raw record posted),
    // treat as record.updated.
    if (evType && !["record.updated", "record_updated", "record.update", "update"].includes(evType)) {
      continue;
    }
    const record = ev?.data?.record || ev?.record || ev?.data || null;
    if (!record) continue;

    const newStage = extractStage(record);
    const email = extractEmail(record, ev);
    if (!newStage || !email) {
      log("info", "skip_missing_fields", { has_stage: !!newStage, has_email: !!email });
      continue;
    }
    evaluated++;

    // Find every active recipient matching this email.
    const { data: recipients, error: lookupErr } = await db
      .from("lit_campaign_contacts")
      .select("id, campaign_id")
      .eq("email", email)
      .in("status", ["queued", "pending"]);
    if (lookupErr) {
      log("warn", "recipient_lookup_failed", { err: lookupErr.message, email });
      errors.push(lookupErr.message);
      continue;
    }
    if (!recipients || recipients.length === 0) {
      log("info", "no_active_recipients", { email });
      continue;
    }

    for (const r of recipients) {
      try {
        const { data: rules } = await db.rpc("lit_effective_exit_rules", { p_campaign_id: r.campaign_id });
        const shouldExit = rules && (rules as any).exit_on_attio_won === true;
        if (!shouldExit) {
          log("info", "exit_disabled_for_campaign", { campaign_id: r.campaign_id, recipient_id: r.id });
          continue;
        }
        const wonStages: string[] = ((rules as any).attio_won_stages) || ["Won", "Closed Won", "Customer"];
        if (!wonStages.includes(newStage)) {
          log("info", "stage_not_in_won_list", { new_stage: newStage, won_stages: wonStages });
          continue;
        }
        const { error: updErr } = await db
          .from("lit_campaign_contacts")
          .update({ status: "funnel_exited", next_send_at: null, updated_at: new Date().toISOString() })
          .eq("id", r.id);
        if (updErr) {
          log("warn", "exit_update_failed", { err: updErr.message, recipient_id: r.id });
          continue;
        }
        await db.from("lit_outreach_history").insert({
          campaign_id: r.campaign_id,
          contact_id: null,
          channel: "crm",
          event_type: "funnel_exit",
          status: "funnel_exited",
          provider: "attio",
          occurred_at: new Date().toISOString(),
          metadata: {
            attio_record_id: record?.id || record?.record_id || null,
            new_stage: newStage,
            recipient_id: r.id,
            recipient_email: email,
            source: "attio_webhook",
          },
        });
        exited++;
        log("info", "exit_applied", { campaign_id: r.campaign_id, recipient_id: r.id, new_stage: newStage });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log("warn", "per_recipient_failed", { err: msg, recipient_id: r.id });
        errors.push(msg);
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, evaluated, exited, errors: errors.slice(0, 5) }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
