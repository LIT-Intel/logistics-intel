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

export const STARTER_PLAYS: Play[] = [
  // LIT Marketing first — primary GTM offering, biggest-touch sequences
  LIT_MARKETING_BROKER_PLAY,
  LIT_MARKETING_FORWARDER_PLAY,
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
  },
];

export function findPlay(id: string | null | undefined): Play | null {
  if (!id) return null;
  return STARTER_PLAYS.find((p) => p.id === id) ?? null;
}