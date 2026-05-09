// LIT Marketing campaign templates.
//
// The 8-template registry (freightBrokerTemplates + smallForwarderTemplates)
// is preserved as re-export shims for backwards compatibility. New sequences
// should use LIT_MARKETING_14_TOUCH from litMarketingSequence.ts.
//
// Token contract:
//   {{first_name}}    — recipient first name (resolved at send time)
//   {{company_name}}  — recipient company    (resolved at send time)
//   {{top_lane}}      — top trade lane       (resolved at send time)
//   {{sender_name}}   — sender's first name  (resolved at send time)
//   {{phone}}         — sender phone         (resolved at send time)
//
//   {{company_intelligence_public_url}}  ─┐
//   {{contact_discovery_public_url}}     ─├─ resolved at INSERT time
//   {{pulse_ai_public_url}}              ─┤  by resolveEmailTemplateHtml
//   {{pulse_workflow_public_url}}        ─┤
//   {{lane_signals_public_url}}          ─┘
//
// Send-time tokens pass through resolveEmailTemplateHtml unchanged.

import { EMAIL_ASSETS, type EmailAssetKey } from "./emailAssets";
import { wrapV7 } from "./litMarketingSequence";

// v7 design: dark slate hero band with LIT icon + sender_company_name
// wordmark, sans-serif body, brand-blue CTA button with depth border,
// optional Pro Tip tinted card. Replaces the old Georgia-serif +
// inline-SVG layout. Same wrapper used by the 14-touch sequence so
// every LIT-facing outbound email looks identical.
//
// Authoring note: pass in `bodyHtml` already shaped with <p>/<br> tags
// for paragraph breaks, plus optional `proTipHtml` for the tinted
// card. wrapV7 handles the hero, CTA, divider, and footer.
function wrapBrokerEmail(
  bodyHtml: string,
  subject: string,
  previewText: string,
  proTipHtml?: string,
  ctaText: string = "See a sample shipper profile",
  ctaUrl: string = "https://www.logisticintel.com",
): string {
  return wrapV7({
    bodyHtml,
    ctaText,
    ctaUrl,
    previewText,
    subjectLine: subject,
    proTipHtml,
  });
}

export type CampaignAudience = "freight_broker" | "small_forwarder";

export interface CampaignEmailTemplate {
  id: string;
  name: string;
  audience: CampaignAudience;
  stepNumber: 1 | 2 | 3 | 4;
  subject: string;
  previewText?: string;
  /** Raw HTML with {{*_public_url}} placeholders + send-time tokens. */
  html: string;
  /** Which product visual the email features. Omit for plain-text steps. */
  imageAssetKey?: EmailAssetKey;
  /** Send-time tokens the template uses (for help text / preview). */
  tokensUsed: string[];
  /** One-line description shown in the picker. */
  description: string;
}

// ─────────────────────────────────────────────────────────────────────
// Freight Broker — 4-touch sequence
// ─────────────────────────────────────────────────────────────────────

