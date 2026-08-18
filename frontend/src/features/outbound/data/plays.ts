import type { Play } from "../types";

// Starter play catalog. Until a `/plays` backend exists these are presented as
// in-app templates (see CLAUDE.md §6 — "Start from a play"). The card click
// just opens /app/campaigns/new with the play's id pre-seeded into the
// builder's local state; nothing here is persisted server-side.
// LIT Marketing 2-week sequences — two audience-specific plays. Each
// auto-fills the campaign builder with the full 14-day cadence (emails,
// LinkedIn touches, calls) including subject lines, bodies, and scripts
// pre-written with stack-cost comparisons and ROI math.
//
// These are admin-only (gated in Campaigns.jsx by isSuperAdmin). They
// pitch LIT itself and must never be visible to subscribers.
//
// See applyLitMarketingSequenceToBuilder(resolveHtml, audience) in
// src/lib/litMarketingSequence.ts.
const LIT_MARKETING_CHANNELS: Play["channels"] = [
  "email",         // Day 1 · intro · stack math
  "linkedin_invite", // Day 2 · connect
  "email",         // Day 3 · cost / fit math
  "call",          // Day 4 · voicemail
  "email",         // Day 5 · tool-by-tool comparison
  "linkedin_message", // Day 6 · DM follow-up
  "wait",          // Day 7 · rest
  "email",         // Day 8 · workflow proof
  "email",         // Day 9 · objection / stack
  "call",          // Day 10 · follow-up
  "email",         // Day 11 · anonymized example
  "email",         // Day 13 · breakup
  "linkedin_message", // Day 14 · final close
];

export const LIT_MARKETING_BROKER_PLAY: Play = {
  id: "lit-marketing-broker-14",
  icon: "sparkles",
  accent: "#3B82F6",
  name: "LIT Marketing · Broker (14 days)",
  persona: "Freight broker sales teams",
  desc: "Broker-focused 14-day cadence: stack-cost math, lane-fit comparisons, anonymized 5-rep desk numbers. 6 emails + 3 LinkedIn + 2 calls.",
  channels: LIT_MARKETING_CHANNELS,
  steps: 13,
  badge: "Stack consolidation pitch",
};

export const LIT_MARKETING_FORWARDER_PLAY: Play = {
  id: "lit-marketing-forwarder-14",
  icon: "sparkles",
  accent: "#06B6D4",
  name: "LIT Marketing · Forwarder (14 days)",
  persona: "Forwarder sales teams",
  desc: "Forwarder-focused 14-day cadence: mode/lane fit math, 3-rep team consolidation example, Pulse AI pre-call workflow. 6 emails + 3 LinkedIn + 2 calls.",
  channels: LIT_MARKETING_CHANNELS,
  steps: 13,
  badge: "Fit-rate pitch",
};

// Legacy alias — keeps Campaigns.jsx and CampaignBuilder.jsx referencing
// `lit-marketing-14` working through the migration. New code should pick
// LIT_MARKETING_BROKER_PLAY or LIT_MARKETING_FORWARDER_PLAY explicitly.
export const LIT_MARKETING_PLAY: Play = LIT_MARKETING_BROKER_PLAY;

