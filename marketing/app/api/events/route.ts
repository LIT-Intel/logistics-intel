import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * POST /api/events — first-party event sink for the marketing site.
 *
 * Mirrors what we send to Plausible (page_view, form_submit, cta_click,
 * exit_intent_shown, scroll_depth_75, outbound_click, time_on_page_30s)
 * into public.lit_marketing_site_events so the LIT admin dashboard can query
 * them directly and join to lit_leads by email.
 *
 * Body:
 *   {
 *     event_name: string,
 *     path?: string,
 *     properties?: object,
 *     session_id?: string,
 *     lead_email?: string,
 *     utm?: object,
 *     referrer?: string
 *   }
 *
 * Always returns 200 OK with a tiny JSON body. Failure is logged but the
 * client never sees an error — analytics must never break the page.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STR = 1024;
const MAX_PROP_KEYS = 32;

// Allowed event names. Anything else is rejected silently — protects
// against junk traffic filling the table.
const ALLOWED_EVENTS = new Set<string>([
  "page_view",
  "form_submit",
  "cta_click",
  "exit_intent_shown",
  "scroll_depth_75",
  "outbound_click",
  "time_on_page_30s",
]);

function cap(s: unknown, max = MAX_STR): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function sanitizeObject(o: unknown): Record<string, unknown> {
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (count >= MAX_PROP_KEYS) break;
    if (typeof k !== "string" || k.length > 64) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      out[k] = v.length > MAX_STR ? v.slice(0, MAX_STR) : v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
    count += 1;
  }
  return out;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  // Read the body defensively. sendBeacon submits as a Blob; fetch as
  // JSON. req.json() handles both.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: true }, { status: 200 });
  }

  if (!raw || typeof raw !== "object") {
    return Response.json({ ok: true }, { status: 200 });
  }

  const body = raw as Record<string, unknown>;
  const event_name = cap(body.event_name, 64);
  if (!event_name || !ALLOWED_EVENTS.has(event_name)) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const path = cap(body.path, 512);
  const session_id = cap(body.session_id, 128);
  const referrer = cap(body.referrer, 1024);
  const properties = sanitizeObject(body.properties);
  const utm = sanitizeObject(body.utm);

  let lead_email: string | null = null;
  const rawEmail = cap(body.lead_email, 320);
  if (rawEmail && isValidEmail(rawEmail)) lead_email = rawEmail.toLowerCase();

  const user_agent = cap(req.headers.get("user-agent"), 512);

  const supabase = getSupabase();
  if (!supabase) {
    // Env not configured — degrade gracefully. The client doesn't care.
    return Response.json({ ok: true }, { status: 200 });
  }

  try {
    const { error } = await supabase.from("lit_marketing_site_events").insert({
      event_name,
      path,
      properties,
      session_id,
      lead_email,
      utm,
      referrer,
      user_agent,
    });
    if (error) {
      // Log but never surface — analytics is best-effort.
      console.error("[api/events] insert failed", error.message);
    }
  } catch (err) {
    console.error("[api/events] unexpected", err);
  }

  return Response.json({ ok: true }, { status: 200 });
}

// Allow CORS pre-flight in case a future static asset on a subdomain
// fires events. Same-origin in practice today.
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
