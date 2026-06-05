/**
 * Outreach domain — campaign-side OAuth flows, queue management, and the
 * Gmail / Outlook bridge functions.
 *
 * `reply-receiver` is a public webhook (verify_jwt=false) and is NOT exposed
 * here — it is push-only.
 */
import { invokeEdge } from "./_client";

export interface OAuthStartRequest {
  provider: "gmail" | "outlook";
  return_url?: string;
  org_id?: string;
}

export interface OAuthStartResponse {
  ok: boolean;
  redirect_url?: string;
  state?: string;
  error?: string;
}

export interface QueueCampaignRecipientsRequest {
  campaign_id: string;
  company_ids?: string[];
  contact_ids?: string[];
  options?: Record<string, unknown>;
}

export interface QueueCampaignRecipientsResponse {
  ok: boolean;
  enqueued?: number;
  skipped?: number;
  error?: string;
}

export interface SendTestEmailRequest {
  campaign_id?: string;
  step_id?: string;
  recipient_email: string;
  subject?: string;
  body?: string;
}

export interface SendTestEmailResponse {
  ok: boolean;
  message_id?: string;
  error?: string;
}

export interface PhantomBusterRequest {
  agent_id?: string;
  payload?: Record<string, unknown>;
}

export interface PhantomBusterResponse {
  ok: boolean;
  contacts?: unknown[];
  message?: string;
  request?: unknown;
}

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

/** Begin a Gmail or Outlook OAuth flow for a mailbox connection. */
export async function emailOauthStart(
  req: OAuthStartRequest,
): Promise<OAuthStartResponse> {
  return invokeEdge<OAuthStartResponse>("email-oauth-start", req);
}

export async function oauthGmailStart(
  req: Omit<OAuthStartRequest, "provider"> = {},
): Promise<OAuthStartResponse> {
  return invokeEdge<OAuthStartResponse>("oauth-gmail-start", req);
}

export async function oauthOutlookStart(
  req: Omit<OAuthStartRequest, "provider"> = {},
): Promise<OAuthStartResponse> {
  return invokeEdge<OAuthStartResponse>("oauth-outlook-start", req);
}

/** Queue recipients for the next campaign-send tick. */
export async function queueCampaignRecipients(
  req: QueueCampaignRecipientsRequest,
): Promise<QueueCampaignRecipientsResponse> {
  return invokeEdge<QueueCampaignRecipientsResponse>("queue-campaign-recipients", req);
}

/** Send a one-off test email through the campaign pipeline. */
export async function sendTestEmail(
  req: SendTestEmailRequest,
): Promise<SendTestEmailResponse> {
  return invokeEdge<SendTestEmailResponse>("send-test-email", req);
}

/** PhantomBuster LinkedIn scraper (currently a scaffold — returns empty contacts). */
export async function phantombusterLinkedIn(
  req: PhantomBusterRequest = {},
): Promise<PhantomBusterResponse> {
  return invokeEdge<PhantomBusterResponse>("phantombuster-linkedin", req);
}
