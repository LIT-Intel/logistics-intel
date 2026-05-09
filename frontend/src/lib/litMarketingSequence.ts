// LIT Marketing · 14-day, 13-touch outbound sequence.
//
// Brand voice: consultative, freight-operator style. Not hype-driven.
// Tokens resolved at send time by the dispatcher's applyMergeVars helper.
//
// Token contract (send-time tokens — left untouched by resolveEmailTemplateHtml):
//   {{first_name}}    — recipient first name
//   {{last_name}}     — recipient last name
//   {{full_name}}     — recipient full name
//   {{company_name}}  — recipient company
//   {{top_lane}}      — top trade lane signal
//   {{sender_name}}   — sender first name
//   {{phone}}         — sender phone
//
// Insert-time tokens (resolved by resolveEmailTemplateHtml before persisting):
//   {{company_intelligence_public_url}}
//   {{contact_discovery_public_url}}
//   {{pulse_ai_public_url}}
//   {{pulse_workflow_public_url}}
//   {{lane_signals_public_url}}

import type { EmailAssetKey } from "./emailAssets";

export type LitTouchKind =
  | "email"
  | "linkedin_invite"
  | "linkedin_message"
  | "call";

export interface LitMarketingTouch {
  /** Position in the 14-touch list (1-indexed). NOT a calendar day — use `calendarDay`. */
  touchIndex: number;
  /** Calendar day of the sequence (1-based). Some days have no touch (e.g. day 7). */
  calendarDay: number;
  /** Days gap from the previous non-wait touch. First touch is 0. */
  delayDays: number;
  kind: LitTouchKind;
  /** Label shown in the timeline. */
  title: string;
  // Email-only:
  subject?: string;
  previewText?: string;
  /** Raw HTML with {{*_public_url}} asset placeholders + send-time tokens. */
  html?: string;
  /** Which product visual the email features. */
  imageAssetKey?: EmailAssetKey;
  // Manual touchpoints (LinkedIn / call):
  /** Copy-paste script body shown in the inspector. */
  scriptMarkdown?: string;
  /** One-liner shown in the step inspector description. */
  description?: string;
  /** Send-time tokens the touch uses (for help text / preview). */
  tokensUsed: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// v7 design tokens — matches the deployed send-subscription-email layout.
// These are USER-COMPOSED outbound emails, NOT LIT subscription emails.
// The dark hero band uses {{sender_company_name}} as the wordmark so
// recipients see the sender's company, not "Logistic Intel".
// ─────────────────────────────────────────────────────────────────────────────

const _MKT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const _MKT_LIT_ICON = "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";
const _MKT_COLOR = {
  text: "#0F172A", textSubtle: "#475569", textMuted: "#94A3B8",
  divider: "#E2E8F0", ctaBg: "#2563EB", ctaBgDark: "#1E40AF", ctaText: "#FFFFFF",
  bg: "#FFFFFF", pageBg: "#F1F5F9", heroBg: "#0A1024",
  tipBg: "#EFF6FF", tipBorder: "#DBEAFE", tipLabel: "#1E40AF",
};

/**
 * v7 layout for outbound marketing emails.
 *
 * The hero band displays `{{sender_company_name}}` as the wordmark so
 * recipients see the sender's brand, not Logistic Intel. The LIT icon
 * is included as a small badge (38×38) — reps can swap it out in the
 * campaign builder by editing the HTML.
 *
 * Parameters:
 *   bodyHtml   — pre-built HTML body content (paragraphs, lists, etc.)
 *   ctaText    — button label
 *   ctaUrl     — button URL (send-time token OK, e.g. "https://www.logisticintel.com")
 *   previewText — inbox preview snippet (100 chars max)
 *   subjectLine — used for <title> only
 *   showProTip — wrap the last paragraph in the Pro Tip tinted card
 */
function wrapV7(opts: {
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  previewText: string;
  subjectLine: string;
  proTipHtml?: string;
}): string {
  const { bodyHtml, ctaText, ctaUrl, previewText, subjectLine, proTipHtml } = opts;

  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FFFFFF;mso-hide:all;">${previewText}${"&nbsp;&#847;".repeat(60)}</div>`;

  const heroBlock = `<tr><td bgcolor="${_MKT_COLOR.heroBg}" style="background-color:${_MKT_COLOR.heroBg};padding:28px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding-right:12px;"><img src="${_MKT_LIT_ICON}" width="38" height="38" alt="" style="display:block;width:38px;height:38px;border-radius:8px;border:0;outline:none;" /></td><td valign="middle" style="font-family:${_MKT_FONT};font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">{{sender_company_name}}</td></tr></table></td></tr>`;

  const proTipBlock = proTipHtml
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:20px 0 0 0;width:100%;"><tr><td bgcolor="${_MKT_COLOR.tipBg}" style="background-color:${_MKT_COLOR.tipBg};border:1px solid ${_MKT_COLOR.tipBorder};border-radius:12px;padding:16px 20px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:${_MKT_COLOR.tipLabel};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Pro tip</div><div style="font-family:${_MKT_FONT};font-size:15px;line-height:1.55;color:${_MKT_COLOR.text};">${proTipHtml}</div></td></tr></table>`
    : "";

  const ctaBlock = `<tr><td style="padding:8px 40px 36px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${_MKT_COLOR.ctaBg}" valign="middle" style="background-color:${_MKT_COLOR.ctaBg};border-radius:10px;mso-padding-alt:14px 28px;border-bottom:2px solid ${_MKT_COLOR.ctaBgDark};"><a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${_MKT_FONT};font-size:15px;font-weight:600;color:${_MKT_COLOR.ctaText};text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">${ctaText} →</a></td></tr></table></td></tr>`;

  return `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="X-UA-Compatible" content="IE=edge" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /><title>${subjectLine}</title><!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--></head><body style="margin:0;padding:0;background-color:${_MKT_COLOR.pageBg};color:${_MKT_COLOR.text};font-family:${_MKT_FONT};-webkit-font-smoothing:antialiased;">${previewBlock}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${_MKT_COLOR.pageBg}" style="background-color:${_MKT_COLOR.pageBg};border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="${_MKT_COLOR.bg}" style="max-width:600px;width:100%;background-color:${_MKT_COLOR.bg};border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);">${heroBlock}<tr><td style="padding:28px 40px 8px 40px;font-family:${_MKT_FONT};font-size:16px;line-height:1.65;color:${_MKT_COLOR.text};text-align:left;">${bodyHtml}${proTipBlock}</td></tr>${ctaBlock}<tr><td style="padding:0 40px;"><div style="height:1px;background-color:${_MKT_COLOR.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:20px 40px 28px 40px;font-family:${_MKT_FONT};font-size:13px;line-height:1.65;color:${_MKT_COLOR.textMuted};text-align:left;">{{sender_name}} · {{sender_company_name}}<br/>You received this because we thought our service might be a fit for {{company_name}}.</td></tr></table></td></tr></table></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML wrapper helpers (v7 — replaces old wrapWithImage / wrapPlainText)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Touch email with v7 layout. The old `imgPlaceholder` parameter is
 * removed — SVG hero images are replaced by the dark slate hero band.
 * The `proTipHtml` parameter optionally renders a tinted Pro Tip card
 * below the body paragraphs (used on touches 1, 3, 7).
 * The `ctaText`/`ctaUrl` parameters are optional overrides — defaults
 * to "Request a quick look" linking to logisticintel.com.
 */
function wrapWithImage(
  bodyHtml: string,
  _imgPlaceholder: string,
  _imgAlt: string,
  proTipHtml?: string,
  ctaText?: string,
  ctaUrl?: string,
): string {
  // imgPlaceholder / imgAlt parameters are kept in the signature for
  // backward compatibility with the existing call sites but are no
  // longer rendered — the v7 hero band replaces the SVG asset.
  return wrapV7({
    bodyHtml,
    ctaText: ctaText ?? "Request a quick look",
    ctaUrl: ctaUrl ?? "https://www.logisticintel.com",
    previewText: "",
    subjectLine: "",
    proTipHtml,
  });
}

function wrapPlainText(bodyHtml: string, proTipHtml?: string, ctaText?: string, ctaUrl?: string): string {
  return wrapV7({
    bodyHtml,
    ctaText: ctaText ?? "See how it works",
    ctaUrl: ctaUrl ?? "https://www.logisticintel.com",
    previewText: "",
    subjectLine: "",
    proTipHtml,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 14-day, 13-touch sequence
// ─────────────────────────────────────────────────────────────────────────────

export const LIT_MARKETING_14_TOUCH: LitMarketingTouch[] = [
  // ── Touch 1 · Day 1 · Email · Intro ──────────────────────────────────────
  {
    touchIndex: 1,
    calendarDay: 1,
    delayDays: 0,
    kind: "email",
    title: "Email · Intro",
    subject: "Built this for freight sales teams",
    previewText:
      "Stop prospecting from stale lists. Find shippers already moving freight.",
    imageAssetKey: "company_intelligence",
    tokensUsed: [
      "{{first_name}}",
      "{{company_name}}",
      "{{top_lane}}",
      "{{sender_name}}",
    ],
    html: wrapWithImage(
      `Hi {{first_name}},<br><br>
Most freight sales teams are still building prospect lists from generic databases, old importer lists, or referrals.<br><br>
The problem is that none of those tell your reps what really matters: who is actively shipping, where they are moving freight, how often they move it, and who to contact.<br><br>
Logistic Intel helps freight brokers and forwarders find qualified shippers using live Bill of Lading activity, lane signals, company intelligence, verified contacts, and outbound tools in one workspace.<br><br>
So instead of saying, "Do you have any freight we can quote?" your team can lead with context: "We noticed your import volume on {{top_lane}} has changed recently. Are you reviewing capacity or backup options?"<br><br>
Would it be worth a quick look at how this works on a few lanes your team already sells?<br><br>
Best,<br>{{sender_name}}`,
      "{{company_intelligence_public_url}}",
      "LIT Company Intelligence — active shipper profile",
      `The reps who book the most freight don't open with "any capacity?" — they open with a specific signal. "I saw your volume on {{top_lane}} shifted last quarter. We handle that lane." That's the conversation LIT makes possible.`,
    ),
  },

  // ── Touch 2 · Day 2 · LinkedIn invite ────────────────────────────────────
  {
    touchIndex: 2,
    calendarDay: 2,
    delayDays: 1,
    kind: "linkedin_invite",
    title: "LinkedIn connection request",
    description:
      "Send a brief, relevant connection request on LinkedIn.",
    scriptMarkdown: `Hi {{first_name}}, I work with freight brokers and forwarders on better shipper prospecting using live trade and shipment signals. Thought it would be good to connect.`,
    tokensUsed: ["{{first_name}}"],
  },

  // ── Touch 3 · Day 3 · Email · Problem-first follow-up ────────────────────
  {
    touchIndex: 3,
    calendarDay: 3,
    delayDays: 1,
    kind: "email",
    title: "Email · Problem-first follow-up",
    subject: "The hard part isn't finding company names",
    previewText:
      "Knowing whether a company is worth a rep's time today.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `Hi {{first_name}},<br><br>
The hard part in freight sales is not finding a company name. It is knowing whether that company is worth a rep's time today.<br><br>
A generic sales tool may give you contacts. A trade data platform may give you shipment records. But your team still has to connect the dots manually: volume, lanes, timing, decision-makers, and the right reason to reach out.<br><br>
Logistic Intel was built specifically for logistics sales teams. Reps can identify active shippers, see their trade activity, understand lane patterns, enrich contacts, and launch outreach from one place.<br><br>
That means fewer cold emails that sound like every other broker and more conversations based on real supply chain activity.<br><br>
Open to seeing what this would show for your target lanes?<br><br>
Best,<br>{{sender_name}}`,
      `Freight sales timing matters more than list size. One rep who knows <em>when</em> a shipper is reviewing capacity beats ten reps who are guessing.`,
    ),
  },

  // ── Touch 4 · Day 4 · Call · Voicemail script ────────────────────────────
  {
    touchIndex: 4,
    calendarDay: 4,
    delayDays: 1,
    kind: "call",
    title: "Call · voicemail",
    description:
      "Leave a voicemail referencing shipment history and lane activity.",
    scriptMarkdown: `Hi {{first_name}}, this is {{sender_name}} with Logistic Intel. We help freight brokers and forwarders find active shippers based on real shipment history, lane activity, and verified contacts. The reason I'm calling is that many teams are still prospecting from generic lists that don't show timing or freight fit. I wanted to see if your team is currently using shipment intelligence to prioritize outreach, or if that is still mostly manual. You can reach me at {{phone}}.`,
    tokensUsed: ["{{first_name}}", "{{sender_name}}", "{{phone}}"],
  },

  // ── Touch 5 · Day 5 · Email · Why switch ─────────────────────────────────
  {
    touchIndex: 5,
    calendarDay: 5,
    delayDays: 1,
    kind: "email",
    title: "Email · Why freight teams switch",
    subject: "Why freight teams switch",
    previewText: "Freight sales needs freight context.",
    imageAssetKey: "pulse_ai",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapWithImage(
      `Hi {{first_name}},<br><br>
The reason logistics teams switch to Logistic Intel is simple: Freight sales needs freight context.<br><br>
A standard contact database can help you find people. But it usually cannot tell you:<br><br>
&nbsp;&nbsp;· which companies are actively importing<br>
&nbsp;&nbsp;· which lanes are growing or changing<br>
&nbsp;&nbsp;· which suppliers they use<br>
&nbsp;&nbsp;· which ports, modes, and container types show opportunity<br>
&nbsp;&nbsp;· which contacts are most relevant<br><br>
Logistic Intel brings that into one workflow so reps can prioritize accounts based on actual supply chain behavior, not guesswork.<br><br>
For freight brokers and forwarders, that matters because timing often determines whether a shipper conversation turns into a quote, a trial lane, or nothing.<br><br>
Would you be open to a 20-minute walkthrough using your target customer profile?<br><br>
Best,<br>{{sender_name}}`,
      "{{pulse_ai_public_url}}",
      "LIT Pulse AI Brief — account intelligence for freight sales",
    ),
  },

  // ── Touch 6 · Day 6 · LinkedIn message · Follow-up DM ────────────────────
  {
    touchIndex: 6,
    calendarDay: 6,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn follow-up DM",
    description:
      "Follow up after connecting — ask a signal question about their prospecting workflow.",
    scriptMarkdown: `Thanks for connecting, {{first_name}}. Curious — when your team builds shipper lists today, are reps using actual shipment/lane data, or mostly company/contact databases?`,
    tokensUsed: ["{{first_name}}"],
  },

  // ── Touch 7 · Day 8 · Email · Workflow / proof ───────────────────────────
  // (Day 7 is a rest day — no touch. delayDays = 2 to bridge days 6 → 8.)
  {
    touchIndex: 7,
    calendarDay: 8,
    delayDays: 2,
    kind: "email",
    title: "Email · Workflow overview",
    subject: "From BOL data to booked freight",
    previewText: "The workflow LIT is designed to support.",
    imageAssetKey: "pulse_workflow" as EmailAssetKey,
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapWithImage(
      `Hi {{first_name}},<br><br>
Here is the workflow Logistic Intel is designed to support:<br><br>
<strong>1)</strong> Search for shippers by lane, commodity, supplier, geography, or shipment activity.<br>
<strong>2)</strong> See the company's recent trade picture: volume, lanes, carrier mix, cadence, and changes.<br>
<strong>3)</strong> Identify relevant contacts.<br>
<strong>4)</strong> Launch outreach with a message tied to real supply chain context.<br>
<strong>5)</strong> Push the account into your team's sales workflow.<br><br>
That replaces the usual process of jumping between trade data, LinkedIn, contact tools, spreadsheets, and a CRM.<br><br>
The goal is not more data for your reps to sort through. It is better sales timing, better account selection, and more relevant outreach.<br><br>
Could I show you what this looks like for {{top_lane}} shippers?<br><br>
Best,<br>{{sender_name}}`,
      "{{pulse_workflow_public_url}}",
      "LIT workflow: Search, Trade Picture, Contacts, Outreach, CRM handoff",
      `Most reps open with "do you have any freight?" Top reps open with "I see you moved X containers on {{top_lane}} last quarter — here's what we can do with that." That second conversation starts differently.`,
    ),
  },

  // ── Touch 8 · Day 9 · Email · Objection handler ──────────────────────────
  {
    touchIndex: 8,
    calendarDay: 9,
    delayDays: 1,
    kind: "email",
    title: "Email · Objection handler",
    subject: "Already using ZoomInfo or trade data?",
    previewText: "LIT isn't another place to look up companies.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `Hi {{first_name}},<br><br>
