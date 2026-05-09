// send-subscription-email v7
// Five fixes from user feedback:
// (1) Layout: each email controls its own h1 headline. No more
//     "Welcome, Vincent." repeating on every email — only welcome /
//     paid-welcome / upgrade-confirm emails open with a personal
//     welcome. Tip emails / founder note / ending-soon get their own
//     contextual headlines.
// (2) RFP Studio removed from all plan copy (discontinued service).
// (3) Growth plan adds a 🚀 in the headline display — not in subject
//     lines (some spam filters flag emoji subjects).
// (4) Pro Tip card helper — tinted blue card injected into trial
//     welcome + paid plan welcome with actionable next-step tips.
// (5) Three new tip emails to expand the trial sequence: showing
//     how top reps use Pulse AI, contact enrichment, and revenue
//     opportunity sizing. Cron fires them at Day 4 / 6 / 8.
//
// NEW in v7b (2026-05-09):
// (6) payment_failed event — fires when Stripe payment fails.
// (7) cancellation_confirmation event — fires when user cancels.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type PlanSlug = "free_trial" | "starter" | "growth" | "scale" | "enterprise";
type EventType =
  | "trial_welcome"
  | "trial_day_2_activation"
  | "trial_day_3_founder_note"
  | "trial_tip_pulse_ai"
  | "trial_tip_contact_enrichment"
  | "trial_tip_revenue_opportunity"
  | "trial_ending_soon"
  | "paid_plan_welcome"
  | "upgrade_confirmation"
  | "payment_failed"
  | "cancellation_confirmation";

const VALID_EVENT_TYPES: EventType[] = [
  "trial_welcome", "trial_day_2_activation", "trial_day_3_founder_note",
  "trial_tip_pulse_ai", "trial_tip_contact_enrichment", "trial_tip_revenue_opportunity",
  "trial_ending_soon", "paid_plan_welcome", "upgrade_confirmation",
  "payment_failed", "cancellation_confirmation",
];

interface SendPayload {
  user_id?: string; org_id?: string; subscription_id?: string;
  recipient_email: string; first_name?: string; plan_slug: string;
  event_type: EventType; force?: boolean;
  trial_ends_date?: string; previous_plan_name?: string;
  period_end?: string; plan_name?: string;
}
interface PlanEmailCopy { name: string; nameWithIcon: string; benefits: string[]; primaryCta: string; primaryPath: string; }

function normalizePlanSlug(value?: string | null): PlanSlug {
  const v = String(value || "").trim().toLowerCase();
  if (v === "free" || v === "free_trial" || v === "trial") return "free_trial";
  if (v === "standard" || v === "starter") return "starter";
  if (v === "pro" || v === "growth" || v === "growth_plus") return "growth";
  if (v === "team" || v === "scale") return "scale";
  if (v === "unlimited" || v.startsWith("enterprise")) return "enterprise";
  return "free_trial";
}

// Plan copy — RFP Studio removed (discontinued service per user 2026-05-09).
// nameWithIcon adds a rocket emoji to Growth's display name in body copy.
const PLAN_EMAIL_COPY: Record<PlanSlug, PlanEmailCopy> = {
  free_trial: {
    name: "Free Trial", nameWithIcon: "Free Trial",
    benefits: [
      "Search shipper companies by name, trade lane, or commodity",
      "View full supply chain shipment history per company",
      "See active trade lanes, shipping cadence, and carrier mix",
      "Compare benchmark freight rates by lane and mode",
      "Enrich up to 10 contacts with verified emails",
      "Run Pulse AI briefs for fast account intelligence",
      "Size revenue opportunity per shipper account",
    ],
    primaryCta: "Open your dashboard", primaryPath: "/dashboard",
  },
  starter: {
    name: "Starter", nameWithIcon: "Starter",
    benefits: [
      "75 shipper searches per month with full lane and commodity filters",
      "Save up to 50 shippers with full shipment timeline access",
      "25 Pulse account briefs per month for fast research",
      "Launch outreach campaigns with up to 250 active recipients",
      "1 connected mailbox for sending from your own domain",
      "Email support",
    ],
    primaryCta: "Open your workspace", primaryPath: "/dashboard",
  },
  growth: {
    name: "Growth", nameWithIcon: "Growth 🚀",
    benefits: [
      "350 shipper searches per month and 350 saves to Command Center",
      "100 Pulse AI briefs and 100 Pulse lookalike searches per month",
      "150 contact enrichments per month with verified emails",
      "1,000 active campaign recipients across your team",
      "3 team seats with 3 connected mailboxes",
      "Lead prospecting and team analytics",
      "Saved Pulse lists for industry segmentation",
    ],
    primaryCta: "Invite your team", primaryPath: "/settings/team",
  },
  scale: {
    name: "Scale", nameWithIcon: "Scale",
    benefits: [
      "1,000 shipper searches and 1,000 saves per month",
      "500 Pulse AI briefs and 500 Pulse lookalike searches per month",
      "500 contact enrichments per month with verified emails",
      "5 team seats with 5 connected mailboxes",
      "2,500 active campaign recipients",
      "Credit-rating ready and contact intelligence ready datasets",
      "Saved Pulse lists, lead prospecting, and full team analytics",
    ],
    primaryCta: "Open your workspace", primaryPath: "/dashboard",
  },
  enterprise: {
    name: "Enterprise", nameWithIcon: "Enterprise",
    benefits: [
      "Unlimited searches, company saves, Pulse runs, and enrichments",
      "10+ team seats with custom seat scaling",
      "Credit-rating ready and contact intelligence ready datasets",
      "Custom data integrations and CRM sync (Salesforce, HubSpot)",
      "White-glove onboarding and named customer success contact",
      "SLA-backed support with quarterly business reviews",
    ],
    primaryCta: "Schedule your kickoff", primaryPath: "/settings/billing",
  },
};