export const freightBrokerTemplates: CampaignEmailTemplate[] = [
  {
    id: "lit_marketing_broker_1_company_intel",
    name: "Broker Email 1 · Company Intelligence Intro",
    audience: "freight_broker",
    stepNumber: 1,
    subject: "Built this for freight sales teams",
    previewText:
      "A better way to find active shippers using real shipment signals.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Founder-style intro framed around freight signals.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">I built LIT because freight sales teams are still stuck jumping between shipment data, spreadsheets, CRMs, and contact tools just to figure out who's actually worth calling.</p>
<p style="margin:0 0 16px 0;">LIT helps brokers find active shippers, understand trade activity, identify the right contacts, and start outreach from one workspace — using live shipment signals, not guesses.</p>
<p style="margin:0 0 16px 0;">The goal is simple: help your team spend less time qualifying and more time selling into accounts with real freight movement.</p>
<p style="margin:0 0 16px 0;">Happy to send over a sample shipper profile so you can see what it looks like for {{company_name}}.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Built this for freight sales teams",
      "A better way to find active shippers using real shipment signals.",
      `Reps who book the most freight don't ask "any capacity?" — they open with a specific signal: "I noticed your volume on this lane shifted last quarter." That's the conversation LIT makes possible.`,
    ),
  },
  {
    id: "lit_marketing_broker_2_manual_pain",
    name: "Broker Email 2 · Manual Prospecting Pain",
    audience: "freight_broker",
    stepNumber: 2,
    subject: "Freight prospecting is too manual",
    previewText:
      "Who is shipping right now, and is there a real reason to reach out?",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    description: "Follow-up — names the prospecting pain.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">One of the reasons we built LIT is that freight prospecting still feels way too manual.</p>
<p style="margin:0 0 16px 0;">Brokers are jumping between shipment databases, Google searches, spreadsheets, CRMs, contact tools, and campaign platforms — all to answer one basic question:</p>
<p style="margin:0 0 16px 0;font-weight:600;">Who is shipping right now, and is there a real reason to reach out?</p>
<p style="margin:0 0 16px 0;">LIT is built to make that answer fast. Look up a company, see shipment activity, understand top lanes, spot account-level signals, find contacts, and start outreach from the same workspace.</p>
<p style="margin:0 0 16px 0;">It's not meant to replace the sales process. It's meant to give your team a better starting point.</p>
<p style="margin:0 0 16px 0;">Worth a quick look on a few lanes {{company_name}} already sells?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Freight prospecting is too manual",
      "Who is shipping right now, and is there a real reason to reach out?",
      `Freight sales timing matters more than list size. One rep who knows <em>when</em> a shipper is reviewing capacity beats ten reps who are guessing.`,
      "See it on your target lanes",
    ),
  },
  {
    id: "lit_marketing_broker_3_contact_discovery",
    name: "Broker Email 3 · Contact Discovery",
    audience: "freight_broker",
    stepNumber: 3,
    subject: "Not just any contacts",
    previewText: "Find the contacts behind the freight activity.",
    imageAssetKey: "contact_discovery",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Frames Contact Discovery as the answer to who to call.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">One thing we wanted to avoid with LIT was giving brokers another giant list of generic contacts.</p>
<p style="margin:0 0 16px 0;">A good freight sales workflow needs context first: who is actually shipping, what lanes they use, and which people are likely connected to logistics, transportation, procurement, or supply chain.</p>
<p style="margin:0 0 16px 0;">That's why LIT connects company intelligence with contact discovery — so your team isn't just chasing names, they're working from actual freight signals.</p>
<p style="margin:0 0 16px 0;">If {{company_name}} is focused on shipper growth, this could be useful. Want me to send over a sample account profile?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Not just any contacts",
      "Find the contacts behind the freight activity.",
      `The right title with no shipment context is still a cold call. The right title <em>plus</em> "your volume on this lane changed in Q3" is a meeting.`,
      "Send me a sample profile",
    ),
  },
  {
    id: "lit_marketing_broker_4_breakup",
    name: "Broker Email 4 · Close the Loop",
    audience: "freight_broker",
    stepNumber: 4,
    subject: "Should I close the loop?",
    previewText: "Last note on LIT for freight prospecting.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Breakup email — leaves the door open without pressure.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">I don't want to keep chasing you if this isn't relevant, so I'll close the loop after this.</p>
<p style="margin:0 0 16px 0;">We built LIT for freight teams that want a cleaner way to find active shippers, understand what they move, identify the right contacts, and turn that into outreach — without bouncing between five tools.</p>
<p style="margin:0 0 16px 0;">If shipper prospecting is already handled well at {{company_name}}, no worries.</p>
<p style="margin:0 0 16px 0;">But if your team is still working from static lists, generic lead databases, or manual research, this could be useful. Want a quick example of what a shipper profile looks like in LIT?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Should I close the loop?",
      "Last note on LIT for freight prospecting.",
      undefined,
      "Yes, send a sample",
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────
// Small Forwarder — 4-touch sequence
// ─────────────────────────────────────────────────────────────────────

export const smallForwarderTemplates: CampaignEmailTemplate[] = [
  {
    id: "lit_marketing_forwarder_1_company_intel",
    name: "Forwarder Email 1 · Company Intelligence Intro",
    audience: "small_forwarder",
    stepNumber: 1,
    subject: "Built this for forwarder sales teams",
    previewText: "Shipment intelligence for smaller forwarders.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Founder-style intro for forwarders.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">I built LIT because smaller freight forwarders need a better way to find and understand potential customers — without adding more manual research to the sales process.</p>
<p style="margin:0 0 16px 0;">Most forwarder teams don't have endless time to dig through shipment records, contact databases, spreadsheets, and CRMs just to figure out which accounts are worth pursuing.</p>
<p style="margin:0 0 16px 0;">LIT helps forwarders see who's actively shipping, what lanes they use, how often they move freight, and who may be worth contacting — all in one workspace.</p>
<p style="margin:0 0 16px 0;">{{company_name}} might find it useful as a way to build more targeted sales opportunities from real shipment activity. Want me to send over a sample profile?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Built this for forwarder sales teams",
      "Shipment intelligence built for smaller forwarders.",
      `Smaller forwarder teams win when they pick the right 50 accounts and pursue them with context — not when they email 5,000 names with no signal. LIT is built to make picking those 50 fast.`,
      "See a sample shipper profile",
    ),
  },
  {
    id: "lit_marketing_forwarder_2_better_signals",
    name: "Forwarder Email 2 · Better Signals",
    audience: "small_forwarder",
    stepNumber: 2,
    subject: "Forwarders need better signals",
    previewText: "Start sales conversations from actual shipment activity.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Follow-up on why shipment activity matters as a sales signal.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">A lot of freight sales still starts with a weak signal: a company list, a cold contact, or a guess that someone might ship.</p>
<p style="margin:0 0 16px 0;">We built LIT around a stronger signal: actual shipment activity.</p>
<p style="margin:0 0 16px 0;">For forwarders, that means looking at companies by trade activity, top lanes, shipment volume, mode indicators, and account-level patterns before deciding who to pursue.</p>
<p style="margin:0 0 16px 0;">The goal isn't to make sales robotic — it's to help your team start better conversations with better context.</p>
<p style="margin:0 0 16px 0;">If {{company_name}} is growing import or export accounts, LIT can identify companies already moving freight and give your team a real reason to reach out. Want me to show you?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Forwarders need better signals",
      "Start sales conversations from actual shipment activity.",
      `"Hope you're well, just checking in" reads the same to every shipper. "I noticed your import volume to LAX shifted in Q2" reads only to the one that's actually relevant. That's the difference shipment data makes.`,
      "Show me what it looks like",
    ),
  },
  {
    id: "lit_marketing_forwarder_3_pulse_ai",
    name: "Forwarder Email 3 · Pulse AI Brief",
    audience: "small_forwarder",
    stepNumber: 3,
    subject: "The first 30 seconds of account research",
    previewText: "Pulse AI turns shipment activity into account briefs.",
    imageAssetKey: "pulse_ai",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    description: "Frames Pulse AI as a research / time-saving tool.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">One of the hardest parts of forwarder sales is doing enough research to make the outreach relevant — without spending 30 minutes on every account.</p>
<p style="margin:0 0 16px 0;">That's why we built Pulse AI inside LIT.</p>
<p style="margin:0 0 16px 0;">Pulse turns shipment activity into a quick account brief: what changed, where the opportunity is, what risk signals are visible, and what outreach angle may actually make sense.</p>
<p style="margin:0 0 16px 0;">For smaller teams, the value is simple: less account research from scratch, more focused conversations. Want me to send a sample brief?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "The first 30 seconds of account research",
      "Pulse AI turns shipment activity into account briefs.",
      `Pulse AI is what reps use right before a call — 30 seconds in, you know cadence, top lanes, recent shifts, and what to lead with. The point isn't more data; it's the right data, fast.`,
      "Send me a sample brief",
    ),
  },
  {
    id: "lit_marketing_forwarder_4_breakup",
    name: "Forwarder Email 4 · Useful or Not a Fit",
    audience: "small_forwarder",
    stepNumber: 4,
    subject: "Useful or not a fit?",
    previewText: "Last note on LIT for forwarder prospecting.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Breakup email — closes the loop with a clean ask.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Last note from me.</p>
<p style="margin:0 0 16px 0;">LIT isn't for every forwarder. If your team already has a strong way to find active shippers, research accounts, enrich contacts, and manage outreach, this probably isn't urgent.</p>
<p style="margin:0 0 16px 0;">But if prospecting still involves manual research, spreadsheets, disconnected tools, or generic lead lists — I think LIT could help.</p>
<p style="margin:0 0 16px 0;">We built it to help forwarders turn shipment data into real sales opportunities, not just more records to sort through. Want a sample account profile so you can decide?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Useful or not a fit?",
      "Last note on LIT for forwarder prospecting.",
      undefined,
      "Send the sample profile",
    ),
  },
];

