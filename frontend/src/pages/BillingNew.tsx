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
import { getSavedCompanies } from '@/lib/api';
import { getLitCampaigns } from '@/lib/litCampaigns';
import {
  getPlanConfig,
  getTotalPrice,
  type BillingInterval,
  type PlanCode,
} from '@/lib/planLimits';
import { useEntitlements, FEATURE_LABELS, type FeatureKey } from '@/lib/usage';
import { usePartnerStatus } from '@/lib/affiliate';
import { CheckCircle2, AlertCircle } from 'lucide-react';

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

  // Phase F — real usage counters (preserved verbatim from prior impl).
  const [realSearches, setRealSearches] = useState<number>(0);
  const [realSaves, setRealSaves] = useState<number>(0);
  const [realActiveCampaigns, setRealActiveCampaigns] = useState<number>(0);

  const checkoutSuccess = searchParams.get('checkout') === 'success';

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    loadSubscription();
    loadRealUsageCounters();
    if (checkoutSuccess) {
      const t = setTimeout(() => {
        loadSubscription();
        loadRealUsageCounters();
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [user, checkoutSuccess]);

  // PRESERVED VERBATIM (from prior phase). Reads three real meters and
  // silently fails per branch — never blocks Billing page render.
  async function loadRealUsageCounters() {
    if (!user?.id) return;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    supabase
      .from('lit_activity_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', (user as any).id)
      .eq('event_type', 'search')
      .gte('created_at', monthStart)
      .then(
        (res: any) => {
          if (!res?.error && typeof res?.count === 'number') setRealSearches(res.count);
        },
        () => { /* silent */ },
      );

    getSavedCompanies()
      .then((resp: any) => {
        const rows = Array.isArray(resp?.rows) ? resp.rows : Array.isArray(resp) ? resp : [];
        setRealSaves(rows.length || 0);
      })
      .catch(() => { /* silent */ });

    getLitCampaigns()
      .then((resp: any) => {
        const rows = Array.isArray(resp?.rows) ? resp.rows : Array.isArray(resp) ? resp : [];
        const active = rows.filter((c: any) => c?.status === 'active' || c?.status === 'live').length;
        setRealActiveCampaigns(active);
      })
      .catch(() => { /* silent */ });
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

  // Seat config
  const assignedSeats =
    subscription?.seats ||
    (user as any)?.seat_count ||
    (user as any)?.team_seat_count ||
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

  // Build real usage meters from useEntitlements snapshot. Falls back to
  // legacy in-page counters until snapshot loads.
  const usageMeters: UsageMeter[] = useMemo(() => {
    if (!entitlements) {
      return [
        { key: 'company_search', label: 'Searches', used: realSearches, limit: currentPlan.limits.searches_per_month },
        { key: 'saved_company', label: 'Saved companies', used: realSaves, limit: currentPlan.limits.command_center_saves_per_month },
        { key: 'campaign_send', label: 'Active campaigns', used: realActiveCampaigns, limit: currentPlan.limits.campaigns_active },
      ];
    }
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
  }, [entitlements, realSearches, realSaves, realActiveCampaigns, currentPlan]);

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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
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

        {/* Affiliate tie-in */}
        <div className="mb-6">
          <AffiliateTieIn
            state={affiliateState}
            onApply={() => navigate('/partners/apply')}
            onOpenDash={() => navigate('/app/affiliate')}
            onOpenAdmin={() => navigate('/app/admin/partner-program')}
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