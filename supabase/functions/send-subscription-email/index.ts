// send-subscription-email — transactional lifecycle email dispatcher.
// v3 (2026-05-09): premium typography-first layout, real PNG logo from
// GitHub raw, correct plan codes (free_trial/starter/growth/scale/enterprise),
// correct trial entitlements (search + supply chain history + trade
// lanes + benchmark rates + 10 enrichments + Pulse AI briefs + revenue
// opportunity sizing — NOT Pulse search/lookalike).
//
// Auth: service-role Bearer token OR JWT belonging to a platform admin.
// verify_jwt: false — we implement custom auth here.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// ─── Types ────────────────────────────────────────────────────────────

type PlanSlug = "free_trial" | "starter" | "growth" | "scale" | "enterprise";

type EventType =
  | "trial_welcome"
  | "trial_day_2_activation"
  | "trial_day_3_founder_note"
  | "trial_ending_soon"
  | "paid_plan_welcome"
  | "upgrade_confirmation";

const VALID_EVENT_TYPES: EventType[] = [
  "trial_welcome",
  "trial_day_2_activation",
  "trial_day_3_founder_note",
  "trial_ending_soon",
  "paid_plan_welcome",
  "upgrade_confirmation",
];

interface SendPayload {
  user_id?: string;
  org_id?: string;
  subscription_id?: string;
  recipient_email: string;
  first_name?: string;
  plan_slug: string; // accepts any string; normalizePlanSlug coerces
  event_type: EventType;
  force?: boolean;
  trial_ends_date?: string;
  previous_plan_name?: string;
}

interface PlanEmailCopy {
  name: string;
  headline: string;
  benefits: string[];
  primaryCta: string;
  primaryPath: string;
}

// ─── Plan copy ─ matches frontend/src/lib/email/planEmailCopy.ts ─────

function normalizePlanSlug(value?: string | null): PlanSlug {
  const v = String(value || "").trim().toLowerCase();
  if (v === "free" || v === "free_trial" || v === "trial") return "free_trial";
  if (v === "standard" || v === "starter") return "starter";
  if (v === "pro" || v === "growth" || v === "growth_plus") return "growth";
  if (v === "team" || v === "scale") return "scale";
  if (v === "unlimited" || v.startsWith("enterprise")) return "enterprise";
  return "free_trial";
}

const PLAN_EMAIL_COPY: Record<PlanSlug, PlanEmailCopy> = {
  free_trial: {
    name: "Free Trial",
    headline: "Welcome to LIT.",
    benefits: [
      "Search shipper companies by name, trade lane, or commodity",
      "View full supply chain shipment history per company",
      "See active trade lanes, shipping cadence, and carrier mix",
      "Compare benchmark freight rates by lane and mode",
      "Enrich up to 10 contacts with verified emails",
      "Run Pulse AI briefs for fast account intelligence",
      "Size revenue opportunity per shipper account",
    ],
    primaryCta: "Open your dashboard",
    primaryPath: "/dashboard",
  },
  starter: {
    name: "Starter",
    headline: "Your LIT Starter workspace is ready.",
    benefits: [
      "75 shipper searches per month with full lane and commodity filters",
      "Save up to 50 shippers with full shipment timeline access",
      "25 Pulse account briefs per month for fast research",
      "Launch outreach campaigns with up to 250 active recipients",
      "1 connected mailbox for sending from your own domain",
      "Email support",
    ],
    primaryCta: "Open your workspace",
    primaryPath: "/dashboard",
  },
  growth: {
    name: "Growth",
    headline: "Your LIT Growth team is ready.",
    benefits: [
      "350 shipper searches per month and 350 saves to Command Center",
      "100 Pulse AI briefs and 100 Pulse lookalike searches per month",
      "150 contact enrichments per month with verified emails",
      "1,000 active campaign recipients across your team",
      "3 team seats with 3 connected mailboxes",
      "RFP Studio, lead prospecting, and team analytics",
      "Saved Pulse lists for industry segmentation",
    ],
    primaryCta: "Invite your team",
    primaryPath: "/settings/team",
  },
  scale: {
    name: "Scale",
    headline: "Your LIT Scale workspace is ready.",
    benefits: [
      "1,000 shipper searches and 1,000 saves per month",
      "500 Pulse AI briefs and 500 Pulse lookalike searches per month",
      "500 contact enrichments per month with verified emails",
      "5 team seats with 5 connected mailboxes",
      "2,500 active campaign recipients and 100 RFP drafts",
      "Credit-rating ready and contact intelligence ready datasets",
      "Saved Pulse lists, lead prospecting, and full team analytics",
    ],
    primaryCta: "Open your workspace",
    primaryPath: "/dashboard",
  },
  enterprise: {
    name: "Enterprise",
    headline: "Welcome to LIT Enterprise.",
    benefits: [
      "Unlimited searches, company saves, Pulse runs, and enrichments",
      "10+ team seats with custom seat scaling",
      "Credit-rating ready and contact intelligence ready datasets",
      "Custom data integrations and CRM sync (Salesforce, HubSpot)",
      "White-glove onboarding and named customer success contact",
      "SLA-backed support with quarterly business reviews",
    ],
    primaryCta: "Schedule your kickoff",
    primaryPath: "/settings/billing",
  },
};

