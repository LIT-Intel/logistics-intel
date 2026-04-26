// Affiliate state hook + action helpers.
//
// Probes Supabase for the affiliate backend tables (`affiliate_partners`,
// `affiliate_applications`). When the tables don't exist yet, the hook
// returns `status: 'no_backend'` so the UI can render an honest
// "application backend not enabled yet" shell — no fake metrics, no fake
// referral codes, no fake earnings.
//
// When the partner is active, also fetches referrals / commissions /
// payouts and computes lifetime / available / pending earnings.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/auth/supabaseAuthClient';

export type AffiliateStatus =
  | 'loading'
  | 'no_backend'
  | 'not_applied'
  | 'pending'
  | 'active'
  | 'rejected'
  | 'suspended';

export type StripeConnectStatus =
  | 'not_connected'
  | 'onboarding_started'
  | 'verification_required'
  | 'restricted'
  | 'payouts_enabled';

export interface AffiliatePartner {
  id: string;
  refCode: string | null;
  tier: string | null;
  status: 'active' | 'suspended' | 'terminated';
  commissionPct: number | null;
  commissionMonths: number | null;
  attributionDays: number | null;
  minPayoutCents: number;
  payoutCurrency: string;
  stripeAccountId: string | null;
  stripeStatus: StripeConnectStatus;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  accountManagerEmail: string | null;
  joinedAt: string | null;
}

export interface AffiliateApplication {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  submittedAt: string | null;
  reviewer: string | null;
  rejectionReason: string | null;
}

export interface AffiliateReferral {
  id: string;
  name: string;
  plan: string;
  signedUp: string;
  status: string;
  mrr: string;
  earned: string;
  payout: string;
}

export interface AffiliatePayoutRow {
  id: string;
  period: string;
  paidOn: string;
  amount: string;
  commissions: number;
  transfer: string;
  status: string;
  tone: 'success' | 'warn' | 'danger' | 'neutral';
}

export interface AffiliateActivityItem {
  t: string;
  d: string;
  amt: string;
  tone: 'success' | 'warn' | 'danger' | 'neutral' | 'brand';
  kind?: 'commission' | 'referral' | 'payout';
  time: string;
}

export interface AffiliateStats {
  lifetimeEarnings: string;
  lifetimeDelta: string | null;
  available: string;
  availableDelta: string | null;
  pending: string;
  pendingDelta: string | null;
  activeReferrals: string;
  activeReferralsDelta: string | null;
}

export interface AffiliateState {
  loading: boolean;
  status: AffiliateStatus;
  backendAvailable: boolean;
  partner: AffiliatePartner | null;
  application: AffiliateApplication | null;
  referralLink: string | null;
  referrals: AffiliateReferral[];
  payouts: AffiliatePayoutRow[];
  activity: AffiliateActivityItem[];
  stats: AffiliateStats | null;
  earningsByMonth: { label: string; value: number }[];
  stripeNotConfigured: boolean;
  refresh: () => Promise<void>;
}

const INITIAL: Omit<AffiliateState, 'refresh'> = {
  loading: true,
  status: 'loading',
  backendAvailable: false,
  partner: null,
  application: null,
  referralLink: null,
  referrals: [],
  payouts: [],
  activity: [],
  stats: null,
  earningsByMonth: [],
  stripeNotConfigured: false,
};

const TABLE_MISSING_CODES = new Set(['42P01', 'PGRST116', 'PGRST205']);

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code && TABLE_MISSING_CODES.has(e.code)) return true;
  const msg = String(e.message || '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('not found in the schema') ||
    msg.includes('could not find the table')
  );
}

