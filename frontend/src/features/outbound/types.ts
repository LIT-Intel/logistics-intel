import type { ChannelKind } from "./tokens";

export type CampaignStatus = "active" | "paused" | "draft" | "archived";
export type CampaignHealth = "great" | "good" | "attention" | null;

export interface CampaignFunnel {
  enrolled: number;
  sent: number;
  // Distinct recipient emails who received at least one 'sent' event.
  // Used by FunnelStrip as the sent-bar denominator (sent/enrolled can
  // exceed 100% for multi-step campaigns since each recipient receives N
  // sends; uniqueSent caps naturally at the recipient count).
  uniqueSent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  suppressed: number;
  // Net "live" meetings = bookings + reschedules - cancellations.
  // Sourced from lit_outreach_history rows logged by cal-webhook.
  meetings: number;
  // Computed rates (0-100), null when sent === 0
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  bounceRate: number | null;
  // ISO timestamp of the most recent event for this campaign
  lastEventAt: string | null;
}

export interface CampaignCreator {
  full_name: string | null;
  email: string | null;
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
  creator: CampaignCreator | null;
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
  badge?: "Top performer" | "Best reply rate" | "Highest meeting rate" | "Best multichannel reply rate";
}

export type StepKind = ChannelKind;

/**
 * Builder-side model for a campaign step.
 *
 * Identity invariant — DO NOT collapse these two fields:
 *  - `localId` is the React key. ALWAYS a fresh client-generated uid, never
 *    reused. Used for selection, list-rendering, drag/reorder. Must be unique
 *    within a single builder session, even across "duplicate step" actions
 *    and across delete-then-re-add of a previously-saved step.
 *  - `dbId` is the persisted row identity in `lit_campaign_steps.id`. `null`
 *    for new steps that have never been saved. Populated by `dbStepToBuilder`
 *    when hydrating an existing campaign. This is the ONLY field that may
 *    ever be sent to the database as the row's primary key.
 *
 * Conflating these (e.g. `localId: row.id || uid()`) is the bug fixed in
 * CR P0-2. If the save path later switches `upsertCampaignStep` to use
 * onConflict: "id" instead of "campaign_id,step_order", a stale `localId`
 * could collide with a re-added-after-delete step. Keep them separate.
 */
export interface BuilderStep {
  localId: string;
  dbId: string | null;
  kind: StepKind;
  // email
  subject: string;
  // Optional alternate subject for A/B testing. When present at send
  // time, the dispatcher picks A or B uniformly per recipient.
  subject_b?: string;
  body: string;
  // linkedin / call
  title: string;
  description: string;
  // wait
  waitDays: number;
  /** Optional sub-day component for wait steps. 0–23 hours. */
  waitHours?: number;
  /** Optional sub-hour component for wait steps. 0–59 minutes. */
  waitMinutes?: number;
  // shared
  delayDays: number;
  /** Optional sub-day component for the delay before this step. 0–23 hours. */
  delayHours?: number;
  /** Optional sub-hour component for the delay before this step. 0–59 minutes. */
  delayMinutes?: number;
  /** Whether the dispatcher should append the sender's signature to this
   *  step's body. Defaults to true. */
  includeSignature?: boolean;
  /** J.2 — when set ("HH:MM"), the step fires at this local time in the
   *  campaign's send_timezone, on the day computed from the delay. NULL/
   *  undefined = legacy delay-based behavior. */
  timeOfDayLocal?: string | null;
  /** J.2 — when true, weekend-resolved fire times bump to next Monday at
   *  the same time-of-day. */
  weekdaysOnly?: boolean;
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