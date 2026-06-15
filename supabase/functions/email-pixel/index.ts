// email-pixel — open-tracking pixel for outbound campaign emails.
//
// URL shape: GET /functions/v1/email-pixel?t=<token>
//
// Token is a base64url-encoded payload + HMAC-SHA256 signature truncated
// to 16 bytes. Payload carries the minimum fields needed to attribute the
// open: { r: recipient_id, s: campaign_step_id, c: campaign_id, u: user_id }.
//
// Why HMAC tokens (not a slug table):
//   - Open pixels fire ONCE per send, ~50% hit rate. A per-send slug row
//     means an INSERT per send that's read back only ~half the time —
//     wasted writes + a wider table to keep clean.
//   - HMAC is stateless. The slug-table pattern (used by redirect-click)
//     exists because click destinations are CONTENT we have to look up;
//     opens have no destination to look up.
//   - Token is forge-proof: only the edge function (with the secret)
//     can mint a valid pixel URL, so a scraper or attacker can't inflate
//     metrics.
//
// Per request:
//   1. Decode + HMAC-verify the token. Bad sig → still return 1x1 GIF
//      (don't leak verification status to bots) but skip the write.
//   2. De-dupe per (recipient_id, campaign_step_id, event_type='opened') —
//      Apple Mail Privacy Protection pre-fetches images, so the first
//      open is the only signal we trust. Subsequent fires update
//      opened_at but don't double-count.
//   3. Insert lit_outreach_history row with event_type='opened',
//      provider='pixel'. Sub-project I plumbing (campaign_id NOT NULL
//      backfill) makes this immediately visible in CampaignKpiHero.
//   4. Return 1x1 transparent GIF with no-cache headers.
//
// Public — no JWT required. The token is the auth.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// 1x1 transparent GIF (43 bytes). Pre-encoded so we don't allocate on
// every fire.
const PIXEL_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
  0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b,
]);

function pixelResponse(status = 200): Response {
  return new Response(PIXEL_GIF, {
    status,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(sig);
}

function ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

/** Exported for unit testing — mints a pixel token from the four IDs. */
export async function mintPixelToken(
  secret: string,
  ids: { recipient_id: string; campaign_step_id: string; campaign_id: string; user_id: string },
): Promise<string> {
  // Compact JSON keys to keep the URL short; older mail clients truncate
  // very long links and break tracking.
  const payload = JSON.stringify({
    r: ids.recipient_id,
    s: ids.campaign_step_id,
    c: ids.campaign_id,
    u: ids.user_id,
  });
  const payloadB64 = b64urlEncode(new TextEncoder().encode(payload));
  const sig = await hmacSign(secret, payloadB64);
  // Truncate to 16 bytes — full SHA-256 is overkill for an integrity tag
  // on a short payload and would inflate the URL by 32 chars.
  const sigB64 = b64urlEncode(sig.slice(0, 16));
  return `${payloadB64}.${sigB64}`;
}

async function verifyToken(
  secret: string,
  token: string,
): Promise<{ recipient_id: string; campaign_step_id: string; campaign_id: string; user_id: string } | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let sigGiven: Uint8Array;
  try { sigGiven = b64urlDecode(sigB64); } catch { return null; }
  if (sigGiven.length !== 16) return null;
  const expected = await hmacSign(secret, payloadB64);
  if (!ctEqual(sigGiven, expected.slice(0, 16))) return null;
  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  } catch { return null; }
  if (!payload?.r || !payload?.s || !payload?.c || !payload?.u) return null;
  return {
    recipient_id: String(payload.r),
    campaign_step_id: String(payload.s),
    campaign_id: String(payload.c),
    user_id: String(payload.u),
  };
}