You may already have a contact database, trade data subscription, or CRM.<br><br>
Logistic Intel is not meant to be "another place to look up companies." It is designed to answer a freight-specific sales question: "Which shippers should we contact right now, and what should we say based on their actual freight activity?"<br><br>
That is the gap most tools leave open. Generic sales platforms are broad. Trade databases are useful for research. But freight teams need a workflow that connects shipper activity, lane context, decision-makers, and outreach.<br><br>
That is where Logistic Intel fits.<br><br>
Worth comparing it against what your team uses today?<br><br>
Best,<br>{{sender_name}}`,
    ),
  },

  // ── Touch 9 · Day 10 · Call · Follow-up call script ──────────────────────
  {
    touchIndex: 9,
    calendarDay: 10,
    delayDays: 1,
    kind: "call",
    title: "Call · follow-up",
    description:
      "Follow-up call referencing the email sequence and the LIT workflow.",
    scriptMarkdown: `Hi {{first_name}}, {{sender_name}} from Logistic Intel. I sent over a note about using shipment activity to prioritize shipper outreach. The quick version is that we help freight sales teams move from generic prospecting to lane-based, signal-based outreach. I was hoping to compare how your team currently finds qualified shippers versus what LIT can show from live trade activity. My number is {{phone}}.`,
    tokensUsed: ["{{first_name}}", "{{sender_name}}", "{{phone}}"],
  },

  // ── Touch 10 · Day 11 · Email · Forwarder-specific ───────────────────────
  {
    touchIndex: 10,
    calendarDay: 11,
    delayDays: 1,
    kind: "email",
    title: "Email · Forwarder-specific",
    subject: "For forwarders: prospecting is too broad",
    previewText:
      "The real question is whether the shipping profile matches your strengths.",
    imageAssetKey: "contact_discovery",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapWithImage(
      `Hi {{first_name}},<br><br>
