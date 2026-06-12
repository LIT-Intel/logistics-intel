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
    bodyAfterBullets?: string;
    signoff?: string;
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
    bodyAfterBullets: extras?.bodyAfterBullets,
    signoff: extras?.signoff,
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
    previewText: "Trade intelligence designed specifically for freight brokers.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}"],
    description: "Day 0 welcome intro for freight brokers. Pain-aware open, positioning-led, founder-voice credibility middle.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Most freight brokers are still prospecting from the same stale lead lists, outdated contacts, and generic company data as everyone else.</p>
<p style="margin:0 0 16px 0;">That makes it harder to know which shippers are actually active, who they're using today, and when there may be a real opportunity to start a conversation.</p>
<p style="margin:0 0 16px 0;">That's why we built Logistics Intel — a trade intelligence platform designed specifically for freight brokers.</p>
<p style="margin:0 0 16px 0;">After six years inside a global forwarder in Atlanta, I saw how much time reps wasted chasing accounts without the right shipping context. Logistics Intel brings together U.S. bill of lading data, verified operations contacts, and freight-specific buying signals in one workspace.</p>
<p style="margin:0 0 16px 0;">Your team can see a shipper's lanes, current carriers, shipment activity, and volume trends before making the first call.</p>
<p style="margin:0;">What Logistics Intel helps brokers uncover:</p>`,
      "the freight intel built for brokers",
      "Trade intelligence designed specifically for freight brokers.",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_1_founder_intro",
      {
        headline: "The freight intel built for brokers.",
        bullets: [
          "U.S. bill of lading data refreshed daily",
          "Carrier shifts and lane launches surfaced as buying signals",
          "Verified operations contacts with strong deliverability",
          "One workspace instead of multiple disconnected tools",
        ],
        bodyAfterBullets: `<p style="margin:0;">If your team is looking for a better way to find and prioritize freight opportunities, Logistics Intel was built for that.</p>`,
        signoff: `Best,<br/>The Logistics Intel Team`,
      },
    ),
  },
  {
    id: "lit_marketing_broker_2_account_card",
    name: "Broker Email 2 · Account Research",
    audience: "freight_broker",
    stepNumber: 2,
    subject: "Account research built for freight brokers",
    previewText: "Volume, lanes, carriers, and buying signals — all in one account view.",
    imageAssetKey: "pulse_ai",
    tokensUsed: ["{{first_name}}"],
    description: "Day +3 follow-up. Pre-call account research framing with a concrete example card.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Before a rep calls a shipper, they usually need to answer a few basic questions:</p>
<p style="margin:0 0 8px 0;">Who are they shipping with?</p>
<p style="margin:0 0 8px 0;">Which lanes are active?</p>
<p style="margin:0 0 8px 0;">Is volume growing or slowing down?</p>
<p style="margin:0 0 16px 0;">Is there a reason they may be open to a new carrier or broker?</p>
<p style="margin:0 0 16px 0;">Most teams have to piece that together across multiple tools.</p>
<p style="margin:0 0 16px 0;">Logistics Intel puts that account research in one place.</p>
<p style="margin:0 0 16px 0;">When your reps open a company profile, they can quickly see shipment volume, active trade lanes, current carriers, recent changes, and buying signals that help them understand whether the account is worth pursuing.</p>
<p style="margin:0;">For example, an account brief may show:</p>`,
      "Account research built for freight brokers",
      "Volume, lanes, carriers, and buying signals — all in one account view.",
      undefined,
      "See your accounts",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_2_account_card",
      {
        headline: "Account research built for freight brokers.",
        bullets: [
          "Trailing 12-month volume by lane",
          "New origin ports or lane activity",
          "Carrier shifts or rising single-carrier reliance",
          "Volume changes that may signal capacity needs",
          "Push to your Command Center or external CRM",
        ],
        bodyAfterBullets: `<p style="margin:0;">Every signal is tied back to public source data, refreshed weekly, and built to help brokers walk into outreach with better context.</p>`,
        signoff: `— The Logistics Intel Team`,
        resourceCard: {
          companyName: "Tesla, Inc.",
          teu12m: "14,200 TEU",
          topLane: "CN → US Long Beach",
          topCarrier: "COSCO Shipping",
          trigger: "+18% volume MoM",
          crmStage: "Active",
          caption: "A real account brief inside the workspace — public BOL data, refreshed weekly.",
        },
      },
    ),
  },
  {
    id: "lit_marketing_broker_3_signal_selling",
    name: "Broker Email 3 · Domestic Freight Signals",
    audience: "freight_broker",
    stepNumber: 3,
    subject: "Find domestic freight signals before your competitors",
    previewText: "Port spikes, lane shifts, and carrier changes that signal drayage and truckload need.",
    imageAssetKey: "pulse_workflow",
    tokensUsed: ["{{first_name}}"],
    description: "Day +7 follow-up. Domestic-freight angle (drayage, transload, truckload) framed around buying signals.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Good freight prospecting usually comes down to two things: targeting and timing.</p>
<p style="margin:0 0 16px 0;">For brokers, the best opportunities often show up before a shipper says they need help. A spike in import volume, a new port of entry, or a shift in lane activity can all signal upcoming domestic freight needs — drayage from the port, transload support, warehouse transfers, or full truckload moves between facilities.</p>
<p style="margin:0 0 16px 0;">That is what Logistics Intel is built to help uncover.</p>
<p style="margin:0 0 16px 0;">Instead of working from static lists, your team can see shipment patterns, trailing 12-month volume, port activity, carrier shifts, and lane changes surfaced as buying signals.</p>
<p style="margin:0 0 16px 0;">That gives reps a more relevant reason to start the conversation.</p>
<p style="margin:0 0 16px 0;">For example:</p>
<p style="margin:0 0 16px 0;font-style:italic;color:#475569;">&ldquo;Saw your inbound volume through Savannah increased this quarter — are you reviewing drayage or truckload capacity from the port?&rdquo;</p>
<p style="margin:0 0 16px 0;">That lands better than:</p>
<p style="margin:0 0 16px 0;font-style:italic;color:#475569;">&ldquo;Just checking in to see if you have any freight.&rdquo;</p>
<p style="margin:0;">What your team can see inside Logistics Intel:</p>`,
      "Find domestic freight signals before your competitors",
      "Port spikes, lane shifts, and carrier changes that signal drayage and truckload need.",
      undefined,
      "Try it free for 14 days",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_3_signal_selling",
      {
        headline: "Find domestic freight signals before your competitors.",
        bullets: [
          "Import volume and shipment patterns by company",
          "Port activity and lane changes that signal domestic freight needs",
          "Carrier shifts and new origin activity surfaced as buying signals",
          "Account context your reps can use before the first call",
        ],
        bodyAfterBullets: `<p style="margin:0;">The 14-day free trial gives your team access to the workspace so you can test it against the accounts you are already pursuing.</p>`,
        signoff: `— The Logistics Intel Team`,
        resourceCard: {
          companyName: "Home Depot",
          teu12m: "127,800 TEU",
          topLane: "Multi-origin → US Savannah",
          topCarrier: "Maersk",
          trigger: "Savannah inbound volume up this quarter",
          crmStage: "Active",
          caption: "Port spikes like this become a real reason to start a domestic-freight conversation.",
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
    previewText: "What is the hardest part of finding new shipper accounts right now?",
    tokensUsed: ["{{first_name}}"],
    description: "Day +14 final touch. Single-question close. Soft trial CTA.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">One quick question, and then we'll get out of your inbox.</p>
<p style="margin:0 0 16px 0;">What is the hardest part of finding new shipper accounts for your team right now?</p>
<p style="margin:0 0 16px 0;">Is it stale lead lists, bad contact data, not knowing who is actively shipping, or not having a clear reason to reach out?</p>
<p style="margin:0 0 16px 0;">One sentence is enough — we read every reply.</p>
<p style="margin:0;">If it's easier to just take a look, the trial is 14 days with no card required.</p>`,
      "one quick question",
      "What is the hardest part of finding new shipper accounts right now?",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_broker_4_quiet_close",
      {
        headline: "One quick question.",
        signoff: `— The Logistics Intel Team`,
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
    name: "Forwarder Email 1 · Problem Awareness",
    audience: "small_forwarder",
    stepNumber: 1,
    subject: "Freight leads built for forwarders",
    previewText: "Trade intelligence designed for freight sales teams.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}"],
    description: "Day 0 educational intro for freight forwarders. Problem-awareness opener; positioning middle; capability bullets.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Finding freight leads is easy. Finding the right freight leads is the hard part.</p>
<p style="margin:0 0 16px 0;">Most forwarders are still working from stale account lists, outdated contacts, and generic company data that does not show whether a shipper is actually active, growing, or worth pursuing.</p>
<p style="margin:0 0 16px 0;">That is why we built Logistics Intel — a trade intelligence platform designed for freight sales teams.</p>
<p style="margin:0 0 16px 0;">Logistics Intel helps forwarders see which companies are actively importing or exporting, where their freight is moving, who they may be using today, and what changes may create a reason to reach out.</p>
<p style="margin:0 0 16px 0;">Your team can walk into outreach with better context around lanes, ports, shipment volume, carrier activity, and verified decision-maker contacts.</p>
<p style="margin:0;">What Logistics Intel helps forwarders uncover:</p>`,
      "Freight leads built for forwarders",
      "Trade intelligence designed for freight sales teams.",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_1_founder_intro",
      {
        headline: "Freight leads built for forwarders.",
        bullets: [
          "Import and export shipment activity",
          "Active trade lanes and port pairs",
          "Volume trends and shipment frequency",
          "Carrier and forwarder signals",
          "Verified operations and logistics contacts",
        ],
        bodyAfterBullets: `<p style="margin:0;">If your team is looking for a better way to find and prioritize freight opportunities, Logistics Intel was built for that.</p>`,
        signoff: `— The Logistics Intel Team`,
      },
    ),
  },
  {
    id: "lit_marketing_forwarder_2_account_card",
    name: "Forwarder Email 2 · Account Intelligence",
    audience: "small_forwarder",
    stepNumber: 2,
    subject: "Know the account before the first call",
    previewText: "Volume, lanes, ports, carrier signals — all in one account view.",
    imageAssetKey: "pulse_ai",
    tokensUsed: ["{{first_name}}"],
    description: "Day +3 follow-up. Pre-call account research framing with a concrete account brief example.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Before a forwarder reaches out to a prospect, they usually need to answer a few important questions:</p>
<p style="margin:0 0 8px 0;">What are they shipping?</p>
<p style="margin:0 0 8px 0;">Which lanes are active?</p>
<p style="margin:0 0 8px 0;">How often are they moving freight?</p>
<p style="margin:0 0 8px 0;">Which ports are they using?</p>
<p style="margin:0 0 16px 0;">Is there a reason they may be open to a new forwarding partner?</p>
<p style="margin:0 0 16px 0;">Most teams have to piece that together across multiple tools.</p>
<p style="margin:0 0 16px 0;">Logistics Intel puts that account research in one place.</p>
<p style="margin:0 0 16px 0;">When your reps open a company profile, they can quickly see shipment volume, active lanes, port activity, carrier or forwarder signals, and recent changes that may point to a real opportunity.</p>
<p style="margin:0;">For example, an account brief may show:</p>`,
      "Know the account before the first call",
      "Volume, lanes, ports, carrier signals — all in one account view.",
      undefined,
      "See your accounts",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_2_account_card",
      {
        headline: "Know the account before the first call.",
        bullets: [
          "Trailing 12-month shipment volume",
          "Top origin and destination lanes",
          "Port activity and shipment frequency",
          "Carrier or forwarder changes",
          "Verified logistics contacts",
        ],
        bodyAfterBullets: `<p style="margin:0;">Every signal is tied back to public source data, refreshed regularly, and built to help forwarders walk into outreach with better context.</p>`,
        signoff: `— The Logistics Intel Team`,
        resourceCard: {
          companyName: "Tesla, Inc.",
          teu12m: "14,200 TEU",
          topLane: "CN → US Long Beach",
          topCarrier: "COSCO Shipping",
          trigger: "+18% volume MoM",
          crmStage: "Active",
          caption: "A real account brief inside the workspace — public BOL data, refreshed regularly.",
        },
      },
    ),
  },
  {
    id: "lit_marketing_forwarder_3_velocity",
    name: "Forwarder Email 3 · Timing & Outreach Relevance",
    audience: "small_forwarder",
    stepNumber: 3,
    subject: "A better reason to reach out",
    previewText: "Real shipping activity gives reps a more relevant reason to start the conversation.",
    imageAssetKey: "campaign_builder",
    tokensUsed: ["{{first_name}}"],
    description: "Day +7 follow-up. Timing-based outreach framing; concrete India→Savannah example vs generic 'do you have any freight' anti-example.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Good freight prospecting usually comes down to two things: targeting and timing.</p>
<p style="margin:0 0 16px 0;">For forwarders, the best opportunities often show up before a shipper sends out an RFQ. A new origin country, a lane expansion, increased shipment frequency, or a carrier change can all signal that something is moving inside the account.</p>
<p style="margin:0 0 16px 0;">That is where better account intelligence can make a difference.</p>
<p style="margin:0 0 16px 0;">Instead of reaching out with a generic &ldquo;just checking in,&rdquo; your team can use real shipping activity to start a more relevant conversation.</p>
<p style="margin:0 0 16px 0;">For example:</p>
<p style="margin:0 0 16px 0;font-style:italic;color:#475569;">&ldquo;Saw your imports from India to Savannah have increased this quarter &mdash; are you reviewing options for ocean freight or customs support on that lane?&rdquo;</p>
<p style="margin:0 0 16px 0;">That lands better than:</p>
<p style="margin:0 0 16px 0;font-style:italic;color:#475569;">&ldquo;Do you have any freight we can quote?&rdquo;</p>
<p style="margin:0;">What your team can see inside Logistics Intel:</p>`,
      "A better reason to reach out",
      "Real shipping activity gives reps a more relevant reason to start the conversation.",
      undefined,
      "Try it free for 14 days",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_3_velocity",
      {
        headline: "A better reason to reach out.",
        bullets: [
          "Active import and export lanes",
          "Shipment volume and frequency changes",
          "New origin or destination activity",
          "Carrier and routing shifts",
          "Contact enrichment for logistics decision-makers",
        ],
        bodyAfterBullets: `<p style="margin:0;">The 14-day free trial gives your team access to the workspace so you can test it against the accounts you are already pursuing.</p>`,
        signoff: `— The Logistics Intel Team`,
        resourceCard: {
          companyName: "Costco Wholesale",
          teu12m: "89,400 TEU",
          topLane: "Multi-origin → US (LA/LB + Savannah)",
          topCarrier: "OOCL",
          trigger: "Savannah inbound volume up this quarter",
          crmStage: "Active",
          caption: "Lane expansions and port shifts like this become a real reason to start a conversation.",
        },
      },
    ),
  },
  {
    id: "lit_marketing_forwarder_4_quiet_close",
    name: "Forwarder Email 4 · Quiet Close (Reply Ask)",
    audience: "small_forwarder",
    stepNumber: 4,
    subject: "One quick question",
    previewText: "What is the hardest part of finding new shipper accounts right now?",
    tokensUsed: ["{{first_name}}"],
    description: "Day +14 final touch. Single-question close. Soft trial CTA.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">One quick question, and then we'll get out of your inbox.</p>
<p style="margin:0 0 16px 0;">What is the hardest part of finding new shipper accounts for your forwarding team right now?</p>
<p style="margin:0 0 16px 0;">Is it stale lead lists, bad contact data, not knowing who is actively shipping, or not having a clear reason to reach out?</p>
<p style="margin:0 0 16px 0;">One sentence is enough — we read every reply.</p>
<p style="margin:0;">If it is easier to just take a look, the trial is 14 days with no card required.</p>`,
      "One quick question",
      "What is the hardest part of finding new shipper accounts right now?",
      undefined,
      "Start your 14-day free trial",
      "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=lit_marketing_forwarder_4_quiet_close",
      {
        headline: "One quick question.",
        signoff: `— The Logistics Intel Team`,
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
// LIT Marketing sequence builder — defined here (not in litMarketingSequence.ts)
// because it needs to read freightBrokerTemplates / smallForwarderTemplates
// above. Putting it here keeps the import direction one-way:
// campaignEmailTemplates → litMarketingSequence (for wrapV7). The reverse
// direction would create a circular import that browser ESM can't resolve.
// ─────────────────────────────────────────────────────────────────────────────

export type { LitMarketingTouch, LitTouchKind, LitBuilderStep } from "./litMarketingSequence";
import type { LitAudience, LitBuilderStep } from "./litMarketingSequence";

/**
 * Convert the LIT Marketing 4-email sequence into BuilderStep-compatible
 * objects for CampaignBuilder. Picking the broker play seeds B1-B4; picking
 * the forwarder play seeds F1-F4. Email-only cadence over 14 days:
 *   Day 1  — intro (Email 1)
 *   Day 4  — proof (Email 2)
 *   Day 8  — use-case (Email 3)
 *   Day 14 — reply-ask (Email 4)
 */
export function applyLitMarketingSequenceToBuilder(
  resolveHtml: (raw: string) => string,
  audience: LitAudience = "broker",
): LitBuilderStep[] {
  function uid(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const templates =
    audience === "forwarder" ? smallForwarderTemplates : freightBrokerTemplates;

  // Delay-days per step: step 1 = 0 (Day 1), step 2 = +3 (Day 4),
  // step 3 = +4 (Day 8), step 4 = +6 (Day 14). CampaignBuilder schedules
  // each step relative to the previous step's send time.
  const DELAY_DAYS = [0, 3, 4, 6];

  return templates.map((t, i): LitBuilderStep => ({
    localId: uid(),
    dbId: null,
    kind: "email",
    subject: t.subject,
    body: resolveHtml(t.html),
    title: t.name,
    description: t.description,
    waitDays: 0,
    delayDays: DELAY_DAYS[i] ?? 0,
    delayHours: 0,
    delayMinutes: 0,
    includeSignature: true,
    expanded: i === 0,
  }));
}
