import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getSupabase } from "@/lib/supabase";

/**
 * POST /api/webhooks/resend — Resend webhook ingestion endpoint.
 *
 * Resend delivers webhooks via Svix. Every request is signed with HMAC-SHA256
 * over the body using the endpoint's signing secret. We validate the
 * signature (constant-time compare) before touching the body, then insert
 * one row into public.lit_resend_events for every lifecycle event.
 *
 * Event types we listen for (configured in the Resend dashboard):
 *   email.sent             → row.event_type = 'sent'
 *   email.delivered        → row.event_type = 'delivered'
 *   email.delivery_delayed → row.event_type = 'delivery_delayed'
 *   email.opened           → row.event_type = 'opened'
 *   email.clicked          → row.event_type = 'clicked'  (carries click_url)
 *   email.bounced          → row.event_type = 'bounced'
 *   email.complained       → row.event_type = 'complained'
 *   email.failed           → row.event_type = 'failed'
 *
 * Required env:
 *   RESEND_WEBHOOK_SECRET           Svix signing secret from the Resend dashboard.
 *                                    Format: `whsec_<base64>` — only the base64
 *                                    portion is used as the HMAC key.
 *   SUPABASE_URL + SERVICE_ROLE_KEY  Used by getSupabase() to write the event.
 *
 * Response contract:
 *   200 ok      — event accepted (logged + persisted, or intentionally ignored).
 *   400 bad     — malformed body or missing required Svix headers.
 *   401 unauth  — signature mismatch.
 *   500 store   — Supabase write failed; Resend will retry per its backoff.
 *
 * We try to return as fast as possible — the only blocking work is the
 * single Supabase insert. Any other downstream fan-out should be done
 * asynchronously off this endpoint.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: Record<string, unknown> & {
    email_id?: string;
    to?: string | string[];
    from?: string;
    subject?: string;
    tags?: Array<{ name: string; value: string }>;
    click?: { link?: string; ipAddress?: string; userAgent?: string };
    open?: { ipAddress?: string; userAgent?: string };
    bounce?: { type?: string; message?: string };
  };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return json({ error: "missing_svix_headers" }, 400);
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET unset");
    return json({ error: "server_misconfigured" }, 500);
  }

  if (!verifySignature(secret, svixId, svixTimestamp, svixSignature, rawBody)) {
    console.warn("[webhooks/resend] signature mismatch", { svixId });
    return json({ error: "signature_mismatch" }, 401);
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const row = mapPayloadToRow(payload);
  if (!row) {
    // Unknown / unhandled event type — ack with 200 so Resend doesn't retry.
    return json({ ok: true, skipped: true, type: payload?.type });
  }

  const supa = getSupabase();
  if (!supa) {
    console.error("[webhooks/resend] supabase client unavailable");
    return json({ error: "store_unavailable" }, 500);
  }

  const { error } = await supa.from("lit_email_events").insert(row);
  if (error) {
    console.error("[webhooks/resend] insert failed", error.message);
    return json({ error: "store_failed" }, 500);
  }

  return json({ ok: true });
}

/**
 * Verify a Svix signature header. Svix sends multiple space-separated
 * "v1,<base64sig>" entries — any match is sufficient.
 */
function verifySignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  body: string,
): boolean {
  // Strip the `whsec_` prefix if present; the remainder is the base64-encoded
  // HMAC key.
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;

  let key: Buffer;
  try {
    key = Buffer.from(keyB64, "base64");
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = crypto
    .createHmac("sha256", key)
    .update(signedContent)
    .digest("base64");

  // svix-signature header format: "v1,<sig> v1,<sig> ..."
  const candidates = svixSignature
    .split(/\s+/)
    .map((s) => s.split(",", 2)[1])
    .filter((s): s is string => Boolean(s));

  for (const candidate of candidates) {
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

// Mapped to the actual public.lit_email_events schema:
// (id, conversation_id, message_id, campaign_id, contact_id, event_type,
//  event_timestamp, user_agent, ip_hash, url_clicked, metadata_json, created_at)
type EmailEventRow = {
  message_id: string | null;
  event_type: string;
  event_timestamp: string;
  user_agent: string | null;
  ip_hash: string | null;
  url_clicked: string | null;
  metadata_json: {
    email_to: string | null;
    subject: string | null;
    template_id: string | null;
    tags: Array<{ name: string; value: string }> | null;
    raw: ResendWebhookPayload;
  };
};

function mapEventType(type: string): string {
  // Strip the "email." prefix if present, otherwise return the raw type.
  return type.startsWith("email.") ? type.slice("email.".length) : type;
}

function mapPayloadToRow(p: ResendWebhookPayload): EmailEventRow | null {
  if (!p?.type || typeof p.type !== "string") return null;

  // Only persist email.* lifecycle events. Contact.* events come on a
  // different pipeline (Resend Audiences) and are tracked elsewhere.
  if (!p.type.startsWith("email.")) return null;

  const data = p.data ?? {};
  const click = data.click ?? {};
  const open = data.open ?? {};

  const to = Array.isArray(data.to) ? data.to[0] : data.to;

  // Resolve template_id from Resend tags. The marketing-site sender attaches
  // a tag `template` whenever it dispatches via a template id.
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const templateTag = tags.find((t: { name: string; value: string }) => t?.name === "template");
  const template_id = templateTag?.value ?? null;

  return {
    message_id: typeof data.email_id === "string" ? data.email_id : null, // Resend's email_id → message_id
    event_type: mapEventType(p.type),
    event_timestamp: typeof p.created_at === "string" ? p.created_at : new Date().toISOString(),
    user_agent:
      (typeof click.userAgent === "string" && click.userAgent.slice(0, 500)) ||
      (typeof open.userAgent === "string" && open.userAgent.slice(0, 500)) ||
      null,
    ip_hash:
      (typeof click.ipAddress === "string" && click.ipAddress) ||
      (typeof open.ipAddress === "string" && open.ipAddress) ||
      null,
    url_clicked: typeof click.link === "string" ? click.link.slice(0, 2048) : null,
    metadata_json: {
      // Everything Resend gave us that doesn't fit a dedicated column.
      email_to: typeof to === "string" ? to.toLowerCase().slice(0, 254) : null,
      subject: typeof data.subject === "string" ? data.subject.slice(0, 998) : null,
      template_id,
      tags: tags.length > 0 ? tags : null,
      raw: p,
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
