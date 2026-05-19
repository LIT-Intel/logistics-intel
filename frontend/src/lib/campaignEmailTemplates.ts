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
  extras?: {
    headline?: string;
    bullets?: string[];
    resourceCard?: {
      companyName: string;
      teu12m: string;
      topLane: string;
      topCarrier: string;
      trigger: string;
      crmStage?: string;
      caption: string;
    };
  },
): string {
  return wrapV7({
    bodyHtml,
    ctaText,
    ctaUrl,
    previewText,
    subjectLine: subject,
    proTipHtml,
    headline: extras?.headline,
    bullets: extras?.bullets,
    resourceCard: extras?.resourceCard,
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
    id: "lit_marketing_broker_1_founder_intro",
    name: "Broker Email 1 · Founder Intro",
    audience: "freight_broker",
    stepNumber: 1,
    subject: "the freight intel built for brokers",
    previewText: "Live shipment patterns, verified contacts, and buying signals — in one workspace.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}"],
    description: "Day 0 welcome intro for freight brokers. Positioning-led headline; founder-voice body.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Welcome to Logistics Intel — the trade intelligence platform built specifically for freight brokers.</p>
<p style="margin:0 0 16px 0;">After six years inside a forwarder in Atlanta, I watched too many brokerage reps chase the same accounts as every other broker in the market. The lists were stale, the contacts were wrong, and the signals — the ones that tell you which shipper is actually ready to switch carriers — never made it into anyone's CRM.</p>
<p style="margin:0 0 16px 0;">So we built it. Every U.S. bill of lading, joined to verified ops contacts, with the buying signals already surfaced. Your reps walk into every call knowing the shipper's lanes, current carrier, and volume direction.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "the freight intel built for brokers",
      "Live shipment patterns, verified contacts, and buying signals — in one workspace.",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_1_founder_intro",
      {
        headline: "The freight intel built for brokers.",
        bullets: [
          "Every U.S. bill of lading, refreshed daily",
          "Carrier shifts and lane launches as buying signals",
          "Verified ops contacts, 95% deliverability",
          "One workspace, not five disconnected tools",
        ],
      },
    ),
  },
  {
    id: "lit_marketing_broker_2_account_card",
    name: "Broker Email 2 · First 30 Seconds of Research",
    audience: "freight_broker",
    stepNumber: 2,
    subject: "the first 30 seconds of account research, done",
    previewText: "What your reps see when they open any account.",
    imageAssetKey: "pulse_ai",
    tokensUsed: ["{{first_name}}"],
    description: "Day +3 follow-up. Concrete account-card proof with two trigger callouts.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">{{first_name}}, this is what your reps see when they open any account inside Logistics Intel.</p>
<p style="margin:0 0 8px 0;">• Trailing 12m: 18.9K TEU on TR → US</p>
<p style="margin:0 0 8px 0;">• Trigger: 4 new origin ports activated, volume up 18% — capacity expansion</p>
<p style="margin:0 0 8px 0;">• Trigger: rising single-carrier reliance — pricing-leverage moment</p>
<p style="margin:0 0 16px 0;">• CRM stage: pushes to your Command Center or external CRM</p>
<p style="margin:0 0 16px 0;">Every signal cited to a public source. Refreshed weekly. Ninety-five percent confidence. No hallucinated facts.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "the first 30 seconds of account research, done",
      "What your reps see when they open any account.",
      undefined,
      "See your accounts",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_2_account_card",
      {
        headline: "Open an account. See the deal.",
        bullets: [
          "T-12m volume on TR → US",
          "Trigger: 4 new origin ports activated",
          "Trigger: rising single-carrier reliance",
          "Pushes to your Command Center or external CRM",
        ],
        resourceCard: {
          companyName: "Tesla, Inc.",
          teu12m: "14,200 TEU",
          topLane: "CN → US Long Beach",
          topCarrier: "COSCO Shipping",
          trigger: "+18% volume MoM",
          crmStage: "Active",
          caption: "Every signal cited to public source. 95% confidence. No hallucinated facts.",
        },
      },
    ),
  },
  {
    id: "lit_marketing_broker_3_signal_selling",
    name: "Broker Email 3 · Signal-Based Selling",
    audience: "freight_broker",
    stepNumber: 3,
    subject: "stop guessing who's shipping right now",
    previewText: "Targeting and timing — the only two things that matter.",
    imageAssetKey: "pulse_workflow",
    tokensUsed: ["{{first_name}}"],
    description: "Day +7 follow-up. Comparison frame: blind prospecting vs signal-based.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">{{first_name}}, the difference between a broker who hits quota and one who chases lists comes down to two things: targeting and timing.</p>
<p style="margin:0 0 8px 0;">• Live shipment patterns and trailing-12m volume on every importer</p>
<p style="margin:0 0 8px 0;">• Carrier shifts, new origin ports, and lane launches surfaced as buying signals</p>
<p style="margin:0 0 8px 0;">• "Saw your VN → US volume spike 18% this quarter" beats "just checking in"</p>
<p style="margin:0 0 16px 0;">• One workspace built for logistics, not a generic CRM</p>
<p style="margin:0 0 16px 0;">The free trial gets your team the full workspace for fourteen days. Bring your top accounts and tell us what's missing.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "stop guessing who's shipping right now",
      "Targeting and timing — the only two things that matter.",
      undefined,
      "Try it free for 14 days",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_3_signal_selling",
      {
        headline: "Targeting and timing. Just those two.",
        bullets: [
          "Live shipment patterns and T-12m volume",
          "Carrier shifts and new origin ports surfaced as signals",
          "\"Saw your VN → US spike 18% this quarter\" beats \"just checking in\"",
          "Built for logistics, not a generic CRM",
        ],
        resourceCard: {
          companyName: "Home Depot",
          teu12m: "127,800 TEU",
          topLane: "Multi-origin → US Savannah",
          topCarrier: "Maersk",
          trigger: "lane diversification active",
          crmStage: "Active",
          caption: "Buying signals on every importer, refreshed weekly.",
        },
      },
    ),
  },
  {
    id: "lit_marketing_broker_4_quiet_close",
    name: "Broker Email 4 · Quiet Close (Question Lead)",
    audience: "freight_broker",
    stepNumber: 4,
    subject: "one quick question",
    previewText: "What's the hardest part of finding new accounts right now?",
    tokensUsed: ["{{first_name}}"],
    description: "Day +14 final touch. Single-question close. Soft trial CTA.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">{{first_name}}, one quick question and then we'll get out of your inbox.</p>
<p style="margin:0 0 16px 0;">What's the hardest part of finding new accounts for your team right now? Stale lists, no signal, contact data drift, something else?</p>
<p style="margin:0 0 16px 0;">One sentence is enough. We read every reply.</p>
<p style="margin:0 0 16px 0;">If it's easier to just poke around, the trial is fourteen days, no card.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "one quick question",
      "What's the hardest part of finding new accounts right now?",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_4_quiet_close",
      {
        headline: "One question. One sentence back.",
      },
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────
// Small Forwarder — 4-touch sequence
// ─────────────────────────────────────────────────────────────────────

export const smallForwarderTemplates: CampaignEmailTemplate[] = [
  {
    id: "lit_marketing_forwarder_1_founder_intro",
    name: "Forwarder Email 1 · Founder Intro",
    audience: "small_forwarder",
    stepNumber: 1,
    subject: "live shipper intel, built for forwarders",
    previewText: "Every U.S. bill of lading, joined to verified ops contacts, refreshed daily.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}"],
    description: "Day 0 welcome intro for freight forwarders. Positioning-led headline; founder-voice body.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Welcome to Logistics Intel — the trade intelligence platform built specifically for freight forwarders.</p>
<p style="margin:0 0 16px 0;">After six years quoting freight at a forwarder in Atlanta, I knew there had to be a better way than opening seven tabs every Monday morning trying to figure out who was actually moving freight that week. The lists were always wrong by a quarter, the contacts were stale, and the lanes were guesswork.</p>
<p style="margin:0 0 16px 0;">So we built it. Every U.S. bill of lading, joined to verified ops contacts, refreshed daily. Filter by lane, see who's moving freight right now, and stop chasing companies that haven't imported in two years.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "live shipper intel, built for forwarders",
      "Every U.S. bill of lading, joined to verified ops contacts, refreshed daily.",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_1_founder_intro",
      {
        headline: "Live shipper intel, built for forwarders.",
        bullets: [
          "Every U.S. bill of lading, refreshed daily",
          "Verified ops contacts on every importer",
          "Filter by lane, carrier, volume, and TEU trend",
          "One workspace built for logistics",
        ],
      },
    ),
  },
  {
    id: "lit_marketing_forwarder_2_account_card",
    name: "Forwarder Email 2 · What 30 Seconds Looks Like",
    audience: "small_forwarder",
    stepNumber: 2,
    subject: "what 30 seconds of research looks like",
    previewText: "One account profile, one click. Lane, volume, carrier, signal.",
    imageAssetKey: "pulse_ai",
    tokensUsed: ["{{first_name}}"],
    description: "Day +3 follow-up. Concrete account-card proof, not features.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">{{first_name}}, this is what an account profile looks like inside Logistics Intel — one card, one click.</p>
<p style="margin:0 0 8px 0;">• Trailing 12m volume: 18.9K TEU</p>
<p style="margin:0 0 8px 0;">• Top lane: TR → US, 4 new origin ports activated</p>
<p style="margin:0 0 8px 0;">• Top carrier: Hapag-Lloyd, growing single-carrier reliance</p>
<p style="margin:0 0 16px 0;">• CRM stage: synced to your pipeline</p>
<p style="margin:0 0 16px 0;">Every claim cited to a public source, refreshed weekly, no hallucinated facts. Run it on your own top 25 accounts and tell us if anything looks off.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "what 30 seconds of research looks like",
      "One account profile, one click. Lane, volume, carrier, signal.",
      undefined,
      "See it on your accounts",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_2_account_card",
      {
        headline: "Account research, in 30 seconds.",
        bullets: [
          "Trailing-12m volume, in TEU and shipment count",
          "Top lane and current carrier",
          "Buying signals: new origin ports, carrier shifts",
          "CRM stage synced to your pipeline",
        ],
        resourceCard: {
          companyName: "Tesla, Inc.",
          teu12m: "14,200 TEU",
          topLane: "CN → US Long Beach",
          topCarrier: "COSCO Shipping",
          trigger: "+18% volume MoM",
          crmStage: "Active",
          caption: "Open any importer. See the whole account in 30 seconds.",
        },
      },
    ),
  },
  {
    id: "lit_marketing_forwarder_3_velocity",
    name: "Forwarder Email 3 · Search to Campaign in 20 Min",
    audience: "small_forwarder",
    stepNumber: 3,
    subject: "from a search bar to a campaign in 20 minutes",
    previewText: "What used to take a sales team five days.",
    imageAssetKey: "campaign_builder",
    tokensUsed: ["{{first_name}}"],
    description: "Day +7 follow-up. Workflow compression — Pulse → Coach → Triggers → Campaign → Replies.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">{{first_name}}, the work that used to take a sales team five days now takes twenty minutes.</p>
<p style="margin:0 0 8px 0;">• Search "EV battery importers shipping from Korea" — Pulse finds 27 matches</p>
<p style="margin:0 0 8px 0;">• Pulse Coach flags 8 with volume up month-over-month</p>
<p style="margin:0 0 8px 0;">• Auto-save companies, queue verified ops contacts</p>
<p style="margin:0 0 16px 0;">• Launch a Day-1 sequence to all 12 buyers from inside the same tab</p>
<p style="margin:0 0 16px 0;">One workspace, one round of research, one launch. The free trial gets you the full thing for fourteen days.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "from a search bar to a campaign in 20 minutes",
      "What used to take a sales team five days.",
      undefined,
      "Try it free for 14 days",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_3_velocity",
      {
        headline: "Five days of research, twenty minutes.",
        bullets: [
          "Search by lane, HS code, or origin port",
          "AI surfaces companies with volume up MoM",
          "Auto-queue verified ops contacts",
          "Launch a Day-1 sequence in the same tab",
        ],
        resourceCard: {
          companyName: "Costco Wholesale",
          teu12m: "89,400 TEU",
          topLane: "CN → US LA/LB",
          topCarrier: "OOCL",
          trigger: "steady, +2% YoY",
          crmStage: "Active",
          caption: "Pulse Coach finds 27 matches. You launch to 12 in twenty minutes.",
        },
      },
    ),
  },
  {
    id: "lit_marketing_forwarder_4_quiet_close",
    name: "Forwarder Email 4 · Quiet Close",
    audience: "small_forwarder",
    stepNumber: 4,
    subject: "one last note",
    previewText: "If the shipper feed isn't useful, that's a fair answer.",
    tokensUsed: ["{{first_name}}"],
    description: "Day +14 final touch. Short, no image, soft close.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">{{first_name}}, last note from us.</p>
<p style="margin:0 0 16px 0;">If the shipper feed isn't useful, that's a fair answer and we won't keep pinging. The trial is fourteen days, no card, no auto-renew. If you'd like to see it on your own top three lanes, it's right here.</p>
<p style="margin:0 0 16px 0;">Either way — appreciate you reading this far.</p>
<p style="margin:0;">— the Logistics Intel team</p>`,
      "one last note",
      "If the shipper feed isn't useful, that's a fair answer.",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_4_quiet_close",
      {
        headline: "Last note from us.",
      },
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
