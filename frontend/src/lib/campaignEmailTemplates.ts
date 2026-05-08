// LIT Marketing campaign templates — the 8-email first wave for two
// audiences (freight brokers, small forwarders).
//
// Design intent: founder/operator-style intros, NOT generic SaaS copy.
// Each sequence is 4 steps mixing one product visual + plain-text
// follow-ups. Visuals come from the marketing site's public email-assets
// folder (see frontend/src/lib/emailAssets.ts) so they render in every
// email client without hashed build URLs or broken paths.
//
// Token contract:
//   {{first_name}}    — recipient first name (resolved at send time)
//   {{company_name}}  — recipient company    (resolved at send time)
//   {{top_lane}}      — top trade lane       (resolved at send time)
//   {{sender_name}}   — sender's first name  (resolved at send time)
//
//   {{company_intelligence_public_url}}  ─┐
//   {{contact_discovery_public_url}}     ─├─ resolved at INSERT time
//   {{pulse_ai_public_url}}              ─┘  by resolveEmailTemplateHtml
//
// The send-time tokens (first_name, etc.) are left untouched by
// resolveEmailTemplateHtml — they get substituted by the dispatcher's
// applyMergeVars helper later, the same way they do for any template.

import { EMAIL_ASSETS, type EmailAssetKey } from "./emailAssets";

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
    description: "Founder-style intro with the Company Intelligence visual.",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            I built LIT because freight sales teams are still stuck jumping between shipment data, spreadsheets, CRMs, and contact tools just to figure out who is actually worth calling.<br><br>
            LIT helps brokers find active shippers, understand trade activity, identify the right contacts, and start outreach from one workspace.
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0 20px 0;">
            <a href="https://www.logisticintel.com" target="_blank" style="text-decoration:none;">
              <img src="{{company_intelligence_public_url}}" alt="LIT Company Intelligence account profile" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:1px solid #E5E7EB;border-radius:14px;">
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            The goal is simple: help brokers spend less time guessing and more time targeting companies with real freight movement.<br><br>
            If helpful, I can send over a sample shipper profile so you can see what it looks like.<br><br>
            — {{sender_name}}
          </td>
        </tr>
        <tr>
          <td style="padding-top:22px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748B;">
            Logistics Intel / LIT<br>
            Freight revenue intelligence for logistics sales teams
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
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
    description: "Plain-text follow-up — names the prospecting pain.",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            One of the reasons we built LIT is because freight prospecting still feels way too manual.<br><br>
            Brokers are jumping between shipment databases, Google searches, spreadsheets, CRMs, contact tools, and campaign platforms just to answer a basic question:<br><br>
            <strong>Who is shipping right now, and is there a real reason to reach out?</strong><br><br>
            LIT is built to make that answer easier.<br><br>
            You can look up a company, see shipment activity, understand top lanes, spot account-level signals, find contacts, and start outreach from the same workspace.<br><br>
            It is not meant to replace the sales process. It is meant to give your team a better starting point.<br><br>
            Worth a quick look?<br><br>
            — {{sender_name}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
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
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            One thing we wanted to avoid with LIT was giving brokers another giant list of generic contacts.<br><br>
            A good freight sales workflow needs context first: who is actually shipping, what lanes they use, and which people are likely connected to logistics, transportation, procurement, or supply chain.
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0 20px 0;">
            <a href="https://www.logisticintel.com" target="_blank" style="text-decoration:none;">
              <img src="{{contact_discovery_public_url}}" alt="LIT Contact Discovery for freight sales teams" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:1px solid #E5E7EB;border-radius:14px;">
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            That is why LIT connects company intelligence with contact discovery, so your team is not just chasing names. They are working from actual freight signals.<br><br>
            If {{company_name}} is focused on shipper growth, I think this could be useful.<br><br>
            Want me to send over a sample account profile?<br><br>
            — {{sender_name}}
          </td>
        </tr>
        <tr>
          <td style="padding-top:22px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748B;">
            Logistics Intel / LIT<br>
            Find active shippers. Understand trade activity. Launch outreach.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "lit_marketing_broker_4_breakup",
    name: "Broker Email 4 · Close the Loop",
    audience: "freight_broker",
    stepNumber: 4,
    subject: "Should I close the loop?",
    previewText: "Last note on LIT for freight prospecting.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Plain-text breakup email.",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            I don't want to keep chasing you if this is not relevant, so I'll close the loop after this.<br><br>
            We built LIT for freight teams that want a cleaner way to find active shippers, understand what they move, identify the right contacts, and turn that into outreach without bouncing between five different tools.<br><br>
            If shipper prospecting is already handled well at {{company_name}}, no worries at all.<br><br>
            But if your team is still relying on static lists, generic lead databases, or manual research, I think this could be useful.<br><br>
            Should I send you a quick example of what a shipper profile looks like in LIT?<br><br>
            — {{sender_name}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
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
    description: "Founder-style intro with the Company Intelligence visual.",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            I built LIT because smaller freight forwarders need a better way to find and understand potential customers without adding more manual research to the sales process.<br><br>
            Most teams do not have endless time to dig through shipment records, contact databases, spreadsheets, and CRMs just to figure out which accounts are worth pursuing.
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0 20px 0;">
            <a href="https://www.logisticintel.com" target="_blank" style="text-decoration:none;">
              <img src="{{company_intelligence_public_url}}" alt="LIT Company Intelligence account profile for freight forwarders" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:1px solid #E5E7EB;border-radius:14px;">
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            LIT helps forwarders see who is actively shipping, what lanes they use, how often they move freight, and who may be worth contacting.<br><br>
            I thought {{company_name}} might find it useful as a way to build more targeted sales opportunities from real shipment activity.<br><br>
            Want me to send over a sample profile?<br><br>
            — {{sender_name}}
          </td>
        </tr>
        <tr>
          <td style="padding-top:22px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748B;">
            Logistics Intel / LIT<br>
            Freight revenue intelligence for logistics sales teams
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "lit_marketing_forwarder_2_better_signals",
    name: "Forwarder Email 2 · Better Signals",
    audience: "small_forwarder",
    stepNumber: 2,
    subject: "Forwarders need better signals",
    previewText: "Start sales conversations from actual shipment activity.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Plain-text follow-up on why shipment activity matters.",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            A lot of freight sales still starts with a weak signal: a company list, a cold contact, or a guess that someone might ship.<br><br>
            We built LIT around a better signal: actual shipment activity.<br><br>
            For forwarders, that means you can look at companies by trade activity, top lanes, shipment volume, mode indicators, and account-level patterns before deciding who to pursue.<br><br>
            The goal is not to make sales robotic. It is to help your team start better conversations with better context.<br><br>
            If {{company_name}} is trying to grow import or export accounts, LIT can help identify companies that are already moving freight and give your team a real reason to reach out.<br><br>
            Want me to share what that looks like?<br><br>
            — {{sender_name}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
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
    description: "Frames Pulse AI as a research/time-saving tool.",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            One of the hardest parts of forwarder sales is doing enough research to make the outreach relevant, without spending 30 minutes on every account.<br><br>
            That is why we added Pulse AI inside LIT.
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0 20px 0;">
            <a href="https://www.logisticintel.com" target="_blank" style="text-decoration:none;">
              <img src="{{pulse_ai_public_url}}" alt="LIT Pulse AI account intelligence brief" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:1px solid #E5E7EB;border-radius:14px;">
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Pulse turns shipment activity into a quick account brief: what changed, where the opportunity might be, what risk signals are visible, and what kind of outreach angle may actually make sense.<br><br>
            For smaller teams, the value is simple: less account research from scratch, more focused conversations.<br><br>
            Want me to send a sample account brief?<br><br>
            — {{sender_name}}
          </td>
        </tr>
        <tr>
          <td style="padding-top:22px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748B;">
            Logistics Intel / LIT<br>
            Shipment intelligence, contact discovery, and outreach in one freight-focused workspace
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "lit_marketing_forwarder_4_breakup",
    name: "Forwarder Email 4 · Useful or Not a Fit",
    audience: "small_forwarder",
    stepNumber: 4,
    subject: "Useful or not a fit?",
    previewText: "Last note on LIT for forwarder prospecting.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    description: "Plain-text breakup email.",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            Hi {{first_name}},<br><br>
            Last note from me here.<br><br>
            LIT may not be for every forwarder. If your team already has a strong way to find active shippers, research accounts, enrich contacts, and manage outreach, then this probably is not urgent.<br><br>
            But if prospecting still involves manual research, spreadsheets, disconnected tools, or generic lead lists, I think LIT could help.<br><br>
            We built it to help forwarders turn shipment data into real sales opportunities, not just more records to sort through.<br><br>
            Should I send you a sample account profile so you can decide if it is worth a closer look?<br><br>
            — {{sender_name}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
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
    .join(EMAIL_ASSETS.rate_benchmark);
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