// LIT_MARKETING_BROKER_PLAY + LIT_MARKETING_FORWARDER_PLAY removed from
// STARTER_PLAYS on 2026-06-04 — replaced by the 4-touch cold-outbound
// campaigns seeded directly into lit_campaigns (Forwarders/Brokers Cold
// Outbound) which are bound to the new Pulse → Attio system lists. The
// constants are still exported above so legacy import-paths don't break,
// but they no longer appear in the play picker.
export const STARTER_PLAYS: Play[] = [
  {
    id: "lane-launch",
    icon: "ship",
    accent: "#06B6D4",
    name: "Lane launch",
    persona: "VP Logistics · Importer",
    desc: "New origin–destination lane. Hit shippers moving on it now, sorted by TEU and recency.",
    channels: ["email", "linkedin_invite", "email", "call", "email", "email"],
    steps: 6,
    badge: "Top performer",
    stepCopy: [
      { subject: "A quick lane question", body: "Hi {{first_name}},\n\nI noticed {{company_name}} has been active on a lane we follow lately. Are you already covered there, or would another option be useful when capacity gets tight?\n\nHappy to share what we're seeing either way.\n\n— {{sender_name}}", delayDays: 0 },
      { title: "Light lane connection", description: "Hi {{first_name}} — noticed {{company_name}} is active on a lane I work around too. Thought it made sense to connect.", delayDays: 1 },
      { subject: "What we're seeing on the lane", body: "Hi {{first_name}},\n\nOne useful pattern: volume has been moving unevenly by week, which is catching some teams short. If it helps, I can send the simple monthly view I used—no meeting needed.\n\n— {{sender_name}}", delayDays: 2 },
      { title: "Lane check-in", description: "Ask whether the active lane is currently a priority. If not, thank them and end the call without pitching.", delayDays: 2 },
      { subject: "Worth keeping on your radar", body: "Hi {{first_name}},\n\nSending the lane note I mentioned. It shows the recent cadence and where demand has been most consistent. Want me to forward it?\n\n— {{sender_name}}", delayDays: 3 },
      { subject: "Should I close this out?", body: "Hi {{first_name}},\n\nI don't want to crowd your inbox. Should I close the loop, or would it be useful to reconnect when the lane becomes a priority?\n\n— {{sender_name}}", delayDays: 4 },
    ],
  },
  {
    id: "conquest",
    icon: "target",
    accent: "#EF4444",
    name: "Competitor conquest",
    persona: "Director of Procurement",
    desc: "Shippers on competitor X. Shows you know who their carrier is — invites a conversation.",
    channels: ["email", "linkedin_invite", "call", "email", "linkedin_message"],
    steps: 5,
    stepCopy: [
      { subject: "Curious about your current coverage", body: "Hi {{first_name}},\n\nIt looks like {{company_name}} has steady activity in a few lanes we know well. How is the current setup working for you?\n\nNot trying to force a switch—just curious where you still need flexibility.\n\n— {{sender_name}}", delayDays: 0 },
      { title: "Peer connection", description: "Hi {{first_name}} — we both work around freight and logistics. Thought it would be useful to connect and compare notes.", delayDays: 1 },
      { title: "Coverage question", description: "Ask one question: where does the current provider create the most friction—visibility, response time, or capacity?", delayDays: 2 },
      { subject: "A useful comparison", body: "Hi {{first_name}},\n\nI pulled a short comparison of cadence and coverage on one of your active lanes. I can send it over if useful. No deck or sales call attached.\n\n— {{sender_name}}", delayDays: 2 },
      { title: "Natural follow-up", description: "Thanks for connecting, {{first_name}}. Is there one lane where you'd value a backup option this quarter?", delayDays: 3 },
    ],
  },
  {
    id: "winback",
    icon: "refresh-cw",
    accent: "#8B5CF6",
    name: "Win-back · dormant",
    persona: "Existing relationship",
    desc: "Customers that stopped shipping with you. Ping the moment they ship with someone else.",
    channels: ["email", "email", "call", "email"],
    steps: 4,
    badge: "Best reply rate",
    stepCopy: [
      { subject: "Checking in, {{first_name}}", body: "Hi {{first_name}},\n\nIt's been a while. I saw {{company_name}} moving freight again and wanted to ask how things have been on your side.\n\nNo pitch—I'd genuinely like to reconnect.\n\n— {{sender_name}}", delayDays: 0 },
      { subject: "One thing that may help", body: "Hi {{first_name}},\n\nWe recently added a clearer monthly lane view that makes seasonal changes easier to spot. If that's relevant to what you're working on, I'm happy to show you.\n\n— {{sender_name}}", delayDays: 3 },
      { title: "Relationship check-in", description: "Lead with the past relationship. Ask what has changed since you last worked together and listen.", delayDays: 3 },
      { subject: "Open door", body: "Hi {{first_name}},\n\nI'll leave it here for now. If priorities change or you need another set of eyes on a lane, the door is open.\n\nHope all is well.\n\n— {{sender_name}}", delayDays: 5 },
    ],
  },
  {
    id: "signal",
    icon: "zap",
    accent: "#F59E0B",
    name: "Signal-triggered",
    persona: "Auto-enroll on cadence shift",
    desc: "Auto-enroll shippers whose cadence changed +30% in last 60 days. Strike while it's hot.",
    channels: ["email", "linkedin_invite", "email"],
    steps: 3,
    stepCopy: [
      { subject: "Noticed a change at {{company_name}}", body: "Hi {{first_name}},\n\nI noticed {{company_name}}'s shipment cadence changed recently. Was that planned, or did demand move faster than expected?\n\nI can share the pattern I saw if useful.\n\n— {{sender_name}}", delayDays: 0 },
      { title: "Signal-based connection", description: "Hi {{first_name}} — noticed a recent change in {{company_name}}'s shipping cadence. Thought it was worth connecting; happy to share the pattern.", delayDays: 1 },
      { subject: "The cadence view", body: "Hi {{first_name}},\n\nThe change is concentrated in a small number of weeks rather than a steady rise. That distinction usually matters for planning. Want the monthly view?\n\n— {{sender_name}}", delayDays: 2 },
    ],
  },
  {
    id: "rfp-followup",
    icon: "file-text",
    accent: "#10B981",
    name: "RFP follow-up",
    persona: "After quote sent",
    desc: 'Stay top-of-mind after RFP. Multi-touch with value delivery, not "just checking in".',
    channels: ["email", "linkedin_message", "email", "call"],
    steps: 4,
    stepCopy: [
      { subject: "Anything unclear in the quote?", body: "Hi {{first_name}},\n\nWanted to make sure the quote was easy to evaluate. Is there anything unclear—or anything you need shown differently for the team reviewing it?\n\n— {{sender_name}}", delayDays: 1 },
      { title: "Helpful RFP follow-up", description: "Hi {{first_name}} — happy to clarify anything in the quote or provide a cleaner lane comparison for your review team.", delayDays: 2 },
      { subject: "One useful addition", body: "Hi {{first_name}},\n\nI can add a monthly volume and seasonality view to the quote so the assumptions are easier to pressure-test. Would that help?\n\n— {{sender_name}}", delayDays: 2 },
      { title: "Decision support", description: "Ask whether the evaluation team needs pricing detail, operational proof, or a reference. Do not ask 'just checking in.'", delayDays: 3 },
    ],
  },
  {
    id: "event",
    icon: "calendar",
    accent: "#EC4899",
    name: "TPM / event play",
    persona: "Pre/post conference",
    desc: "Two weeks before, two weeks after. Booked-meeting machine for trade shows.",
    channels: ["email", "linkedin_invite", "email", "call", "email"],
    steps: 5,
    badge: "Highest meeting rate",
    stepCopy: [
      { subject: "Will you be at the upcoming event?", body: "Hi {{first_name}},\n\nWill you be at the upcoming industry event? I'll be there and would enjoy comparing notes on what you're seeing in the market.\n\nIf schedules line up, coffee works better than a formal meeting.\n\n— {{sender_name}}", delayDays: 0 },
      { title: "Event connection", description: "Hi {{first_name}} — looks like we may both be at the upcoming industry event. Thought I'd connect before the week gets busy.", delayDays: 1 },
      { subject: "A simple idea for the event", body: "Hi {{first_name}},\n\nRather than another conference pitch, I'd be glad to show you one live lane and get your take on it. Ten minutes, then we can both get back to the event.\n\n— {{sender_name}}", delayDays: 3 },
      { title: "Event follow-up", description: "Mention the event context, ask one relevant question, and offer a brief coffee or hallway conversation.", delayDays: 3 },
      { subject: "Good to cross paths", body: "Hi {{first_name}},\n\nGood to cross paths around the event. If you'd like, I can send the lane view we discussed so your team can look at it on their own time.\n\n— {{sender_name}}", delayDays: 4 },
    ],
  },
];

export function findPlay(id: string | null | undefined): Play | null {
  if (!id) return null;
  return STARTER_PLAYS.find((p) => p.id === id) ?? null;
}
