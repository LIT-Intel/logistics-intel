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
export function wrapV7(opts: {
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
// Value-prop visual helpers — comparison cards + stack cost tables.
// Outlook-safe: 100% inline styles, table-based layout, no flexbox.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Side-by-side "Before vs With LIT" card. Renders as a 2-column table
 * in email clients that support tables (most), and stacks gracefully
 * on narrow widths. Headers get color treatment so the contrast reads.
 */
function comparisonHtml(
  leftLabel: string,
  leftBullets: string[],
  rightLabel: string,
  rightBullets: string[],
): string {
  const bullets = (items: string[]) =>
    items
      .map(
        (b) =>
          `<tr><td style="padding:4px 0 4px 0;font-family:${_MKT_FONT};font-size:14px;line-height:1.5;color:${_MKT_COLOR.text};">• ${b}</td></tr>`,
      )
      .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:18px 0 6px 0;width:100%;"><tr><td valign="top" width="49%" style="padding:14px 14px;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${leftLabel}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bullets(leftBullets)}</table></td><td width="2%" style="width:8px;">&nbsp;</td><td valign="top" width="49%" style="padding:14px 14px;background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:#1E40AF;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${rightLabel}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bullets(rightBullets)}</table></td></tr></table>`;
}

/**
 * Stacked "your current stack" cost breakdown. Each row shows tool +
 * monthly cost; the total is bolded at the bottom. Used to anchor the
 * dollar math when pitching LIT as a stack replacement.
 */
function stackTableHtml(rows: Array<{ tool: string; cost: string }>, total: string): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;font-family:${_MKT_FONT};font-size:14px;color:${_MKT_COLOR.text};">${r.tool}</td><td align="right" style="padding:6px 0;font-family:${_MKT_FONT};font-size:14px;color:${_MKT_COLOR.text};">${r.cost}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:14px 0 6px 0;width:100%;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;"><tr><td style="padding:14px 16px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Typical broker / forwarder stack — per rep</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}<tr><td style="padding:10px 0 0 0;border-top:1px solid #E2E8F0;font-family:${_MKT_FONT};font-size:14px;font-weight:700;color:${_MKT_COLOR.text};">Total / rep / month</td><td align="right" style="padding:10px 0 0 0;border-top:1px solid #E2E8F0;font-family:${_MKT_FONT};font-size:14px;font-weight:700;color:${_MKT_COLOR.text};">${total}</td></tr></table></td></tr></table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIT Marketing · split into TWO 14-day sequences (broker / forwarder).
// Each has ~6 emails + 3 LinkedIn touches + 2 calls + final close. The
// LIT_MARKETING_14_TOUCH alias below points at the broker sequence so
// existing campaigns that referenced it keep working.
// ─────────────────────────────────────────────────────────────────────────────

// ── BROKER 14-day sequence ───────────────────────────────────────────────────
export const LIT_MARKETING_BROKER_14: LitMarketingTouch[] = [
  // ── Touch 1 · Day 1 · Email · Intro + stack math ─────────────────────────
  {
    touchIndex: 1,
    calendarDay: 1,
    delayDays: 0,
    kind: "email",
    title: "Email · Intro · stack math",
    subject: "What your team's prospecting stack actually costs",
    previewText: "Replacing 3–4 disconnected tools with one freight-native workspace.",
    tokensUsed: [
      "{{first_name}}",
      "{{company_name}}",
      "{{top_lane}}",
      "{{sender_name}}",
    ],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Most freight broker sales teams I talk to are running the same prospecting stack — and paying for all of it, per rep, every month:</p>
${stackTableHtml(
  [
    { tool: "Trade / BOL data (ImportYeti, Panjiva, etc.)", cost: "$199–$499" },
    { tool: "Contact database (ZoomInfo, Apollo)", cost: "$79–$149" },
    { tool: "Email outreach (Smartlead, Instantly)", cost: "$59–$99" },
    { tool: "CRM seat (HubSpot, Salesforce)", cost: "$45–$90" },
  ],
  "$382–$837",
)}
<p style="margin:14px 0;">And reps still copy-paste between four dashboards just to figure out who's worth a call this week.</p>
<p style="margin:0 0 14px 0;">LIT collapses the stack into one workspace: live BOL signals, lane / volume / carrier patterns, contact discovery, and outreach — built specifically for freight sales. Most teams that switch cut $200–$400 / rep / month out of their tooling and recover a half-day of research time per rep per week.</p>
<p style="margin:0 0 14px 0;">Worth a 20-minute look on {{top_lane}} shippers your team is already working?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `The cheapest stack isn't the goal — the smallest stack is. Every tool a rep has to context-switch into is a tax on outreach volume.`,
      "See the stack comparison",
    ),
  },
  // ── Touch 2 · Day 2 · LinkedIn invite ────────────────────────────────────
  {
    touchIndex: 2,
    calendarDay: 2,
    delayDays: 1,
    kind: "linkedin_invite",
    title: "LinkedIn connection request",
    description: "Brief, relevant connection request — no pitch.",
    scriptMarkdown: `Hi {{first_name}}, I work with freight broker sales teams on signal-based prospecting using live BOL data and lane intelligence. Would be good to connect.`,
    tokensUsed: ["{{first_name}}"],
  },
  // ── Touch 3 · Day 3 · Email · The bad-fit cost ───────────────────────────
  {
    touchIndex: 3,
    calendarDay: 3,
    delayDays: 1,
    kind: "email",
    title: "Email · The cost of bad-fit prospecting",
    subject: "Most broker outreach goes to the wrong companies",
    previewText: "And the cost is bigger than reps think.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Here's the math I keep seeing on broker sales teams:</p>
${comparisonHtml(
  "Without freight signals",
  [
    "Reps work a list of 300 importers from a generic DB.",
    "~40% are on the wrong lanes for your capacity.",
    "~25% are locked into a yearly RFP contract.",
    "~15% don't ship the volume your team handles.",
    "Best case: 60 real-fit accounts.",
    "Time spent: ~18 min / account on research.",
  ],
  "With LIT lane + volume signals",
  [
    "Reps filter to companies actually moving on your lanes.",
    "Volume bands, carrier mix, cadence are visible up-front.",
    "Recent shifts surface accounts in-market right now.",
    "200+ real-fit accounts on the same effort budget.",
    "Time spent: ~30 sec / account on research.",
    "Reps make 3–4× more contextual calls per day.",
  ],
)}
<p style="margin:14px 0;">For a 5-rep broker desk, that gap is usually worth 8–12 extra qualified conversations a week — the kind that turn into RFP invites instead of voicemails.</p>
<p style="margin:0 0 14px 0;">Want to see this run against your top 3 lanes?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Run it on my lanes",
    ),
  },
  // ── Touch 4 · Day 4 · Call · Voicemail ───────────────────────────────────
  {
    touchIndex: 4,
    calendarDay: 4,
    delayDays: 1,
    kind: "call",
    title: "Call · voicemail",
    description: "Voicemail referencing wasted reach on wrong-lane accounts.",
    scriptMarkdown: `Hi {{first_name}}, {{sender_name}} from Logistic Intel. We help broker sales teams stop wasting reach on wrong-lane shippers and focus on accounts actually moving freight on lanes you can win. Most teams that switch tell us they replace two or three of their prospecting tools and cut $300+ per rep per month while doubling qualified conversations. Reach me at {{phone}} — would love to compare what your team works with today.`,
    tokensUsed: ["{{first_name}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 5 · Day 5 · Email · Tool-by-tool comparison ────────────────────
  {
    touchIndex: 5,
    calendarDay: 5,
    delayDays: 1,
    kind: "email",
    title: "Email · Tool-by-tool comparison",
    subject: "How LIT compares to your current stack",
    previewText: "BOL data + contacts + outreach in one workflow.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Quick breakdown of how LIT compares to what most broker teams use today:</p>
${comparisonHtml(
  "ImportYeti / Panjiva",
  [
    "Strong on raw BOL data.",
    "Weak on contact discovery and outreach.",
    "No signal scoring or lane prioritization.",
    "Built for analysts, not for reps.",
  ],
  "Logistic Intel",
  [
    "Same BOL + lane data, freight-sales tuned.",
    "Built-in contact discovery + verification.",
    "Pulse AI scores accounts by signal strength.",
    "Outreach runs from the same workspace.",
  ],
)}
${comparisonHtml(
  "ZoomInfo + Apollo",
  [
    "Wide contact coverage, generic titles.",
    "No shipment / lane context whatsoever.",
    "Reps still need a separate freight data tool.",
    "Reaches the wrong logistics buyers often.",
  ],
  "Logistic Intel",
  [
    "Logistics-specific contacts: VP Supply Chain, Procurement.",
    "Every contact tied to shipment + lane data.",
    "Reps see WHY a contact matters before reaching out.",
    "Cuts the contact-DB line item entirely for most teams.",
  ],
)}
<p style="margin:14px 0;">For most broker teams, LIT replaces 2–3 stack line items. Pricing is below the combined cost of what it replaces — that's the model.</p>
<p style="margin:0 0 14px 0;">Want a side-by-side run against your current tools?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Apples-to-apples: ask your team what it costs to onboard a new rep onto the current stack. With LIT it's one login and one workflow — typically a day instead of a week.`,
      "Send me the side-by-side",
    ),
  },
  // ── Touch 6 · Day 6 · LinkedIn DM ────────────────────────────────────────
  {
    touchIndex: 6,
    calendarDay: 6,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn follow-up DM",
    description: "Follow-up after connection — concrete question on stack cost.",
    scriptMarkdown: `Thanks for connecting {{first_name}}. Honest question — when you add up what your reps pay for trade data + contacts + outreach + CRM each month, what's the per-rep total? Most broker teams I talk to are at $400+. LIT typically replaces 2–3 of those line items. Curious where you'd land.`,
    tokensUsed: ["{{first_name}}"],
  },
  // ── Touch 7 · Day 8 · Email · Workflow proof ─────────────────────────────
  {
    touchIndex: 7,
    calendarDay: 8,
    delayDays: 2,
    kind: "email",
    title: "Email · Workflow before/after",
    subject: "Before / after on a typical broker prospecting workflow",
    previewText: "From 18-minute research per account to 30 seconds.",
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">The shift that drives most of the ROI for broker teams isn't the data — it's the workflow.</p>
${comparisonHtml(
  "Before LIT — 18 min / account",
  [
    "1. Search ImportYeti, copy company.",
    "2. Open ZoomInfo, find logistics contact.",
    "3. Open LinkedIn, verify title and tenure.",
    "4. Open Smartlead, paste into a sequence.",
    "5. Open CRM, create the account.",
    "6. Hope the lane fits next time you check.",
  ],
  "With LIT — 30 sec / account",
  [
    "1. Filter Pulse by lane / mode / volume.",
    "2. Open the company — signals + cadence visible.",
    "3. Save the contact (already verified).",
    "4. Enroll in a campaign — same workspace.",
    "5. CRM sync happens automatically.",
    "6. Re-rank when signals shift — no manual check.",
  ],
)}
<p style="margin:14px 0;">For a rep working 25 accounts a day, that's the difference between 90 minutes of actual selling vs. 90 minutes lost to dashboard tabbing. Across a 5-person desk: a full FTE of recovered selling time per week.</p>
<p style="margin:0 0 14px 0;">Could I show you what this looks like on {{top_lane}} accounts?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Time cost is the unspoken stack tax. A $0 free tool that adds 10 minutes per account is more expensive than a paid tool that saves 17.`,
      "Walk me through it on {{top_lane}}",
    ),
  },
  // ── Touch 8 · Day 9 · Email · Objection / "we already have X" ────────────
  {
    touchIndex: 8,
    calendarDay: 9,
    delayDays: 1,
    kind: "email",
    title: "Email · Objection handler",
    subject: "Already on ZoomInfo, ImportYeti, or Smartlead?",
    previewText: "LIT isn't another tab — it replaces those tabs.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">If your team already has ZoomInfo, ImportYeti, Smartlead, and a CRM, the fair question is "why add anything?" The honest answer: don't add LIT — <strong>swap</strong> with it.</p>
<p style="margin:0 0 10px 0;">What most broker teams replace when they move to LIT:</p>
<ul style="margin:0 0 14px 18px;padding:0;line-height:1.7;">
  <li>ImportYeti / Panjiva — covered by LIT's BOL + lane intelligence</li>
  <li>ZoomInfo / Apollo for logistics roles — covered by LIT's freight-tuned contact discovery</li>
  <li>Smartlead / Instantly seats — outreach now lives in the same workspace</li>
</ul>
<p style="margin:0 0 14px 0;">What stays: your CRM (HubSpot, Salesforce, Pipedrive — LIT syncs to all three).</p>
<p style="margin:0 0 14px 0;">Net for most teams: $200–$400 cut from per-rep monthly cost, plus an hour or two reclaimed per rep per day.</p>
<p style="margin:0 0 14px 0;">Worth a 20-minute walkthrough so you can decide for yourself?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Stack consolidation tends to feel risky on paper and obvious in practice. The teams that move first compound a quarter-over-quarter selling advantage on the teams that don't.`,
      "Yes, walk me through it",
    ),
  },
  // ── Touch 9 · Day 10 · Call · Follow-up ──────────────────────────────────
  {
    touchIndex: 9,
    calendarDay: 10,
    delayDays: 1,
    kind: "call",
    title: "Call · follow-up",
    description: "Follow-up call referencing the stack comparison.",
    scriptMarkdown: `Hi {{first_name}}, {{sender_name}} again. I sent over a comparison of how LIT replaces ImportYeti, ZoomInfo, and an outreach tool for most broker desks — usually nets out $200–$400 cheaper per rep monthly. Wanted to see if a quick walkthrough on your top lanes would be useful. My number is {{phone}}.`,
    tokensUsed: ["{{first_name}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 10 · Day 11 · Email · Anonymized example ───────────────────────
  {
    touchIndex: 10,
    calendarDay: 11,
    delayDays: 1,
    kind: "email",
    title: "Email · Anonymized example",
    subject: "What a 5-rep broker desk looked like 90 days in",
    previewText: "Concrete numbers from a team that consolidated their stack.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">A 5-rep broker desk we work with switched their stack to LIT 90 days ago. Anonymized numbers from their last review:</p>
${comparisonHtml(
  "Their old stack — per rep / mo",
  [
    "ImportYeti — $299",
    "ZoomInfo — $129",
    "Smartlead — $79",
    "Misc lookups (DataAxle, etc) — $40",
    "Total: ~$547 / rep / mo",
    "Stack total (5 reps): $2,735 / mo",
  ],
  "LIT — per rep / mo",
  [
    "Logistic Intel (Pro) — $249",
    "Everything above, one workspace",
    "Same CRM sync (HubSpot)",
    "Total: $249 / rep / mo",
    "Stack total (5 reps): $1,245 / mo",
    "Saved: $1,490 / mo · $17,880 / yr",
  ],
)}
<p style="margin:14px 0;">More relevant: qualified meetings booked per rep per week went from 2.4 → 4.1 in the first 60 days. They credit it to less time in dashboards, more time on calls with shippers that actually fit their lanes.</p>
<p style="margin:0 0 14px 0;">Happy to walk through what this would look like for {{company_name}} if it's useful.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Show me a walkthrough",
    ),
  },
  // ── Touch 11 · Day 13 · Email · Breakup ──────────────────────────────────
  {
    touchIndex: 11,
    calendarDay: 13,
    delayDays: 2,
    kind: "email",
    title: "Email · Breakup",
    subject: "Should I close the loop?",
    previewText: "Final note on LIT for your broker desk.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">I don't want to keep sending notes if this isn't a fit right now, so I'll close the loop here.</p>
<p style="margin:0 0 14px 0;">The short version: most broker desks running ImportYeti + ZoomInfo + Smartlead are paying $400–$500 / rep / mo and still working from disconnected dashboards. LIT replaces those, usually nets out cheaper, and gets reps to "in-market" shippers faster.</p>
<p style="margin:0 0 14px 0;">If shipper prospecting is already dialed at {{company_name}}, no worries. If not, this is worth a 20-minute look. Just reply "send it" and I'll share a recorded walkthrough on your lanes.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Send the walkthrough",
    ),
  },
  // ── Touch 12 · Day 14 · LinkedIn final close ─────────────────────────────
  {
    touchIndex: 12,
    calendarDay: 14,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn final close",
    description: "Clean LinkedIn close — leaves the door open.",
    scriptMarkdown: `{{first_name}}, closing the loop here. The main idea was helping your broker reps cut $200–$400/mo per rep in stack cost while booking more qualified meetings. Open to reconnecting when consolidating the prospecting stack becomes a priority.`,
    tokensUsed: ["{{first_name}}"],
  },
];

