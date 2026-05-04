import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/sanity/lib/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo-request — accepts the live demo form submission,
 * validates required fields, and writes a `demoRequest` doc to Sanity.
 * Sales sees the row in Studio under "Inbox → Demo requests."
 *
 * Optional: if DEMO_REQUEST_WEBHOOK is set, ALSO POSTs the same payload
 * to that URL (Slack incoming webhook, Zapier, n8n, etc.) so the team
 * gets a real-time ping. The Sanity write is the source of truth — the
 * webhook is best-effort.
 */
const REQUIRED = ["name", "email"] as const;

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // Honeypot — silently drop submissions that fill `_hp`
  if (body?._hp) {
    return json({ ok: true });
  }

  for (const k of REQUIRED) {
    if (!body?.[k] || typeof body[k] !== "string") {
      return json({ ok: false, error: `missing_field:${k}` }, 400);
    }
  }
  if (!isValidEmail(body.email)) {
    return json({ ok: false, error: "invalid_email" }, 400);
  }

  // Soft sanity caps — protect against abuse
  const truncate = (s: any, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);

  const doc = {
    _type: "demoRequest" as const,
    name: truncate(body.name, 200)!,
    email: truncate(body.email, 200)!,
    company: truncate(body.company, 200),
    domain: truncate(body.domain, 200),
    phone: truncate(body.phone, 60),
    useCase: truncate(body.useCase, 60),
    teamSize: truncate(body.teamSize, 30),
    primaryGoal: truncate(body.primaryGoal, 1000),
    source: truncate(body.source, 200),
    userAgent: truncate(req.headers.get("user-agent") || "", 500),
    submittedAt: new Date().toISOString(),
    status: "new" as const,
  };

  try {
    const created = await sanityWriteClient.create(doc);
    // Best-effort webhook fanout
    const hook = process.env.DEMO_REQUEST_WEBHOOK;
    if (hook) {
      fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...doc, sanityId: created._id }),
      }).catch(() => null);
    }
    return json({ ok: true, id: created._id });
  } catch (e: any) {
    console.error("[demo-request] sanity write failed", e?.message || e);
    return json({ ok: false, error: "store_failed" }, 500);
  }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
