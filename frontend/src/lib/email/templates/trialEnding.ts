// Trial Ending Soon — Day 12. Fires for every trial regardless of activity.
// event_type: 'trial_ending_soon'

import { renderEmailLayout } from "./baseLayout";
import type { PlanSlug } from "../planEmailCopy";

export interface TrialEndingContext {
  firstName?: string;
  planSlug?: PlanSlug | string;
  appUrl?: string;
  siteUrl?: string;
  heroImageUrl?: string;
  unsubscribeUrl: string;
  /** Trial end date string for display, e.g. "May 22" */
  trialEndsDate?: string;
}

function resolveName(firstName?: string): string {
  return firstName && firstName.trim() ? firstName.trim() : "there";
}

export function buildTrialEndingEmail(ctx: TrialEndingContext): {
  subject: string;
  previewText: string;
  html: string;
  text: string;
} {
  const name = resolveName(ctx.firstName);
  const appUrl = ctx.appUrl ?? "https://app.logisticintel.com";
  const endsPhrase = ctx.trialEndsDate ? ` on ${ctx.trialEndsDate}` : " in 2 days";

  const subject = "Your LIT trial is ending soon";
  const previewText = "Keep your shipper intelligence workspace active.";

  const bodyHtml = `
<p style="margin:0 0 16px 0;">Hi ${name},</p>
<p style="margin:0 0 16px 0;">Your LIT trial ends${endsPhrase}. After that, your saved companies, Pulse lists, and shipper research will be locked until you choose a plan.</p>
<p style="margin:0 0 12px 0;">If you've been using LIT to research shippers, identify contacts, or build outreach lists, keeping your workspace active means:</p>
<ul style="margin:0 0 20px 0;padding-left:20px;line-height:1.7;">
  <li style="margin-bottom:6px;">Your saved companies and notes stay intact</li>
  <li style="margin-bottom:6px;">Your Pulse search history and saved lists carry over</li>
  <li style="margin-bottom:6px;">Any AI briefs you've generated remain in your account</li>
  <li style="margin-bottom:6px;">Your contacts and suppression lists are preserved</li>
</ul>
<p style="margin:0 0 16px 0;">Starter starts at $99/month and covers most solo prospecting workflows. Pro adds campaigns and market benchmarks. There's no long-term contract.</p>
<p style="margin:0 0 0 0;color:#475569;font-size:14px;">Not ready to commit? Reply and tell me what's holding you back — honest answers only, no sales pressure.</p>`;

  const bodyText = `Hi ${name},

Your LIT trial ends${endsPhrase}. After that, your saved companies, Pulse lists, and shipper research will be locked until you choose a plan.

If you've been using LIT to research shippers, identify contacts, or build outreach lists, keeping your workspace active means:

  - Your saved companies and notes stay intact
  - Your Pulse search history and saved lists carry over
  - Any AI briefs you've generated remain in your account
  - Your contacts and suppression lists are preserved

Starter starts at $99/month and covers most solo prospecting workflows. Pro adds campaigns and market benchmarks. There's no long-term contract.

Not ready to commit? Reply and tell me what's holding you back — honest answers only, no sales pressure.`;

  const { html, text } = renderEmailLayout({
    heroImageUrl: ctx.heroImageUrl,
    heroAlt: "LIT company intelligence dashboard",
    headline: "Your LIT trial is ending soon",
    bodyHtml,
    bodyText,
    ctaText: "Choose your plan",
    ctaUrl: `${appUrl}/settings/billing`,
    unsubscribeUrl: ctx.unsubscribeUrl,
    previewText,
  });

  return { subject, previewText, html, text };
}
