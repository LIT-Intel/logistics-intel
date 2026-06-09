// Reverse-engineered from deployed v9 of send-subscription-email on
// 2026-06-09 (drift audit found this hand-minified version live in
// production with the Gabriel sender override + SALES_FROM features
// that the older git v7 source lacked). Reformatted to multi-line
// for readability; behavior verified line-by-line against deployed
// EZBR sha256 ef5419e6cdcdde56de6d4a0f4e244f960fb66c75bb0c892778cad8670d88fb21.
//
// v9 — Gabriel sender across ALL events (no Valesco). Per-event sender
// override still lets book-demo + check-in route through sales@ for
// reply tracking.

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
  | "trial_book_demo"
  | "trial_check_in_inactive"
  | "paid_plan_welcome"
  | "upgrade_confirmation"
  | "payment_failed"
  | "cancellation_confirmation";

const VALID_EVENT_TYPES: EventType[] = [
  "trial_welcome",
  "trial_day_2_activation",
  "trial_day_3_founder_note",
  "trial_tip_pulse_ai",
  "trial_tip_contact_enrichment",
  "trial_tip_revenue_opportunity",
  "trial_ending_soon",
  "trial_book_demo",
  "trial_check_in_inactive",
  "paid_plan_welcome",
  "upgrade_confirmation",
  "payment_failed",
  "cancellation_confirmation",
];

// Sales-routed sender for book-demo + check-in. Display name = Gabriel
// (per user preference: no Valesco on any outbound). Replies go to
// sales@ inbox not hello@.
const SALES_FROM =
  Deno.env.get("LIT_SALES_FROM") ?? "Gabriel from LIT <sales@logisticintel.com>";
const SALES_REPLY_TO = Deno.env.get("LIT_SALES_REPLY_TO") ?? "sales@logisticintel.com";
const CAL_15MIN = "https://cal.com/logisticintel/15min";
const CAL_30MIN = "https://cal.com/logisticintel/30min";

interface SendPayload {
  user_id?: string;
  org_id?: string;
  subscription_id?: string;
  recipient_email: string;
  first_name?: string;
  plan_slug: string;
  event_type: EventType;
  force?: boolean;
  trial_ends_date?: string;
  previous_plan_name?: string;
  period_end?: string;
  plan_name?: string;
}