/** Combined LIT Marketing template registry — surfaced in the picker. */
export const LIT_MARKETING_TEMPLATES: CampaignEmailTemplate[] = [
  ...freightBrokerTemplates,
  ...smallForwarderTemplates,
];

// ─────────────────────────────────────────────────────────────────────
// HTML resolution + validation
// ─────────────────────────────────────────────────────────────────────

/**
 * Replace the asset placeholders ({{*_public_url}}) with absolute https://
 * URLs from EMAIL_ASSETS. Send-time tokens (first_name etc.) pass through
 * unchanged — those resolve later when the dispatcher applies merge vars.
 *
 * Call this BEFORE inserting the HTML into the composer / persisting it
 * to lit_campaign_steps.body. The persisted body should never contain
 * {{*_public_url}} — those are template-author conveniences, not runtime
 * variables.
 */
export function resolveEmailTemplateHtml(templateHtml: string): string {
  return templateHtml
    .split("{{company_intelligence_public_url}}")
    .join(EMAIL_ASSETS.company_intelligence)
    .split("{{contact_discovery_public_url}}")
    .join(EMAIL_ASSETS.contact_discovery)
    .split("{{pulse_ai_public_url}}")
    .join(EMAIL_ASSETS.pulse_ai)
    .split("{{campaign_builder_public_url}}")
    .join(EMAIL_ASSETS.campaign_builder)
    .split("{{rate_benchmark_public_url}}")
    .join(EMAIL_ASSETS.rate_benchmark)
    .split("{{pulse_workflow_public_url}}")
    .join(EMAIL_ASSETS.pulse_workflow)
    .split("{{lane_signals_public_url}}")
    .join(EMAIL_ASSETS.lane_signals);
}

