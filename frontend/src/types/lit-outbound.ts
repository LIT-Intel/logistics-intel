/**
 * Row shapes for the Phase A Outbound Engine tables
 * (see supabase/migrations/20260424000000_create_lit_outbound_schema.sql).
 *
 * Kept narrow and append-only so existing modules that don't know about
 * Outbound aren't affected.
 */

export type LitChannel = "email" | "linkedin" | "sms" | "call" | "wait";

export type LitSequenceStatus = "draft" | "active" | "archived";

export type LitStepType = "email" | "linkedin" | "sms" | "call" | "wait";

export type LitEmailProvider = "gmail" | "outlook" | "smtp";

export type LitEmailAccountStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "revoked";

export type LitOutreachEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "unsubscribed"
  | "failed"
  | "meeting_booked";

export interface LitSequenceRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  channel: LitChannel;
  status: LitSequenceStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LitSequenceInput {
  name: string;
  description?: string | null;
  channel?: LitChannel;
  status?: LitSequenceStatus;
  metadata?: Record<string, unknown>;
}

export interface LitCampaignStepRow {
  id: string;
  campaign_id: string;
  sequence_id: string | null;
  user_id: string;
  step_order: number;
  channel: LitChannel;
  step_type: LitStepType;
  subject: string | null;
  body: string | null;
  delay_days: number;
  delay_hours: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LitCampaignStepInput {
  id?: string;
  campaign_id: string;
  sequence_id?: string | null;
  step_order: number;
  channel?: LitChannel;
  step_type?: LitStepType;
  subject?: string | null;
  body?: string | null;
  delay_days?: number;
  delay_hours?: number;
  metadata?: Record<string, unknown>;
}

export interface LitOutreachHistoryRow {
  id: string;
  campaign_id: string | null;
  campaign_step_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  user_id: string;
  channel: LitChannel;
  event_type: LitOutreachEventType;
  status: string | null;
  subject: string | null;
  message_id: string | null;
  provider: string | null;
  provider_event_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LitEmailAccountRow {
  id: string;
  user_id: string;
  provider: LitEmailProvider;
  email: string;
  display_name: string | null;
  status: LitEmailAccountStatus;
  is_primary: boolean;
  scopes: string[];
  connected_at: string | null;
  last_synced_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Readiness snapshot surfaced to the Outbound UI for a given campaign.
 * Computed client-side from existing rows — no backend dependency.
 */
export interface LitCampaignReadiness {
  campaign_id: string;
  has_recipients: boolean;
  recipient_count: number;
  has_steps: boolean;
  step_count: number;
  has_connected_inbox: boolean;
  primary_inbox_email: string | null;
  blockers: string[];
}
