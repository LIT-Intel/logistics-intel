// cal-webhook v3 — receives Cal.com booking webhooks and logs them as
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
// Mapping strategy (Sub-project L — multi-strategy attribution):
//   Strategy 1: attendee_match     → most recent lit_outreach_history send
//                whose metadata.recipient_email matches the booker (attendee)
//                email AND whose own campaign_id is NOT NULL.
//                This handles the canonical "we mailed them, they booked" path.
//   Strategy 2: booker_contact_match → if Strategy 1 misses, look up the
//                booker email in lit_campaign_contacts joined to an active
//                campaign. Handles "contact was queued/added to a campaign
//                but no send had landed yet."
//   Strategy 3: organizer_match    → if Strategies 1+2 miss, resolve the
//                booking's organizer.email to an auth.users row, then attach
//                to that user's most recent active|draft campaign in
//                lit_campaigns. Handles "person books on our calendar without
//                ever having been on an outbound list" — the Meetings KPI
//                still credits the campaign that's currently running.
//   Strategy 4: unattributed       → no match available; row is written with
//                campaign_id=NULL and metadata.attribution_path='unattributed'
//                so it surfaces in admin reports as "unattributed booking".
//
// Idempotency: dedupes against metadata->>'cal_booking_id' so Cal.com
// retries don't double-log.

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

// Extract organizer email from various shapes Cal.com has shipped. The
// canonical field is payload.organizer.email but older / cancelled-event
// payloads sometimes carry payload.user.email or payload.organizerEmail.
function extractOrganizerEmail(payload: any): string {
  const candidates = [
    payload?.organizer?.email,
    payload?.organizerEmail,
    payload?.user?.email,
    payload?.eventOwner?.email,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) return c.trim().toLowerCase();
  }
  return "";
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
  const organizerEmail = extractOrganizerEmail(payload);
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

  // Dedupe: same cal_booking_id + event_type already logged? Cal.com
  // retries on 5xx; we never want duplicates on the campaign timeline.
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

  // ── Attribution strategy 1: attendee_match ───────────────────────────
  // Match the booker email to their most recent outreach send. Most recent
  // (by created_at DESC) so a re-engagement scenario attributes to the
  // current active campaign, not the first one the contact ever got mailed.
  let campaignId: string | null = null;
  let recipientId: string | null = null;
  let userId: string | null = null;
  let contactId: string | null = null;
  let companyId: string | null = null;
  let attributionPath:
    | "attendee_match"
    | "booker_contact_match"
    | "organizer_match"
    | "unattributed" = "unattributed";

  if (attendeeEmail) {
    // Pull a small window of recent sends (not just the single most recent)
    // so a stale send row with campaign_id=NULL doesn't poison attribution.
    // We pick the most-recent send WHERE campaign_id IS NOT NULL.
    const { data: recentSends } = await db
      .from("lit_outreach_history")
      .select("campaign_id, contact_id, company_id, user_id, metadata")
      .eq("event_type", "sent")
      .filter("metadata->>recipient_email", "eq", attendeeEmail)
      .not("campaign_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastSend = Array.isArray(recentSends) && recentSends.length > 0 ? recentSends[0] : null;
    if (lastSend?.campaign_id) {
      campaignId = lastSend.campaign_id ?? null;
      contactId = lastSend.contact_id ?? null;
      companyId = lastSend.company_id ?? null;
      userId = lastSend.user_id ?? null;
      recipientId = (lastSend.metadata as any)?.recipient_id ?? null;
      attributionPath = "attendee_match";
    }
  }

  // ── Attribution strategy 2: booker_contact_match ─────────────────────
  // Strategy 1 missed (no prior send to the booker). Look the booker email
  // up directly in lit_campaign_contacts and pick a contact that belongs
  // to an active campaign — this covers contacts queued/added to a campaign
  // before the first send window fired.
  if (!campaignId && attendeeEmail) {
    const { data: contactRows } = await db
      .from("lit_campaign_contacts")
      .select("id, campaign_id, contact_id, company_id, user_id, lit_campaigns!inner(id,status)")
      .eq("email", attendeeEmail)
      .eq("lit_campaigns.status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    const contactRow = Array.isArray(contactRows) && contactRows.length > 0 ? contactRows[0] as any : null;
    if (contactRow?.campaign_id) {
      campaignId = contactRow.campaign_id ?? null;
      contactId = contactRow.contact_id ?? null;
      companyId = contactRow.company_id ?? null;
      userId = contactRow.user_id ?? null;
      recipientId = contactRow.id ?? null;
      attributionPath = "booker_contact_match";
    }
  }

  // ── Attribution strategy 3: organizer_match ──────────────────────────
  // Strategy 1 missed (e.g. a prospect booked on our calendar without ever
  // being on an outbound list, or attendee was an internal mailbox like
  // sales@logisticintel.com). Use the booking organizer's email to find
  // the LIT user who owns the calendar, then attribute to their most
  // recently created active|draft campaign.
  if (!campaignId && organizerEmail) {
    const { data: organizerUser } = await db
      .schema("auth" as any)
      .from("users")
      .select("id")
      .eq("email", organizerEmail)
      .limit(1)
      .maybeSingle();
    const organizerUserId = (organizerUser as any)?.id ?? null;
    if (organizerUserId) {
      const { data: recentCampaign } = await db
        .from("lit_campaigns")
        .select("id")
        .eq("user_id", organizerUserId)
        .in("status", ["active", "draft"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentCampaign?.id) {
        campaignId = recentCampaign.id;
        userId = organizerUserId;
        attributionPath = "organizer_match";
      }
    }
  }

  // ── Fallback: user_id resolution ─────────────────────────────────────
  // user_id is NOT NULL on lit_outreach_history. If neither attribution
  // strategy resolved one, fall back to the first platform_admin so the
  // row inserts cleanly and shows up in unattributed-meetings reports.
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
    organizer_email: organizerEmail || null,
    recipient_email: attendeeEmail,
    recipient_id: recipientId,
    // matched_via is kept for backwards-compat with anything still reading it.
    matched_via:
      attributionPath === "attendee_match"
        ? "last_send"
        : attributionPath === "booker_contact_match"
        ? "booker_contact"
        : attributionPath === "organizer_match"
        ? "organizer"
        : "unmatched",
    attribution_path: attributionPath,
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

  log("info", "meeting_logged", { event_type: eventType, cal_booking_id: bookingId, campaign_id: campaignId, attribution_path: attributionPath, matched: !!campaignId });
  return new Response(JSON.stringify({ ok: true, id: inserted?.id, event_type: eventType, campaign_id: campaignId, attribution_path: attributionPath }), { headers: { "Content-Type": "application/json" } });
});
