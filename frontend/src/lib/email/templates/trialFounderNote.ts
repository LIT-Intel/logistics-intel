// Trial Day 3 Founder Note — fires for EVERY trial user, no behavioral gate.
// Plain text only — no hero image.
// event_type: 'trial_day_3_founder_note'

import { renderEmailLayout } from "./baseLayout";
import type { PlanSlug } from "../planEmailCopy";

export interface TrialFounderNoteContext {
  firstName?: string;
  planSlug?: PlanSlug;
  appUrl?: string;
  siteUrl?: string;
  unsubscribeUrl: string;
}

function resolveName(firstName?: string): string {
  return firstName && firstName.trim() ? firstName.trim() : "there";
}

export function buildTrialFounderNoteEmail(ctx: TrialFounderNoteContext): {
  subject: string;
  previewText: string;
  html: string;
  text: string;
} {
  const name = resolveName(ctx.firstName);
  const appUrl = ctx.appUrl ?? "https://app.logisticintel.com";

  const subject = "How I'd use LIT if I were you";
  const previewText = "A quick note from the founder.";

  // Plain text style body — no hero, no marketing language
  const bodyHtml = `
<p style="margin:0 0 16px 0;">Hi ${name},</p>
<p style="margin:0 0 16px 0;">Vincent here — founder of LIT. Just wanted to drop in personally.</p>
<p style="margin:0 0 16px 0;">A few days into your trial, the most useful thing you can do is pick ONE lane your team already sells, run a Pulse search on it, and open three or four company profiles. Look at the shipment cadence, the lanes, who they're using as a carrier. That's where you start to see whether a company is worth a real conversation — versus just adding another name to a generic list.</p>
<p style="margin:0 0 20px 0;">If you're stuck or LIT isn't clicking, just hit reply. I read every one and I'm happy to walk through your target accounts on a quick call.</p>
<p style="margin:0;">— Vincent<br/>Founder, Logistic Intel</p>`;

  const bodyText = `Hi ${name},

Vincent here — founder of LIT. Just wanted to drop in personally.

A few days into your trial, the most useful thing you can do is pick ONE lane your team already sells, run a Pulse search on it, and open three or four company profiles. Look at the shipment cadence, the lanes, who they're using as a carrier. That's where you start to see whether a company is worth a real conversation — versus just adding another name to a generic list.

If you're stuck or LIT isn't clicking, just hit reply. I read every one and I'm happy to walk through your target accounts on a quick call.

— Vincent
Founder, Logistic Intel`;

  const { html, text } = renderEmailLayout({
    // No heroImageUrl — plainTextOnly suppresses the hero block
    heroImageUrl: undefined,
    headline: "How I'd use LIT if I were you",
    bodyHtml,
    bodyText,
    ctaText: "Open Pulse",
    ctaUrl: `${appUrl}/pulse`,
    unsubscribeUrl: ctx.unsubscribeUrl,
    plainTextOnly: true,
    previewText,
  });

  return { subject, previewText, html, text };
}