interface PlanEmailCopy {
  name: string;
  nameWithIcon: string;
  benefits: string[];
  primaryCta: string;
  primaryPath: string;
}

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
    nameWithIcon: "Free Trial",
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
    nameWithIcon: "Starter",
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
    nameWithIcon: "Growth 🚀",
    benefits: [
      "350 shipper searches per month and 350 saves to Command Center",
      "100 Pulse AI briefs and 100 Pulse lookalike searches per month",
      "150 contact enrichments per month with verified emails",
      "1,000 active campaign recipients across your team",
      "3 team seats with 3 connected mailboxes",
      "Lead prospecting and team analytics",
      "Saved Pulse lists for industry segmentation",
    ],
    primaryCta: "Invite your team",
    primaryPath: "/settings/team",
  },
  scale: {
    name: "Scale",
    nameWithIcon: "Scale",
    benefits: [
      "1,000 shipper searches and 1,000 saves per month",
      "500 Pulse AI briefs and 500 Pulse lookalike searches per month",
      "500 contact enrichments per month with verified emails",
      "5 team seats with 5 connected mailboxes",
      "2,500 active campaign recipients",
      "Credit-rating ready and contact intelligence ready datasets",
      "Saved Pulse lists, lead prospecting, and full team analytics",
    ],
    primaryCta: "Open your workspace",
    primaryPath: "/dashboard",
  },
  enterprise: {
    name: "Enterprise",
    nameWithIcon: "Enterprise",
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

const FONT_BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const LIT_ICON_URL =
  "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";
const COLOR = {
  text: "#0F172A",
  textSubtle: "#475569",
  textMuted: "#94A3B8",
  divider: "#E2E8F0",
  ctaBg: "#2563EB",
  ctaBgDark: "#1E40AF",
  ctaText: "#FFFFFF",
  bg: "#FFFFFF",
  pageBg: "#F1F5F9",
  heroBg: "#0A1024",
  brandBlue: "#2563EB",
  tipBg: "#EFF6FF",
  tipBorder: "#DBEAFE",
  tipLabel: "#1E40AF",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function benefitsHtml(benefits: string[]): string {
  const rows = benefits
    .map(
      (b) =>
        `<tr><td valign="top" style="padding:6px 14px 6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.4;color:${COLOR.brandBlue};font-weight:700;width:20px;">✓</td><td valign="top" style="padding:6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${esc(b)}</td></tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 0 0;width:auto;">${rows}</table>`;
}

function benefitsText(benefits: string[]): string {
  return benefits.map((b) => `  ✓ ${b}`).join("\n");
}

function proTipHtml(tipText: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:24px 0 0 0;width:100%;"><tr><td bgcolor="${COLOR.tipBg}" style="background-color:${COLOR.tipBg};border:1px solid ${COLOR.tipBorder};border-radius:12px;padding:16px 20px;"><div style="font-family:${FONT_BODY};font-size:11px;font-weight:700;color:${COLOR.tipLabel};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Pro tip</div><div style="font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR.text};">${tipText}</div></td></tr></table>`;
}

interface LayoutContext {
  previewText: string;
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
  const subtitleBlock = opts.subtitle
    ? `<p style="margin:0;font-family:${FONT_BODY};font-size:18px;font-weight:500;line-height:1.4;color:${COLOR.textSubtle};text-align:left;">${esc(opts.subtitle)}</p>`
    : "";
  const ctaBlock = `<tr><td style="padding:8px 40px 36px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${COLOR.ctaBg}" valign="middle" style="background-color:${COLOR.ctaBg};border-radius:10px;mso-padding-alt:16px 32px;border-bottom:2px solid ${COLOR.ctaBgDark};"><a href="${opts.ctaUrl}" target="_blank" style="display:inline-block;padding:16px 32px;font-family:${FONT_BODY};font-size:16px;font-weight:600;color:${COLOR.ctaText};text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">${esc(opts.ctaText)} →</a></td></tr></table></td></tr>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(opts.headline)}</title></head><body style="margin:0;padding:0;background-color:${COLOR.pageBg};color:${COLOR.text};font-family:${FONT_BODY};">${previewBlock}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLOR.pageBg}" style="background-color:${COLOR.pageBg};border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="${COLOR.bg}" style="max-width:600px;width:100%;background-color:${COLOR.bg};border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);">${heroBlock}<tr><td style="padding:36px 40px 4px 40px;"><h1 style="margin:0 0 8px 0;font-family:${FONT_BODY};font-size:30px;font-weight:800;color:${COLOR.text};line-height:1.18;letter-spacing:-0.02em;text-align:left;">${esc(opts.headline)}</h1>${subtitleBlock}</td></tr><tr><td style="padding:24px 40px 8px 40px;font-family:${FONT_BODY};font-size:16px;line-height:1.65;color:${COLOR.text};text-align:left;">${opts.bodyHtml}</td></tr>${ctaBlock}<tr><td style="padding:0 40px;"><div style="height:1px;background-color:${COLOR.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:24px 40px 32px 40px;font-family:${FONT_BODY};font-size:13px;line-height:1.7;color:${COLOR.textMuted};text-align:left;"><span style="color:${COLOR.textSubtle};font-weight:600;">Logistics Intel</span> — freight revenue intelligence for logistics sales teams.<br/>You are receiving this because you signed up for a LIT account.<br/><a href="${opts.unsubscribeUrl}" style="color:${COLOR.textMuted};text-decoration:underline;">Unsubscribe</a> &middot; <a href="mailto:hello@logisticintel.com" style="color:${COLOR.textMuted};text-decoration:underline;">hello@logisticintel.com</a></td></tr></table></td></tr></table></body></html>`;
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
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
  return { html, text };
}

function buildEmail(
  eventType: EventType,
  payload: SendPayload,
  appUrl: string,
  unsubscribeUrl: string,
): {
  subject: string;
  html: string;
  text: string;
  fromOverride?: string;
  replyToOverride?: string;
} {
  const planSlug = normalizePlanSlug(payload.plan_slug);
  const plan = PLAN_EMAIL_COPY[planSlug];
  const name = payload.first_name?.trim() || "there";
  const nameSuffix = name === "there" ? "" : `, ${name}`;
  switch (eventType) {
    case "trial_welcome": {
      const tip = `Run a Pulse AI brief on a prospect <strong>before</strong> your next sales call. 30 seconds of context beats 30 minutes of generic outreach.`;
      const bodyHtml = `<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;">You're in. For the next 14 days you have access to the same shipper intelligence freight teams use to stop selling to dead lists — no credit card required.</p><p style="margin:0 0 8px 0;font-weight:700;color:${COLOR.text};">What you can do today:</p>${benefitsHtml(plan.benefits)}${proTipHtml(tip)}<p style="margin:24px 0 18px 0;">The 5-minute test: pick a shipper your team already sells to, search them in LIT, and walk through their full supply chain history.</p><p style="margin:0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;">P.S. Hit reply if anything's unclear — I read every one. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYou're in. For the next 14 days you have access to the same shipper intelligence freight teams use to stop selling to dead lists — no credit card required.\n\nWhat you can do today:\n\n${benefitsText(plan.benefits)}\n\nPRO TIP: Run a Pulse AI brief on a prospect BEFORE your next sales call.\n\nP.S. Hit reply if anything's unclear — I read every one. — Gabriel`;
      const { html, text } = buildLayout({
        previewText: "14 days. No credit card required.",
        headline: name === "there" ? "Welcome to LIT." : `Welcome${nameSuffix}.`,
        subtitle: "Your trial is live for 14 days.",
        bodyHtml,
        bodyText,
        ctaText: plan.primaryCta,
        ctaUrl: `${appUrl}${plan.primaryPath}`,
        unsubscribeUrl,
      });
      return { subject: "You're in — your LIT trial is live", html, text };
    }
    case "trial_day_2_activation": {
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Most trials get five minutes of attention then forgotten. Don't let yours.</p><p style="font-weight:700;">A 10-minute workflow:</p><ol><li>Search a known shipper in your target lane.</li><li>Open their company profile. Walk through shipment history, lanes, and carrier mix.</li><li>Run a Pulse AI brief.</li><li>Enrich a contact at the company.</li></ol><p>— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nMost trials get five minutes of attention then forgotten. Don't let yours.\n\n1. Search a known shipper.\n2. Open their company profile.\n3. Run a Pulse AI brief.\n4. Enrich a contact.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: "A 10-minute workflow.",
        headline: "Test LIT in 10 minutes.",
        subtitle: "The workflow that gets to value fastest.",
        bodyHtml,
        bodyText,
        ctaText: "Open your dashboard",
        ctaUrl: `${appUrl}/dashboard`,
        unsubscribeUrl,
      });
      return { subject: "How to test LIT in 10 minutes", html, text };
    }
    case "trial_day_3_founder_note": {
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Gabriel here — founder of LIT. A few days into your trial, the most useful thing you can do is pick ONE shipper your team already knows, walk through their LIT profile, and notice what's there.</p><p>If LIT isn't clicking yet, hit reply. I read every one.</p><p>— Gabriel<br/><span style="color:${COLOR.textSubtle};">Founder, Logistic Intel</span></p>`;
      const bodyText = `Hi ${name},\n\nGabriel here — founder of LIT. Pick ONE shipper your team already knows, walk through their LIT profile.\n\nIf LIT isn't clicking yet, hit reply.\n\n— Gabriel\nFounder, Logistic Intel`;
      const { html, text } = buildLayout({
        previewText: "A note from the founder.",
        headline: "How I'd use LIT if I were you.",
        bodyHtml,
        bodyText,
        ctaText: "Open LIT",
        ctaUrl: `${appUrl}/dashboard`,
        unsubscribeUrl,
        showHeroBanner: false,
      });
      return { subject: "How I'd use LIT if I were you", html, text };
    }
    case "trial_tip_pulse_ai": {
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Top freight reps don't show up cold. They show up <strong>informed</strong>. Pulse AI gives you a 30-second brief on any shipper before you call.</p>${proTipHtml(`Most reps research <em>after</em> the call. Top reps research <em>before</em>.`)}<p>— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nTop freight reps don't show up cold. They show up informed. Pulse AI gives you a 30-second brief on any shipper before you call.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: "30-second prep.",
        headline: "30-second prep, not 30-minute prep.",
        bodyHtml,
        bodyText,
        ctaText: "Open Pulse AI",
        ctaUrl: `${appUrl}/dashboard`,
        unsubscribeUrl,
      });
      return {
        subject: "How top reps prep for sales calls in 30 seconds",
        html,
        text,
      };
    }
    case "trial_tip_contact_enrichment": {
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>A bouncing email isn't just a wasted send. It's a small mark against your sender reputation.</p><p>Save 2–3 shippers you want to call. Click <strong>Enrich</strong> on the VP / Director of Logistics. You get a verified email + role + LinkedIn. 95%+ deliverability.</p>${proTipHtml(`10 verified contacts beat 100 stale ones.`)}<p>— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nA bouncing email isn't just a wasted send.\n\n10 verified beat 100 stale.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: "Stop sending to bouncing emails.",
        headline: "Better contacts, fewer bounces.",
        bodyHtml,
        bodyText,
        ctaText: "Try contact enrichment",
        ctaUrl: `${appUrl}/dashboard`,
        unsubscribeUrl,
      });
      return { subject: "Stop sending to bouncing emails", html, text };
    }
    case "trial_tip_revenue_opportunity": {
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Reps who quote rates lose deals. Reps who quote <strong>opportunity</strong> win them.</p><p>Open any shipper profile and click the <strong>Revenue Opportunity</strong> tab to see estimated annual freight spend by service line.</p>${proTipHtml(`"I see you're spending ~$2.4M annually on ocean — let's talk about taking 30% of that" lands very differently than "do you have any freight to quote?"`)}<p>— Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nReps who quote rates lose deals.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: "Lead with revenue.",
        headline: "Show up with their number.",
        bodyHtml,
        bodyText,
        ctaText: "Open a shipper profile",
        ctaUrl: `${appUrl}/dashboard`,
        unsubscribeUrl,
      });
      return { subject: "Lead with revenue, not capacity", html, text };
    }
    case "trial_ending_soon": {
      const endsPhrase = payload.trial_ends_date
        ? ` on ${payload.trial_ends_date}`
        : " in 2 days";
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Your LIT trial ends${esc(endsPhrase)}. After that, your saved companies, contact enrichments, and Pulse AI briefs are locked until you choose a plan.</p><p>Starter is $125/mo. Growth 🚀 is $499/mo for up to 3 reps.</p><p style="font-style:italic;color:${COLOR.textSubtle};font-size:14px;">Not ready? Reply and tell me what's holding you back. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour LIT trial ends${endsPhrase}.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: "Keep your workspace active.",
        headline: "Your trial is ending soon.",
        bodyHtml,
        bodyText,
        ctaText: "Choose your plan",
        ctaUrl: `${appUrl}/settings/billing`,
        unsubscribeUrl,
      });
      return { subject: "Your LIT trial is ending soon", html, text };
    }
    case "trial_book_demo": {
      const bodyHtml = `<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;">You've been exploring LIT for a few days. The fastest way to see what it can do for <strong>your</strong> specific accounts is a 15-minute walkthrough — I'll pull up the shippers you've already searched and show you the patterns most people miss on their own.</p><p style="margin:0 0 18px 0;">No slides, no pitch. Just your accounts and the parts of LIT that actually move the needle for them.</p>${proTipHtml(`Bring 2-3 target shipper names. We'll walk through their full freight footprint, revenue opportunity, and decision-maker map together — and you'll leave with a ready-to-call list.`)}<p style="margin:24px 0 18px 0;">Pick a time that works:</p><p style="margin:6px 0;">→ <a href="${CAL_15MIN}" style="color:${COLOR.brandBlue};font-weight:600;text-decoration:none;">15-minute walkthrough</a> &nbsp;(recommended)</p><p style="margin:6px 0;">→ <a href="${CAL_30MIN}" style="color:${COLOR.brandBlue};font-weight:600;text-decoration:none;">30-minute deep dive</a> &nbsp;(if you want to whiteboard a campaign)</p><p style="margin:18px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;">— Gabriel<br/>Logistic Intel</p>`;
      const bodyText = `Hi ${name},\n\nYou've been exploring LIT for a few days. The fastest way to see what it can do for YOUR specific accounts is a 15-minute walkthrough.\n\nNo slides, no pitch.\n\nPRO TIP: Bring 2-3 target shipper names.\n\n→ 15-minute walkthrough (recommended): ${CAL_15MIN}\n→ 30-minute deep dive: ${CAL_30MIN}\n\n— Gabriel\nLogistic Intel`;
      const { html, text } = buildLayout({
        previewText: "15-minute walkthrough of YOUR accounts.",
        headline: "Want me to walk you through it?",
        subtitle: "15 minutes, your accounts, no slides.",
        bodyHtml,
        bodyText,
        ctaText: "Book 15 minutes",
        ctaUrl: CAL_15MIN,
        unsubscribeUrl,
        showHeroBanner: false,
      });
      return {
        subject: "Quick 15-min walkthrough of LIT?",
        html,
        text,
        fromOverride: SALES_FROM,
        replyToOverride: SALES_REPLY_TO,
      };
    }
    case "trial_check_in_inactive": {
      const bodyHtml = `<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p><p style="margin:0 0 18px 0;">Noticed you haven't been back to LIT in a couple of days. Want to make sure you didn't run into something blocking you — most people get stuck on one of three things:</p><ol style="margin:0 0 18px 0;padding-left:24px;"><li style="margin:6px 0;">Not sure which company to search first.</li><li style="margin:6px 0;">The interface isn't clicking yet.</li><li style="margin:6px 0;">Wondering whether LIT actually fits your specific lanes / mode / customer mix.</li></ol><p style="margin:0 0 18px 0;">Whatever it is, 15 minutes with me would unblock it. I'll screen-share, you bring your real target accounts, and we'll see if LIT is the right fit together.</p><p style="margin:0 0 18px 0;"><a href="${CAL_15MIN}" style="color:${COLOR.brandBlue};font-weight:600;text-decoration:none;">→ Grab 15 minutes on my calendar</a></p><p style="margin:0 0 0 0;">Or just reply to this email with what's blocking you — I read every reply personally.</p><p style="margin:18px 0 0 0;font-style:italic;color:${COLOR.textSubtle};font-size:14px;">— Gabriel<br/>Logistic Intel</p>`;
      const bodyText = `Hi ${name},\n\nNoticed you haven't been back to LIT in a couple of days.\n\nMost people get stuck on:\n1. Not sure which company to search first.\n2. The interface isn't clicking yet.\n3. Wondering whether LIT fits your lanes/mode/customer mix.\n\n15 minutes with me would unblock it.\n\n→ Grab 15 minutes: ${CAL_15MIN}\n\nOr just reply.\n\n— Gabriel\nLogistic Intel`;
      const { html, text } = buildLayout({
        previewText: "What's blocking you in LIT?",
        headline: "Stuck somewhere?",
        subtitle: "Let's unblock it in 15 minutes.",
        bodyHtml,
        bodyText,
        ctaText: "Book 15 minutes",
        ctaUrl: CAL_15MIN,
        unsubscribeUrl,
        showHeroBanner: false,
      });
      return {
        subject: "Stuck somewhere in LIT?",
        html,
        text,
        fromOverride: SALES_FROM,
        replyToOverride: SALES_REPLY_TO,
      };
    }
    case "paid_plan_welcome": {
      const tip =
        planSlug === "starter"
          ? `Open a shipper profile → Revenue Opportunity tab. Walk in with a real $ figure.`
          : `Run a Pulse AI brief on every prospect <strong>before</strong> you call them.`;
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Your <strong>${esc(plan.nameWithIcon)}</strong> plan is active.</p>${benefitsHtml(plan.benefits)}${proTipHtml(tip)}<p style="font-style:italic;color:${COLOR.textSubtle};font-size:14px;">Questions? Reply here. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour ${plan.nameWithIcon} plan is active.\n\n${benefitsText(plan.benefits)}\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: `Your ${plan.name} workspace is ready.`,
        headline:
          name === "there"
            ? `Welcome to ${plan.nameWithIcon}.`
            : `Welcome to ${plan.nameWithIcon}${nameSuffix}.`,
        bodyHtml,
        bodyText,
        ctaText: plan.primaryCta,
        ctaUrl: `${appUrl}${plan.primaryPath}`,
        unsubscribeUrl,
      });
      return {
        subject: `You're on LIT ${plan.name} — here's what's new`,
        html,
        text,
      };
    }
    case "upgrade_confirmation": {
      const fromPhrase = payload.previous_plan_name
        ? ` from ${payload.previous_plan_name}`
        : "";
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Your upgrade${esc(fromPhrase)} to <strong>${esc(plan.nameWithIcon)}</strong> is confirmed.</p>${benefitsHtml(plan.benefits)}<p style="font-style:italic;color:${COLOR.textSubtle};font-size:14px;">Reply if anything isn't working. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour upgrade to ${plan.nameWithIcon} is confirmed.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: "Your new features are live.",
        headline: `You're now on ${plan.nameWithIcon}.`,
        bodyHtml,
        bodyText,
        ctaText: "Explore your new features",
        ctaUrl: `${appUrl}${plan.primaryPath}`,
        unsubscribeUrl,
      });
      return { subject: "Your LIT plan has been upgraded", html, text };
    }
    case "payment_failed": {
      const planDisplay = payload.plan_name || plan.name;
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>Your most recent payment for <strong>${esc(planDisplay)}</strong> didn't go through. Please update your payment method to avoid losing access.</p><p style="font-style:italic;color:${COLOR.textSubtle};font-size:14px;">P.S. If something's changed, just hit reply. — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nYour payment for ${planDisplay} didn't go through. Update your payment method.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: "Action needed.",
        headline: "Your payment didn't go through.",
        bodyHtml,
        bodyText,
        ctaText: "Update payment method",
        ctaUrl: `${appUrl}/settings/billing`,
        unsubscribeUrl,
      });
      return {
        subject: "Heads up — your LIT payment didn't go through",
        html,
        text,
      };
    }
    case "cancellation_confirmation": {
      const planDisplay = payload.plan_name || plan.name;
      const periodEnd = payload.period_end || "the end of your billing period";
      const bodyHtml = `<p>Hi ${esc(name)},</p><p>We've cancelled your <strong>${esc(planDisplay)}</strong> subscription. Access until ${esc(periodEnd)}.</p><p style="font-style:italic;color:${COLOR.textSubtle};font-size:14px;">P.S. Mind hitting reply and telling me why? — Gabriel</p>`;
      const bodyText = `Hi ${name},\n\nCancelled. Access until ${periodEnd}.\n\n— Gabriel`;
      const { html, text } = buildLayout({
        previewText: `Access until ${periodEnd}.`,
        headline: "Your subscription has been cancelled.",
        bodyHtml,
        bodyText,
        ctaText: "Reactivate plan",
        ctaUrl: `${appUrl}/settings/billing`,
        unsubscribeUrl,
      });
      return {
        subject: "Your LIT subscription has been cancelled",
        html,
        text,
      };
    }
    default: {
      const _exhaustive: never = eventType;
      throw new Error(`Unknown event_type: ${_exhaustive}`);
    }
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
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    const role =
      payload?.app_metadata?.role ?? payload?.user_metadata?.role ?? "";
    return role === "admin" || role === "super_admin";
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("LIT_RESEND_API_KEY");
  const appUrl = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");
  const siteUrl = (Deno.env.get("LIT_SITE_URL") ?? "https://www.logisticintel.com").replace(/\/+$/, "");
  const fromEmail =
    Deno.env.get("LIT_EMAIL_FROM") ??
    "Gabriel from LIT <hello@updates.logisticintel.com>";
  const replyTo = Deno.env.get("LIT_EMAIL_REPLY_TO") ?? "hello@logisticintel.com";
  if (!(await isAuthorized(req, serviceRoleKey))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  let body: SendPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { recipient_email, event_type } = body;
  if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid recipient_email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!VALID_EVENT_TYPES.includes(event_type)) {
    return new Response(
      JSON.stringify({ ok: false, error: `Invalid event_type: ${event_type}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const planSlug = normalizePlanSlug(body.plan_slug);
  const db = createClient(supabaseUrl, serviceRoleKey);
  const { data: unsub } = await db
    .from("lit_email_unsubscribes")
    .select("id")
    .eq("recipient_email", recipient_email.toLowerCase())
    .maybeSingle();
  if (unsub) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "unsubscribed" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  if (!body.force) {
    const { data: existing } = await db
      .from("lit_email_automation_events")
      .select("id")
      .eq("event_type", event_type)
      .eq("plan_slug", planSlug)
      .eq("status", "sent")
      .eq(
        body.user_id ? "user_id" : "recipient_email",
        body.user_id ?? recipient_email.toLowerCase(),
      )
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "already_sent",
          existing_id: existing.id,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
  }
  const emailToken = btoa(recipient_email.toLowerCase()).replace(/=/g, "");
  const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(recipient_email.toLowerCase())}&token=${emailToken}`;
  let emailResult: {
    subject: string;
    html: string;
    text: string;
    fromOverride?: string;
    replyToOverride?: string;
  };
  try {
    emailResult = buildEmail(
      event_type,
      { ...body, plan_slug: planSlug },
      appUrl,
      unsubscribeUrl,
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Template build failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const { subject, html, text } = emailResult;
  const effectiveFrom = emailResult.fromOverride ?? fromEmail;
  const effectiveReplyTo = emailResult.replyToOverride ?? replyTo;
  const listUnsubscribeHeader = `<${unsubscribeUrl}>, <mailto:${effectiveReplyTo}?subject=Unsubscribe>`;
  let resendEmailId: string | null = null;
  let sendStatus: "sent" | "failed" = "failed";
  let errorMessage: string | null = null;
  if (!resendKey) {
    errorMessage = "LIT_RESEND_API_KEY not configured";
  } else {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: effectiveFrom,
          to: [recipient_email],
          reply_to: effectiveReplyTo,
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
        errorMessage = String(
          respJson?.message || respJson?.name || respJson?.error || resp.status,
        ).slice(0, 500);
      }
    } catch (err) {
      errorMessage =
        err instanceof Error
          ? err.message.slice(0, 500)
          : String(err).slice(0, 500);
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
      payload_json: {
        first_name: body.first_name,
        plan_slug: planSlug,
        event_type,
        trial_ends_date: body.trial_ends_date,
        previous_plan_name: body.previous_plan_name,
        period_end: body.period_end,
        plan_name: body.plan_name,
      },
    })
    .select("id")
    .single();
  if (sendStatus === "sent") {
    return new Response(
      JSON.stringify({
        ok: true,
        resend_email_id: resendEmailId,
        event_id: eventRow?.id ?? null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({
      ok: false,
      error: errorMessage,
      event_id: eventRow?.id ?? null,
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
});
