/**
 * Affiliate / Partner program domain.
 *
 * Public-by-token entry points (`affiliate-invite-lookup`,
 * `accept-affiliate-invite`) use the URL-safe token as their auth boundary —
 * the token IS the credential. Admin entry points gate on
 * `platform_admins.role`.
 */
import { invokeEdge } from "./_client";

export interface AffiliateApplyRequest {
  email: string;
  name?: string;
  company?: string;
  website?: string;
  promo_channels?: string[];
  notes?: string;
}

export interface AffiliateApplyResponse {
  ok: boolean;
  application_id?: string;
  status?: "pending" | "approved" | "rejected";
  error?: string;
}

export interface AffiliateInviteLookupRequest {
  token: string;
}

export interface AffiliateInviteLookupResponse {
  ok: boolean;
  code?: string;
  invite?: {
    recipient_email: string | null;
    inviter_name: string | null;
    invited_at: string | null;
    expires_at: string | null;
    status: string;
  };
  error?: string;
}

export interface AcceptAffiliateInviteRequest {
  token: string;
  user_id?: string;
  // Optional registration shortcut for new-user accepts.
  password?: string;
  full_name?: string;
}

export interface AcceptAffiliateInviteResponse {
  ok: boolean;
  partner_id?: string;
  error?: string;
}

export interface AffiliateReviewRequest {
  application_id: string;
  decision: "approve" | "reject";
  notes?: string;
}

export interface AffiliateReviewResponse {
  ok: boolean;
  status?: string;
  error?: string;
}

export interface SendAffiliateInviteRequest {
  email: string;
  inviter_name?: string;
  message?: string;
  expires_in_days?: number;
}

export interface SendAffiliateInviteResponse {
  ok: boolean;
  invite_id?: string;
  invite_url?: string;
  error?: string;
}

export interface ClaimAffiliateReferralRequest {
  ref_code: string;
  user_id?: string;
}

export interface ClaimAffiliateReferralResponse {
  ok: boolean;
  referral_id?: string;
  error?: string;
}

export interface AffiliateAdminRequest {
  action:
    | "list_applications"
    | "list_partners"
    | "list_referrals"
    | "list_payouts"
    | "review_application"
    | "update_partner"
    | "create_payout"
    | "list_invites";
  params?: Record<string, unknown>;
}

export interface AffiliateAdminResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

export async function affiliateApply(
  req: AffiliateApplyRequest,
): Promise<AffiliateApplyResponse> {
  return invokeEdge<AffiliateApplyResponse>("affiliate-apply", req);
}

export async function affiliateInviteLookup(
  req: AffiliateInviteLookupRequest,
): Promise<AffiliateInviteLookupResponse> {
  return invokeEdge<AffiliateInviteLookupResponse>("affiliate-invite-lookup", req);
}

export async function acceptAffiliateInvite(
  req: AcceptAffiliateInviteRequest,
): Promise<AcceptAffiliateInviteResponse> {
  return invokeEdge<AcceptAffiliateInviteResponse>("accept-affiliate-invite", req);
}

export async function affiliateReview(
  req: AffiliateReviewRequest,
): Promise<AffiliateReviewResponse> {
  return invokeEdge<AffiliateReviewResponse>("affiliate-review", req);
}

export async function sendAffiliateInvite(
  req: SendAffiliateInviteRequest,
): Promise<SendAffiliateInviteResponse> {
  return invokeEdge<SendAffiliateInviteResponse>("send-affiliate-invite", req);
}

export async function claimAffiliateReferral(
  req: ClaimAffiliateReferralRequest,
): Promise<ClaimAffiliateReferralResponse> {
  return invokeEdge<ClaimAffiliateReferralResponse>("claim-affiliate-referral", req);
}

export async function affiliateAdmin<T = unknown>(
  req: AffiliateAdminRequest,
): Promise<AffiliateAdminResponse<T>> {
  return invokeEdge<AffiliateAdminResponse<T>>("affiliate-admin", req as unknown as Record<string, unknown>);
}
