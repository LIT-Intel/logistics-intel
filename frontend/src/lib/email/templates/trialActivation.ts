// Trial Day 2 demo invitation. Skipped if the user already has activity.
// event_type: 'trial_day_2_activation'

import { renderEmailLayout } from "./baseLayout";
import type { PlanSlug } from "../planEmailCopy";

export interface TrialActivationContext {
  firstName?: string;
  planSlug?: PlanSlug | string;
  appUrl?: string;
  siteUrl?: string;
  heroImageUrl?: string;
  unsubscribeUrl: string;
}

export function buildTrialActivationEmail(ctx: TrialActivationContext): {
  subject: string;
  previewText: string;
  html: string;
  text: string;
} {
  const name = ctx.firstName?.trim() || "there";
  const subject = "Let us show you how to get the most from LIT";
  const previewText = "Book a 30-minute walkthrough using your target accounts.";
  const demoUrl = "https://cal.com/logisticintel/30min";

  const bodyHtml = `
<p style="margin:0 0 16px 0;">Hi ${name},</p>
<p style="margin:0 0 16px 0;">The fastest way to turn your trial into a real prospecting workflow is to see LIT using the accounts and lanes your team already works.</p>
<p style="margin:0 0 12px 0;font-weight:600;">In a focused 30-minute demo, we'll show you how to:</p>
<ul style="margin:0 0 18px 0;padding-left:22px;line-height:1.7;">
  <li>Find active shippers in your target market.</li>
  <li>Read shipment cadence, lanes, carriers, and buying signals.</li>
  <li>Identify and enrich the right decision-makers.</li>
  <li>Turn the intelligence into a campaign-ready prospect list.</li>
</ul>
<p style="margin:0 0 16px 0;">Bring two or three target companies and we'll walk through them together. No generic sales presentation.</p>
<p style="margin:0;color:#475569;font-size:14px;">Choose a time that works for you and leave with a repeatable LIT workflow.</p>`;

  const bodyText = `Hi ${name},

The fastest way to turn your trial into a real prospecting workflow is to see LIT using the accounts and lanes your team already works.

In a focused 30-minute demo, we'll show you how to find active shippers, read buying signals, identify decision-makers, and build a campaign-ready prospect list.

Bring two or three target companies and we'll walk through them together. No generic sales presentation.

Book your demo: ${demoUrl}`;

  const { html, text } = renderEmailLayout({
    headline: "See LIT work on your accounts.",
    subtitle: "A focused 30-minute walkthrough with your target market.",
    bodyHtml,
    bodyText,
    ctaText: "Book your 30-minute demo",
    ctaUrl: demoUrl,
    unsubscribeUrl: ctx.unsubscribeUrl,
    previewText,
  });

  return { subject, previewText, html, text };
}
