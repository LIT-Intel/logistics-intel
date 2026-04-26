// Affiliate state hook.
//
// Probes Supabase for the affiliate backend tables (`affiliate_partners`,
// `affiliate_applications`). When the tables don't exist yet, the hook
// returns `status: 'no_backend'` so the UI can render an honest
// "application backend not enabled yet" shell — no fake metrics, no fake
// referral codes, no fake earnings.
//
// Once Phase B ships the migrations, this hook will start returning real
// state (`not_applied`, `pending`, `active`, `rejected`, `suspended`)
// without any UI changes required.

import { useEffect, useState } from 'react';
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
  status: 'active' | 'suspended';
  commissionPct: number | null;
  commissionMonths: number | null;
  stripeAccountId: string | null;
  stripeStatus: StripeConnectStatus;
  payoutCurrency: string | null;
  accountManager: string | null;
  joinedAt: string | null;
}

export interface AffiliateApplication {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string | null;
  reviewer: string | null;
  rejectionReason: string | null;
}

export interface AffiliateState {
  loading: boolean;
  status: AffiliateStatus;
  backendAvailable: boolean;
  partner: AffiliatePartner | null;
  application: AffiliateApplication | null;
  referralLink: string | null;
}

const INITIAL: AffiliateState = {
  loading: true,
  status: 'loading',
  backendAvailable: false,
  partner: null,
  application: null,
  referralLink: null,
};

// Postgres "relation does not exist" error code.
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

export function useAffiliateState(userId: string | null | undefined): AffiliateState {
  const [state, setState] = useState<AffiliateState>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supabase || !userId) {
        if (!cancelled) {
          setState({
            loading: false,
            status: 'no_backend',
            backendAvailable: false,
            partner: null,
            application: null,
            referralLink: null,
          });
        }
        return;
      }

      // 1. Look for an active partner record.
      const partnerQ = await supabase
        .from('affiliate_partners')
        .select(
          'id, ref_code, tier, status, commission_pct, commission_months, stripe_account_id, stripe_status, payout_currency, account_manager, joined_at'
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (partnerQ.error && isMissingTableError(partnerQ.error)) {
        if (!cancelled) {
          setState({
            loading: false,
            status: 'no_backend',
            backendAvailable: false,
            partner: null,
            application: null,
            referralLink: null,
          });
        }
        return;
      }

      if (partnerQ.data) {
        const p = partnerQ.data as Record<string, unknown>;
        const partner: AffiliatePartner = {
          id: String(p.id),
          refCode: (p.ref_code as string) ?? null,
          tier: (p.tier as string) ?? null,
          status: (p.status as 'active' | 'suspended') ?? 'active',
          commissionPct: (p.commission_pct as number) ?? null,
          commissionMonths: (p.commission_months as number) ?? null,
          stripeAccountId: (p.stripe_account_id as string) ?? null,
          stripeStatus:
            (p.stripe_status as StripeConnectStatus) ?? 'not_connected',
          payoutCurrency: (p.payout_currency as string) ?? null,
          accountManager: (p.account_manager as string) ?? null,
          joinedAt: (p.joined_at as string) ?? null,
        };
        const referralLink = partner.refCode
          ? `https://logisticintel.com/?ref=${partner.refCode}`
          : null;
        if (!cancelled) {
          setState({
            loading: false,
            status: partner.status === 'suspended' ? 'suspended' : 'active',
            backendAvailable: true,
            partner,
            application: null,
            referralLink,
          });
        }
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
        if (!cancelled) {
          setState({
            loading: false,
            status: 'no_backend',
            backendAvailable: false,
            partner: null,
            application: null,
            referralLink: null,
          });
        }
        return;
      }

      if (appQ.data) {
        const a = appQ.data as Record<string, unknown>;
        const application: AffiliateApplication = {
          id: String(a.id),
          status: (a.status as 'pending' | 'approved' | 'rejected') ?? 'pending',
          submittedAt: (a.submitted_at as string) ?? null,
          reviewer: (a.reviewer as string) ?? null,
          rejectionReason: (a.rejection_reason as string) ?? null,
        };
        const status: AffiliateStatus =
          application.status === 'rejected'
            ? 'rejected'
            : application.status === 'approved'
              ? 'active'
              : 'pending';
        if (!cancelled) {
          setState({
            loading: false,
            status,
            backendAvailable: true,
            partner: null,
            application,
            referralLink: null,
          });
        }
        return;
      }

      // 3. Tables exist, but no application or partner — user hasn't applied.
      if (!cancelled) {
        setState({
          loading: false,
          status: 'not_applied',
          backendAvailable: true,
          partner: null,
          application: null,
          referralLink: null,
        });
      }
    }

    load().catch((err) => {
      // Network error or unexpected failure — treat as backend unavailable
      // rather than showing fake data.
      console.warn('[affiliate] state probe failed:', err);
      if (!cancelled) {
        setState({
          loading: false,
          status: 'no_backend',
          backendAvailable: false,
          partner: null,
          application: null,
          referralLink: null,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