For freight forwarders, the prospecting problem is usually not a shortage of company names. It is that most prospect lists are too broad.<br><br>
Your team has specific mode strengths, lane expertise, and commodity experience. A shipper who moves the wrong cargo on the wrong lanes is not a real opportunity, even if they technically import or export.<br><br>
The real question is whether a company's shipping profile actually matches what your team can win and service.<br><br>
Logistic Intel helps forwarders filter by commodity, lane, origin, destination, shipment size, and carrier mix — so your reps spend time on accounts that fit, not just accounts that show up in a generic database.<br><br>
That changes the conversation from "do you have any freight?" to "we noticed you move X on this lane. Here is how we typically handle that for companies in your category."<br><br>
Open to a look?<br><br>
Best,<br>{{sender_name}}`,
      "{{contact_discovery_public_url}}",
      "LIT Contact Discovery for freight forwarders",
    ),
  },

  // ── Touch 11 · Day 12 · Email · Broker-specific ──────────────────────────
  {
    touchIndex: 11,
    calendarDay: 12,
    delayDays: 1,
    kind: "email",
    title: "Email · Broker-specific",
    subject: "For brokers: bad-fit prospecting is expensive",
    previewText:
      "Help reps go after accounts showing the right freight signals.",
    imageAssetKey: "lane_signals" as EmailAssetKey,
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapWithImage(
      `Hi {{first_name}},<br><br>