// ─── Layout (premium typography-first, no boxed feel) ────────────────

const COLOR = {
  text: "#0F172A",
  textSubtle: "#475569",
  textMuted: "#94A3B8",
  divider: "#E2E8F0",
  accent: "#0F172A",
  accentText: "#FFFFFF",
  bg: "#FFFFFF",
};
const FONT_BODY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_HEADLINE = '"Charter", "Iowan Old Style", "Source Serif Pro", Georgia, "Times New Roman", serif';

// Real PNG logo — GitHub raw, always accessible regardless of marketing
// site state. Renders in every email client including Outlook desktop.
const LIT_LOGO_URL = "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/logo_email.png";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function benefitsHtml(benefits: string[]): string {
  // Custom checkmark list — feels more premium than default <ul> bullets.
  // Uses Outlook-safe table layout with green checkmarks rendered as
  // inline-styled text (no image dependency).
  const rows = benefits.map((b) => `
    <tr>
      <td valign="top" style="padding: 4px 12px 4px 0; font-family:${FONT_BODY}; font-size:14px; line-height:1.5; color:${COLOR.accent}; font-weight:600; width:18px;">✓</td>
      <td valign="top" style="padding: 4px 0; font-family:${FONT_BODY}; font-size:15px; line-height:1.55; color:${COLOR.text};">${esc(b)}</td>
    </tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 0 0;">${rows}</table>`;
}

function benefitsText(benefits: string[]): string {
  return benefits.map((b) => `  ✓ ${b}`).join("\n");
}

interface LayoutContext {
  previewText: string;
  headline: string;
  bodyHtml: string;
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  unsubscribeUrl: string;
  footerNote?: string;
}

function buildLayout(opts: LayoutContext): { html: string; text: string } {
  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FFFFFF;mso-hide:all;">${esc(opts.previewText)}${"&nbsp;&#847;".repeat(60)}</div>`;

  const ctaBlock = `
          <tr>
            <td align="left" style="padding: 8px 0 36px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${opts.ctaUrl}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="8%" stroke="f" fillcolor="${COLOR.accent}">
                <w:anchorlock/>
                <center style="color:${COLOR.accentText};font-family:${FONT_BODY};font-size:15px;font-weight:600;letter-spacing:0.01em;">${esc(opts.ctaText)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${opts.ctaUrl}" style="display:inline-block;background-color:${COLOR.accent};color:${COLOR.accentText};font-family:${FONT_BODY};font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:8px;letter-spacing:0.01em;mso-hide:all;">${esc(opts.ctaText)} →</a>
              <!--<![endif]-->
            </td>
          </tr>`;

  const footerNoteBlock = opts.footerNote
    ? `
          <tr>
            <td style="padding: 0 0 32px 0;font-family:${FONT_BODY};font-size:14px;color:${COLOR.textSubtle};line-height:1.55;font-style:italic;">
              ${opts.footerNote}
            </td>
          </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${esc(opts.headline)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLOR.bg};color:${COLOR.text};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  ${previewBlock}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLOR.bg};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding: 56px 24px 64px 24px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;">

          <!-- Real PNG logo, top-left -->
          <tr>
            <td align="left" style="padding: 0 0 40px 0;">
              <img src="${LIT_LOGO_URL}" alt="Logistics Intel" width="160" style="display:block;width:160px;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding: 0 0 24px 0;">
              <h1 style="margin:0;font-family:${FONT_HEADLINE};font-size:32px;font-weight:700;color:${COLOR.text};line-height:1.2;letter-spacing:-0.01em;">${esc(opts.headline)}</h1>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding: 0 0 8px 0;font-family:${FONT_BODY};font-size:16px;line-height:1.65;color:${COLOR.text};">
              ${opts.bodyHtml}
            </td>
          </tr>

          ${ctaBlock}
          ${footerNoteBlock}

          <!-- Hairline divider -->
          <tr>
            <td style="padding: 0;">
              <div style="height:1px;background-color:${COLOR.divider};font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0 0 0;font-family:${FONT_BODY};font-size:13px;line-height:1.7;color:${COLOR.textMuted};">
              <span style="color:${COLOR.textSubtle};font-weight:600;">Logistics Intel</span> — freight revenue intelligence for logistics sales teams.<br/>
              You are receiving this because you signed up for a LIT account.<br/>
              <a href="${opts.unsubscribeUrl}" style="color:${COLOR.textMuted};text-decoration:underline;">Unsubscribe</a> &middot; <a href="mailto:hello@logisticintel.com" style="color:${COLOR.textMuted};text-decoration:underline;">hello@logisticintel.com</a>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    opts.headline,
    "",
    opts.bodyText,
    "",
    `${opts.ctaText}: ${opts.ctaUrl}`,
    "",
    opts.footerNote ? opts.footerNote.replace(/<[^>]+>/g, "").trim() : "",
    "—",
    "Logistics Intel — freight revenue intelligence for logistics sales teams.",
    "Questions? Reply to this email.",
    `Unsubscribe: ${opts.unsubscribeUrl}`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();

  return { html, text };
}

// ─── Template builders ───────────────────────────────────────────────

function buildEmail(
  eventType: EventType,
  payload: SendPayload,
  appUrl: string,
  unsubscribeUrl: string,
): { subject: string; html: string; text: string } {
  const planSlug = normalizePlanSlug(payload.plan_slug);
  const plan = PLAN_EMAIL_COPY[planSlug];
  const name = payload.first_name?.trim() || "there";

  switch (eventType) {
    case "trial_welcome": {
      const bodyHtml = `
<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p>
<p style="margin:0 0 18px 0;">Your LIT trial is live. You have 14 days to explore the platform with no credit card required.</p>
<p style="margin:0 0 8px 0;font-weight:600;">What's included on your trial:</p>
${benefitsHtml(plan.benefits)}
<p style="margin:24px 0 18px 0;">The fastest way to see value: pick one trade lane your team already sells, search a known shipper, and walk through their full supply chain history. You'll see shipment cadence, carrier mix, and active trade lanes in under five minutes.</p>
<p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;">P.S. If anything is unclear, reply directly — we read every email.</p>`;

      const bodyText = `Hi ${name},

Your LIT trial is live. You have 14 days to explore the platform with no credit card required.

What's included on your trial:

${benefitsText(plan.benefits)}

The fastest way to see value: pick one trade lane your team already sells, search a known shipper, and walk through their full supply chain history. You'll see shipment cadence, carrier mix, and active trade lanes in under five minutes.

P.S. If anything is unclear, reply directly — we read every email.`;

      const { html, text } = buildLayout({
        previewText: "14 days to explore. No credit card required.",
        headline: plan.headline,
        bodyHtml,
        bodyText,
        ctaText: plan.primaryCta,
        ctaUrl: `${appUrl}${plan.primaryPath}`,
        unsubscribeUrl,
      });
      return { subject: "Your LIT trial is live", html, text };
    }

    case "trial_day_2_activation": {
      const bodyHtml = `
<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p>
<p style="margin:0 0 18px 0;">Most trials get poked at for five minutes and then forgotten. Don't let yours be one of them.</p>
<p style="margin:0 0 12px 0;font-weight:600;">A 10-minute workflow that gets to value fast:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px 0;">
  <tr>
    <td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;font-weight:700;color:${COLOR.text};width:24px;">1.</td>
    <td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Search a known shipper in your target lane (someone you already sell to or compete for).</td>
  </tr>
  <tr>
    <td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;font-weight:700;color:${COLOR.text};">2.</td>
    <td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Open their company profile. Walk through shipment history, trade lanes, and carrier mix.</td>
  </tr>
  <tr>
    <td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;font-weight:700;color:${COLOR.text};">3.</td>
    <td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Run a Pulse AI brief on the account. Read the buying signals and revenue opportunity.</td>
  </tr>
  <tr>
    <td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;font-weight:700;color:${COLOR.text};">4.</td>
    <td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Enrich a contact at the company (you have 10 enrichments on the trial).</td>
  </tr>
</table>
<p style="margin:0;">Once you've done this for one company, the value clicks. Try it now while it's fresh.</p>`;

      const bodyText = `Hi ${name},

Most trials get poked at for five minutes and then forgotten. Don't let yours be one of them.

A 10-minute workflow that gets to value fast:

1. Search a known shipper in your target lane (someone you already sell to or compete for).
2. Open their company profile. Walk through shipment history, trade lanes, and carrier mix.
3. Run a Pulse AI brief on the account. Read the buying signals and revenue opportunity.
4. Enrich a contact at the company (you have 10 enrichments on the trial).

Once you've done this for one company, the value clicks. Try it now while it's fresh.`;

      const { html, text } = buildLayout({
        previewText: "A 10-minute workflow that gets to value fast.",
        headline: "How to test LIT in 10 minutes",
        bodyHtml,
        bodyText,
        ctaText: "Open your dashboard",
        ctaUrl: `${appUrl}/dashboard`,
        unsubscribeUrl,
      });
      return { subject: "How to test LIT in 10 minutes", html, text };
    }

    case "trial_day_3_founder_note": {
      const bodyHtml = `
<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p>
<p style="margin:0 0 18px 0;">Vincent here — founder of LIT.</p>
<p style="margin:0 0 18px 0;">A few days into your trial, the most useful thing you can do is pick ONE shipper your team already knows, walk through their LIT profile, and notice what's there: shipment cadence, the lanes they're moving, the carriers they use, the buyers' actual freight footprint.</p>
<p style="margin:0 0 18px 0;">That's where the value clicks. Not "another database of contacts." A picture of the customer's actual freight before you reach out.</p>
<p style="margin:0 0 24px 0;">If LIT isn't clicking yet, hit reply. I read every one and I'm happy to walk through your target accounts on a 15-minute call.</p>
<p style="margin:0;">— Vincent<br/>Founder, Logistic Intel</p>`;

      const bodyText = `Hi ${name},

Vincent here — founder of LIT.

A few days into your trial, the most useful thing you can do is pick ONE shipper your team already knows, walk through their LIT profile, and notice what's there: shipment cadence, the lanes they're moving, the carriers they use, the buyers' actual freight footprint.

That's where the value clicks. Not "another database of contacts." A picture of the customer's actual freight before you reach out.

If LIT isn't clicking yet, hit reply. I read every one and I'm happy to walk through your target accounts on a 15-minute call.

— Vincent
Founder, Logistic Intel`;

      const { html, text } = buildLayout({
        previewText: "A note from the founder.",
        headline: "How I'd use LIT if I were you",
        bodyHtml,
        bodyText,
        ctaText: "Open LIT",
        ctaUrl: `${appUrl}/dashboard`,
        unsubscribeUrl,
      });
      return { subject: "How I'd use LIT if I were you", html, text };
    }

    case "trial_ending_soon": {
      const endsPhrase = payload.trial_ends_date ? ` on ${payload.trial_ends_date}` : " in 2 days";
      const bodyHtml = `
<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p>
<p style="margin:0 0 18px 0;">Your LIT trial ends${esc(endsPhrase)}. After that, your saved companies, contact enrichments, and Pulse AI briefs are locked until you choose a plan.</p>
<p style="margin:0 0 12px 0;font-weight:600;">Keeping your workspace active means:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px 0;">
  <tr><td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;color:${COLOR.accent};font-weight:600;width:18px;">✓</td><td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Saved companies and notes stay intact</td></tr>
  <tr><td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;color:${COLOR.accent};font-weight:600;">✓</td><td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Search history, lane filters, and Pulse AI briefs carry over</td></tr>
  <tr><td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;color:${COLOR.accent};font-weight:600;">✓</td><td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Contact enrichments and saved contacts preserved</td></tr>
  <tr><td valign="top" style="padding: 4px 12px 4px 0;font-family:${FONT_BODY};font-size:14px;color:${COLOR.accent};font-weight:600;">✓</td><td valign="top" style="padding: 4px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">Outreach campaigns and team mailboxes activate</td></tr>
</table>
<p style="margin:0 0 18px 0;">Starter is $125/mo and covers solo prospecting. Growth is $499/mo for up to 3 reps with full enrichment, RFP Studio, and lead prospecting. No long-term contract.</p>
<p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;">Not ready? Reply and tell me what's holding you back. Honest answers only — no sales pressure.</p>`;

      const bodyText = `Hi ${name},

Your LIT trial ends${endsPhrase}. After that, your saved companies, contact enrichments, and Pulse AI briefs are locked until you choose a plan.

Keeping your workspace active means:

  ✓ Saved companies and notes stay intact
  ✓ Search history, lane filters, and Pulse AI briefs carry over
  ✓ Contact enrichments and saved contacts preserved
  ✓ Outreach campaigns and team mailboxes activate

Starter is $125/mo and covers solo prospecting. Growth is $499/mo for up to 3 reps with full enrichment, RFP Studio, and lead prospecting. No long-term contract.

Not ready? Reply and tell me what's holding you back. Honest answers only — no sales pressure.`;

      const { html, text } = buildLayout({
        previewText: "Keep your shipper intelligence workspace active.",
        headline: "Your LIT trial is ending soon",
        bodyHtml,
        bodyText,
        ctaText: "Choose your plan",
        ctaUrl: `${appUrl}/settings/billing`,
        unsubscribeUrl,
      });
      return { subject: "Your LIT trial is ending soon", html, text };
    }

    case "paid_plan_welcome": {
      const bodyHtml = `
<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p>
<p style="margin:0 0 18px 0;">Your <strong>${esc(plan.name)}</strong> plan is active. Everything from your trial — saved companies, search history, Pulse briefs, contacts — carries over unchanged.</p>
<p style="margin:0 0 8px 0;font-weight:600;">What's now available in your workspace:</p>
${benefitsHtml(plan.benefits)}
<p style="margin:24px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;">Questions about your plan? Reply here — you'll reach our team directly.</p>`;

      const bodyText = `Hi ${name},

Your ${plan.name} plan is active. Everything from your trial — saved companies, search history, Pulse briefs, contacts — carries over unchanged.

What's now available in your workspace:

${benefitsText(plan.benefits)}

Questions about your plan? Reply here — you'll reach our team directly.`;

      const { html, text } = buildLayout({
        previewText: `Your ${plan.name} workspace is ready.`,
        headline: plan.headline,
        bodyHtml,
        bodyText,
        ctaText: plan.primaryCta,
        ctaUrl: `${appUrl}${plan.primaryPath}`,
        unsubscribeUrl,
      });
      return { subject: `Welcome to LIT ${plan.name}`, html, text };
    }

    case "upgrade_confirmation": {
      const fromPhrase = payload.previous_plan_name ? ` from ${payload.previous_plan_name}` : "";
      const bodyHtml = `
<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p>
<p style="margin:0 0 18px 0;">Your upgrade${esc(fromPhrase)} to <strong>${esc(plan.name)}</strong> is confirmed. New features and limits are live in your account now.</p>
<p style="margin:0 0 8px 0;font-weight:600;">What's included in ${esc(plan.name)}:</p>
${benefitsHtml(plan.benefits)}
<p style="margin:24px 0 18px 0;">All your existing data — saved companies, Pulse briefs, contacts, campaign history — stays intact.</p>
<p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;">If anything isn't working as expected, reply here and we'll sort it out.</p>`;

      const bodyText = `Hi ${name},

Your upgrade${fromPhrase} to ${plan.name} is confirmed. New features and limits are live in your account now.

What's included in ${plan.name}:

${benefitsText(plan.benefits)}

All your existing data — saved companies, Pulse briefs, contacts, campaign history — stays intact.

If anything isn't working as expected, reply here and we'll sort it out.`;

      const { html, text } = buildLayout({
        previewText: "Your new features are live.",
        headline: `Your plan has been upgraded to ${plan.name}`,
        bodyHtml,
        bodyText,
        ctaText: "Explore your new features",
        ctaUrl: `${appUrl}${plan.primaryPath}`,
        unsubscribeUrl,
      });
      return { subject: "Your LIT plan has been upgraded", html, text };
    }

    default: {
      const _exhaustive: never = eventType;
      throw new Error(`Unknown event_type: ${_exhaustive}`);
    }
  }
}

