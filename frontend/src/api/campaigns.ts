/**
 * Campaigns domain — pulse-list digest, send-pulse-brief, send-test, and
 * pulse-list management edges.
 *
 * The actual campaign-send dispatcher (`send-campaign-email`) is cron-only
 * (gated by `verifyCronAuth` since 2026-05-28) and is NOT exposed here.
 */
import { invokeEdge } from "./_client";

export interface PulseRefreshListsRequest {
  list_ids?: string[];
  org_id?: string;
}

export interface PulseRefreshListsResponse {
  ok: boolean;
  refreshed?: number;
  errors?: unknown[];
  error?: string;
}

export interface PulseListDigestEmailRequest {
  list_id: string;
  recipient_email?: string;
  preview?: boolean;
}

export interface PulseListDigestEmailResponse {
  ok: boolean;
  message_id?: string;
  preview_html?: string;
  error?: string;
}

export interface SendPulseBriefEmailRequest {
  brief_id?: string;
  company_id?: string;
  recipient_email: string;
  subject?: string;
  preview?: boolean;
}

export interface SendPulseBriefEmailResponse {
  ok: boolean;
  message_id?: string;
  preview_html?: string;
  error?: string;
}

export interface PulseBriefRequest {
  company_id?: string;
  source_company_key?: string;
  refresh?: boolean;
}

export interface PulseBriefResponse {
  ok: boolean;
  brief?: unknown;
  cached?: boolean;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

export async function pulseRefreshLists(
  req: PulseRefreshListsRequest = {},
): Promise<PulseRefreshListsResponse> {
  return invokeEdge<PulseRefreshListsResponse>("pulse-refresh-lists", req);
}

export async function pulseListDigestEmail(
  req: PulseListDigestEmailRequest,
): Promise<PulseListDigestEmailResponse> {
  return invokeEdge<PulseListDigestEmailResponse>("pulse-list-digest-email", req);
}

export async function sendPulseBriefEmail(
  req: SendPulseBriefEmailRequest,
): Promise<SendPulseBriefEmailResponse> {
  return invokeEdge<SendPulseBriefEmailResponse>("send-pulse-brief-email", req);
}

export async function pulseBrief(
  req: PulseBriefRequest,
): Promise<PulseBriefResponse> {
  return invokeEdge<PulseBriefResponse>("pulse-brief", req);
}
