import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * apollo-phone-webhook
 *
 * Phase 3 — Apollo's async phone-reveal pipeline POSTs the revealed
 * phone here once their backend has it. The original /people/match
 * request returned a person record with a `phone_numbers_request_id`
 * (and `phone_unlock_status='pending'` on lit_contacts). We use that
 * request_id (or the apollo person id) to find the row and update it.
 *
 * Auth model: this function is invoked by Apollo, not by an end-user,
 * so verify_jwt=false. When `APOLLO_PHONE_WEBHOOK_SECRET` is set, we
 * verify an HMAC-SHA256 signature in the `X-Apollo-Signature` header
 * over the raw request body. When the secret is unset (early rollout),
 * we log a warning but accept the payload — the operator must set the
 * secret on the Apollo dashboard side and in Supabase env before relying
 * on this for billing-grade trust.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Apollo-Signature",
};

const WEBHOOK_SECRET = Deno.env.get("APOLLO_PHONE_WEBHOOK_SECRET") || "";

async function verifySignature(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // documented soft-accept
  if (!signature) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(rawBody),
    );
    const expected = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Constant-time-ish comparison.
    const clean = signature.replace(/^sha256=/, "").trim().toLowerCase();
    if (clean.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ clean.charCodeAt(i);
    }
    return mismatch === 0;
  } catch (_) {
    return false;
  }
}

function extractPhone(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload.phone === "string" && payload.phone) return payload.phone;
  if (typeof payload.phone_number === "string" && payload.phone_number) {
    return payload.phone_number;
  }
  if (typeof payload.sanitized_number === "string" && payload.sanitized_number) {
    return payload.sanitized_number;
  }
  if (Array.isArray(payload.phone_numbers) && payload.phone_numbers[0]) {
    const first = payload.phone_numbers[0];
    if (typeof first === "string") return first;
    return (
      first.sanitized_number || first.raw_number || first.number || null
    );
  }
  if (payload.person && typeof payload.person === "object") {
    return extractPhone(payload.person);
  }
  return null;
}

// Apollo may wrap the resolved person under people[]/contacts[]/matches[]/data/
// result rather than at the top level, so collect every candidate object (top
// level + one level of common wrappers) and read ids/phone from whichever has them.
function candidateNodes(payload: any): any[] {
  const nodes: any[] = [];
  const push = (v: any) => { if (v && typeof v === "object") nodes.push(v); };
  push(payload);
  for (const key of ["person", "contact", "data", "result", "payload"]) push(payload?.[key]);
  for (const key of ["people", "contacts", "matches", "results", "data", "phone_numbers"]) {
    const arr = payload?.[key];
    if (Array.isArray(arr)) arr.forEach(push);
    else push(arr);
  }
  return nodes;
}
function firstStr(nodes: any[], keys: string[]): string | null {
  for (const n of nodes) {
    for (const k of keys) {
      const v = n?.[k];
      if (v != null && (typeof v === "string" || typeof v === "number")) {
        const s = String(v).trim();
        if (s) return s;
      }
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const rawBody = await req.text();
  // Apollo's phone-callback shape isn't documented and has been the blocker —
  // log the raw body (truncated) so we can see exactly what it sends.
  console.log("[apollo-phone-webhook] raw", rawBody ? rawBody.slice(0, 4000) : "(empty body)");
  const signature = req.headers.get("X-Apollo-Signature");
  const verified = await verifySignature(rawBody, signature);
  if (!verified) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid signature" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!WEBHOOK_SECRET) {
    console.warn(
      "[apollo-phone-webhook] APOLLO_PHONE_WEBHOOK_SECRET unset — accepting unsigned payload",
    );
  }

  let payload: any = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch (_) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON payload" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!payload || typeof payload !== "object") {
    return new Response(
      JSON.stringify({ ok: false, error: "Empty payload" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Apollo's exact callback shape isn't fully documented; search top-level AND
  // nested wrappers (people[]/contacts[]/data) for whichever id + phone surfaces.
  const nodes = candidateNodes(payload);
  const requestId: string | null = firstStr(nodes, ["request_id", "phone_numbers_request_id"]);
  // person id: Apollo person ids are 24-char hex; accept `id` too but only as a
  // person-id candidate (never as request id, which is numeric).
  const personId: string | null = firstStr(nodes, ["person_id", "apollo_person_id", "id"]);
  const phone = firstStr(nodes.map((n) => ({ p: extractPhone(n) })), ["p"]);
  console.log("[apollo-phone-webhook] parsed", { requestId, personId, hasPhone: !!phone, nodeCount: nodes.length });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Locate the lit_contacts row. Prefer request_id (set when we issued the
  // unlock) so we can be sure we're updating the same record. Fall back
  // to apollo person id via (source='apollo', source_contact_key=<personId>).
  let row: { id: string; company_id: string | null } | null = null;
  if (requestId) {
    const { data } = await supabase
      .from("lit_contacts")
      .select("id, company_id")
      .eq("phone_unlock_request_id", requestId)
      .maybeSingle();
    if (data) row = data as any;
  }
  if (!row && personId) {
    // Match the Apollo person id against source_contact_key regardless of
    // `source` — unlocked contacts are often source='lit', so the old
    // source='apollo' filter never matched.
    const { data } = await supabase
      .from("lit_contacts")
      .select("id, company_id")
      .eq("source_contact_key", String(personId))
      .limit(1);
    if (Array.isArray(data) && data[0]) row = data[0] as { id: string; company_id: string | null };
  }

  if (!row) {
    // Honest 202: webhook fired but we couldn't locate the contact. Don't
    // return 4xx — Apollo would retry forever.
    console.warn(
      "[apollo-phone-webhook] no matching lit_contacts row",
      { requestId, personId, hasPhone: !!phone },
    );
    return new Response(
      JSON.stringify({ ok: true, matched: false, request_id: requestId, person_id: personId }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const update: Record<string, unknown> = {
    phone_unlock_status: phone ? "delivered" : "failed",
  };
  if (phone) update.phone = phone;

  const { error: updErr } = await supabase
    .from("lit_contacts")
    .update(update)
    .eq("id", row.id);
  if (updErr) {
    console.error("[apollo-phone-webhook] update failed", updErr.message);
    return new Response(
      JSON.stringify({ ok: false, error: updErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Log an activity event so the contact's company timeline shows the unlock.
  try {
    await supabase.from("lit_activity_events").insert({
      event_type: "apollo_phone_revealed",
      company_id: row.company_id,
      metadata: {
        provider: "apollo",
        contact_id: row.id,
        request_id: requestId,
        apollo_person_id: personId,
        phone_present: !!phone,
        signed: !!WEBHOOK_SECRET,
      },
    });
  } catch (_) {
    // Non-fatal — the phone was already saved.
  }

  return new Response(
    JSON.stringify({
      ok: true,
      matched: true,
      contact_id: row.id,
      phone_unlock_status: update.phone_unlock_status,
      phone_present: !!phone,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
