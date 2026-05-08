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
// Shared HTML wrapper helpers
// ─────────────────────────────────────────────────────────────────────────────

function wrapWithImage(bodyHtml: string, imgPlaceholder: string, imgAlt: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0 20px 0;">
            <a href="https://www.logisticintel.com" target="_blank" style="text-decoration:none;">
              <img src="${imgPlaceholder}" alt="${imgAlt}" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:1px solid #E5E7EB;border-radius:14px;">
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding-top:22px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748B;">
            Logistics Intel / LIT<br>
            Shipment intelligence, contact discovery, and outreach for logistics sales teams
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function wrapPlainText(bodyHtml: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td style="font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#0F172A;">
            ${bodyHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
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
