// Billing page (Phase B.24 — UI rebuild matching the LIT billing design
// system). The data layer is unchanged: subscription comes from the
// `subscriptions` table, usage from useEntitlements() (get-entitlements
// edge fn), and Stripe flows go through the existing billing-checkout /
// billing-portal edge functions invoked by createStripeCheckout /
// createStripePortalSession in @/api/functions.
//
// All visual rebuild is in components/billing/sections/*. This file is
// the orchestrator — it owns state, calls the existing handlers, and
// hands real data to dumb presentational components.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { createStripeCheckout, createStripePortalSession } from '@/api/functions';
import { supabase } from '@/lib/supabase';
import {
  getPlanConfig,
  getTotalPrice,
  type BillingInterval,
  type PlanCode,
} from '@/lib/planLimits';
import { useEntitlements, FEATURE_LABELS, type FeatureKey } from '@/lib/usage';
import { usePartnerStatus } from '@/lib/affiliate';
import { CheckCircle2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';

import { BillingHeader, ReadOnlyBanner } from '@/components/billing/sections/BillingHeader';
import { BillingAlerts } from '@/components/billing/sections/BillingAlerts';
import { BillingHero } from '@/components/billing/sections/BillingHero';
import { BillingUsage, type UsageMeter } from '@/components/billing/sections/BillingUsage';
import { BillingPlans } from '@/components/billing/sections/BillingPlans';
import { PaymentMethodCard } from '@/components/billing/sections/PaymentMethodCard';
import { EnterpriseCard } from '@/components/billing/sections/EnterpriseCard';
import { BillingInvoices } from '@/components/billing/sections/BillingInvoices';
import { AffiliateTieIn } from '@/components/billing/sections/AffiliateTieIn';
import { TrustFooter } from '@/components/billing/sections/TrustFooter';
import { deriveCanonicalState, daysUntil, formatDate } from '@/components/billing/sections/billingState';

const SALES_MAILTO = 'mailto:support@logisticintel.com?subject=Enterprise%20Inquiry';

function normalizePlanCode(plan?: string | null): PlanCode {
  const p = (plan || 'free_trial').toLowerCase();
  if (p === 'free' || p === 'free_trial') return 'free_trial';
  if (p === 'starter') return 'starter';
  if (p === 'growth' || p === 'growth_plus') return 'growth';
  if (p.startsWith('enterprise')) return 'enterprise';
  return 'free_trial';
}

function planLabelFor(planCode: PlanCode): string {
  return getPlanConfig(planCode).label;
}

function scrollToPlans() {
  const el = document.getElementById('lit-billing-plans');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Billing() {
  const { user, loading, access, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subscription, setSubscription] = useState<any>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  // 2026-04-29: every paid plan is now a flat package price (Starter $125,
  // Growth $387 incl. 3 seats, Scale $625 incl. 5 seats). The seat
  // selector is gone from the UI — Stripe Checkout always uses
  // quantity:1. We intentionally keep no `selectedSeats` state to remove
  // any role-derived input that could affect the comparison grid.

  // Seats — wire to actual org_members count instead of subscription.seats
  // (which is null for most accounts since seat tracking lives in org_members,
  // not on the Stripe subscription row). Falls back to null so the hero hides
  // the row cleanly when the user isn't part of an org.
  const [orgSeatCount, setOrgSeatCount] = useState<number | null>(null);

  const checkoutSuccess = searchParams.get('checkout') === 'success';

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    loadSubscription();
    loadOrgSeatCount();
    if (checkoutSuccess) {
      const t = setTimeout(() => {
        loadSubscription();
        loadOrgSeatCount();
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [user, checkoutSuccess]);

  // Resolve the user's org → count active members so the hero "X seats
  // assigned" line shows real numbers instead of the always-blank
  // subscription.seats column.
  async function loadOrgSeatCount() {
    if (!user?.id) return;
    try {
      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const orgId = membership?.org_id;
      if (!orgId) return;
      const { count } = await supabase
        .from('org_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('org_id', orgId);
      if (typeof count === 'number') setOrgSeatCount(count);
    } catch {
      /* silent — hero hides the row when null */
    }
  }

  // PRESERVED VERBATIM. Reads from `subscriptions` table.
  async function loadSubscription() {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', (user as any).id)
        .maybeSingle();
      if (data) setSubscription(data);
    } catch {
      /* fallback to auth metadata */
    }
  }

  // PRESERVED VERBATIM. Calls billing-portal edge function.
  async function handlePortal() {
    setErr('');
    setIsRedirecting(true);
    try {
      const result: any = await createStripePortalSession();
      if (result?.url) {
        window.location.href = result.url;
      } else {
        throw new Error(result?.error || 'Unable to open billing portal.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to open billing portal. Please try again.');
      setIsRedirecting(false);
    }
  }

  // PRESERVED VERBATIM. Calls billing-checkout edge function.
  async function handleCheckout(planCode: PlanCode) {
    if (planCode === 'enterprise') {
      window.location.href = SALES_MAILTO;
      return;
    }
    if (planCode === 'free_trial') return;

    // 2026-04-29: every paid plan is a flat package price. We send seats:1
    // to Stripe Checkout for every plan; the package's included seat count
    // (Starter 1, Growth 3, Scale 5) lives in Stripe product metadata, not
    // here. No more "requires at least 3 seats" validation error.
    setErr('');
    setActionLoading(planCode);
    try {
      const result: any = await createStripeCheckout({
        plan_code: planCode,
        interval: billingInterval === 'yearly' ? 'year' : 'month',
        seats: 1,
      });
      if (result?.url) {
        window.location.href = result.url;
      } else {
        throw new Error(result?.error || 'Unable to start checkout.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to start checkout. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  // ── Real entitlements (single source of truth) ─────────────────────
  const { entitlements } = useEntitlements();

  // ── Real partner role for AffiliateTieIn ───────────────────────────
  const partner = usePartnerStatus(user?.id || null);

  // 2026-04-29: the default-seat-selection effect is gone. Every paid plan
  // is a flat package price (Starter $125, Growth $387 incl. 3 seats,
  // Scale $625 incl. 5 seats); there is no selectedSeats state and no
  // role-derived input that could affect the comparison grid.

  // ── Derived state ─────────────────────────────────────────────────
  const rawPlan =
    subscription?.plan_code ||
    (user as any)?.plan ||
    (user as any)?.user_metadata?.plan ||
    'free_trial';
  const currentPlanCode = normalizePlanCode(rawPlan);
  const currentPlan = getPlanConfig(currentPlanCode);
  const subscriptionStatus =
    subscription?.status ||
    (user as any)?.subscription_status ||
    (user as any)?.user_metadata?.subscription_status ||
    'incomplete';
  const stripeCustomerId =
    subscription?.stripe_customer_id ||
    (user as any)?.stripe_customer_id ||
    (user as any)?.user_metadata?.stripe_customer_id;
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);

  const canonicalState = useMemo(
    () =>
      deriveCanonicalState({
        planCode: currentPlanCode,
        rawStatus: subscriptionStatus,
        hasStripeCustomer: Boolean(stripeCustomerId),
        cancelAtPeriodEnd,
      }),
    [currentPlanCode, subscriptionStatus, stripeCustomerId, cancelAtPeriodEnd],
  );

  const canManage = Boolean(access?.canManageBilling);

  // Affiliate role derivation: super admins (platform admin) can access
  // partner admin; active partners get the affiliate state; everyone else
  // sees the apply CTA.
  const affiliateState: 'none' | 'affiliate' | 'admin' = isSuperAdmin
    ? 'admin'
    : partner.isPartner && partner.status === 'active'
    ? 'affiliate'
    : 'none';

  // Seat config — `assignedSeats` is the real number of org members the
  // user currently shares a workspace with (loaded above). `seatsIncluded`
  // is what the package bundles. The hero hides the row when assigned is
  // null (solo accounts not in an org).
  const assignedSeats =
    orgSeatCount ??
    subscription?.seats ??
    (user as any)?.seat_count ??
    null;
  // 2026-04-29: included seats per package. Growth = 3, Scale = 5,
  // Enterprise = Custom, everything else = 1.
  const seatsIncluded =
    currentPlanCode === 'growth'
      ? '3'
      : currentPlanCode === 'scale'
      ? '5'
      : currentPlanCode === 'enterprise'
      ? 'Custom'
      : '1';

  // Hero amount label. Every paid plan is a flat package price now;
  // getTotalPrice ignores the seats arg, so we never multiply.
  const amountForHero = useMemo(() => {
    if (currentPlanCode === 'free_trial') return 'Free';
    if (currentPlanCode === 'enterprise') return 'Custom';
    const total = getTotalPrice(currentPlanCode, billingInterval);
    return total === null ? 'Custom' : `$${total.toLocaleString()}`;
  }, [currentPlanCode, billingInterval]);

  const renewalDate = formatDate(subscription?.current_period_end);
  const daysUntilRenewal = daysUntil(subscription?.current_period_end);
  const billingEmail = (user as any)?.email || null;
  const paymentMethodLabel = stripeCustomerId ? 'On file in Stripe' : 'Not on file';

  // Hero CTA labels per canonical state
  const heroCtas = useMemo(() => {
    switch (canonicalState) {
      case 'free':
        return {
          primary: 'Start subscription',
          secondary: 'Compare plans',
          onPrimary: () => handleCheckout('starter'),
          onSecondary: scrollToPlans,
        };
      case 'trial':
        return {
          primary: 'Add payment',
          secondary: 'Compare plans',
          onPrimary: () => handleCheckout(currentPlanCode === 'free_trial' ? 'starter' : currentPlanCode),
          onSecondary: scrollToPlans,
        };
      case 'pastdue':
        return {
          primary: 'Update payment',
          secondary: 'Manage in Stripe',
          onPrimary: handlePortal,
          onSecondary: handlePortal,
        };
      case 'canceled':
        return {
          primary: 'Reactivate plan',
          secondary: 'Compare plans',
          onPrimary: () => handleCheckout(currentPlanCode === 'free_trial' ? 'starter' : currentPlanCode === 'enterprise' ? 'growth' : currentPlanCode),
          onSecondary: scrollToPlans,
        };
      case 'enterprise':
        return {
          primary: 'Contact account exec',
          secondary: 'Manage in Stripe',
          onPrimary: () => { window.location.href = SALES_MAILTO; },
          onSecondary: handlePortal,
        };
      case 'active':
      default:
        return {
          primary: 'Manage in Stripe',
          secondary: 'Compare plans',
          onPrimary: handlePortal,
          onSecondary: scrollToPlans,
        };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonicalState, currentPlanCode]);

  // Cycle toggle: hide for canceled / enterprise / pastdue (no active
  // checkout flow that benefits from the toggle in those states). Keep
  // for free / trial / active.
  const showCycleToggle = canonicalState === 'free' || canonicalState === 'trial' || canonicalState === 'active';

  // Build real usage meters from useEntitlements snapshot. Single source
  // of truth — get-entitlements is canonical, so we no longer maintain a
  // parallel set of fallback queries against lit_activity_events /
  // saved_companies / lit_campaigns.
  const usageMeters: UsageMeter[] = useMemo(() => {
    if (!entitlements) return [];
    const keys: FeatureKey[] = [
      'company_search',
      'saved_company',
      'company_profile_view',
      'contact_enrichment',
      'campaign_send',
      'pulse_brief',
      'export_pdf',
    ];
    return keys
      .filter((k) => k in entitlements.limits || k in entitlements.used)
      .map((k) => ({
        key: k,
        label: capitalize(FEATURE_LABELS[k]?.plural || k),
        used: entitlements.used[k] ?? 0,
        limit: entitlements.limits[k] ?? null,
      }));
  }, [entitlements]);

  // Usage warnings for BillingAlerts (≥80% of any limited counter)
  const usageWarnings = useMemo(() => {
    return usageMeters
      .filter((m) => m.limit !== null && m.limit > 0)
      .map((m) => {
        const pct = Math.round(((m.used || 0) / (m.limit as number)) * 100);
        return { label: m.label, used: m.used, limit: m.limit as number, pct };
      })
      .filter((w) => w.pct >= 80);
  }, [usageMeters]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      <div className="mx-auto max-w-[1180px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        {/* Sticky header with breadcrumb + role/status */}
        <BillingHeader state={canonicalState} canManage={canManage} isSuperAdmin={isSuperAdmin} />

        {/* Read-only banner (only when canManage === false) */}
        <ReadOnlyBanner canManage={canManage} />

        {/* Toast: checkout success */}
        {checkoutSuccess && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Billing update received</p>
              <p className="mt-0.5 text-sm text-emerald-700">
                Your subscription status is refreshing now.
              </p>
            </div>
          </div>
        )}

        {/* Toast: error */}
        {err && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-900">Billing action failed</p>
              <p className="mt-0.5 text-sm text-red-700">{err}</p>
            </div>
          </div>
        )}

        {/* State-driven alerts */}
        <div className="mb-5">
          <BillingAlerts
            state={canonicalState}
            trialEndIso={subscription?.current_period_end || null}
            paymentFailedAt={subscription?.current_period_end || null}
            canceledAt={subscription?.current_period_end || null}
            onUpgrade={() => handleCheckout(currentPlanCode === 'free_trial' ? 'starter' : currentPlanCode === 'enterprise' ? 'growth' : currentPlanCode)}
            onUpdatePayment={handlePortal}
            onContactSales={() => { window.location.href = SALES_MAILTO; }}
            onSeePlans={scrollToPlans}
            usageWarnings={usageWarnings}
          />
        </div>

        {/* Trial countdown — shown only for trial users. Pulse Coach
            visual language so it slots cleanly above the hero without
            competing with it. Surfaces real days-left + the highest-burn
            usage meter so users see exactly what's about to run out. */}
        {canonicalState === 'trial' && (
          <div className="mb-6">
            <TrialCountdownCard
              daysLeft={daysUntilRenewal}
              endDate={renewalDate}
              meters={usageMeters}
              onUpgrade={() => handleCheckout('starter')}
              onCompare={scrollToPlans}
            />
          </div>
        )}

        {/* Hero */}
        <div className="mb-6">
          <BillingHero
            planCode={currentPlanCode}
            planLabel={planLabelFor(currentPlanCode)}
            state={canonicalState}
            amountDisplay={amountForHero}
            cycle={currentPlanCode === 'free_trial' || currentPlanCode === 'enterprise' ? null : billingInterval}
            renewalDate={renewalDate}
            daysUntilRenewal={daysUntilRenewal}
            paymentMethodLabel={paymentMethodLabel}
            billingEmail={billingEmail}
            seats={{ assigned: assignedSeats, included: seatsIncluded }}
            showCycleToggle={showCycleToggle}
            onCycleChange={(c) => setBillingInterval(c)}
            primaryLabel={heroCtas.primary}
            secondaryLabel={heroCtas.secondary}
            onPrimary={heroCtas.onPrimary}
            onSecondary={heroCtas.onSecondary}
            primaryDisabled={!canManage && (canonicalState !== 'enterprise' && canonicalState !== 'active')}
            isLoading={isRedirecting || Boolean(actionLoading)}
          />
        </div>

        {/* Usage */}
        <div className="mb-6">
          <BillingUsage meters={usageMeters} resetAt={formatDate(entitlements?.reset_at)} />
        </div>

        {/* Plans */}
        <div className="mb-6">
          <BillingPlans
            currentPlanCode={currentPlanCode}
            cycle={billingInterval}
            onSelectPlan={(p) => handleCheckout(p)}
            onContactSales={() => { window.location.href = SALES_MAILTO; }}
            onManageCurrent={handlePortal}
            actionLoading={actionLoading}
            canManage={canManage}
            hasStripeCustomer={Boolean(stripeCustomerId)}
          />
        </div>

        {/* Payment method + Enterprise — 2-up grid that stacks <820px */}
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <PaymentMethodCard
            hasStripeCustomer={Boolean(stripeCustomerId)}
            billingEmail={billingEmail}
            canManage={canManage}
            onManagePortal={handlePortal}
            onAddPayment={() => handleCheckout(currentPlanCode === 'free_trial' ? 'starter' : currentPlanCode)}
            isLoading={isRedirecting}
          />
          <EnterpriseCard
            onContactSales={() => { window.location.href = SALES_MAILTO; }}
            onBookDemo={() => { window.location.href = SALES_MAILTO; }}
          />
        </div>

        {/* Affiliate tie-in — moved above Invoices so the partner program
            is visible without scrolling past an empty invoices block. */}
        <div className="mb-6">
          <AffiliateTieIn
            state={affiliateState}
            onApply={() => navigate('/partners/apply')}
            onOpenDash={() => navigate('/app/affiliate')}
            onOpenAdmin={() => navigate('/app/admin/partner-program')}
          />
        </div>

        {/* Invoices */}
        <div className="mb-6">
          <BillingInvoices
            invoices={[]}
            hasStripeCustomer={Boolean(stripeCustomerId)}
            canManage={canManage}
            onOpenPortal={handlePortal}
            isLoading={isRedirecting}
          />
        </div>

        {/* Trust footer */}
        <TrustFooter />
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Trial-specific countdown banner. Only renders for users in the `trial`
 * canonical state. Shows real days-left, the highest-burn usage meter,
 * and a strong upgrade CTA — keeps trial users anchored to "what runs
 * out, when, and how to keep going." Pulse Coach styling matches the
 * Profile-page premium quota card pattern for cross-page brand
 * consistency.
 */
function TrialCountdownCard({
  daysLeft,
  endDate,
  meters,
  onUpgrade,
  onCompare,
}: {
  daysLeft: number | null;
  endDate: string | null;
  meters: UsageMeter[];
  onUpgrade: () => void;
  onCompare: () => void;
}) {
  const hottestMeter = useMemo(() => {
    const limited = meters.filter((m) => m.limit != null && m.limit > 0);
    if (!limited.length) return null;
    return limited
      .map((m) => ({ ...m, pct: Math.min(100, Math.round((m.used / (m.limit as number)) * 100)) }))
      .sort((a, b) => b.pct - a.pct)[0];
  }, [meters]);

  const headlineDays = daysLeft != null ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}` : null;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 px-5 py-4 sm:px-6"
      style={{
        background: 'linear-gradient(160deg,#0F172A 0%,#1E293B 100%)',
        boxShadow: 'inset 0 -1px 0 rgba(0,240,255,0.18), 0 1px 3px rgba(15,23,42,0.06)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)' }}
      />
      <div className="relative flex flex-wrap items-start gap-4 sm:flex-nowrap">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{ background: 'rgba(0,240,255,0.10)', borderColor: 'rgba(255,255,255,0.10)' }}
        >
          <Sparkles className="h-4 w-4" style={{ color: '#00F0FF' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display flex flex-wrap items-center gap-2 text-[12.5px] font-bold tracking-wide text-white">
            Pulse Coach
            <span
              className="inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
              style={{
                color: '#00F0FF',
                borderColor: 'rgba(0,240,255,0.35)',
                background: 'rgba(0,240,255,0.08)',
                fontFamily: 'ui-monospace,monospace',
              }}
            >
              Trial
            </span>
            {headlineDays && (
              <span className="font-mono text-[10.5px] font-semibold text-slate-300">
                {headlineDays} left{endDate ? ` · ends ${endDate}` : ''}
              </span>
            )}
          </div>
          <p className="font-display mt-1.5 text-[14px] font-semibold text-white">
            {hottestMeter && hottestMeter.pct >= 60
              ? `${hottestMeter.label} ${hottestMeter.pct}% used — upgrade now and we'll honor your trial usage.`
              : `Get the most out of your trial — upgrade to unlock unlimited workflows.`}
          </p>
          {hottestMeter && hottestMeter.limit != null && (
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-300" style={{ fontFamily: 'DM Sans,sans-serif' }}>
              <span className="font-mono text-white">
                {hottestMeter.used} / {hottestMeter.limit}
              </span>
              <span>·</span>
              <span>{hottestMeter.label.toLowerCase()}</span>
              <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-white/5 max-w-[180px]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(2, hottestMeter.pct)}%`,
                    background:
                      hottestMeter.pct >= 90 ? '#F97316' : hottestMeter.pct >= 70 ? '#FACC15' : '#00F0FF',
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onCompare}
            className="font-display inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[11.5px] font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Compare plans
          </button>
          <button
            type="button"
            onClick={onUpgrade}
            className="font-display inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11.5px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.35)] transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.45)]"
            style={{ background: 'linear-gradient(180deg,#0F172A 0%,#0B1220 100%)' }}
          >
            Upgrade now
            <ArrowRight className="h-3 w-3" style={{ color: '#00F0FF' }} />
          </button>
        </div>
      </div>
    </div>
  );
}