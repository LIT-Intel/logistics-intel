import type { ChannelKind } from "./tokens";

export type CampaignStatus = "active" | "paused" | "draft" | "archived";
export type CampaignHealth = "great" | "good" | "attention" | null;

export interface CampaignFunnel {
  enrolled: number;
  sent: number;
  opened: number;
  replied: number;
  booked: number;
}

export interface OutboundCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: string | null;
  channels: ChannelKind[];
  steps: number;
  recipients: number | null;
  metrics: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  // derived for UI
  funnel: CampaignFunnel | null;
  health: CampaignHealth;
  alert: string | null;
  spark: number[] | null;
  nextSendLabel: string;
}

export interface Play {
  id: string;
  name: string;
  icon: string;
  accent: string;
  persona: string;
  desc: string;
  channels: ChannelKind[];
  steps: number;
  badge?: "Top performer" | "Best reply rate" | "Highest meeting rate";
}

export type StepKind = ChannelKind;

export interface BuilderStep {
  localId: string;
  kind: StepKind;
  // email
  subject: string;
  body: string;
  // linkedin / call
  title: string;
  description: string;
  // wait
  waitDays: number;
  // shared
  delayDays: number;
  expanded: boolean;
}

export interface Persona {
  id: string;
  name: string;
  description: string | null;
}

export interface OutreachTemplate {
  id: string;
  name: string;
  channel: string | null;
  subject: string | null;
  body: string | null;
  persona_id: string | null;
}

export type TemplatesResult =
  | { state: "ok"; rows: OutreachTemplate[] }
  | { state: "empty" }
  | { state: "blocked"; reason: string };

export type PersonasResult =
  | { state: "ok"; rows: Persona[] }
  | { state: "empty" }
  | { state: "blocked"; reason: string };