serve(async (req) => {
  // GET only — mail clients always fetch images with GET.
  if (req.method !== "GET") return pixelResponse(405);

  const url = new URL(req.url);
  const token = url.searchParams.get("t")?.trim();
  if (!token) return pixelResponse();

  // Pixel secret is reused across both signing (send-campaign-email) and
  // verification (here). Falls back to SUPABASE_SERVICE_ROLE_KEY if
  // unset so the pixel keeps working in environments where the user
  // hasn't yet rotated in a dedicated secret — the service-role key is
  // already a high-entropy server-side secret that no client sees.
  const secret = Deno.env.get("LIT_EMAIL_PIXEL_SECRET")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";
  if (!secret) return pixelResponse(); // still serve the GIF; just no write.

  const ids = await verifyToken(secret, token);
  if (!ids) return pixelResponse(); // bad sig → silent no-op.

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return pixelResponse();

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const now = new Date().toISOString();

    // Look up the original send so the opened row carries the same
    // contact_id + company_id + subject for analytics drill-ins. Best-
    // effort — if the lookup fails we still write the open with NULL
    // attribution rather than dropping the signal.
    let companyId: string | null = null;
    let contactId: string | null = null;
    let subject: string | null = null;
    let recipientEmail: string | null = null;
    try {
      const { data: contact } = await admin
        .from("lit_campaign_contacts")
        .select("email, company_id, contact_id")
        .eq("id", ids.recipient_id)
        .maybeSingle();
      if (contact) {
        companyId = (contact.company_id as string | null) ?? null;
        contactId = (contact.contact_id as string | null) ?? null;
        recipientEmail = (contact.email as string | null) ?? null;
      }
    } catch (e) {
      console.warn("[email-pixel] recipient lookup failed", e);
    }
    if (!subject) {
      try {
        const { data: step } = await admin
          .from("lit_campaign_steps")
          .select("subject")
          .eq("id", ids.campaign_step_id)
          .maybeSingle();
        subject = (step?.subject as string | null) ?? null;
      } catch { /* non-fatal */ }
    }

    // First-open dedupe. Apple Mail Privacy Protection pre-fetches images
    // server-side, so every recipient on iOS 15+ generates an open
    // ~instantly even if they never read the message. We still want to
    // record that first prefetch (it's the only signal we get on iOS)
    // but we don't want repeated prefetches to inflate the open rate.
    const { data: existing } = await admin
      .from("lit_outreach_history")
      .select("id")
      .eq("campaign_id", ids.campaign_id)
      .eq("event_type", "opened")
      .filter("metadata->>recipient_id", "eq", ids.recipient_id)
      .filter("metadata->>campaign_step_id", "eq", ids.campaign_step_id)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      // NOTE: contact_id is NOT set on the insert. lit_outreach_history.
      // contact_id FK targets lit_contacts.id. ids.recipient_id is
      // lit_campaign_contacts.id — different table. Setting raw recipient_id
      // here would violate the FK. The lit_campaign_contacts.contact_id
      // column (looked up above) DOES target lit_contacts.id, so we use
      // that when present. See redirect-click for the same pattern.
      await admin
        .from("lit_outreach_history")
        .insert({
          user_id: ids.user_id,
          campaign_id: ids.campaign_id,
          campaign_step_id: ids.campaign_step_id,
          company_id: companyId,
          contact_id: contactId,
          channel: "email",
          event_type: "opened",
          status: "opened",
          subject,
          provider: "pixel",
          opened_at: now,
          occurred_at: now,
          metadata: {
            recipient_id: ids.recipient_id,
            recipient_email: recipientEmail,
            campaign_step_id: ids.campaign_step_id,
            ua: req.headers.get("user-agent") ?? null,
            ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            source: "pixel",
          },
        })
        .throwOnError();
    } else {
      // Subsequent fires: just bump opened_at on the existing row so
      // last-seen analytics stay fresh, but don't insert another event.
      await admin
        .from("lit_outreach_history")
        .update({ opened_at: now })
        .eq("id", (existing as any).id);
    }
  } catch (e) {
    // Pixel must never 5xx — clients would log broken-image warnings.
    console.error("[email-pixel] write failure", e);
  }

  return pixelResponse();
});