// ── FORWARDER 14-day sequence ────────────────────────────────────────────────
export const LIT_MARKETING_FORWARDER_14: LitMarketingTouch[] = [
  // ── Touch 1 · Day 1 · Email · Intro + qualification math ─────────────────
  {
    touchIndex: 1,
    calendarDay: 1,
    delayDays: 0,
    kind: "email",
    title: "Email · Intro · qualification math",
    subject: "Most forwarder prospect lists are 80% noise",
    previewText: "Cut the wrong-mode, wrong-lane, wrong-volume accounts before outreach.",
    tokensUsed: [
      "{{first_name}}",
      "{{company_name}}",
      "{{top_lane}}",
      "{{sender_name}}",
    ],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Smaller forwarders don't lose deals because they have too few accounts to chase — they lose them because their prospect lists are too broad.</p>
${comparisonHtml(
  "Generic importer list",
  [
    "All importers in a category.",
    "No mode visibility (air vs. ocean).",
    "No lane match to your strengths.",
    "Volume mix unknown — 1 carton or 1,000?",
    "Result: ~80% of outreach goes to bad fits.",
  ],
  "LIT mode + lane + volume filter",
  [
    "Filter to companies on {{top_lane}}.",
    "See ocean vs. air vs. hybrid up front.",
    "Volume bands surface the accounts you can win.",
    "Carrier mix shows if there's a service gap.",
    "Result: 3–4× lift in real-fit conversations.",
  ],
)}
<p style="margin:14px 0;">For a 3-rep forwarder team, the practical effect is usually 10–15 extra qualified conversations a month with shippers that actually match your service profile.</p>
<p style="margin:0 0 14px 0;">Worth a quick look on {{company_name}}'s strongest lanes?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Most forwarders win when they pick the right 50 accounts and pursue them with context — not when they email 5,000 names with no signal. LIT is built to make picking those 50 fast.`,
      "Run it on my lanes",
    ),
  },
  // ── Touch 2 · Day 2 · LinkedIn invite ────────────────────────────────────
  {
    touchIndex: 2,
    calendarDay: 2,
    delayDays: 1,
    kind: "linkedin_invite",
    title: "LinkedIn connection request",
    description: "Brief connection request — no pitch.",
    scriptMarkdown: `Hi {{first_name}}, I work with forwarder sales teams on better lane-match prospecting using live BOL + mode data. Would be good to connect.`,
    tokensUsed: ["{{first_name}}"],
  },
  // ── Touch 3 · Day 3 · Email · Cost of broad prospecting ──────────────────
  {
    touchIndex: 3,
    calendarDay: 3,
    delayDays: 1,
    kind: "email",
    title: "Email · The real cost of broad prospecting",
    subject: "What broad prospecting actually costs a 3-rep forwarder team",
    previewText: "Time, dollars, and missed in-market accounts.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Quick math on a typical 3-rep forwarder team running a generic-list approach:</p>
${stackTableHtml(
  [
    { tool: "Trade data subscription", cost: "$199–$399" },
    { tool: "Contact / enrichment tool", cost: "$79–$129" },
    { tool: "Outreach sequencer", cost: "$59–$99" },
    { tool: "Misc lookup tools (Whois, etc)", cost: "$30–$60" },
  ],
  "$367–$687",
)}
<p style="margin:14px 0;">That's $1,100–$2,000 / month across 3 reps for a stack that still doesn't tell them which accounts are mode-matched and lane-matched to your service.</p>
<p style="margin:0 0 14px 0;">LIT replaces most of that — one workspace, freight-native, with mode / lane / volume filters built for forwarder qualification. Most 3-rep teams cut $300–$500 / month from total stack cost and book more qualified conversations.</p>
<p style="margin:0 0 14px 0;">Want me to model what your stack consolidation would look like?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Model my stack consolidation",
    ),
  },
  // ── Touch 4 · Day 4 · Call · Voicemail ───────────────────────────────────
  {
    touchIndex: 4,
    calendarDay: 4,
    delayDays: 1,
    kind: "call",
    title: "Call · voicemail",
    description: "Voicemail referencing forwarder qualification gap.",
    scriptMarkdown: `Hi {{first_name}}, {{sender_name}} with Logistic Intel. We help smaller forwarders cut the 80% of generic-list outreach that doesn't match your modes or lanes — typically saves $300–$500/mo across the team and books 10+ extra qualified conversations a month. My number is {{phone}}, would love to compare against what your team uses today.`,
    tokensUsed: ["{{first_name}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 5 · Day 5 · Email · Mode + lane fit ────────────────────────────
  {
    touchIndex: 5,
    calendarDay: 5,
    delayDays: 1,
    kind: "email",
    title: "Email · Mode + lane fit beats company name",
    subject: "Stop chasing importers — start chasing fit",
    previewText: "Why shipping profile matters more than company name.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Most forwarder prospect lists are organized by industry or revenue band. Both are weak proxies for "would this account actually fit our service."</p>
${comparisonHtml(
  "Industry / revenue lists",
  [
    "\"$50M+ furniture importers\" → 600 names.",
    "Half are FCL ocean — your team is LCL.",
    "A third already have a 3PL contract.",
    "Most won't say.",
    "Outreach feels generic to recipients.",
  ],
  "LIT shipping-profile match",
  [
    "Filter by mode (LCL / FCL / air).",
    "Filter by lane match to your network.",
    "Filter by cadence — monthly vs. one-off.",
    "Sort by carrier-switch signals.",
    "Outreach references their actual freight.",
  ],
)}
<p style="margin:14px 0;">For smaller forwarders, the win isn't more names — it's a tighter list of accounts where your service profile and their shipping profile actually overlap. That's the conversation worth having.</p>
<p style="margin:0 0 14px 0;">Want to see what a fit-filtered list looks like for {{company_name}}?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `For a smaller team, 50 well-fit accounts beats 500 generic ones every quarter. The math is on time-per-conversation, not list size.`,
      "Show me a fit-filtered list",
    ),
  },
  // ── Touch 6 · Day 6 · LinkedIn DM ────────────────────────────────────────
  {
    touchIndex: 6,
    calendarDay: 6,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn follow-up DM",
    description: "Follow-up — concrete question on prospecting fit-rate.",
    scriptMarkdown: `Thanks for connecting {{first_name}}. Honest question — when your reps run a prospect list, what % of accounts end up actually mode-matched and lane-matched to your service? Most forwarder teams I talk to are at 20–30%. LIT typically pushes that to 70–80% by filtering on shipping profile before outreach. Curious where you'd land.`,
    tokensUsed: ["{{first_name}}"],
  },
  // ── Touch 7 · Day 8 · Email · Pulse AI 30-second brief ───────────────────
  {
    touchIndex: 7,
    calendarDay: 8,
    delayDays: 2,
    kind: "email",
    title: "Email · Pulse AI · 30 seconds before each call",
    subject: "The 30 seconds before a forwarder rep makes a call",
    previewText: "What changed, what they ship, what to lead with.",
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">The hardest 30 seconds in forwarder sales is right before a rep dials — getting enough context to not sound generic, fast enough that you can still make the next 20 calls.</p>
${comparisonHtml(
  "Typical pre-call research — 12 min",
  [
    "Tab to ImportYeti, search company.",
    "Skim 80 rows of BOL data.",
    "Tab to LinkedIn, check the contact.",
    "Tab to Google, hunt for recent news.",
    "Tab to CRM, scan prior notes.",
    "Dial — usually missed the angle.",
  ],
  "LIT Pulse AI brief — 30 sec",
  [
    "Open the account.",
    "Pulse summary: top lanes, cadence, recent shifts.",
    "Mode mix + carrier mix in one card.",
    "Suggested outreach angle, signal-based.",
    "One click — start the call.",
    "Lead with what actually changed in their freight.",
  ],
)}
<p style="margin:14px 0;">For a rep dialing 25–30 accounts a day, that's 4–5 hours a week reclaimed for actual conversations. For a 3-rep team, it's the equivalent of adding half a rep — without the salary.</p>
<p style="margin:0 0 14px 0;">Could I show you what a Pulse brief looks like for a {{top_lane}} shipper?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Pulse AI is what reps open right before they dial. 30 seconds in, you know cadence, top lanes, recent shifts, and what to lead with. The point isn't more data; it's the right data, fast.`,
      "See a sample Pulse brief",
    ),
  },
  // ── Touch 8 · Day 9 · Email · Stack consolidation deep-dive ──────────────
  {
    touchIndex: 8,
    calendarDay: 9,
    delayDays: 1,
    kind: "email",
    title: "Email · Stack consolidation deep-dive",
    subject: "If you're already paying for ImportYeti + Apollo + Smartlead",
    previewText: "Most forwarders can replace all three with one tool.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">A common pattern on forwarder teams: 3 tools, 3 invoices, 3 logins per rep, and the workflow is still copy-paste.</p>
${comparisonHtml(
  "Current 3-tool stack — per rep / mo",
  [
    "ImportYeti / Panjiva — ~$299",
    "Apollo / ZoomInfo — ~$99",
    "Smartlead / Instantly — ~$79",
    "Total: ~$477 / rep / mo",
    "3 reps: ~$1,431 / mo",
    "3 reps × 12: $17,172 / yr",
  ],
  "LIT (Pro plan) — per rep / mo",
  [
    "Logistic Intel — $249",
    "BOL + lane + mode signals included",
    "Forwarder-tuned contact discovery",
    "Outreach engine in same workspace",
    "3 reps: $747 / mo",
    "3 reps × 12: $8,964 / yr",
  ],
)}
<p style="margin:14px 0;">Net for a 3-rep team: <strong>~$8,200 / yr cut from tooling</strong>, plus the time tax of switching between 3 dashboards goes to zero.</p>
<p style="margin:0 0 14px 0;">Worth a side-by-side against your current setup?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Run the side-by-side",
    ),
  },
  // ── Touch 9 · Day 10 · Call · Follow-up ──────────────────────────────────
  {
    touchIndex: 9,
    calendarDay: 10,
    delayDays: 1,
    kind: "call",
    title: "Call · follow-up",
    description: "Follow-up referencing the 3-tool consolidation math.",
    scriptMarkdown: `Hi {{first_name}}, {{sender_name}} again. The note I sent had the math on consolidating ImportYeti + Apollo + Smartlead into LIT — usually $8k+/yr saved for a 3-rep team plus a much cleaner workflow. Wanted to see if a walkthrough on your lanes makes sense. Reach me at {{phone}}.`,
    tokensUsed: ["{{first_name}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 10 · Day 11 · Email · Anonymized example ───────────────────────
  {
    touchIndex: 10,
    calendarDay: 11,
    delayDays: 1,
    kind: "email",
    title: "Email · Anonymized example",
    subject: "What a 3-rep forwarder team booked in 60 days on LIT",
    previewText: "Numbers from a team that consolidated their stack.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">A 3-rep forwarder team we work with moved their full prospecting stack onto LIT 60 days ago. Anonymized snapshot:</p>
${comparisonHtml(
  "Days 1–60 — before LIT",
  [
    "Stack cost: ~$477 / rep / mo",
    "Mode-fit rate: ~22% of accounts",
    "Avg pre-call research: 11 min",
    "Qualified meetings: 2.1 / rep / week",
    "Wins / rep / quarter: 1.3",
    "Reps burning time on dashboard switching",
  ],
  "Days 1–60 — on LIT",
  [
    "Stack cost: $249 / rep / mo (-48%)",
    "Mode-fit rate: ~74% of accounts",
    "Avg pre-call research: 35 sec",
    "Qualified meetings: 3.6 / rep / week (+71%)",
    "Wins / rep / quarter: 2.4 (projected)",
    "Reps in one workspace, all day",
  ],
)}
<p style="margin:14px 0;">The shift wasn't magic — it was eliminating the dashboard-tabbing tax and getting reps to in-market shippers faster. Same headcount, more output.</p>
<p style="margin:0 0 14px 0;">Happy to model what this would look like for {{company_name}}.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Model it for my team",
    ),
  },
  // ── Touch 11 · Day 13 · Email · Breakup ──────────────────────────────────
  {
    touchIndex: 11,
    calendarDay: 13,
    delayDays: 2,
    kind: "email",
    title: "Email · Breakup",
    subject: "Should I close the loop?",
    previewText: "Final note on LIT for forwarder prospecting.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">I don't want to keep sending notes if this isn't relevant, so I'll close the loop here.</p>
<p style="margin:0 0 14px 0;">Short version: smaller forwarder teams running ImportYeti + Apollo + Smartlead are typically at ~$477 / rep / mo and still working from disconnected lists. LIT replaces those, nets out below the combined cost, and filters accounts by actual mode + lane + cadence fit before outreach.</p>
<p style="margin:0 0 14px 0;">If shipper prospecting is already a strength at {{company_name}}, no worries. If consolidating the stack and tightening fit-rate is on the radar, reply "send it" and I'll share a recorded walkthrough on your lanes.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Send the walkthrough",
    ),
  },
  // ── Touch 12 · Day 14 · LinkedIn final close ─────────────────────────────
  {
    touchIndex: 12,
    calendarDay: 14,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn final close",
    description: "Clean LinkedIn close — leaves the door open.",
    scriptMarkdown: `{{first_name}}, closing the loop. Main idea was helping your forwarder reps cut ~$200–$300/mo per rep in stack cost while raising mode-fit rate from ~22% to 70%+. Open to reconnecting when consolidating the prospecting stack is a priority.`,
    tokensUsed: ["{{first_name}}"],
  },
];

// Backward-compat alias — anything referencing LIT_MARKETING_14_TOUCH gets
// the broker sequence. New consumers should pick LIT_MARKETING_BROKER_14
// or LIT_MARKETING_FORWARDER_14 explicitly.
export const LIT_MARKETING_14_TOUCH: LitMarketingTouch[] = LIT_MARKETING_BROKER_14;


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
export type LitAudience = "broker" | "forwarder";

export function applyLitMarketingSequenceToBuilder(
  resolveHtml: (raw: string) => string,
  audience: LitAudience = "broker",
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

  const sequence =
    audience === "forwarder" ? LIT_MARKETING_FORWARDER_14 : LIT_MARKETING_BROKER_14;
  const out: LitBuilderStep[] = [];

  for (let i = 0; i < sequence.length; i++) {
    const touch = sequence[i];

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
