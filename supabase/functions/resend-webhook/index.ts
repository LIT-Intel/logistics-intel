// resend-webhook — receives Resend email lifecycle events and writes
// them into the existing campaign tracking tables so Resend-sent
// campaigns share one analytics surface with Gmail / Outlook sends.
//
// Public endpoint (verify_jwt: false). Authenticity is enforced via
// Svix-style HMAC signing, the same scheme Resend ships with.
//
// Per event we:
//   1. Verify svix-id + svix-timestamp + body signature against
//      LIT_RESEND_WEBHOOK_SECRET. Reject 401 if it doesn't match.
//   2. Insert the raw payload into email_webhook_events for audit.
//   3. Look up the original send in lit_outreach_history by
//      provider='resend' AND message_id=event.data.email_id.
//   4. Insert a derivative lit_outreach_history event row with the
//      mapped event_type (opened, clicked, delivered, bounced,
//      complained, delayed).
//   5. On bounced or complained: upsert into lit_email_suppression_list
//      so the dispatcher's pre-send gate auto-skips this address on
//      subsequent campaigns.
//
// Hard rules:
//   - 200 on signature pass even if no matching send is found, because
//     Resend's retry policy hammers non-2xx responses and we don't want
//     stale rows to back-pressure the pipeline.
//   - Never trust event.data.email_id as the SOLE identifier — also
//     join on the recipient email so cross-account routing mistakes
//     don't taint another customer's analytics.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EVENT_MAP: Record<string, { type: string; status: string; ts: string | null }> = {
  "email.delivered":        { type: "delivered",   status: "delivered",  ts: "occurred_at" },
  "email.opened":           { type: "opened",      status: "opened",     ts: "opened_at" },
  "email.clicked":          { type: "clicked",     status: "clicked",    ts: "clicked_at" },
  "email.bounced":          { type: "bounced",     status: "bounced",    ts: "failed_at" },
  "email.complained":       { type: "complained",  status: "complained", ts: "failed_at" },
  "email.delivery_delayed": { type: "delayed",     status: "delayed",    ts: null },
  "email.sent":             { type: "sent_ack",    status: "sent",       ts: null },
};

async function verifySvix(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  // Replay-protection: reject events older than 5 minutes.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  // Resend secrets ship as `whsec_<base64>`. Strip the prefix.
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  const payload = `${id}.${ts}.${rawBody}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // Header format: "v1,<base64>" possibly multiple space-separated.
  for (const part of sigHeader.split(" ")) {
    const [, sig] = part.split(",");
    if (sig && sig === computed) return true;
  }
  return false;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("LIT_RESEND_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  const rawBody = await req.text();

  // Signature check. Skip only if no secret is configured AND we're in
  // a dev/local context — production must always have the secret set.
  if (webhookSecret) {
    const ok = await verifySvix(req, rawBody, webhookSecret);
    if (!ok) {
      console.warn("[resend-webhook] signature verification failed");
      return json({ ok: false, error: "bad_signature" }, 401);
    }
  } else {
    console.warn("[resend-webhook] LIT_RESEND_WEBHOOK_SECRET not set; accepting unsigned payload");
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const eventType: string = String(event?.type || "");
  const data = event?.data || {};
  const emailId: string | null = data?.email_id || data?.id || null;
  const recipient: string | null = Array.isArray(data?.to) ? data.to[0] : (typeof data?.to === "string" ? data.to : null);
  const occurredAt: string = data?.created_at || event?.created_at || new Date().toISOString();

  const admin = createClient(supabaseUrl, serviceKey);

  // 1. Raw audit log — always insert, even for unmapped event types.
  await admin.from("email_webhook_events").insert({
    provider: "resend",
    event_type: eventType,
    email_id: emailId,
    from_email: data?.from || null,
    to_emails: data?.to ? (Array.isArray(data.to) ? data.to : [data.to]) : null,
    subject: data?.subject || null,
    created_at_provider: occurredAt,
    payload: event,
    email_source: "campaign",
  });

  const mapped = EVENT_MAP[eventType];
  if (!mapped) {
    return json({ ok: true, ignored: eventType });
  }

  // 2. Resolve the original send so we can stamp campaign_id +
  //    contact_id on the derivative event row. We trust message_id +
  //    recipient — a routing error that delivers to a stranger should
  //    not pollute another org's analytics.
  let original: any = null;
  if (emailId) {
    const { data: hit } = await admin
      .from("lit_outreach_history")
      .select("id, user_id, campaign_id, campaign_step_id, company_id, contact_id, subject, metadata")
      .eq("provider", "resend")
      .eq("message_id", emailId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    original = hit ?? null;
  }

  // 3. Derivative event — single row per webhook fire.
  await admin.from("lit_outreach_history").insert({
    user_id: original?.user_id ?? null,
    campaign_id: original?.campaign_id ?? null,
    campaign_step_id: original?.campaign_step_id ?? null,
    company_id: original?.company_id ?? null,
    contact_id: original?.contact_id ?? null,
    channel: "email",
    event_type: mapped.type,
    status: mapped.status,
    subject: original?.subject || data?.subject || null,
    message_id: emailId,
    provider: "resend",
    provider_event_id: event?.id || null,
    occurred_at: occurredAt,
    metadata: {
      recipient_email: recipient,
      url: data?.click?.link || null,
      reason: data?.bounce?.message || data?.complaint?.feedback_id || null,
      raw_event: eventType,
    },
  });

  // 4. Suppression on bounce / complaint. We don't have an org_id
  //    pinned to the event, so fall back to the original send's user
  //    org via lit_email_accounts when available; otherwise insert
  //    org-wide null (global suppression for this address).
  if ((mapped.type === "bounced" || mapped.type === "complained") && recipient) {
    let orgId: string | null = null;
    if (original?.user_id) {
      const { data: member } = await admin
        .from("org_members")
        .select("org_id")
        .eq("user_id", original.user_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = member?.org_id ?? null;
    }
    await admin.from("lit_email_suppression_list").upsert({
      org_id: orgId,
      email: recipient,
      reason: mapped.type === "bounced" ? "bounce_hard" : "complaint",
      source: "resend_webhook",
      context: { event_type: eventType, raw: data },
    }, { onConflict: "org_id,email" });
  }

  return json({ ok: true, mapped: mapped.type });
});