export type EmailHtmlValidationIssue = {
  kind: "unresolved_asset_placeholder" | "invalid_image_src";
  detail: string;
};

/**
 * Sanity-check final email HTML before save / launch / test send.
 * Returns issues per <img> tag whose src is not a public https:// URL,
 * plus any leftover {{*_public_url}} placeholders that escaped resolution.
 */
export function validateEmailHtml(html: string): EmailHtmlValidationIssue[] {
  const issues: EmailHtmlValidationIssue[] = [];
  if (!html) return issues;

  // Unresolved asset placeholders should never reach the persist layer.
  const PLACEHOLDER_RE = /\{\{[a-z_]+_public_url\}\}/gi;
  const placeholders = html.match(PLACEHOLDER_RE);
  if (placeholders && placeholders.length > 0) {
    for (const p of new Set(placeholders)) {
      issues.push({
        kind: "unresolved_asset_placeholder",
        detail: `Unresolved image placeholder: ${p}. Run resolveEmailTemplateHtml() before saving.`,
      });
    }
  }

  // <img src="…"> must be an absolute https:// URL. Reject blob:, data:,
  // mnt/, localhost, relative, or anything containing a bare {{ token.
  const IMG_SRC_RE = /<img\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi;
  let match: RegExpExecArray | null;
  while ((match = IMG_SRC_RE.exec(html)) !== null) {
    const src = match[1].trim();
    if (!/^https:\/\//i.test(src)) {
      issues.push({
        kind: "invalid_image_src",
        detail: `Image src must be a public HTTPS URL to render in email clients. Got: ${src.slice(0, 120)}`,
      });
      continue;
    }
    if (src.includes("{{") || src.includes("blob:") || src.includes("data:") || src.includes("/mnt/") || src.includes("localhost")) {
      issues.push({
        kind: "invalid_image_src",
        detail: `Image src contains a forbidden pattern (placeholder / blob / data / mnt / localhost): ${src.slice(0, 120)}`,
      });
    }
  }
  return issues;
}

/**
 * Convenience: shape a CampaignEmailTemplate for the existing
 * OutreachTemplate-shaped picker. Resolves the asset URLs so the body
 * surface in the composer is already final HTML, with only the send-time
 * tokens left to merge.
 */
export function asOutreachTemplate(t: CampaignEmailTemplate): {
  id: string;
  name: string;
  channel: "email";
  subject: string;
  body: string;
  persona_id: null;
} {
  return {
    id: t.id,
    name: t.name,
    channel: "email",
    subject: t.subject,
    body: resolveEmailTemplateHtml(t.html),
    persona_id: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 14-touch sequence adapter — re-exported from litMarketingSequence.ts
// ─────────────────────────────────────────────────────────────────────────────

export { applyLitMarketingSequenceToBuilder } from "./litMarketingSequence";
export type { LitMarketingTouch, LitTouchKind, LitBuilderStep } from "./litMarketingSequence";
