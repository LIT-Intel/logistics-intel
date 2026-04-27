// Helper module for the Partner Program Admin page.
// All calls go through the affiliate-admin edge function (super-admin
// only, service-role reads internally). Approvals/rejections go through
// the existing affiliate-review function.

import { supabase } from '@/auth/supabaseAuthClient';

async function getAuthHeader(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? `Bearer ${token}` : null;
}

async function callFn(name: string, body: unknown) {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, error: 'Not authenticated' };
  const url = `${
    (import.meta as ImportMeta & { env?: { VITE_SUPABASE_URL?: string } }).env
      ?.VITE_SUPABASE_URL ?? ''
  }/functions/v1/${name}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: `Invalid JSON from ${name}` };
  }
  if (!res.ok && data.ok !== true) {
    return { ok: false, status: res.status, ...data };
  }
  return data as { ok: boolean } & Record<string, unknown>;
}

export interface AdminKpis {
  applications_pending: number;
  applications_approved_30d: number;
  applications_rejected_30d: number;
  partners_active: number;
  partners_suspended: number;
  commissions_pending: number;
  payouts_pending: number;
}

export interface AdminApplicationRow {
  id: string;
  user_id: string;
  email: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  full_name: string | null;
  company_or_brand: string | null;
  website_or_linkedin: string | null;
  country: string | null;
  audience_description: string | null;
  audience_size: string | null;
  primary_channels: string | null;
  expected_referral_volume: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer: string | null;
  rejection_reason: string | null;
}

export interface AdminPartnerRow {
  id: string;
  user_id: string;
  email: string | null;
  ref_code: string;
  tier: string;
  status: 'active' | 'suspended' | 'terminated';
  commission_pct: number;
  commission_months: number;
  stripe_status: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  joined_at: string | null;
  suspended_at: string | null;
  referrals_count: number;
  lifetime_earnings_cents: number;
  available_cents: number;
  pending_cents: number;
}

export interface AdminCommissionRow {
  id: string;
  partner_id: string;
  partner_label: string | null;
  partner_ref_code: string | null;
  referral_id: string | null;
  referred_label: string | null;
  invoice_id: string | null;
  amount_cents: number;
  currency: string;
  commission_pct: number;
  commission_months: number;
  status: 'pending' | 'earned' | 'paid' | 'voided' | 'flagged';
  earned_at: string | null;
  clears_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  notes: string | null;
}

export interface AdminPayoutRow {
  id: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  currency: string;
  commissions_count: number;
  stripe_transfer_id: string | null;
  stripe_payout_id: string | null;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  paid_on: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface AdminTierRow {
  id: string;
  code: string;
  name: string;
  commission_pct: number;
  commission_months: number;
  attribution_days: number;
  min_payout_cents: number;
  description: string | null;
  is_active: boolean;
  partners_count: number;
}

export async function fetchAdminKpis() {
  return callFn('affiliate-admin', { action: 'kpis' });
}
export async function fetchAdminApplications() {
  return callFn('affiliate-admin', { action: 'list_applications' });
}
export async function fetchAdminPartners() {
  return callFn('affiliate-admin', { action: 'list_partners' });
}
export async function fetchAdminCommissions() {
  return callFn('affiliate-admin', { action: 'list_commissions' });
}
export async function fetchAdminPayouts() {
  return callFn('affiliate-admin', { action: 'list_payouts' });
}
export async function fetchAdminTiers() {
  return callFn('affiliate-admin', { action: 'list_tiers' });
}

export async function reviewApplication(
  applicationId: string,
  action: 'approve' | 'reject',
  options?: { rejection_reason?: string; tier?: string },
) {
  return callFn('affiliate-review', {
    application_id: applicationId,
    action,
    ...(options ?? {}),
  });
}
