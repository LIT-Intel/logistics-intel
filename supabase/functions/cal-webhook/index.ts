// cal-webhook v1 — receives Cal.com booking webhooks and logs them as
// meeting events on the matching campaign recipient.
//
// Wire-up (one-time): Cal.com Dashboard → Settings → Developer → Webhooks
//   URL:        https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/cal-webhook
//   Events:     BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
//   Secret:     copy into CAL_WEBHOOK_SECRET on Supabase Edge Functions → Secrets
//
// Auth: HMAC-SHA256 of the raw JSON body, signed with CAL_WEBHOOK_SECRET,
// sent by Cal.com as the X-Cal-Signature-256 header (hex, lowercase).
//
// Mapping strategy:
//   1. Get the attendee email from payload.attendees[0].email
//   2. Find the most recent lit_outreach_history send for that email
//      where event_type='sent' (this gives us campaign_id + recipient_id + user_id)
//   3. INSERT a fresh lit_outreach_history row with event_type='meeting_booked'
//      (or 'meeting_rescheduled' / 'meeting_cancelled')
//   4. Stash the Cal.com booking payload in metadata for later inspection.
//
// Idempotency: dedupes against metadata->>'cal_booking_id' so Cal.com
// retries don't double-log. If no matching send is found (e.g. the
// attendee booked without ever getting an email from us), we still
// log a row with campaign_id=NULL so it's visible in admin reports.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = { ts: new Date().toISOString(), level, fn: "cal-webhook", event, ...fields };
  const json = JSON.stringify(line);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);
}

async function verifySignature(secret: string, rawBody: string, providedSig: string): Promise<boolean> {
  if (!providedSig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time compare to defend against timing attacks.
  const a = hex.toLowerCase();
  const b = providedSig.toLowerCase().replace(/^sha256=/, "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function mapEventType(trigger: string): string {
  const t = String(trigger || "").toUpperCase();
  if (t === "BOOKING_CREATED" || t === "BOOKING_CONFIRMED") return "meeting_booked";
  if (t === "BOOKING_RESCHEDULED") return "meeting_rescheduled";
  if (t === "BOOKING_CANCELLED" || t === "BOOKING_CANCELED" || t === "MEETING_ENDED") return "meeting_cancelled";
  return "meeting_" + t.toLowerCase();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Cal-Signature-256" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });

  const secret = Deno.env.get("CAL_WEBHOOK_SECRET") || "";
  const rawBody = await req.text();
  const sig = req.headers.get("X-Cal-Signature-256") || req.headers.get("x-cal-signature-256") || "";

  // If secret is set, signature is required. If not set (e.g. very
  // first wire-up before user adds the secret), log but accept —
  // tightens to required once CAL_WEBHOOK_SECRET is configured.
  if (secret) {
    const ok = await verifySignature(secret, rawBody, sig);
    if (!ok) {
      log("warn", "signature_invalid", { provided_len: sig.length });
      return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
  } else {
    log("warn", "secret_unset_accepting_anyway");
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  const trigger = String(body?.triggerEvent || body?.trigger_event || "").trim();
  const payload = body?.payload || {};
  const attendees: any[] = Array.isArray(payload?.attendees) ? payload.attendees : [];
  const attendeeEmail = String(attendees[0]?.email || "").trim().toLowerCase();
  const bookingId = String(payload?.uid || payload?.bookingId || payload?.id || "").trim();
  const startTime = payload?.startTime || payload?.start_time || null;
  const meetingTitle = payload?.title || payload?.eventTitle || null;
  const meetingUrl = payload?.meetingUrl || payload?.location || null;

  if (!trigger || !bookingId) {
    return new Response(JSON.stringify({ ok: false, error: "missing_trigger_or_booking_id" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const eventType = mapEventType(trigger);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: existing } = await db
    .from("lit_outreach_history")
    .select("id")
    .eq("event_type", eventType)
    .filter("metadata->>cal_booking_id", "eq", bookingId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    log("info", "dedupe_hit", { cal_booking_id: bookingId, event_type: eventType });
    return new Response(JSON.stringify({ ok: true, skipped: "dedupe" }), { headers: { "Content-Type": "application/json" } });
  }

  let campaignId: string | null = null;
  let recipientId: string | null = null;
  let userId: string | null = null;
  let contactId: string | null = null;
  let companyId: string | null = null;
  if (attendeeEmail) {
    const { data: lastSend } = await db
      .from("lit_outreach_history")
      .select("campaign_id, contact_id, company_id, user_id, metadata")
      .eq("event_type", "sent")
      .filter("metadata->>recipient_email", "eq", attendeeEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastSend) {
      campaignId = lastSend.campaign_id ?? null;
      contactId = lastSend.contact_id ?? null;
      companyId = lastSend.company_id ?? null;
      userId = lastSend.user_id ?? null;
      recipientId = (lastSend.metadata as any)?.recipient_id ?? null;
    }
  }

  if (!userId) {
    const { data: admin } = await db.from("platform_admins").select("user_id").limit(1).maybeSingle();
    userId = admin?.user_id ?? null;
  }
  if (!userId) {
    log("error", "no_user_id_fallback", { attendee_email: attendeeEmail });
    return new Response(JSON.stringify({ ok: false, error: "no_user_id_resolvable" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const meta: Record<string, unknown> = {
    cal_booking_id: bookingId,
    cal_trigger: trigger,
    cal_start_time: startTime,
    cal_meeting_url: meetingUrl,
    cal_meeting_title: meetingTitle,
    attendee_email: attendeeEmail,
    recipient_email: attendeeEmail,
    recipient_id: recipientId,
    matched_via: campaignId ? "last_send" : "unmatched",
  };

  const { data: inserted, error: insertErr } = await db
    .from("lit_outreach_history")
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      contact_id: contactId,
      company_id: companyId,
      channel: "meeting",
      event_type: eventType,
      status: eventType,
      provider: "cal.com",
      subject: meetingTitle,
      occurred_at: startTime || new Date().toISOString(),
      metadata: meta,
    })
    .select("id")
    .single();

  if (insertErr) {
    log("error", "history_insert_failed", { err: insertErr.message, cal_booking_id: bookingId });
    return new Response(JSON.stringify({ ok: false, error: insertErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  log("info", "meeting_logged", { event_type: eventType, cal_booking_id: bookingId, campaign_id: campaignId, matched: !!campaignId });
  return new Response(JSON.stringify({ ok: true, id: inserted?.id, event_type: eventType, campaign_id: campaignId }), { headers: { "Content-Type": "application/json" } });
});