// ─── Auth check ──────────────────────────────────────────────────────

async function isAuthorized(req: Request, serviceRoleKey: string): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  if (token === serviceRoleKey) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const role = payload?.app_metadata?.role ?? payload?.user_metadata?.role ?? "";
    return role === "admin" || role === "super_admin";
  } catch {
    return false;
  }
}

// ─── Main handler ────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("LIT_RESEND_API_KEY");
  const appUrl = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");
  const siteUrl = (Deno.env.get("LIT_SITE_URL") ?? "https://www.logisticintel.com").replace(/\/+$/, "");
  const fromEmail = Deno.env.get("LIT_EMAIL_FROM") ?? "LIT <hello@updates.logisticintel.com>";
  const replyTo = Deno.env.get("LIT_EMAIL_REPLY_TO") ?? "hello@logisticintel.com";

  if (!(await isAuthorized(req, serviceRoleKey))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let body: SendPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { recipient_email, event_type } = body;
  if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid recipient_email" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!VALID_EVENT_TYPES.includes(event_type)) {
    return new Response(JSON.stringify({ ok: false, error: `Invalid event_type: ${event_type}` }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const planSlug = normalizePlanSlug(body.plan_slug);

  const db = createClient(supabaseUrl, serviceRoleKey);

  // Suppression check
  const { data: unsub } = await db
    .from("lit_email_unsubscribes")
    .select("id")
    .eq("recipient_email", recipient_email.toLowerCase())
    .maybeSingle();
  if (unsub) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "unsubscribed" }), { headers: { "Content-Type": "application/json" } });
  }

  // Idempotency
  if (!body.force) {
    const { data: existing } = await db
      .from("lit_email_automation_events")
      .select("id")
      .eq("event_type", event_type)
      .eq("plan_slug", planSlug)
      .eq("status", "sent")
      .eq(body.user_id ? "user_id" : "recipient_email", body.user_id ?? recipient_email.toLowerCase())
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent", existing_id: existing.id }), { headers: { "Content-Type": "application/json" } });
    }
  }

  const emailToken = btoa(recipient_email.toLowerCase()).replace(/=/g, "");
  const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(recipient_email.toLowerCase())}&token=${emailToken}`;

  let emailResult: { subject: string; html: string; text: string };
  try {
    emailResult = buildEmail(event_type, { ...body, plan_slug: planSlug }, appUrl, unsubscribeUrl);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: `Template build failed: ${err instanceof Error ? err.message : String(err)}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const { subject, html, text } = emailResult;
  const listUnsubscribeHeader = `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=Unsubscribe>`;

  let resendEmailId: string | null = null;
  let sendStatus: "sent" | "failed" = "failed";
  let errorMessage: string | null = null;

  if (!resendKey) {
    errorMessage = "LIT_RESEND_API_KEY not configured";
    console.warn("[send-subscription-email] LIT_RESEND_API_KEY missing — email not sent");
  } else {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient_email],
          reply_to: replyTo,
          subject,
          html,
          text,
          headers: {
            "List-Unsubscribe": listUnsubscribeHeader,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          tags: [
            { name: "event_type", value: event_type },
            { name: "plan_slug", value: planSlug },
          ],
        }),
      });
      const respJson: any = await resp.json().catch(() => ({}));
      if (resp.ok) {
        resendEmailId = (respJson?.id as string | null) ?? null;
        sendStatus = "sent";
      } else {
        errorMessage = String(respJson?.message || respJson?.name || respJson?.error || resp.status).slice(0, 500);
        console.warn("[send-subscription-email] Resend error:", resp.status, errorMessage);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
      console.error("[send-subscription-email] Resend threw:", err);
    }
  }

  const { data: eventRow } = await db
    .from("lit_email_automation_events")
    .insert({
      user_id: body.user_id ?? null,
      org_id: body.org_id ?? null,
      subscription_id: body.subscription_id ?? null,
      plan_slug: planSlug,
      event_type,
      resend_email_id: resendEmailId,
      recipient_email: recipient_email.toLowerCase(),
      subject,
      status: sendStatus,
      error_message: errorMessage,
      payload_json: { first_name: body.first_name, plan_slug: planSlug, event_type, trial_ends_date: body.trial_ends_date, previous_plan_name: body.previous_plan_name },
    })
    .select("id")
    .single();

  if (sendStatus === "sent") {
    return new Response(
      JSON.stringify({ ok: true, resend_email_id: resendEmailId, event_id: eventRow?.id ?? null }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({ ok: false, error: errorMessage, event_id: eventRow?.id ?? null }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
});
