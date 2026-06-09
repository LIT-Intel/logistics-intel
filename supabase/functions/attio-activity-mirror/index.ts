// attio-activity-mirror v1 — mirrors LIT outreach events (sent, opened,
// clicked, replied, bounced, complained) as Notes on the matching Attio
// Person record so sales can see activity inside Attio's CRM UI without
// flipping back to LIT.
//
// Trigger: pg_net POST from Postgres trigger on lit_outreach_history
// (per-send) and lit_email_events (per-engagement). Auth: X-Internal-Cron
// + anon JWT in Authorization (gateway-pass), validated server-side.
//
// Idempotency: Attio Notes don't enforce uniqueness, so we accept a
// dedupe_key from the caller and short-circuit if we've already written
// the same key to lit_attio_activity_log within the last 7 days.
//
// Lookup: we find the Attio Person by email via the query endpoint
// (POST /v2/objects/people/records/query). If no match, we DO NOT create
// a new Person — that's pulse-attio-sync's job. Activity events for
// untracked recipients log as 'person_not_in_attio' and exit cleanly.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const ATTIO_BASE = "https://api.attio.com/v2";

function verifyCronAuth(req: Request): { ok: true } | { ok: false; response: Response } {
  const expected = Deno.env.get("LIT_CRON_SECRET") || "";
  const provided = req.headers.get("X-Internal-Cron") || "";
  if (!expected) return { ok: false, response: new Response("server misconfigured", { status: 500 }) };
  if (provided !== expected) return { ok: false, response: new Response("forbidden", { status: 403 }) };
  return { ok: true };
}

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = { ts: new Date().toISOString(), level, fn: "attio-activity-mirror", event, ...fields };
  const json = JSON.stringify(line);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);
}

async function findAttioPersonByEmail(attioKey: string, email: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${attioKey}`, "Content-Type": "application/json" };
  const res = await fetch(`${ATTIO_BASE}/objects/people/records/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: { email_addresses: { "$contains": email.toLowerCase() } },
      limit: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio query ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json?.data?.[0]?.id?.record_id ?? null;
}