For freight brokers, chasing bad-fit shippers is one of the most expensive things a sales team can do.<br><br>
Reps spend time researching, calling, and following up on accounts that were never the right fit — wrong lanes, wrong volume, wrong mode, or already locked into contracts.<br><br>
Logistic Intel helps brokers qualify accounts before the first call. Instead of cold outreach on a company because it showed up in a contact database, your reps can see actual lane activity, shipment patterns, and changes in freight behavior.<br><br>
That means more calls to shippers who fit your capacity, fewer calls to companies you can't serve.<br><br>
If your team is running on the same prospecting method it used two years ago, it may be worth a look at what signal-based targeting would change.<br><br>
Happy to show you a few examples on lanes your team is working now.<br><br>
Best,<br>{{sender_name}}`,
      "{{lane_signals_public_url}}",
      "LIT lane signals — origin-destination freight patterns for broker prospecting",
    ),
  },

  // ── Touch 12 · Day 13 · Email · Breakup ──────────────────────────────────
  {
    touchIndex: 12,
    calendarDay: 13,
    delayDays: 1,
    kind: "email",
    title: "Email · Breakup",
    subject: "Should I close the loop?",
    previewText: "If shipper prospecting isn't a priority, no problem.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `Hi {{first_name}},<br><br>
I don't want to keep sending notes if this isn't relevant right now, so I'll close the loop after this.<br><br>
The main idea was that Logistic Intel helps freight brokers and forwarders find active shippers using real shipment history and lane signals, rather than generic prospect lists that don't show timing or freight fit.<br><br>
If shipper prospecting is already handled well at {{company_name}}, no worries.<br><br>
But if your team is still relying on static lists, generic contact databases, or manual research to find qualified accounts, I think this is worth a look.<br><br>
Should I send over a quick example of what a shipper profile looks like in LIT?<br><br>
Best,<br>{{sender_name}}`,
    ),
  },

  // ── Touch 13 · Day 14 · LinkedIn message · Final close ───────────────────
  {
    touchIndex: 13,
    calendarDay: 14,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn final close",
    description:
      "Final LinkedIn message — close the loop cleanly and leave the door open.",
    scriptMarkdown: `{{first_name}}, I'll close the loop here. The main idea was helping your team find active shippers using real shipment and lane signals instead of generic prospect lists. Happy to reconnect when improving shipper prospecting becomes a priority.`,
    tokensUsed: ["{{first_name}}"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Builder-step adapter
// ─────────────────────────────────────────────────────────────────────────────

export type LitBuilderStep = {
  localId: string;
  kind: LitTouchKind | "wait";
  subject: string;
  body: string;
  title: string;
  description: string;
  waitDays: number;
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  includeSignature: boolean;
  expanded: boolean;
};

/**
 * Convert the LIT_MARKETING_14_TOUCH sequence into BuilderStep-compatible
 * objects for CampaignBuilder.
 *
 * Includes a synthetic wait step between touch 6 (day 6) and touch 7 (day 8)
 * to make the day-7 gap visible in the timeline.
 *
 * The caller is responsible for passing each email step's html through
 * resolveEmailTemplateHtml() before persisting it.
 */
export function applyLitMarketingSequenceToBuilder(
  resolveHtml: (raw: string) => string,
): LitBuilderStep[] {
  function uid() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const out: LitBuilderStep[] = [];

  for (let i = 0; i < LIT_MARKETING_14_TOUCH.length; i++) {
    const touch = LIT_MARKETING_14_TOUCH[i];

    // Insert a synthetic wait step between touch 6 (calendarDay 6) and
    // touch 7 (calendarDay 8) to surface the day-7 gap.
    if (touch.touchIndex === 7) {
      out.push({
        localId: uid(),
        kind: "wait",
        subject: "",
        body: "",
        title: "",
        description: "",
        waitDays: 1,
        delayDays: 0,
        delayHours: 0,
        delayMinutes: 0,
        includeSignature: false,
        expanded: false,
      });
    }

    if (touch.kind === "email") {
      out.push({
        localId: uid(),
        kind: "email",
        subject: touch.subject ?? "",
        body: touch.html ? resolveHtml(touch.html) : "",
        title: touch.title,
        description: touch.description ?? "",
        waitDays: 0,
        delayDays: touch.touchIndex === 7 ? 1 : touch.delayDays,
        delayHours: 0,
        delayMinutes: 0,
        includeSignature: true,
        expanded: i === 0,
      });
    } else if (
      touch.kind === "linkedin_invite" ||
      touch.kind === "linkedin_message" ||
      touch.kind === "call"
    ) {
      // For manual touchpoints: title holds the step label, description holds
      // the script so reps can copy-paste it from the inspector.
      out.push({
        localId: uid(),
        kind: touch.kind,
        subject: "",
        body: "",
        title: touch.title,
        description: touch.scriptMarkdown ?? touch.description ?? "",
        waitDays: 0,
        delayDays: touch.delayDays,
        delayHours: 0,
        delayMinutes: 0,
        includeSignature: false,
        expanded: false,
      });
    }
  }

  return out;
}