const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const LIT_ICON_URL = "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";

const COLOR = {
  text: "#0F172A", textSubtle: "#475569", textMuted: "#94A3B8",
  divider: "#E2E8F0",
  ctaBg: "#2563EB", ctaBgDark: "#1E40AF", ctaText: "#FFFFFF",
  bg: "#FFFFFF", pageBg: "#F1F5F9", heroBg: "#0A1024", brandBlue: "#2563EB",
  tipBg: "#EFF6FF", tipBorder: "#DBEAFE", tipLabel: "#1E40AF",
};

function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// No align="left" on these tables — it would float them and wrap
// subsequent paragraphs around them on the right.
function benefitsHtml(benefits: string[]): string {
  const rows = benefits.map((b) => `<tr><td valign="top" style="padding:6px 14px 6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.4;color:${COLOR.brandBlue};font-weight:700;width:20px;">✓</td><td valign="top" style="padding:6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${esc(b)}</td></tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 0 0;width:auto;">${rows}</table>`;
}
function benefitsText(benefits: string[]): string { return benefits.map((b) => `  ✓ ${b}`).join("\n"); }

// Pro Tip card — tinted blue card with PRO TIP label + body. Used in
// trial welcome and paid plan welcome to give the user one concrete
// next thing to try beyond the benefits list.
function proTipHtml(tipText: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:24px 0 0 0;width:100%;"><tr><td bgcolor="${COLOR.tipBg}" style="background-color:${COLOR.tipBg};border:1px solid ${COLOR.tipBorder};border-radius:12px;padding:16px 20px;"><div style="font-family:${FONT_BODY};font-size:11px;font-weight:700;color:${COLOR.tipLabel};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Pro tip</div><div style="font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${tipText}</div></td></tr></table>`;
}

interface LayoutContext {
  previewText: string;
  // Each email's primary h1. Welcome emails open with a personal
  // welcome ("Welcome, Vincent."); tip emails / founder note open
  // with their own headline ("30-second prep for sales calls").
  headline: string;
  subtitle?: string;
  bodyHtml: string;
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  unsubscribeUrl: string;
  showHeroBanner?: boolean;
}

function buildLayout(opts: LayoutContext): { html: string; text: string } {
  const showBanner = opts.showHeroBanner !== false;
  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FFFFFF;mso-hide:all;">${esc(opts.previewText)}${"&nbsp;&#847;".repeat(60)}</div>`;

  const heroBlock = showBanner
    ? `<tr><td bgcolor="${COLOR.heroBg}" style="background-color:${COLOR.heroBg};padding:32px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding-right:14px;"><img src="${LIT_ICON_URL}" width="40" height="40" alt="LIT" style="display:block;width:40px;height:40px;border-radius:9px;border:0;outline:none;" /></td><td valign="middle" style="font-family:${FONT_BODY};font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">Logistic Intel</td></tr></table></td></tr>`
    : `<tr><td style="padding:36px 40px 0 40px;"><img src="${LIT_ICON_URL}" alt="LIT" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:10px;border:0;outline:none;" /></td></tr>`;

  const subtitleBlock = opts.subtitle ? `<p style="margin:0;font-family:${FONT_BODY};font-size:18px;font-weight:500;line-height:1.4;color:${COLOR.textSubtle};text-align:left;">${esc(opts.subtitle)}</p>` : "";

  const ctaBlock = `<tr><td style="padding:8px 40px 36px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${COLOR.ctaBg}" valign="middle" style="background-color:${COLOR.ctaBg};border-radius:10px;mso-padding-alt:16px 32px;border-bottom:2px solid ${COLOR.ctaBgDark};"><a href="${opts.ctaUrl}" target="_blank" style="display:inline-block;padding:16px 32px;font-family:${FONT_BODY};font-size:16px;font-weight:600;color:${COLOR.ctaText};text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">${esc(opts.ctaText)} →</a></td></tr></table></td></tr>`;

  const html = `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="X-UA-Compatible" content="IE=edge" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /><title>${esc(opts.headline)}</title><!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--></head><body style="margin:0;padding:0;background-color:${COLOR.pageBg};color:${COLOR.text};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">${previewBlock}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLOR.pageBg}" style="background-color:${COLOR.pageBg};border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="${COLOR.bg}" style="max-width:600px;width:100%;background-color:${COLOR.bg};border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);">${heroBlock}<tr><td style="padding:36px 40px 4px 40px;"><h1 style="margin:0 0 8px 0;font-family:${FONT_BODY};font-size:30px;font-weight:800;color:${COLOR.text};line-height:1.18;letter-spacing:-0.02em;text-align:left;">${esc(opts.headline)}</h1>${subtitleBlock}</td></tr><tr><td style="padding:24px 40px 8px 40px;font-family:${FONT_BODY};font-size:16px;line-height:1.65;color:${COLOR.text};text-align:left;">${opts.bodyHtml}</td></tr>${ctaBlock}<tr><td style="padding:0 40px;"><div style="height:1px;background-color:${COLOR.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:24px 40px 32px 40px;font-family:${FONT_BODY};font-size:13px;line-height:1.7;color:${COLOR.textMuted};text-align:left;"><span style="color:${COLOR.textSubtle};font-weight:600;">Logistics Intel</span> — freight revenue intelligence for logistics sales teams.<br/>You are receiving this because you signed up for a LIT account.<br/><a href="${opts.unsubscribeUrl}" style="color:${COLOR.textMuted};text-decoration:underline;">Unsubscribe</a> &middot; <a href="mailto:hello@logisticintel.com" style="color:${COLOR.textMuted};text-decoration:underline;">hello@logisticintel.com</a></td></tr></table></td></tr></table></body></html>`;

  const text = [
    opts.headline,
    opts.subtitle ?? "",
    "",
    opts.bodyText,
    "",
    `${opts.ctaText}: ${opts.ctaUrl}`,
    "",
    "—",
    "Logistics Intel — freight revenue intelligence for logistics sales teams.",
    "Questions? Reply to this email.",
    `Unsubscribe: ${opts.unsubscribeUrl}`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
  return { html, text };
}

function buildEmail(eventType: EventType, payload: SendPayload, appUrl: string, unsubscribeUrl: string): { subject: string; html: string; text: string } {
  const planSlug = normalizePlanSlug(payload.plan_slug);
  const plan = PLAN_EMAIL_COPY[planSlug];
  const name = payload.first_name?.trim() || "there";
  const nameSuffix = name === "there" ? "" : `, ${name}`;
  switch (eventType) {
    case "trial_welcome": {
      const tip = `Run a Pulse AI brief on a prospect <strong>before</strong> your next sales call. 30 seconds of context beats 30 minutes of generic outreach — and your prospect won't know you didn't already have it.`;
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">You're in. For the next 14 days you have access to the same shipper intelligence freight teams use to stop selling to dead lists — no credit card required.</p><p style="margin:0 0 8px 0;font-weight:700;color:${COLOR.text};text-align:left;">What you can do today:</p>${benefitsHtml(plan.benefits)}${proTipHtml(tip)}<p style="margin:24px 0 18px 0;text-align:left;">The 5-minute test: pick a shipper your team already sells to, search them in LIT, and walk through their full supply chain history. The picture you get back is what makes the rest of the platform make sense.</p><p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">P.S. Hit reply if anything's unclear — I read every one. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYou're in. For the next 14 days you have access to the same shipper intelligence freight teams use to stop selling to dead lists — no credit card required.\n\nWhat you can do today:\n\n${benefitsText(plan.benefits)}\n\nPRO TIP: Run a Pulse AI brief on a prospect BEFORE your next sales call. 30 seconds of context beats 30 minutes of generic outreach.\n\nThe 5-minute test: pick a shipper your team already sells to, search them in LIT, and walk through their full supply chain history.\n\nP.S. Hit reply if anything's unclear — I read every one. — Gabriel`;
      const { html, text } = buildLayout({ previewText: "14 days. No credit card required.", headline: name === "there" ? "Welcome to LIT." : `Welcome${nameSuffix}.`, subtitle: "Your trial is live for 14 days.", bodyHtml, bodyText, ctaText: plan.primaryCta, ctaUrl: `${appUrl}${plan.primaryPath}`, unsubscribeUrl });
      return { subject: "You're in — your LIT trial is live", html, text };
    }
    case "trial_day_2_activation": {
      const stepsHtml = [
        ["1.", "Search a known shipper in your target lane."],
        ["2.", "Open their company profile. Walk through shipment history, lanes, and carrier mix."],
        ["3.", "Run a Pulse AI brief. Read the buying signals and revenue opportunity."],
        ["4.", "Enrich a contact at the company."],
      ].map(([num, txt]) => `<tr><td valign="top" style="padding:6px 14px 6px 0;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${COLOR.brandBlue};width:24px;">${num}</td><td valign="top" style="padding:6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${esc(txt)}</td></tr>`).join("");
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Most trials get five minutes of attention then forgotten. Don't let yours.</p><p style="margin:0 0 12px 0;font-weight:700;color:${COLOR.text};text-align:left;">A 10-minute workflow that gets to value fast:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px 0;width:auto;">${stepsHtml}</table><p style="margin:0 0 0 0;text-align:left;">Once you've done this for one company, the value clicks.</p><p style="margin:18px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nMost trials get five minutes of attention then forgotten. Don't let yours.\n\nA 10-minute workflow that gets to value fast:\n\n1. Search a known shipper in your target lane.\n2. Open their company profile. Walk through shipment history, lanes, and carrier mix.\n3. Run a Pulse AI brief. Read the buying signals and revenue opportunity.\n4. Enrich a contact at the company.\n\nOnce you've done this for one company, the value clicks.\n\n— Gabriel`;
      const { html, text } = buildLayout({ previewText: "A 10-minute workflow that gets to value fast.", headline: "Test LIT in 10 minutes.", subtitle: "The workflow that gets to value fastest.", bodyHtml, bodyText, ctaText: "Open your dashboard", ctaUrl: `${appUrl}/dashboard`, unsubscribeUrl });
      return { subject: "How to test LIT in 10 minutes", html, text };
    }
    case "trial_day_3_founder_note": {
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Gabriel here — founder of LIT.</p><p style="margin:0 0 18px 0;text-align:left;">A few days into your trial, the most useful thing you can do is pick ONE shipper your team already knows, walk through their LIT profile, and notice what's there: shipment cadence, the lanes they're moving, the carriers they use, the buyers' actual freight footprint.</p><p style="margin:0 0 18px 0;text-align:left;">That's where the value clicks. Not \"another database of contacts.\" A picture of the customer's actual freight before you reach out.</p><p style="margin:0 0 24px 0;text-align:left;">If LIT isn't clicking yet, hit reply. I read every one and I'm happy to walk through your target accounts on a 15-minute call.</p><p style="margin:0;font-weight:600;text-align:left;">— Gabriel<br/><span style="color:${COLOR.textSubtle};font-weight:500;">Founder, Logistic Intel</span></p>`;
      const bodyText = `Hi ${name},\n\nGabriel here — founder of LIT.\n\nA few days into your trial, the most useful thing you can do is pick ONE shipper your team already knows, walk through their LIT profile, and notice what's there: shipment cadence, the lanes they're moving, the carriers they use, the buyers' actual freight footprint.\n\nThat's where the value clicks. Not \"another database of contacts.\" A picture of the customer's actual freight before you reach out.\n\nIf LIT isn't clicking yet, hit reply. I read every one and I'm happy to walk through your target accounts on a 15-minute call.\n\n— Gabriel\nFounder, Logistic Intel`;
      const { html, text } = buildLayout({ previewText: "A note from the founder.", headline: "How I'd use LIT if I were you.", bodyHtml, bodyText, ctaText: "Open LIT", ctaUrl: `${appUrl}/dashboard`, unsubscribeUrl, showHeroBanner: false });
      return { subject: "How I'd use LIT if I were you", html, text };
    }
    case "trial_tip_pulse_ai": {
      const stepsHtml = [
        ["1.", "Search the prospect in LIT and open their company profile."],
        ["2.", `Click <strong>Pulse AI</strong> — it generates a 30-second brief on shipment cadence, top lanes, carrier mix, and buying signals.`],
        ["3.", `Open with one specific observation from the brief. Not "do you have any freight?" — something like "I noticed you've shifted ~40% of your USEC volume from CMA to Maersk in the last 6 months."`],
      ].map(([num, txt]) => `<tr><td valign="top" style="padding:6px 14px 6px 0;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${COLOR.brandBlue};width:24px;">${num}</td><td valign="top" style="padding:6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${txt}</td></tr>`).join("");
      const tip = `Most reps research <em>after</em> the call. Top reps research <em>before</em>. Pulse AI puts that on autopilot.`;
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Top performing freight reps don't show up cold. They show up <strong>informed</strong>. Here's how they do it in three steps:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px 0;width:auto;">${stepsHtml}</table>${proTipHtml(tip)}<p style="margin:24px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nTop performing freight reps don't show up cold. They show up informed. Here's how they do it in three steps:\n\n1. Search the prospect in LIT and open their company profile.\n2. Click Pulse AI — it generates a 30-second brief on shipment cadence, top lanes, carrier mix, and buying signals.\n3. Open with one specific observation from the brief. Not "do you have any freight?" — something specific like "I noticed you shifted 40% of your USEC volume from CMA to Maersk."\n\nPRO TIP: Most reps research AFTER the call. Top reps research BEFORE. Pulse AI puts that on autopilot.\n\n— Gabriel`;
      const { html, text } = buildLayout({ previewText: "How top reps prep for sales calls in 30 seconds.", headline: "30-second prep, not 30-minute prep.", subtitle: "How top reps use Pulse AI before sales calls.", bodyHtml, bodyText, ctaText: "Open Pulse AI", ctaUrl: `${appUrl}/dashboard`, unsubscribeUrl });
      return { subject: "How top reps prep for sales calls in 30 seconds", html, text };
    }
    case "trial_tip_contact_enrichment": {
      const stepsHtml = [
        ["1.", "Save 2–3 shippers you actually want to call into your Command Center."],
        ["2.", `Open a saved company and click <strong>Enrich</strong> on the contact you want — typically VP / Director of Logistics, Supply Chain, or Procurement.`],
        ["3.", "You get a verified email + role + LinkedIn. 95%+ deliverability — not the stale list quality you're used to."],
      ].map(([num, txt]) => `<tr><td valign="top" style="padding:6px 14px 6px 0;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${COLOR.brandBlue};width:24px;">${num}</td><td valign="top" style="padding:6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${txt}</td></tr>`).join("");
      const tip = `10 verified contacts beat 100 stale ones. Your trial gives you 10 enrichments — spend them on accounts you'd actually take to lunch.`;
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">A bouncing email isn't just a wasted send. It's a small mark against your sender reputation — and over time, it stops your good emails from landing too.</p><p style="margin:0 0 18px 0;text-align:left;">Here's the workflow top reps use:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px 0;width:auto;">${stepsHtml}</table>${proTipHtml(tip)}<p style="margin:24px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nA bouncing email isn't just a wasted send. It's a small mark against your sender reputation — and over time, it stops your good emails from landing too.\n\nHere's the workflow top reps use:\n\n1. Save 2-3 shippers you actually want to call into your Command Center.\n2. Open a saved company and click Enrich on the contact you want — typically VP / Director of Logistics, Supply Chain, or Procurement.\n3. You get a verified email + role + LinkedIn. 95%+ deliverability.\n\nPRO TIP: 10 verified contacts beat 100 stale ones. Your trial gives you 10 enrichments — spend them on accounts you'd actually take to lunch.\n\n— Gabriel`;
      const { html, text } = buildLayout({ previewText: "Stop sending to bouncing emails.", headline: "Better contacts, fewer bounces.", subtitle: "How top reps use contact enrichment.", bodyHtml, bodyText, ctaText: "Try contact enrichment", ctaUrl: `${appUrl}/dashboard`, unsubscribeUrl });
      return { subject: "Stop sending to bouncing emails", html, text };
    }
    case "trial_tip_revenue_opportunity": {
      const stepsHtml = [
        ["1.", `Open any shipper profile and click the <strong>Revenue Opportunity</strong> tab.`],
        ["2.", "You'll see estimated annual freight spend split by service line — ocean, air, customs, drayage, warehousing, trucking."],
        ["3.", "Pick one service line where your team is strong and lead with that number."],
      ].map(([num, txt]) => `<tr><td valign="top" style="padding:6px 14px 6px 0;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${COLOR.brandBlue};width:24px;">${num}</td><td valign="top" style="padding:6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${txt}</td></tr>`).join("");
      const tip = `"I see you're spending ~$2.4M annually on ocean — let's talk about taking 30% of that" is a different conversation than "do you have any freight to quote?"`;
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Reps who quote rates lose deals. Reps who quote <strong>opportunity</strong> win them.</p><p style="margin:0 0 18px 0;text-align:left;">Here's how top reps use Revenue Opportunity sizing:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px 0;width:auto;">${stepsHtml}</table>${proTipHtml(tip)}<p style="margin:24px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nReps who quote rates lose deals. Reps who quote opportunity win them.\n\nHere's how top reps use Revenue Opportunity sizing:\n\n1. Open any shipper profile and click the Revenue Opportunity tab.\n2. You'll see estimated annual freight spend split by service line — ocean, air, customs, drayage, warehousing, trucking.\n3. Pick one service line where your team is strong and lead with that number.\n\nPRO TIP: "I see you're spending ~$2.4M annually on ocean — let's talk about taking 30% of that" is a different conversation than "do you have any freight to quote?"\n\n— Gabriel`;
      const { html, text } = buildLayout({ previewText: "Lead with revenue, not capacity.", headline: "Show up with their number.", subtitle: "How top reps use Revenue Opportunity sizing.", bodyHtml, bodyText, ctaText: "Open a shipper profile", ctaUrl: `${appUrl}/dashboard`, unsubscribeUrl });
      return { subject: "Lead with revenue, not capacity", html, text };
    }
    case "trial_ending_soon": {
      const endsPhrase = payload.trial_ends_date ? ` on ${payload.trial_ends_date}` : " in 2 days";
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Your LIT trial ends${esc(endsPhrase)}. After that, your saved companies, contact enrichments, and Pulse AI briefs are locked until you choose a plan.</p><p style="margin:0 0 12px 0;font-weight:700;color:${COLOR.text};text-align:left;">Keep your workspace active and:</p>${benefitsHtml(["Saved companies and notes stay intact","Search history and Pulse AI briefs carry over","Contact enrichments and saved contacts preserved","Outreach campaigns and team mailboxes activate"])}<p style="margin:18px 0 18px 0;text-align:left;">Starter is $125/mo for solo prospecting. Growth 🚀 is $499/mo for up to 3 reps with full enrichment, lead prospecting, and team analytics. No long-term contracts.</p><p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">Not ready? Reply and tell me what's holding you back. Honest answers only — no sales pressure. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour LIT trial ends${endsPhrase}. After that, your saved companies, contact enrichments, and Pulse AI briefs are locked until you choose a plan.\n\nKeep your workspace active and:\n\n  ✓ Saved companies and notes stay intact\n  ✓ Search history and Pulse AI briefs carry over\n  ✓ Contact enrichments and saved contacts preserved\n  ✓ Outreach campaigns and team mailboxes activate\n\nStarter is $125/mo for solo prospecting. Growth 🚀 is $499/mo for up to 3 reps with full enrichment, lead prospecting, and team analytics. No long-term contracts.\n\nNot ready? Reply and tell me what's holding you back. Honest answers only — no sales pressure. — Gabriel`;
      const { html, text } = buildLayout({ previewText: "Keep your shipper intelligence workspace active.", headline: "Your trial is ending soon.", subtitle: "2 days left to keep your workspace.", bodyHtml, bodyText, ctaText: "Choose your plan", ctaUrl: `${appUrl}/settings/billing`, unsubscribeUrl });
      return { subject: "Your LIT trial is ending soon", html, text };
    }
    case "paid_plan_welcome": {
      // Pro tip differs slightly per plan; for starter, point them at
      // a concrete revenue-opportunity workflow.
      const tip = planSlug === "starter"
        ? `On your next call: open a shipper profile, switch to the <strong>Revenue Opportunity</strong> tab, and walk in with a real $ figure. "I see you're spending ~$2M annually on ocean — let's talk" lands very differently than "do you have any freight?"`
        : `Run a Pulse AI brief on every prospect <strong>before</strong> you call them. The 30 seconds you spend pays back in a much better first conversation.`;
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Your <strong>${esc(plan.nameWithIcon)}</strong> plan is active. Everything from your trial — saved companies, search history, Pulse briefs, contacts — carries over unchanged.</p><p style="margin:0 0 8px 0;font-weight:700;color:${COLOR.text};text-align:left;">What's now in your workspace:</p>${benefitsHtml(plan.benefits)}${proTipHtml(tip)}<p style="margin:24px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">Questions about your plan? Reply here — you'll reach our team directly. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour ${plan.nameWithIcon} plan is active. Everything from your trial — saved companies, search history, Pulse briefs, contacts — carries over unchanged.\n\nWhat's now in your workspace:\n\n${benefitsText(plan.benefits)}\n\nPRO TIP: ${tip.replace(/<[^>]+>/g, "")}\n\nQuestions about your plan? Reply here — you'll reach our team directly. — Gabriel`;
      const { html, text } = buildLayout({ previewText: `Your ${plan.name} workspace is ready.`, headline: name === "there" ? `Welcome to ${plan.nameWithIcon}.` : `Welcome to ${plan.nameWithIcon}${nameSuffix}.`, subtitle: "Your freight intelligence workspace is live.", bodyHtml, bodyText, ctaText: plan.primaryCta, ctaUrl: `${appUrl}${plan.primaryPath}`, unsubscribeUrl });
      return { subject: `You're on LIT ${plan.name} — here's what's new`, html, text };
    }
    case "upgrade_confirmation": {
      const fromPhrase = payload.previous_plan_name ? ` from ${payload.previous_plan_name}` : "";
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Your upgrade${esc(fromPhrase)} to <strong>${esc(plan.nameWithIcon)}</strong> is confirmed. New features and limits are live in your account now.</p><p style="margin:0 0 8px 0;font-weight:700;color:${COLOR.text};text-align:left;">What's included in ${esc(plan.nameWithIcon)}:</p>${benefitsHtml(plan.benefits)}<p style="margin:24px 0 18px 0;text-align:left;">All your existing data — saved companies, Pulse briefs, contacts, campaign history — stays intact.</p><p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">If anything isn't working as expected, reply here. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour upgrade${fromPhrase} to ${plan.nameWithIcon} is confirmed. New features and limits are live in your account now.\n\nWhat's included in ${plan.nameWithIcon}:\n\n${benefitsText(plan.benefits)}\n\nAll your existing data — saved companies, Pulse briefs, contacts, campaign history — stays intact.\n\nIf anything isn't working as expected, reply here. — Gabriel`;
      const { html, text } = buildLayout({ previewText: "Your new features are live.", headline: `You're now on ${plan.nameWithIcon}.`, subtitle: "New features and limits are live.", bodyHtml, bodyText, ctaText: "Explore your new features", ctaUrl: `${appUrl}${plan.primaryPath}`, unsubscribeUrl });
      return { subject: "Your LIT plan has been upgraded", html, text };
    }
    case "payment_failed": {
      const planDisplay = payload.plan_name || plan.name;
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">Your most recent payment for <strong>${esc(planDisplay)}</strong> didn't go through. To avoid losing access to your saved companies, contact enrichments, and Pulse AI history, please update your payment method as soon as possible.</p><p style="margin:0 0 18px 0;text-align:left;">We'll retry automatically every few days. If you've changed cards or banks recently, that's the most common cause — updating your payment method in Billing usually resolves it immediately.</p><p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">P.S. If something's changed on your side or you'd like to pause your subscription, just hit reply. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour most recent payment for ${planDisplay} didn't go through. To avoid losing access to your saved companies, contact enrichments, and Pulse AI history, please update your payment method as soon as possible.\n\nWe'll retry automatically every few days. If you've changed cards or banks recently, that's the most common cause — updating your payment method in Billing usually resolves it immediately.\n\nP.S. If something's changed on your side or you'd like to pause your subscription, just hit reply. — Gabriel`;
      const { html, text } = buildLayout({ previewText: "Action needed to keep your LIT workspace active.", headline: "Your payment didn't go through.", subtitle: "Update your card to keep your workspace active.", bodyHtml, bodyText, ctaText: "Update payment method", ctaUrl: `${appUrl}/settings/billing`, unsubscribeUrl });
      return { subject: "Heads up — your LIT payment didn't go through", html, text };
    }
    case "cancellation_confirmation": {
      const planDisplay = payload.plan_name || plan.name;
      const periodEnd = payload.period_end || "the end of your billing period";
      const bodyHtml = `<p style="margin:0 0 18px 0;text-align:left;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;text-align:left;">We've cancelled your <strong>${esc(planDisplay)}</strong> subscription as requested. You can keep using LIT through your current billing period (until ${esc(periodEnd)}).</p><p style="margin:0 0 18px 0;text-align:left;">After that, your account moves to read-only — your saved companies and Pulse history stay, but search, enrichment, and campaigns gate until you reactivate.</p><p style="margin:0 0 18px 0;text-align:left;">If you change your mind, you can reactivate any time from Settings → Billing.</p><p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;text-align:left;">P.S. Curious — if there's a specific reason, would you mind hitting reply and telling me? Honest answers help us a lot. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nWe've cancelled your ${planDisplay} subscription as requested. You can keep using LIT through your current billing period (until ${periodEnd}).\n\nAfter that, your account moves to read-only — your saved companies and Pulse history stay, but search, enrichment, and campaigns gate until you reactivate.\n\nIf you change your mind, you can reactivate any time from Settings → Billing.\n\nP.S. Curious — if there's a specific reason, would you mind hitting reply and telling me? Honest answers help us a lot. — Gabriel`;
      const { html, text } = buildLayout({ previewText: `You have access until ${periodEnd}.`, headline: "Your subscription has been cancelled.", subtitle: `You have access until ${periodEnd}.`, bodyHtml, bodyText, ctaText: "Reactivate plan", ctaUrl: `${appUrl}/settings/billing`, unsubscribeUrl });
      return { subject: "Your LIT subscription has been cancelled", html, text };
    }
    default: { const _exhaustive: never = eventType; throw new Error(`Unknown event_type: ${_exhaustive}`); }
  }
}

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
  } catch { return false; }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("LIT_RESEND_API_KEY");
  const appUrl = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");
  const siteUrl = (Deno.env.get("LIT_SITE_URL") ?? "https://www.logisticintel.com").replace(/\/+$/, "");
  const fromEmail = Deno.env.get("LIT_EMAIL_FROM") ?? "Gabriel from LIT <hello@updates.logisticintel.com>";
  const replyTo = Deno.env.get("LIT_EMAIL_REPLY_TO") ?? "hello@logisticintel.com";
  if (!(await isAuthorized(req, serviceRoleKey))) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  let body: SendPayload; try { body = await req.json(); } catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } }); }
  const { recipient_email, event_type } = body;
  if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) return new Response(JSON.stringify({ ok: false, error: "Invalid recipient_email" }), { status: 400, headers: { "Content-Type": "application/json" } });
  if (!VALID_EVENT_TYPES.includes(event_type)) return new Response(JSON.stringify({ ok: false, error: `Invalid event_type: ${event_type}` }), { status: 400, headers: { "Content-Type": "application/json" } });
  const planSlug = normalizePlanSlug(body.plan_slug);
  const db = createClient(supabaseUrl, serviceRoleKey);
  const { data: unsub } = await db.from("lit_email_unsubscribes").select("id").eq("recipient_email", recipient_email.toLowerCase()).maybeSingle();
  if (unsub) return new Response(JSON.stringify({ ok: true, skipped: true, reason: "unsubscribed" }), { headers: { "Content-Type": "application/json" } });
  if (!body.force) {
    const { data: existing } = await db.from("lit_email_automation_events").select("id").eq("event_type", event_type).eq("plan_slug", planSlug).eq("status", "sent").eq(body.user_id ? "user_id" : "recipient_email", body.user_id ?? recipient_email.toLowerCase()).maybeSingle();
    if (existing) return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent", existing_id: existing.id }), { headers: { "Content-Type": "application/json" } });
  }
  const emailToken = btoa(recipient_email.toLowerCase()).replace(/=/g, "");
  const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(recipient_email.toLowerCase())}&token=${emailToken}`;
  let emailResult: { subject: string; html: string; text: string };
  try { emailResult = buildEmail(event_type, { ...body, plan_slug: planSlug }, appUrl, unsubscribeUrl); } catch (err) { return new Response(JSON.stringify({ ok: false, error: `Template build failed: ${err instanceof Error ? err.message : String(err)}` }), { status: 500, headers: { "Content-Type": "application/json" } }); }
  const { subject, html, text } = emailResult;
  const listUnsubscribeHeader = `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=Unsubscribe>`;
  let resendEmailId: string | null = null;
  let sendStatus: "sent" | "failed" = "failed";
  let errorMessage: string | null = null;
  if (!resendKey) { errorMessage = "LIT_RESEND_API_KEY not configured"; }
  else {
    try {
      const resp = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: fromEmail, to: [recipient_email], reply_to: replyTo, subject, html, text, headers: { "List-Unsubscribe": listUnsubscribeHeader, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, tags: [{ name: "event_type", value: event_type }, { name: "plan_slug", value: planSlug }] }) });
      const respJson: any = await resp.json().catch(() => ({}));
      if (resp.ok) { resendEmailId = (respJson?.id as string | null) ?? null; sendStatus = "sent"; }
      else { errorMessage = String(respJson?.message || respJson?.name || respJson?.error || resp.status).slice(0, 500); }
    } catch (err) { errorMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500); }
  }
  const { data: eventRow } = await db.from("lit_email_automation_events").insert({ user_id: body.user_id ?? null, org_id: body.org_id ?? null, subscription_id: body.subscription_id ?? null, plan_slug: planSlug, event_type, resend_email_id: resendEmailId, recipient_email: recipient_email.toLowerCase(), subject, status: sendStatus, error_message: errorMessage, payload_json: { first_name: body.first_name, plan_slug: planSlug, event_type, trial_ends_date: body.trial_ends_date, previous_plan_name: body.previous_plan_name, period_end: body.period_end, plan_name: body.plan_name } }).select("id").single();
  if (sendStatus === "sent") return new Response(JSON.stringify({ ok: true, resend_email_id: resendEmailId, event_id: eventRow?.id ?? null }), { headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ ok: false, error: errorMessage, event_id: eventRow?.id ?? null }), { status: 500, headers: { "Content-Type": "application/json" } });
});
