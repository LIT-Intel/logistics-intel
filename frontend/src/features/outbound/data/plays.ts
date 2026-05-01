import type { Play } from "../types";

// Starter play catalog. Until a `/plays` backend exists these are presented as
// in-app templates (see CLAUDE.md §6 — "Start from a play"). The card click
// just opens /app/campaigns/new with the play's id pre-seeded into the
// builder's local state; nothing here is persisted server-side.
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