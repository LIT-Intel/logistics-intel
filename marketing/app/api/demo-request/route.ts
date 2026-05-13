import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/sanity/lib/client";
import { sendEmail, escapeHtml } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo-request — accepts the live demo form submission,
 * validates required fields, and fans out:
 *
 *   1. Sanity write → `demoRequest` doc (source of truth, visible in
 *      Studio under "Inbox → Demo requests"). This is the only step
 *      that blocks the response.
 *   2. Resend email to the prospect (confirmation).
 *   3. Resend email to SALES_INBOX_EMAIL (sales alert).
 *   4. Webhook POST to DEMO_REQUEST_WEBHOOK if set. Slack incoming-
 *      webhook URLs (https://hooks.slack.com/...) get a properly
 *      formatted Block Kit message; everything else gets the raw doc.
 *   5. Supabase row in `public.lit_demo_requests` if
 *      SUPABASE_SERVICE_ROLE_KEY is set. Lets you query history via
 *      SQL or subscribe via Realtime.
 *
 * Steps 2-5 are concurrent and best-effort — any failure is logged but
 * doesn't affect the prospect's success state. The Sanity row remains
 * the recoverable source of truth no matter what fails.
 *
 * Required env (production):
 *   SANITY_API_WRITE_TOKEN   — already set
 * Optional env:
 *   RESEND_API_KEY, RESEND_FROM_EMAIL, SALES_INBOX_EMAIL  (emails)
 *   DEMO_REQUEST_WEBHOOK     (Slack/Discord/Zapier ping)
 *   SUPABASE_SERVICE_ROLE_KEY  (Supabase row insert)
 *   NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL  (Supabase project URL)
 */
const REQUIRED = ["name", "email"] as const;

const SALES_EMAIL = process.env.SALES_INBOX_EMAIL || "sales@logisticintel.com";
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Logistic Intel <sales@logisticintel.com>";

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

  const truncate = (s: any, n: number) =>
    typeof s === "string" ? s.slice(0, n) : undefined;

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

  let sanityId: string;
  try {
    const created = await sanityWriteClient.create(doc);
    sanityId = created._id;
  } catch (e: any) {
    console.error("[demo-request] sanity write failed", e?.message || e);
    return json({ ok: false, error: "store_failed" }, 500);
  }

  // Fan out emails + webhook + Supabase row in parallel — all best-effort.
  // Failures log but don't fail the request; the Sanity write above is
  // the recoverable source of truth.
  //
  // pingAdminNotify is the founder backstop: even if the marketing-site
  // RESEND_API_KEY isn't set or the sales inbox is unread, the Supabase
  // admin-notify function fires from the app side using its own credential
  // and writes the attempt into lit_outreach_history. That row is what
  // the admin dashboard reads, so missed notifications surface there.
  const fanOut: Promise<unknown>[] = [
    sendProspectConfirmation(doc),
    sendSalesAlert(doc, sanityId),
    sendWebhook(doc, sanityId),
    writeSupabaseRow(doc, sanityId),
    pingAdminNotify(doc, sanityId),
  ];
  Promise.allSettled(fanOut);

  return json({ ok: true, id: sanityId });
}

/**
 * Best-effort founder notification via Supabase admin-notify. Uses
 * LIT_ADMIN_NOTIFY_SECRET as a bearer credential. If either env var is
 * unset we skip — the function never throws because we don't want to
 * fail the user-facing response on an internal observability hop.
 */
async function pingAdminNotify(d: Doc, sanityId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secret = process.env.LIT_ADMIN_NOTIFY_SECRET;
  if (!url || !secret) return;
  try {
    const r = await fetch(`${url}/functions/v1/admin-notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({
        event: "demo_request",
        subject: `New demo request — ${d.name}${d.company ? ` · ${d.company}` : ""}`,
        summary: `${d.name}${d.company ? ` · ${d.company}` : ""} wants a demo`,
        cta_url: `https://logisticintel.com/studio/desk/demoRequest;${sanityId}`,
        cta_label: "Open in Studio",
        details: {
          Email: d.email,
          Company: d.company,
          Domain: d.domain,
          Phone: d.phone,
          "Use case": d.useCase,
          "Team size": d.teamSize,
          Source: d.source,
          "Primary goal": d.primaryGoal,
          "Submitted at": d.submittedAt,
          "Sanity id": sanityId,
        },
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[demo-request] admin-notify non-2xx", r.status, text.slice(0, 300));
    }
  } catch (e: any) {
    console.error("[demo-request] admin-notify threw", e?.message || e);
  }
}

