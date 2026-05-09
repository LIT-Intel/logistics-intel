// Paid Plan Welcome — fires immediately when a user activates a paid plan.
// event_type: 'paid_plan_welcome'

import { renderEmailLayout } from "./baseLayout";
import { PLAN_EMAIL_COPY, type PlanSlug } from "../planEmailCopy";

export interface PaidPlanWelcomeContext {
  firstName?: string;
  planSlug: PlanSlug;
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

export function buildPaidPlanWelcomeEmail(ctx: PaidPlanWelcomeContext): {
  subject: string;
  previewText: string;
  html: string;
  text: string;
} {
  const name = resolveName(ctx.firstName);
  const plan = PLAN_EMAIL_COPY[ctx.planSlug] ?? PLAN_EMAIL_COPY.starter;
  const appUrl = ctx.appUrl ?? "https://app.logisticintel.com";

  const subject = `Welcome to LIT ${plan.name}`;
  const previewText = "Your freight intelligence workspace is ready.";

  const bodyHtml = `
<p style="margin:0 0 16px 0;">Hi ${name},</p>
<p style="margin:0 0 16px 0;">Your ${plan.name} plan is active. Here's what's now available in your workspace:</p>
${benefitsHtml(plan.benefits)}
<p style="margin:20px 0 16px 0;">Your previous searches, saved companies, and Pulse lists are all intact. Nothing was reset.</p>
<p style="margin:0 0 16px 0;">If you haven't already, the best first step is to run a Pulse search on your highest-priority lane. The data is live — you'll see the same carriers and shippers your competitors are pitching.</p>
<p style="margin:0 0 0 0;color:#475569;font-size:14px;">Questions about your plan or anything in LIT? Reply here and you'll reach our team directly.</p>`;

  const bodyText = `Hi ${name},

Your ${plan.name} plan is active. Here's what's now available in your workspace:

${benefitsText(plan.benefits)}

Your previous searches, saved companies, and Pulse lists are all intact. Nothing was reset.

If you haven't already, the best first step is to run a Pulse search on your highest-priority lane. The data is live — you'll see the same carriers and shippers your competitors are pitching.

Questions about your plan or anything in LIT? Reply here and you'll reach our team directly.`;

  const { html, text } = renderEmailLayout({
    heroImageUrl: ctx.heroImageUrl,
    heroAlt: "LIT company intelligence — your freight prospecting workspace",
    headline: plan.headline,
    bodyHtml,
    bodyText,
    ctaText: plan.primaryCta,
    ctaUrl: `${appUrl}${plan.primaryPath}`,
    unsubscribeUrl: ctx.unsubscribeUrl,
    previewText,
  });

  return { subject, previewText, html, text };
}
