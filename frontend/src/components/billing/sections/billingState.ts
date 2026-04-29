// Map the live app's `subscriptions.status` enum (active, past_due,
// cancelled, incomplete, trialing) + plan_code (free_trial | starter |
// growth | enterprise) into the 6 canonical UI states the design system
// renders against. Backend values are NEVER changed — this is a pure
// presentational bridge.

import type { PlanCode } from '@/lib/planLimits';

export type CanonicalState =
  | 'active'
  | 'trial'
  | 'pastdue'
  | 'canceled'
  | 'free'
  | 'enterprise';

export function deriveCanonicalState(args: {
  planCode: PlanCode;
  rawStatus: string | null | undefined;
  hasStripeCustomer: boolean;
  cancelAtPeriodEnd?: boolean;
}): CanonicalState {
  const { planCode, rawStatus, hasStripeCustomer, cancelAtPeriodEnd } = args;
  const s = String(rawStatus || '').toLowerCase();

  if (planCode === 'enterprise') return 'enterprise';
  if (s === 'past_due') return 'pastdue';
  if (s === 'cancelled' || s === 'canceled') return 'canceled';
  if (cancelAtPeriodEnd) return 'canceled';
  if (s === 'trialing') return 'trial';
  if (s === 'active' && hasStripeCustomer) return 'active';
  // free_trial plan with no Stripe customer (or "incomplete" status with no
  // payment method) → render the "free" state. The user has never paid.
  if (planCode === 'free_trial' || !hasStripeCustomer) return 'free';
  return 'active';
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}
