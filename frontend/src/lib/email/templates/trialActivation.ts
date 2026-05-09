// Trial Day 2 Activation — behavior-gated. Skipped if user already has activity.
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

function resolveName(firstName?: string): string {
  return firstName && firstName.trim() ? firstName.trim() : "there";
}

export function buildTrialActivationEmail(ctx: TrialActivationContext): {
  subject: string;
  previewText: string;
  html: string;
  text: string;
} {
  const name = resolveName(ctx.firstName);
  const appUrl = ctx.appUrl ?? "https://app.logisticintel.com";

  const subject = "The fastest way to test LIT";
  const previewText = "Try this simple workflow today.";

  const bodyHtml = `
<p style="margin:0 0 16px 0;">Hi ${name},</p>
<p style="margin:0 0 16px 0;">A lot of people sign up, poke around the dashboard, and then close the tab. That's a waste of a good trial.</p>
<p style="margin:0 0 12px 0;">Here's the workflow that gets to value fastest:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 20px 0;">
  <tr>
    <td style="padding:12px 16px;background-color:#F1F5F9;border-radius:8px 8px 0 0;border-bottom:1px solid #E2E8F0;font-size:15px;color:#0F172A;line-height:1.5;">
      <strong style="display:inline-block;width:24px;text-align:center;background-color:#2563EB;color:#fff;border-radius:50%;font-size:12px;height:22px;line-height:22px;margin-right:8px;">1</strong>
      Go to <strong>Pulse</strong> and search your best lane (e.g., "Mexico cross-border" or "USEC to Europe").
    </td>
  </tr>
  <tr>
    <td style="padding:12px 16px;background-color:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:15px;color:#0F172A;line-height:1.5;">
      <strong style="display:inline-block;width:24px;text-align:center;background-color:#2563EB;color:#fff;border-radius:50%;font-size:12px;height:22px;line-height:22px;margin-right:8px;">2</strong>
      Open three companies that look active — check shipment cadence and carrier mix.
    </td>
  </tr>
  <tr>
    <td style="padding:12px 16px;background-color:#F1F5F9;border-bottom:1px solid #E2E8F0;font-size:15px;color:#0F172A;line-height:1.5;">
      <strong style="display:inline-block;width:24px;text-align:center;background-color:#2563EB;color:#fff;border-radius:50%;font-size:12px;height:22px;line-height:22px;margin-right:8px;">3</strong>
      Save the one or two that look like real opportunities. Run a Pulse AI brief.
    </td>
  </tr>
  <tr>
    <td style="padding:12px 16px;background-color:#F8FAFC;border-radius:0 0 8px 8px;font-size:15px;color:#0F172A;line-height:1.5;">
      <strong style="display:inline-block;width:24px;text-align:center;background-color:#2563EB;color:#fff;border-radius:50%;font-size:12px;height:22px;line-height:22px;margin-right:8px;">4</strong>
      Use the brief to write your first outreach — or pull contacts directly from LIT.
    </td>
  </tr>
</table>
<p style="margin:0 0 16px 0;">That's it. Four steps, under 15 minutes. Most sales reps come away with at least one new prospect worth a real conversation.</p>`;

  const bodyText = `Hi ${name},

A lot of people sign up, poke around the dashboard, and then close the tab. That's a waste of a good trial.

Here's the workflow that gets to value fastest:

1. Go to Pulse and search your best lane (e.g., "Mexico cross-border" or "USEC to Europe").
2. Open three companies that look active — check shipment cadence and carrier mix.
3. Save the one or two that look like real opportunities. Run a Pulse AI brief.
4. Use the brief to write your first outreach — or pull contacts directly from LIT.

That's it. Four steps, under 15 minutes. Most sales reps come away with at least one new prospect worth a real conversation.`;

  const { html, text } = renderEmailLayout({
    heroImageUrl: ctx.heroImageUrl,
    heroAlt: "LIT Pulse AI — buying signals and shipper intelligence",
    headline: "The fastest way to test LIT",
    bodyHtml,
    bodyText,
    ctaText: "Run a Pulse search",
    ctaUrl: `${appUrl}/pulse`,
    unsubscribeUrl: ctx.unsubscribeUrl,
    previewText,
  });

  return { subject, previewText, html, text };
}
