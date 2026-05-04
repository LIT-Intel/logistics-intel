import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/sanity/lib/client";
import { sendEmail, escapeHtml } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo-request — accepts the live demo form submission,
 * validates required fields, and:
 *
 *   1. Writes a `demoRequest` doc to Sanity (source of truth — visible
 *      in Studio under "Inbox → Demo requests").
 *   2. Sends a confirmation email to the prospect via Resend.
 *   3. Sends an alert email to sales@logisticintel.com with the details.
 *   4. Optional: if DEMO_REQUEST_WEBHOOK is set, POSTs the payload there
 *      too (Slack incoming webhook, Zapier, n8n, etc.).
 *
 * Email sends + webhook are concurrent and best-effort — failure of any
 * doesn't affect the Sanity write or the prospect's success state.
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

  // Fan out emails + optional webhook in parallel — best-effort. Failures
  // are logged but don't fail the request; the prospect still sees success
  // and the Sanity row is the recoverable source of truth.
  const fanOut: Promise<unknown>[] = [
    sendProspectConfirmation(doc),
    sendSalesAlert(doc, sanityId),
  ];
  const hook = process.env.DEMO_REQUEST_WEBHOOK;
  if (hook) {
    fanOut.push(
      fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...doc, sanityId }),
      }).catch(() => null),
    );
  }
  // Don't block the response — fan-out completes in the background.
  Promise.allSettled(fanOut);

  return json({ ok: true, id: sanityId });
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
