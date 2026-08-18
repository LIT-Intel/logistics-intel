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

export interface UnipileAccount {
  id: string;
  org_id: string;
  owner_user_id: string;
  unipile_account_id: string;
  provider: "LINKEDIN";
  display_name: string | null;
  email: string | null;
  status: "CONNECTING" | "OK" | "CREDENTIALS" | "ERROR" | "STOPPED" | "DELETED";
  use_for_campaigns: boolean;
  use_for_lead_crm: boolean;
  daily_invite_cap: number;
  daily_message_cap: number;
  connected_at: string | null;
  last_synced_at: string | null;
}

export interface LinkedInOutreachAction {
  id: string;
  lead_id?: string | null;
  campaign_id?: string | null;
  campaign_step_id?: string | null;
  campaign_contact_id?: string | null;
  action_type: "invite" | "message" | "reply";
  status: "pending_approval" | "approved" | "sending" | "sent" | "failed" | "cancelled" | "replied";
  recipient_name: string | null;
  recipient_linkedin_url: string;
  message: string;
  agent_rationale: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
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

/** List LinkedIn accounts connected through Unipile for the current workspace. */
export async function listUnipileAccounts(orgId?: string, purpose: "campaigns" | "lead_crm" = "campaigns"): Promise<UnipileAccount[]> {
  const result = await invokeEdge<{ ok: boolean; accounts: UnipileAccount[] }>("unipile-account", {
    action: "list",
    purpose,
    ...(orgId ? { org_id: orgId } : {}),
  });
  return Array.isArray(result.accounts) ? result.accounts : [];
}

/** Generate a short-lived LinkedIn Hosted Auth URL. API credentials stay server-side. */
export async function startUnipileLinkedIn(params: {
  purpose: "campaigns" | "lead_crm";
  orgId?: string;
  accountId?: string;
  returnUrl?: string;
}): Promise<{ url: string; expires_at: string }> {
  return invokeEdge<{ url: string; expires_at: string }>("unipile-account", {
    action: "hosted_link",
    purpose: params.purpose,
    ...(params.orgId ? { org_id: params.orgId } : {}),
    ...(params.accountId ? { account_id: params.accountId } : {}),
    ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
  });
}

export async function refreshUnipileAccount(accountId: string): Promise<UnipileAccount> {
  const result = await invokeEdge<{ account: UnipileAccount }>("unipile-account", {
    action: "refresh",
    account_id: accountId,
  });
  return result.account;
}

export async function listLinkedInOutreach(params: {
  leadId?: string;
  campaignContactId?: string;
  linkedinUrl?: string;
}): Promise<LinkedInOutreachAction[]> {
  const result = await invokeEdge<{ actions: LinkedInOutreachAction[] }>("unipile-outreach", {
    action: "list",
    ...(params.leadId ? { lead_id: params.leadId } : {}),
    ...(params.campaignContactId ? { campaign_contact_id: params.campaignContactId } : {}),
    ...(params.linkedinUrl ? { linkedin_url: params.linkedinUrl } : {}),
  });
  return Array.isArray(result.actions) ? result.actions : [];
}

export async function draftLinkedInOutreach(params: {
  leadId?: string;
  campaignContactId?: string;
  campaignStepId?: string;
  linkedinUrl: string;
  actionType: "invite" | "message";
  accountId?: string;
  angle?: string;
}): Promise<LinkedInOutreachAction> {
  const result = await invokeEdge<{ action: LinkedInOutreachAction }>("unipile-outreach", {
    action: "draft",
    ...(params.leadId ? { lead_id: params.leadId } : {}),
    ...(params.campaignContactId ? { campaign_contact_id: params.campaignContactId } : {}),
    ...(params.campaignStepId ? { campaign_step_id: params.campaignStepId } : {}),
    linkedin_url: params.linkedinUrl,
    action_type: params.actionType,
    ...(params.accountId ? { account_id: params.accountId } : {}),
    ...(params.angle ? { angle: params.angle } : {}),
  });
  return result.action;
}

export async function approveAndSendLinkedIn(actionId: string): Promise<LinkedInOutreachAction> {
  const result = await invokeEdge<{ action: LinkedInOutreachAction }>("unipile-outreach", {
    action: "approve_and_send",
    action_id: actionId,
  });
  return result.action;
}

export async function updateLinkedInDraft(actionId: string, message: string): Promise<LinkedInOutreachAction> {
  const result = await invokeEdge<{ action: LinkedInOutreachAction }>("unipile-outreach", {
    action: "update_draft",
    action_id: actionId,
    message,
  });
  return result.action;
}

export async function cancelLinkedInOutreach(actionId: string): Promise<void> {
  await invokeEdge("unipile-outreach", { action: "cancel", action_id: actionId });
}
