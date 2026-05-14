import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/sanity/lib/client";
import { sendEmail, escapeHtml } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/partner-application — accepts the /partners affiliate form,
 * validates required fields, and fans out:
 *
 *   1. Sanity write → `partnerApplication` doc (source of truth, visible
 *      in Studio under "Inbox → Partner applications"). Blocks response.
 *   2. Resend email to the applicant (confirmation).
 *   3. Resend email to PARTNERSHIPS_INBOX_EMAIL (partnerships alert).
 *   4. Webhook POST to PARTNER_APPLICATION_WEBHOOK if set. Slack incoming-
 *      webhook URLs get a Block Kit message; everything else gets the
 *      raw doc JSON.
 *
 * Steps 2-4 are concurrent and best-effort. The Sanity row remains the
 * recoverable source of truth no matter what fails.
 *
 * Required env (production):
 *   SANITY_API_WRITE_TOKEN
 * Optional env:
 *   RESEND_API_KEY, RESEND_FROM_EMAIL
 *   PARTNERSHIPS_INBOX_EMAIL  (defaults to partnerships@logisticintel.com)
 *   PARTNER_APPLICATION_WEBHOOK
 */
const REQUIRED = ["name", "email"] as const;

const PARTNERSHIPS_EMAIL =
  process.env.PARTNERSHIPS_INBOX_EMAIL || "partnerships@logisticintel.com";
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Logistic Intel <partnerships@logisticintel.com>";

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

  if (body?._hp) return json({ ok: true });

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
    _type: "partnerApplication" as const,
    name: truncate(body.name, 200)!,
    email: truncate(body.email, 200)!,
    companyOrBrand: truncate(body.companyOrBrand, 200),
    websiteOrSocial: truncate(body.websiteOrSocial, 400),
    audienceType: truncate(body.audienceType, 60),
    estimatedAudienceSize: truncate(body.estimatedAudienceSize, 30),
    promotionPlan: truncate(body.promotionPlan, 2000),
    payoutEmail: truncate(body.payoutEmail, 200),
    notes: truncate(body.notes, 2000),
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
    console.error("[partner-application] sanity write failed", e?.message || e);
    return json({ ok: false, error: "store_failed" }, 500);
  }

  const fanOut: Promise<unknown>[] = [
    sendApplicantConfirmation(doc),
    sendPartnershipsAlert(doc, sanityId),
    sendWebhook(doc, sanityId),
  ];
  Promise.allSettled(fanOut);

  return json({ ok: true, id: sanityId });
}

type Doc = {
  name: string;
  email: string;
  companyOrBrand?: string;
  websiteOrSocial?: string;
  audienceType?: string;
  estimatedAudienceSize?: string;
  promotionPlan?: string;
  payoutEmail?: string;
  notes?: string;
  source?: string;
  submittedAt: string;
};

function sendApplicantConfirmation(d: Doc) {
  return sendEmail({
    from: FROM_EMAIL,
    to: d.email,
    replyTo: PARTNERSHIPS_EMAIL,
    subject: "Got your LIT partner application — review in 2 business days",
    html: applicantHtml(d),
    text: applicantText(d),
  });
}

function sendPartnershipsAlert(d: Doc, sanityId: string) {
  return sendEmail({
    from: FROM_EMAIL,
    to: PARTNERSHIPS_EMAIL,
    replyTo: d.email,
    subject: `New partner application — ${d.name}${d.companyOrBrand ? ` · ${d.companyOrBrand}` : ""}`,
    html: partnershipsHtml(d, sanityId),
    text: partnershipsText(d, sanityId),
  });
}

