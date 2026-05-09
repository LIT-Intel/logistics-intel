// Trial Welcome — Day 0. Fires immediately after signup.
// event_type: 'trial_welcome'

import { renderEmailLayout } from "./baseLayout";
import { PLAN_EMAIL_COPY, type PlanSlug } from "../planEmailCopy";

export interface TrialWelcomeContext {
  firstName?: string;
  planSlug?: PlanSlug;
  appUrl?: string;
  siteUrl?: string;
  heroImageUrl: string;
  unsubscribeUrl: string;
}

function resolveName(firstName?: string): string {
  return firstName && firstName.trim() ? firstName.trim() : "there";
}

function benefitsHtml(benefits: string[]): string {
  const items = benefits.map((b) => `<li style="margin-bottom:6px;">${b}</li>`).join("\n");
  return `<ul style="margin:0 0 0 0;padding-left:20px;line-height:1.7;">\n${items}\n</ul>`;
}

function benefitsText(benefits: string[]): string {
  return benefits.map((b) => `  - ${b}`).join("\n");
}

export function buildTrialWelcomeEmail(ctx: TrialWelcomeContext): {
  subject: string;
  previewText: string;
  html: string;
  text: string;
} {
  const name = resolveName(ctx.firstName);
  const planSlug = ctx.planSlug ?? "trial";
  const plan = PLAN_EMAIL_COPY[planSlug] ?? PLAN_EMAIL_COPY.trial;
  const appUrl = ctx.appUrl ?? "https://app.logisticintel.com";

  const subject = "Your LIT trial is live";
  const previewText = "Start with 10 validated shippers and full supply chain history.";

  const bodyHtml = `
<p style="margin:0 0 16px 0;">Hi ${name},</p>
<p style="margin:0 0 16px 0;">Your free trial is active. You have full access to LIT's shipper intelligence database for the next 14 days — no credit card required until you decide to continue.</p>
<p style="margin:0 0 12px 0;font-weight:600;">Here's what to try first:</p>
${benefitsHtml(plan.benefits)}
<p style="margin:20px 0 16px 0;">The quickest way to see value: pick a trade lane your team already works, run a Pulse search, and open two or three company profiles. You'll see shipment history, carrier patterns, and buying signals in under five minutes.</p>
<p style="margin:0 0 4px 0;font-style:italic;color:#475569;">P.S. Need help? Just reply to this email — we read every one.</p>`;

  const bodyText = `Hi ${name},

Your free trial is active. You have full access to LIT's shipper intelligence database for the next 14 days — no credit card required until you decide to continue.

Here's what to try first:

${benefitsText(plan.benefits)}

The quickest way to see value: pick a trade lane your team already works, run a Pulse search, and open two or three company profiles. You'll see shipment history, carrier patterns, and buying signals in under five minutes.

P.S. Need help? Just reply to this email — we read every one.`;

  const { html, text } = renderEmailLayout({
    heroImageUrl: ctx.heroImageUrl,
    heroAlt: "LIT company intelligence — shipment history and lane signals",
    headline: plan.headline,
    bodyHtml,
    bodyText,
    ctaText: plan.primaryCta,
    ctaUrl: `${appUrl}${plan.primaryPath}`,
    footerNote: undefined,
    unsubscribeUrl: ctx.unsubscribeUrl,
    previewText,
  });

  return { subject, previewText, html, text };
}