function fmtCurrency(cents: number, currency = 'usd'): string {
  const value = (cents || 0) / 100;
  try {
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '';
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const hour = 3_600_000;
    const day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
    if (diff < day) return `${Math.round(diff / hour)}h ago`;
    if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

const REFERRAL_BASE_URL =
  (import.meta as ImportMeta & { env?: { VITE_PUBLIC_APP_URL?: string } }).env
    ?.VITE_PUBLIC_APP_URL || 'https://logisticintel.com';

function rowToPartner(p: Record<string, unknown>): AffiliatePartner {
  return {
    id: String(p.id),
    refCode: (p.ref_code as string) ?? null,
    tier: (p.tier as string) ?? null,
    status: (p.status as 'active' | 'suspended' | 'terminated') ?? 'active',
    commissionPct: (p.commission_pct as number) ?? null,
    commissionMonths: (p.commission_months as number) ?? null,
    attributionDays: (p.attribution_days as number) ?? null,
    minPayoutCents: (p.min_payout_cents as number) ?? 5000,
    payoutCurrency: ((p.payout_currency as string) ?? 'usd').toLowerCase(),
    stripeAccountId: (p.stripe_account_id as string) ?? null,
    stripeStatus: ((p.stripe_status as StripeConnectStatus) ?? 'not_connected'),
    stripeChargesEnabled: Boolean(p.stripe_charges_enabled),
    stripePayoutsEnabled: Boolean(p.stripe_payouts_enabled),
    stripeDetailsSubmitted: Boolean(p.stripe_details_submitted),
    accountManagerEmail: (p.account_manager_email as string) ?? null,
    joinedAt: (p.joined_at as string) ?? null,
  };
}

function rowToReferral(
  r: Record<string, unknown>,
  commissionsByReferral: Map<string, { earned: number; pendingClears: string | null }>,
  currency: string,
): AffiliateReferral {
  const id = String(r.id);
  const com = commissionsByReferral.get(id) ?? { earned: 0, pendingClears: null };
  return {
    id,
    name: (r.referred_company as string) || (r.referred_email as string) || '—',
    plan: (r.plan_code as string) || '—',
    signedUp: fmtDateShort((r.signed_up_at as string) ?? (r.first_seen_at as string) ?? null),
    status: ((r.subscription_status as string) || 'tracking').replace(/^./, (c) => c.toUpperCase()),
    mrr: r.mrr_cents ? fmtCurrency(r.mrr_cents as number, currency) : '—',
    earned: com.earned ? fmtCurrency(com.earned, currency) : '—',
    payout: com.pendingClears ? fmtDateShort(com.pendingClears) : '—',
  };
}

function rowToPayout(p: Record<string, unknown>, currency: string): AffiliatePayoutRow {
  const status = (p.status as string) || 'pending';
  const tone: AffiliatePayoutRow['tone'] =
    status === 'paid'
      ? 'success'
      : status === 'failed' || status === 'cancelled'
        ? 'danger'
        : status === 'processing' || status === 'pending'
          ? 'warn'
          : 'neutral';
  const period = (p.period_start as string) || '';
  const periodLabel = period
    ? new Date(period).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : '—';
  return {
    id: String(p.id),
    period: periodLabel,
    paidOn: fmtDateShort((p.paid_on as string) ?? null),
    amount: fmtCurrency((p.amount_cents as number) || 0, currency),
    commissions: (p.commissions_count as number) || 0,
    transfer: (p.stripe_transfer_id as string) || '—',
    status: status.replace(/^./, (c) => c.toUpperCase()),
    tone,
  };
}

export function useAffiliateState(userId: string | null | undefined): AffiliateState {
  const [state, setState] = useState<Omit<AffiliateState, 'refresh'>>(INITIAL);

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setState({
        ...INITIAL,
        loading: false,
        status: 'no_backend',
      });
      return;
    }

    // 1. Probe partner.
    const partnerQ = await supabase
      .from('affiliate_partners')
      .select(
        'id, ref_code, tier, status, commission_pct, commission_months, attribution_days, min_payout_cents, payout_currency, stripe_account_id, stripe_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, account_manager_email, joined_at',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (partnerQ.error && isMissingTableError(partnerQ.error)) {
      setState({ ...INITIAL, loading: false, status: 'no_backend' });
      return;
    }

    if (partnerQ.data) {
      const partner = rowToPartner(partnerQ.data as Record<string, unknown>);
      const currency = partner.payoutCurrency || 'usd';
      const referralLink = partner.refCode
        ? `${REFERRAL_BASE_URL}/?ref=${partner.refCode}`
        : null;

      // Fetch dependent data in parallel.
      const [refsQ, comsQ, paysQ] = await Promise.all([
        supabase
          .from('affiliate_referrals')
          .select(
            'id, ref_code, referred_email, referred_company, plan_code, subscription_status, mrr_cents, first_seen_at, signed_up_at, became_paid_at, churned_at',
          )
          .eq('partner_id', partner.id)
          .order('first_seen_at', { ascending: false })
          .limit(50),
        supabase
          .from('affiliate_commissions')
          .select(
            'id, referral_id, amount_cents, currency, status, earned_at, clears_at, paid_at, voided_at, created_at, notes',
          )
          .eq('partner_id', partner.id)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('affiliate_payouts')
          .select(
            'id, period_start, period_end, amount_cents, currency, commissions_count, stripe_transfer_id, status, paid_on, created_at',
          )
          .eq('partner_id', partner.id)
          .order('period_start', { ascending: false })
          .limit(24),
      ]);

      const referralsRaw = (refsQ.data ?? []) as Record<string, unknown>[];
      const commissionsRaw = (comsQ.data ?? []) as Record<string, unknown>[];
      const payoutsRaw = (paysQ.data ?? []) as Record<string, unknown>[];

      // Aggregate commissions per referral for the table view.
      const commissionsByReferral = new Map<
        string,
        { earned: number; pendingClears: string | null }
      >();
      for (const c of commissionsRaw) {
        const refId = c.referral_id ? String(c.referral_id) : null;
        if (!refId) continue;
        const cur = commissionsByReferral.get(refId) ?? {
          earned: 0,
          pendingClears: null,
        };
        if (c.status === 'earned' || c.status === 'paid') {
          cur.earned += Number(c.amount_cents) || 0;
        }
        if (c.status === 'pending' && !cur.pendingClears) {
          cur.pendingClears = (c.clears_at as string) ?? null;
        }
        commissionsByReferral.set(refId, cur);
      }

      const referrals = referralsRaw.map((r) =>
        rowToReferral(r, commissionsByReferral, currency),
      );

      // Stats.
      let lifetimeCents = 0;
      let availableCents = 0;
      let pendingCents = 0;
      for (const c of commissionsRaw) {
        const amt = Number(c.amount_cents) || 0;
        if (c.status === 'paid') {
          lifetimeCents += amt;
        } else if (c.status === 'earned') {
          lifetimeCents += amt;
          availableCents += amt;
        } else if (c.status === 'pending') {
          pendingCents += amt;
        }
      }
      const activeReferrals = referralsRaw.filter((r) =>
        ['paying', 'active', 'trialing'].includes(
          String(r.subscription_status || '').toLowerCase(),
        ),
      ).length;

      const stats: AffiliateStats = {
        lifetimeEarnings: fmtCurrency(lifetimeCents, currency),
        lifetimeDelta: null,
        available: fmtCurrency(availableCents, currency),
        availableDelta:
          availableCents >= partner.minPayoutCents
            ? 'ready to pay'
            : `vs ${fmtCurrency(partner.minPayoutCents, currency)} min`,
        pending: fmtCurrency(pendingCents, currency),
        pendingDelta: null,
        activeReferrals: String(activeReferrals),
        activeReferralsDelta: null,
      };

      // Activity feed (newest commission events + payouts).
      const activity: AffiliateActivityItem[] = [];
      for (const c of commissionsRaw.slice(0, 8)) {
        const amt = Number(c.amount_cents) || 0;
        const formatted = fmtCurrency(amt, currency);
        const ts =
          (c.paid_at as string) ||
          (c.earned_at as string) ||
          (c.voided_at as string) ||
          (c.created_at as string) ||
          null;
        if (c.status === 'earned' || c.status === 'paid') {
          activity.push({
            t: c.status === 'paid' ? 'Commission paid' : 'Commission earned',
            d: c.notes ? String(c.notes) : 'Cleared commission',
            amt: `+${formatted}`,
            tone: 'success',
            kind: 'commission',
            time: fmtRelative(ts),
          });
        } else if (c.status === 'pending') {
          activity.push({
            t: 'Commission pending',
            d: `Clears ${fmtDateShort((c.clears_at as string) ?? null)}`,
            amt: formatted,
            tone: 'warn',
            kind: 'commission',
            time: fmtRelative(ts),
          });
        } else if (c.status === 'voided') {
          activity.push({
            t: 'Commission voided',
            d: c.notes ? String(c.notes) : 'Refund / chargeback',
            amt: `−${formatted}`,
            tone: 'danger',
            kind: 'commission',
            time: fmtRelative(ts),
          });
        }
      }
      for (const p of payoutsRaw.slice(0, 4)) {
        if (p.status === 'paid') {
          activity.push({
            t: 'Payout paid',
            d: `Stripe transfer ${(p.stripe_transfer_id as string) || ''}`,
            amt: fmtCurrency((p.amount_cents as number) || 0, currency),
            tone: 'brand',
            kind: 'payout',
            time: fmtRelative((p.paid_on as string) ?? null),
          });
        }
      }

      // Earnings by month — only render the chart when at least one
      // commission has actually cleared. Avoids a fake-looking chart.
      const earningsByMonth: { label: string; value: number }[] = [];
      const cleared = commissionsRaw.filter(
        (c) => c.status === 'earned' || c.status === 'paid',
      );
      if (cleared.length > 0) {
        const buckets = new Map<string, number>();
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          buckets.set(key, 0);
        }
        for (const c of cleared) {
          const ts = (c.earned_at as string) || (c.created_at as string);
          if (!ts) continue;
          const d = new Date(ts);
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          if (buckets.has(key)) {
            buckets.set(key, (buckets.get(key) ?? 0) + (Number(c.amount_cents) || 0));
          }
        }
        for (const [key, cents] of buckets.entries()) {
          const [y, m] = key.split('-').map(Number);
          const label = new Date(y, m, 1).toLocaleDateString(undefined, {
            month: 'short',
          });
          earningsByMonth.push({ label, value: cents / 100 });
        }
      }

      setState({
        loading: false,
        status: partner.status === 'suspended' ? 'suspended' : 'active',
        backendAvailable: true,
        partner,
        application: null,
        referralLink,
        referrals,
        payouts: payoutsRaw.map((p) => rowToPayout(p, currency)),
        activity,
        stats,
        earningsByMonth,
        stripeNotConfigured: false,
      });
      return;
    }

    // 2. No partner — fall back to most recent application.
    const appQ = await supabase
      .from('affiliate_applications')
      .select('id, status, submitted_at, reviewer, rejection_reason')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appQ.error && isMissingTableError(appQ.error)) {
      setState({ ...INITIAL, loading: false, status: 'no_backend' });
      return;
    }

    if (appQ.data) {
      const a = appQ.data as Record<string, unknown>;
      const application: AffiliateApplication = {
        id: String(a.id),
        status:
          (a.status as 'pending' | 'approved' | 'rejected' | 'withdrawn') ??
          'pending',
        submittedAt: (a.submitted_at as string) ?? null,
        reviewer: (a.reviewer as string) ?? null,
        rejectionReason: (a.rejection_reason as string) ?? null,
      };
      const status: AffiliateStatus =
        application.status === 'rejected'
          ? 'rejected'
          : application.status === 'approved'
            ? 'active'
            : application.status === 'withdrawn'
              ? 'not_applied'
              : 'pending';
      setState({
        ...INITIAL,
        loading: false,
        status,
        backendAvailable: true,
        application,
      });
      return;
    }

    // 3. Tables exist, no rows — user hasn't applied.
    setState({
      ...INITIAL,
      loading: false,
      status: 'not_applied',
      backendAvailable: true,
    });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    load().catch((err) => {
      console.warn('[affiliate] state probe failed:', err);
      if (!cancelled) {
        setState({ ...INITIAL, loading: false, status: 'no_backend' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { ...state, refresh: load };
}

// ──────────────────────────────────────────────────────────────────────────
// Action helpers — invoke the affiliate edge functions.
// ──────────────────────────────────────────────────────────────────────────

export interface ApplicationFormPayload {
  full_name: string;
  company_or_brand: string;
  website_or_linkedin?: string | null;
  country?: string | null;
  audience_description: string;
  audience_size?: string | null;
  primary_channels: string;
  expected_referral_volume?: string | null;
  accepted_partner_terms: boolean;
  accepted_stripe_ack: boolean;
}

async function getAuthHeader(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? `Bearer ${token}` : null;
}

async function invokeAffiliateFn(name: string, payload: unknown) {
  if (!supabase) {
    return { ok: false, code: 'NO_BACKEND', error: 'Supabase not configured' };
  }
  const auth = await getAuthHeader();
  if (!auth) {
    return { ok: false, error: 'Not authenticated' };
  }
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
      body: JSON.stringify(payload ?? {}),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: `Invalid JSON from ${name}` };
  }
  if (!res.ok && data.ok !== true) {
    return {
      ok: false,
      status: res.status,
      ...data,
    };
  }
  return data as { ok: boolean } & Record<string, unknown>;
}

export async function submitAffiliateApplication(form: ApplicationFormPayload) {
  return invokeAffiliateFn('affiliate-apply', form);
}

export async function startStripeConnect() {
  return invokeAffiliateFn('stripe-connect-onboard', {});
}

export async function refreshStripeConnectStatus() {
  return invokeAffiliateFn('stripe-connect-status', {});
}