type Doc = {
  name: string;
  email: string;
  company?: string;
  domain?: string;
  phone?: string;
  useCase?: string;
  teamSize?: string;
  primaryGoal?: string;
  source?: string;
  submittedAt: string;
};

function sendProspectConfirmation(d: Doc) {
  return sendEmail({
    from: FROM_EMAIL,
    to: d.email,
    replyTo: SALES_EMAIL,
    subject: "Got your Logistic Intel demo request — what happens next",
    html: prospectHtml(d),
    text: prospectText(d),
  });
}

function sendSalesAlert(d: Doc, sanityId: string) {
  return sendEmail({
    from: FROM_EMAIL,
    to: SALES_EMAIL,
    replyTo: d.email,
    subject: `New demo request — ${d.name}${d.company ? ` · ${d.company}` : ""}`,
    html: salesHtml(d, sanityId),
    text: salesText(d, sanityId),
  });
}

function prospectHtml(d: Doc) {
  const firstName = (d.name || "").split(" ")[0] || "there";
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0b1220; line-height: 1.55;">
  <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #2563eb;">Logistic Intel</div>
  <h1 style="font-size: 22px; font-weight: 600; margin: 16px 0 12px; color: #0b1220;">Got it, ${escapeHtml(firstName)}.</h1>
  <p style="font-size: 15px; color: #475569; margin: 0 0 16px;">Thanks for requesting a demo. We'll reach out within one business day to confirm a time that works for your team.</p>
  <p style="font-size: 15px; color: #475569; margin: 0 0 24px;">In the meantime, you can start exploring with a free trial — no credit card required.</p>
  <a href="https://logisticintel.com/signup" style="display: inline-block; background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%); color: #fff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 22px; border-radius: 10px; box-shadow: 0 6px 18px rgba(37,99,235,0.35);">Start free trial →</a>
  <hr style="border: none; border-top: 1px solid #e5ebf5; margin: 32px 0 20px;" />
  <p style="font-size: 13px; color: #94a3b8; margin: 0;">If anything's urgent, reply to this email and you'll reach our sales team directly.</p>
  <p style="font-size: 12px; color: #94a3b8; margin: 16px 0 0;">— The Logistic Intel team</p>
</body></html>`;
}

function prospectText(d: Doc) {
  const firstName = (d.name || "").split(" ")[0] || "there";
  return [
    `Got it, ${firstName}.`,
    "",
    "Thanks for requesting a demo of Logistic Intel. We'll reach out within one business day to confirm a time that works for your team.",
    "",
    "In the meantime, you can start exploring with a free trial — no credit card required.",
    "https://logisticintel.com/signup",
    "",
    "If anything's urgent, reply to this email and you'll reach our sales team directly.",
    "— The Logistic Intel team",
  ].join("\n");
}

function salesHtml(d: Doc, sanityId: string) {
  const row = (label: string, value?: string) =>
    value
      ? `<tr><td style="padding: 6px 12px 6px 0; font-size: 12px; color: #94a3b8; vertical-align: top; white-space: nowrap;">${escapeHtml(label)}</td><td style="padding: 6px 0; font-size: 14px; color: #0b1220;">${escapeHtml(value)}</td></tr>`
      : "";
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0b1220; line-height: 1.55;">
  <div style="background: #fff; border: 1px solid #e5ebf5; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(15,23,42,0.04);">
    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #2563eb;">New demo request</div>
    <h2 style="font-size: 20px; font-weight: 600; margin: 8px 0 4px;">${escapeHtml(d.name)}${d.company ? ` <span style="color:#94a3b8; font-weight: 400;">· ${escapeHtml(d.company)}</span>` : ""}</h2>
    <a href="mailto:${escapeHtml(d.email)}" style="font-size: 13px; color: #2563eb; text-decoration: none;">${escapeHtml(d.email)}</a>
    <table style="width: 100%; border-collapse: collapse; margin-top: 18px;">
      ${row("Use case", d.useCase)}
      ${row("Team size", d.teamSize)}
      ${row("Domain", d.domain)}
      ${row("Phone", d.phone)}
      ${row("Source", d.source)}
      ${row("Submitted", d.submittedAt)}
    </table>
    ${d.primaryGoal ? `<div style="margin-top: 18px; padding: 12px 14px; background: #f6f8fc; border-radius: 8px; font-size: 13px; color: #475569;"><strong style="color:#0b1220;">Primary goal:</strong><br />${escapeHtml(d.primaryGoal)}</div>` : ""}
    <a href="https://logisticintel.com/studio/desk/demoRequest;${escapeHtml(sanityId)}" style="display: inline-block; margin-top: 20px; background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%); color: #fff; font-weight: 600; font-size: 13px; text-decoration: none; padding: 10px 18px; border-radius: 8px;">Open in Studio →</a>
  </div>
</body></html>`;
}

