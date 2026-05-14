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
    subject: "Saw your {{top_lane}} moves this quarter",
    previewText:
      "Two questions on the cadence shift, peer to peer.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "Cold intro built around a specific lane observation.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Pulled {{company_name}}'s footprint on {{top_lane}} this morning. Cadence shifted in the last 60 days — new consignee names on a few of the boxes, which usually means a partner shipper came on or a re-route is in play.</p>
<p style="margin:0 0 16px 0;">Two questions, operator to operator:</p>
<p style="margin:0 0 16px 0;">1. Is the new consignee mix something you brought on, or did it land in your laps via an NVO partner?</p>
<p style="margin:0 0 16px 0;">2. Are you seeing the LA/LB dwell drift on your inbounds? A couple of your boxes ran past 7 days at terminal.</p>
<p style="margin:0 0 16px 0;">Not pitching anything yet — just curious whether you're seeing what I'm seeing.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Saw your {{top_lane}} moves this quarter",
      "Two questions on the cadence shift, peer to peer.",
      `If dwell on {{top_lane}} is creeping past 5 days, the rate sheet matters less than the demurrage exposure on the back end. Worth flagging before peak GRI lands.`,
      "Pull up my lane",
    ),
  },
  {
    id: "lit_marketing_broker_2_manual_pain",
    name: "Broker Email 2 · Manual Prospecting Pain",
    audience: "freight_broker",
    stepNumber: 2,
    subject: "One more thing on the consignee cluster",
    previewText:
      "Backhaul math worth checking before the next bid cycle.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "Operator follow-up on a specific lane observation.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Quick follow-up. One more pattern that jumped out on {{company_name}}'s {{top_lane}} book:</p>
<p style="margin:0 0 16px 0;">Your top three consignees on that lane cluster within roughly 200 miles of each other inland. If you've got a backhaul shipper anywhere in that radius, the drayage round-trip math usually pencils out at $400–$600 per box once you back out the empty repo cost.</p>
<p style="margin:0 0 16px 0;font-weight:600;">Is the inland leg something you control, or is it on the consignee's account?</p>
<p style="margin:0 0 16px 0;">That's the only question that changes whether the play is yours to make or whether the consignee's incumbent locks it down first. Either way the BOL footprint is telling on this one.</p>
<p style="margin:0 0 16px 0;">Hit reply if you want to talk through it.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "One more thing on the consignee cluster",
      "Backhaul math worth checking before the next bid cycle.",
      `Drayage round-trips on clustered consignees are one of the cleanest margin plays on a domestic-inland leg. Most operators miss them because the BOL data is split across the headhaul and the empty repo.`,
      "Look at the cluster",
    ),
  },
  {
    id: "lit_marketing_broker_3_contact_discovery",
    name: "Broker Email 3 · Contact Discovery",
    audience: "freight_broker",
    stepNumber: 3,
    subject: "Briefly — what we actually do",
    previewText: "Lane signals, the right person on the BCO side, one screen.",
    imageAssetKey: "contact_discovery",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "First touch that explains the service, after two signal-only emails.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">If the last two notes were useful, here's the bit where I tell you what I'm actually using.</p>
<p style="margin:0 0 16px 0;">Short version: we pull BOL records and layer in lane, mode, cadence, and carrier mix per shipper — same data I referenced when I flagged {{company_name}}'s {{top_lane}} cadence shift. We also keep the decision-maker contact info next to each account, so the rep can move from "I want to talk to procurement at this shipper" to a sequenced touch without leaving the screen.</p>
<p style="margin:0 0 16px 0;">For a broker desk, the value is the handoff — the gap between spotting a signal and getting a contextual outreach in front of the right person on the BCO side. That gap is where most desks lose deals to whoever moved faster.</p>
<p style="margin:0 0 16px 0;">Worth a 20-minute walkthrough on three of {{company_name}}'s active lanes? You keep the screenshots either way.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Briefly — what we actually do",
      "Lane signals, the right person on the BCO side, one screen.",
      `The right title without freight context is still a cold call. The right title with "your cadence on {{top_lane}} shifted last month" is a meeting.`,
      "Walk me through three lanes",
    ),
  },
  {
    id: "lit_marketing_broker_4_breakup",
    name: "Broker Email 4 · Close the Loop",
    audience: "freight_broker",
    stepNumber: 4,
    subject: "Closing the loop — last one",
    previewText: "If the timing's off I'll back off.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "Breakup email — leaves the door open without pressure.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Not going to keep landing in your inbox if the timing isn't there.</p>
<p style="margin:0 0 16px 0;">For what it's worth: the thing I'd really want you to see is the cadence-drift read on {{company_name}}'s {{top_lane}} consignees. That one signal has been worth catching RFPs ~30 days before they hit your inbox on books like yours. Whether you'd ever do anything about it with us is a separate question.</p>
<p style="margin:0 0 16px 0;">If next quarter makes more sense, ping me. Otherwise — good selling.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Closing the loop — last one",
      "If the timing's off I'll back off.",
      undefined,
      "Send the lane snapshot",
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
    subject: "{{top_lane}} — quick mode-split question",
    previewText: "Saw your consol vs FCL ratio. Curious how you decided.",
    imageAssetKey: "company_intelligence",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "Cold intro built on a mode-split observation.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Was looking at {{company_name}}'s {{top_lane}} pattern this morning. Mode split looks heavier on consol than I'd expect for the volume bands you're hitting. Wanted to ask, operator to operator:</p>
<p style="margin:0 0 16px 0;">Is that a service-level call (transit predictability over cost), or did the FCL math just not pencil out this quarter at current rates?</p>
<p style="margin:0 0 16px 0;">Asking because the consol-vs-FCL break point on that pair has moved ~2 CBM in the wrong direction since Q3. Most operators I talk to are quietly re-running the calc.</p>
<p style="margin:0 0 16px 0;">Not pitching anything — just curious whether you've already had to make the call.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "{{top_lane}} — quick mode-split question",
      "Saw your consol vs FCL ratio. Curious how you decided.",
      `If LCL is winning on the rate sheet but FCL buys back a week of transit, that's worth re-modeling — usually pencils out around the 8-CBM mark, but the threshold has shifted this quarter.`,
      "Pull up the lane",
    ),
  },
  {
    id: "lit_marketing_forwarder_2_better_signals",
    name: "Forwarder Email 2 · Better Signals",
    audience: "small_forwarder",
    stepNumber: 2,
    subject: "Two shippers on your book went quiet",
    previewText: "60+ days, no boxes — usually means one of two things.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "Follow-up flagging a specific cadence-drift signal.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Following up on the {{top_lane}} note. Went a layer deeper on {{company_name}}'s consignee mix and one pattern is worth flagging.</p>
<p style="margin:0 0 16px 0;">Two of your inbound shippers haven't moved a box in 60+ days. That window is almost always one of two things:</p>
<p style="margin:0 0 16px 0;">1. They're ramping for a seasonal pulse and bookings are about to land.<br>2. They're quietly testing another forwarder and the relationship's already drifting.</p>
<p style="margin:0 0 16px 0;">Either one is a phone call this week, not next month. By the time the next BOL hits, the answer to which it was is already locked in.</p>
<p style="margin:0 0 16px 0;">Want the specific BCO names so you can prioritize?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Two shippers on your book went quiet",
      "60+ days, no boxes — usually means one of two things.",
      `Quiet shipper > active shipper for outbound timing. Active ones are too busy to take the call. The quiet quarter is when the incumbent forwarder is either ramping rates or already losing the relationship.`,
      "Send the BCO names",
    ),
  },
  {
    id: "lit_marketing_forwarder_3_pulse_ai",
    name: "Forwarder Email 3 · Pulse AI Brief",
    audience: "small_forwarder",
    stepNumber: 3,
    subject: "Briefly — what we actually do",
    previewText: "How the cadence read works and why it's worth a look.",
    imageAssetKey: "pulse_ai",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "Explains the service after two pure-signal emails.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">If the last two notes were useful, here's the bit where I tell you what I'm actually using.</p>
<p style="margin:0 0 16px 0;">We work off BOL records — every container that lands has a consignee, shipper, carrier, port pair, and date attached to it. Layer that into a cadence model per account and you get the patterns I was flagging on {{company_name}}: who pulses seasonally, who's drifted off, who switched carriers, and which lanes have a mode-split worth re-examining.</p>
<p style="margin:0 0 16px 0;">For your reps, that turns into a one-card brief per shipper before each call. Open the account, glance at the card (cadence, top lanes, recent shifts, suggested opener), dial. 30 seconds of prep instead of 12 minutes — and the opener actually lands because it's about their freight, not "any capacity needs?"</p>
<p style="margin:0 0 16px 0;">Want me to run a brief on one {{top_lane}} shipper so you can see the format?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Briefly — what we actually do",
      "How the cadence read works and why it's worth a look.",
      `30 seconds of context beats 12 minutes of tab-switching. The rep who walks in with one specific signal — not a longer dossier — books the meeting.`,
      "Send a sample brief",
    ),
  },
  {
    id: "lit_marketing_forwarder_4_breakup",
    name: "Forwarder Email 4 · Useful or Not a Fit",
    audience: "small_forwarder",
    stepNumber: 4,
    subject: "Closing the loop — last one",
    previewText: "If the timing's off I'll back off.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    description: "Breakup email — closes the loop with a clean ask.",
    html: wrapBrokerEmail(
      `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Not going to keep landing in your inbox if the timing isn't there.</p>
<p style="margin:0 0 16px 0;">For what it's worth: the read I'd really want you to see is the cadence-drift signal on {{company_name}}'s {{top_lane}} shippers — that one read alone has been worth catching BCOs ~30 days before their incumbent forwarder loses them. Whether you'd do anything about it with us is a separate question.</p>
<p style="margin:0 0 16px 0;">If next quarter makes more sense, ping me. Otherwise — good selling.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      "Closing the loop — last one",
      "If the timing's off I'll back off.",
      undefined,
      "Send the lane snapshot",
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
