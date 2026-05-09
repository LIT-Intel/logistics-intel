// Upgrade Confirmation — fires when a user upgrades from one paid plan to another.
// event_type: 'upgrade_confirmation'

import { renderEmailLayout } from "./baseLayout";
import { PLAN_EMAIL_COPY, type PlanSlug } from "../planEmailCopy";

export interface UpgradeConfirmationContext {
  firstName?: string;
  planSlug: PlanSlug;
  /** The plan the user upgraded FROM, for display purposes */
  previousPlanName?: string;
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

export function buildUpgradeConfirmationEmail(ctx: UpgradeConfirmationContext): {
  subject: string;
  previewText: string;
  html: string;
  text: string;
} {
  const name = resolveName(ctx.firstName);
  const plan = PLAN_EMAIL_COPY[ctx.planSlug] ?? PLAN_EMAIL_COPY.pro;
  const appUrl = ctx.appUrl ?? "https://app.logisticintel.com";
  const fromPhrase = ctx.previousPlanName ? ` from ${ctx.previousPlanName}` : "";

  const subject = "Your LIT plan has been upgraded";
  const previewText = "Your new features are now available.";

  const bodyHtml = `
<p style="margin:0 0 16px 0;">Hi ${name},</p>
<p style="margin:0 0 16px 0;">Your upgrade${fromPhrase} to <strong>${plan.name}</strong> is confirmed. All new features are live in your account now.</p>
<p style="margin:0 0 12px 0;">What's included in ${plan.name}:</p>
${benefitsHtml(plan.benefits)}
<p style="margin:20px 0 16px 0;">Your existing data — saved companies, Pulse lists, contacts, and campaign history — carries over unchanged.</p>
<p style="margin:0 0 0 0;color:#475569;font-size:14px;">If anything isn't working as expected, reply here and we'll sort it out.</p>`;

  const bodyText = `Hi ${name},

Your upgrade${fromPhrase} to ${plan.name} is confirmed. All new features are live in your account now.

What's included in ${plan.name}:

${benefitsText(plan.benefits)}

Your existing data — saved companies, Pulse lists, contacts, and campaign history — carries over unchanged.

If anything isn't working as expected, reply here and we'll sort it out.`;

  const { html, text } = renderEmailLayout({
    heroImageUrl: ctx.heroImageUrl,
    heroAlt: "LIT Pulse AI — upgraded shipper intelligence",
    headline: `Your plan has been upgraded to ${plan.name}`,
    bodyHtml,
    bodyText,
    ctaText: "Explore your new features",
    ctaUrl: `${appUrl}${plan.primaryPath}`,
    unsubscribeUrl: ctx.unsubscribeUrl,
    previewText,
  });

  return { subject, previewText, html, text };
}