function salesText(d: Doc, sanityId: string) {
  return [
    "NEW DEMO REQUEST",
    "",
    `${d.name}${d.company ? ` — ${d.company}` : ""}`,
    `Email: ${d.email}`,
    d.useCase ? `Use case: ${d.useCase}` : "",
    d.teamSize ? `Team size: ${d.teamSize}` : "",
    d.domain ? `Domain: ${d.domain}` : "",
    d.phone ? `Phone: ${d.phone}` : "",
    d.source ? `Source: ${d.source}` : "",
    "",
    d.primaryGoal ? `Primary goal:\n${d.primaryGoal}` : "",
    "",
    `Studio: https://logisticintel.com/studio/desk/demoRequest;${sanityId}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Webhook fan-out — Slack URLs get a properly formatted Block Kit
 * message; everything else (Zapier, n8n, custom) gets raw JSON.
 *
 * Slack detection: any URL hosted on hooks.slack.com or a Slack-
 * compatible relay (Mattermost copies the API). One signal we recognize:
 * the URL pattern `/services/T.../B.../...`.
 */
async function sendWebhook(d: Doc, sanityId: string): Promise<void> {
  const hook = process.env.DEMO_REQUEST_WEBHOOK;
  if (!hook) return;

  const isSlack = /^https:\/\/hooks\.slack\.com\//.test(hook);
  const studioUrl = `https://logisticintel.com/studio/desk/demoRequest;${sanityId}`;

  const payload = isSlack ? buildSlackBlocks(d, studioUrl) : { ...d, sanityId, studioUrl };

  try {
    const r = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[demo-request] webhook non-2xx", r.status, text.slice(0, 300));
    }
  } catch (e: any) {
    console.error("[demo-request] webhook threw", e?.message || e);
  }
}

/** Build a Slack Block Kit message from a demo doc. Renders as a card
 *  with name + company in the header, a fields table for the metadata,
 *  and an "Open in Studio" button at the bottom. */
function buildSlackBlocks(d: Doc, studioUrl: string) {
  const headline = d.company ? `${d.name} · ${d.company}` : d.name;
  const fallback = `New demo request — ${headline}`;

  // Slack supports up to 10 fields per section. Build only the rows we have.
  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Email*\n<mailto:${d.email}|${d.email}>` },
  ];
  if (d.useCase) fields.push({ type: "mrkdwn", text: `*Use case*\n${d.useCase}` });
  if (d.teamSize) fields.push({ type: "mrkdwn", text: `*Team size*\n${d.teamSize}` });
  if (d.domain) fields.push({ type: "mrkdwn", text: `*Domain*\n${d.domain}` });
  if (d.phone) fields.push({ type: "mrkdwn", text: `*Phone*\n${d.phone}` });
  if (d.source) fields.push({ type: "mrkdwn", text: `*Source*\n${d.source}` });

  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🚀 New demo request", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${headline}*` },
    },
    { type: "section", fields },
  ];

  if (d.primaryGoal) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*What they're hoping LIT will help with:*\n>${d.primaryGoal}` },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Open in Studio", emoji: true },
        url: studioUrl,
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Reply via email", emoji: true },
        url: `mailto:${d.email}?subject=Re: ${encodeURIComponent("Logistic Intel demo")}`,
      },
    ],
  });

  return { text: fallback, blocks };
}

/**
 * Mirror the demo doc into `public.lit_demo_requests` so the user can
 * subscribe to inserts via Supabase Realtime, query history with SQL,
 * or feed the row into downstream automation. Best-effort — silently
 * skips if env or table is missing.
 *
 * Required env: SUPABASE_SERVICE_ROLE_KEY + (NEXT_PUBLIC_SUPABASE_URL or
 * VITE_SUPABASE_URL). Migration SQL lives in
 * supabase/migrations/<timestamp>_create_lit_demo_requests.sql — run it
 * once before this path can write.
 */
async function writeSupabaseRow(d: Doc, sanityId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const r = await fetch(`${url}/rest/v1/lit_demo_requests`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        sanity_id: sanityId,
        name: d.name,
        email: d.email,
        company: d.company ?? null,
        domain: d.domain ?? null,
        phone: d.phone ?? null,
        use_case: d.useCase ?? null,
        team_size: d.teamSize ?? null,
        primary_goal: d.primaryGoal ?? null,
        source: d.source ?? null,
        submitted_at: d.submittedAt,
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[demo-request] supabase non-2xx", r.status, text.slice(0, 300));
    }
  } catch (e: any) {
    console.error("[demo-request] supabase threw", e?.message || e);
  }
}