async function createAttioNote(attioKey: string, personRecordId: string, title: string, content: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${attioKey}`, "Content-Type": "application/json" };
  const res = await fetch(`${ATTIO_BASE}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: {
        parent_object: "people",
        parent_record_id: personRecordId,
        title,
        format: "plaintext",
        content,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio note ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json?.data?.id?.note_id ?? null;
}

function buildTitleAndBody(payload: {
  event_type: string;
  campaign_name?: string;
  subject?: string;
  url_clicked?: string;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
}): { title: string; body: string } {
  const ev = payload.event_type.toLowerCase();
  const campaign = payload.campaign_name ? ` (${payload.campaign_name})` : "";
  const when = payload.occurred_at ? new Date(payload.occurred_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  let title: string;
  const bodyLines: string[] = [];
  switch (ev) {
    case "sent":
    case "send":
    case "queued":
      title = `📤 LIT email sent${campaign}`;
      if (payload.subject) bodyLines.push(`Subject: ${payload.subject}`);
      break;
    case "opened":
    case "open":
      title = `👁 LIT email opened${campaign}`;
      if (payload.subject) bodyLines.push(`Subject: ${payload.subject}`);
      break;
    case "clicked":
    case "click":
      title = `🔗 LIT email clicked${campaign}`;
      if (payload.subject) bodyLines.push(`Subject: ${payload.subject}`);
      if (payload.url_clicked) bodyLines.push(`Clicked: ${payload.url_clicked}`);
      break;
    case "replied":
    case "reply":
      title = `↩️ LIT email replied${campaign}`;
      if (payload.subject) bodyLines.push(`Subject: ${payload.subject}`);
      break;
    case "bounced":
    case "bounce":
      title = `❌ LIT email bounced${campaign}`;
      if (payload.subject) bodyLines.push(`Subject: ${payload.subject}`);
      break;
    case "complained":
    case "complaint":
      title = `⚠️ LIT spam complaint${campaign}`;
      if (payload.subject) bodyLines.push(`Subject: ${payload.subject}`);
      break;
    default:
      title = `LIT activity: ${ev}${campaign}`;
      if (payload.subject) bodyLines.push(`Subject: ${payload.subject}`);
  }
  if (when) bodyLines.push(`When: ${when}`);
  bodyLines.push("");
  bodyLines.push("— mirrored from Logistic Intel");
  return { title, body: bodyLines.join("\n") };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Internal-Cron" } });
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const attioKey = Deno.env.get("ATTIO_API_KEY");
  if (!attioKey) {
    log("error", "attio_key_unset");
    return new Response(JSON.stringify({ ok: false, error: "ATTIO_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ ok: false, error: "invalid json" }), { status: 400 }); }

  const litContactId = body?.lit_contact_id as string | undefined;
  const eventType = String(body?.event_type || "").trim();
  const dedupeKey = String(body?.dedupe_key || "").trim();
  if (!litContactId || !eventType || !dedupeKey) {
    return new Response(JSON.stringify({ ok: false, error: "lit_contact_id + event_type + dedupe_key required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);

  // 1. Dedupe check — same key within 7 days = skip.
  const { data: existing } = await db
    .from("lit_attio_activity_log")
    .select("id, status")
    .eq("dedupe_key", dedupeKey)
    .gte("created_at", new Date(Date.now() - 7 * 86400 * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  if (existing) {
    log("info", "dedupe_hit", { dedupe_key: dedupeKey, prior_status: existing.status });
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "dedupe" }), { headers: { "Content-Type": "application/json" } });
  }

  // 2. Resolve contact email + name from lit_contacts.
  const { data: contact } = await db
    .from("lit_contacts")
    .select("id, email, full_name, first_name, last_name")
    .eq("id", litContactId)
    .maybeSingle();
  if (!contact?.email) {
    log("warn", "contact_no_email", { lit_contact_id: litContactId });
    await db.from("lit_attio_activity_log").insert({
      lit_contact_id: litContactId, event_type: eventType, dedupe_key: dedupeKey,
      status: "skipped", reason: "contact_no_email",
    });
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "contact_no_email" }), { headers: { "Content-Type": "application/json" } });
  }

  // 3. Find Attio Person.
  let personRecordId: string | null = null;
  try {
    personRecordId = await findAttioPersonByEmail(attioKey, contact.email);
  } catch (err) {
    log("error", "attio_lookup_failed", { err: String(err), email: contact.email });
    await db.from("lit_attio_activity_log").insert({
      lit_contact_id: litContactId, event_type: eventType, dedupe_key: dedupeKey,
      status: "failed", reason: "attio_lookup_failed", error: String(err).slice(0, 500),
    });
    return new Response(JSON.stringify({ ok: false, error: "attio_lookup_failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }

  if (!personRecordId) {
    log("info", "person_not_in_attio", { email: contact.email });
    await db.from("lit_attio_activity_log").insert({
      lit_contact_id: litContactId, event_type: eventType, dedupe_key: dedupeKey,
      status: "skipped", reason: "person_not_in_attio",
    });
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "person_not_in_attio" }), { headers: { "Content-Type": "application/json" } });
  }

  // 4. Create the Note.
  const { title, body: noteBody } = buildTitleAndBody({
    event_type: eventType,
    campaign_name: body?.campaign_name,
    subject: body?.subject,
    url_clicked: body?.url_clicked,
    occurred_at: body?.occurred_at,
    metadata: body?.metadata,
  });

  let noteId: string | null = null;
  try {
    noteId = await createAttioNote(attioKey, personRecordId, title, noteBody);
  } catch (err) {
    log("error", "attio_note_failed", { err: String(err), person_id: personRecordId });
    await db.from("lit_attio_activity_log").insert({
      lit_contact_id: litContactId, event_type: eventType, dedupe_key: dedupeKey,
      attio_person_id: personRecordId,
      status: "failed", reason: "attio_note_failed", error: String(err).slice(0, 500),
    });
    return new Response(JSON.stringify({ ok: false, error: "attio_note_failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }

  await db.from("lit_attio_activity_log").insert({
    lit_contact_id: litContactId, event_type: eventType, dedupe_key: dedupeKey,
    attio_person_id: personRecordId, attio_note_id: noteId,
    status: "succeeded",
  });

  return new Response(JSON.stringify({ ok: true, attio_person_id: personRecordId, attio_note_id: noteId }), { headers: { "Content-Type": "application/json" } });
});