function applicantHtml(d: Doc) {
  const firstName = (d.name || "").split(" ")[0] || "there";
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0b1220; line-height: 1.55;">
  <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #2563eb;">Logistic Intel · Partner program</div>
  <h1 style="font-size: 22px; font-weight: 600; margin: 16px 0 12px; color: #0b1220;">Got it, ${escapeHtml(firstName)}.</h1>
  <p style="font-size: 15px; color: #475569; margin: 0 0 16px;">Thanks for applying to the LIT partner program. Our partnerships team reviews every application within two business days and will reach out at <strong>${escapeHtml(d.email)}</strong> with next steps.</p>
  <p style="font-size: 15px; color: #475569; margin: 0 0 24px;">If approved, you'll get a partner account, your unique referral link, co-branded materials, and access to commission tracking.</p>
  <hr style="border: none; border-top: 1px solid #e5ebf5; margin: 32px 0 20px;" />
  <p style="font-size: 13px; color: #94a3b8; margin: 0;">Questions in the meantime? Reply to this email and you'll reach the partnerships team directly.</p>
  <p style="font-size: 12px; color: #94a3b8; margin: 16px 0 0;">— The Logistic Intel partnerships team</p>
</body></html>`;
}

function applicantText(d: Doc) {
  const firstName = (d.name || "").split(" ")[0] || "there";
  return [
    `Got it, ${firstName}.`,
    "",
    `Thanks for applying to the LIT partner program. Our partnerships team reviews every application within two business days and will reach out at ${d.email} with next steps.`,
    "",
    "If approved, you'll get a partner account, your unique referral link, co-branded materials, and access to commission tracking.",
    "",
    "Questions in the meantime? Reply to this email and you'll reach the partnerships team directly.",
    "— The Logistic Intel partnerships team",
  ].join("\n");
}

function partnershipsHtml(d: Doc, sanityId: string) {
  const row = (label: string, value?: string) =>
    value
      ? `<tr><td style="padding: 6px 12px 6px 0; font-size: 12px; color: #94a3b8; vertical-align: top; white-space: nowrap;">${escapeHtml(label)}</td><td style="padding: 6px 0; font-size: 14px; color: #0b1220;">${escapeHtml(value)}</td></tr>`
      : "";
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0b1220; line-height: 1.55;">
  <div style="background: #fff; border: 1px solid #e5ebf5; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(15,23,42,0.04);">
    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #2563eb;">New partner application</div>
    <h2 style="font-size: 20px; font-weight: 600; margin: 8px 0 4px;">${escapeHtml(d.name)}${d.companyOrBrand ? ` <span style="color:#94a3b8; font-weight: 400;">· ${escapeHtml(d.companyOrBrand)}</span>` : ""}</h2>
    <a href="mailto:${escapeHtml(d.email)}" style="font-size: 13px; color: #2563eb; text-decoration: none;">${escapeHtml(d.email)}</a>
    <table style="width: 100%; border-collapse: collapse; margin-top: 18px;">
      ${row("Audience type", d.audienceType)}
      ${row("Audience size", d.estimatedAudienceSize)}
      ${row("Website / social", d.websiteOrSocial)}
      ${row("Payout email", d.payoutEmail)}
      ${row("Source", d.source)}
      ${row("Submitted", d.submittedAt)}
    </table>
    ${d.promotionPlan ? `<div style="margin-top: 18px; padding: 12px 14px; background: #f6f8fc; border-radius: 8px; font-size: 13px; color: #475569;"><strong style="color:#0b1220;">Promotion plan:</strong><br />${escapeHtml(d.promotionPlan)}</div>` : ""}
    ${d.notes ? `<div style="margin-top: 12px; padding: 12px 14px; background: #f6f8fc; border-radius: 8px; font-size: 13px; color: #475569;"><strong style="color:#0b1220;">Notes:</strong><br />${escapeHtml(d.notes)}</div>` : ""}
    <a href="https://logisticintel.com/studio/desk/partnerApplication;${escapeHtml(sanityId)}" style="display: inline-block; margin-top: 20px; background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%); color: #fff; font-weight: 600; font-size: 13px; text-decoration: none; padding: 10px 18px; border-radius: 8px;">Review in Studio →</a>
  </div>
</body></html>`;
}

function partnershipsText(d: Doc, sanityId: string) {
  return [
    "NEW PARTNER APPLICATION",
    "",
    `${d.name}${d.companyOrBrand ? ` — ${d.companyOrBrand}` : ""}`,
    `Email: ${d.email}`,
    d.audienceType ? `Audience type: ${d.audienceType}` : "",
    d.estimatedAudienceSize ? `Audience size: ${d.estimatedAudienceSize}` : "",
    d.websiteOrSocial ? `Website / social: ${d.websiteOrSocial}` : "",
    d.payoutEmail ? `Payout email: ${d.payoutEmail}` : "",
    d.source ? `Source: ${d.source}` : "",
    "",
    d.promotionPlan ? `Promotion plan:\n${d.promotionPlan}` : "",
    d.notes ? `\nNotes:\n${d.notes}` : "",
    "",
    `Studio: https://logisticintel.com/studio/desk/partnerApplication;${sanityId}`,
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

async function sendWebhook(d: Doc, sanityId: string): Promise<void> {
  const hook = process.env.PARTNER_APPLICATION_WEBHOOK;
  if (!hook) return;

  const isSlack = /^https:\/\/hooks\.slack\.com\//.test(hook);
  const studioUrl = `https://logisticintel.com/studio/desk/partnerApplication;${sanityId}`;
  const payload = isSlack ? buildSlackBlocks(d, studioUrl) : { ...d, sanityId, studioUrl };

  try {
    const r = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[partner-application] webhook non-2xx", r.status, text.slice(0, 300));
    }
  } catch (e: any) {
    console.error("[partner-application] webhook threw", e?.message || e);
  }
}

function buildSlackBlocks(d: Doc, studioUrl: string) {
  const headline = d.companyOrBrand ? `${d.name} · ${d.companyOrBrand}` : d.name;
  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Email*\n<mailto:${d.email}|${d.email}>` },
  ];
  if (d.audienceType) fields.push({ type: "mrkdwn", text: `*Audience type*\n${d.audienceType}` });
  if (d.estimatedAudienceSize)
    fields.push({ type: "mrkdwn", text: `*Audience size*\n${d.estimatedAudienceSize}` });
  if (d.websiteOrSocial)
    fields.push({ type: "mrkdwn", text: `*Website / social*\n${d.websiteOrSocial}` });
  if (d.payoutEmail) fields.push({ type: "mrkdwn", text: `*Payout email*\n${d.payoutEmail}` });
  if (d.source) fields.push({ type: "mrkdwn", text: `*Source*\n${d.source}` });

  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: "🤝 New partner application", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${headline}*` } },
    { type: "section", fields },
  ];
  if (d.promotionPlan) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Promotion plan:*\n>${d.promotionPlan}` },
    });
  }
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Review in Studio", emoji: true },
        url: studioUrl,
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Reply via email", emoji: true },
        url: `mailto:${d.email}?subject=Re: ${encodeURIComponent("Your LIT partner application")}`,
      },
    ],
  });
  return { text: `New partner application — ${headline}`, blocks };
}
