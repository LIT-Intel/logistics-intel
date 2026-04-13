import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { createStripeCheckout, createStripePortalSession } from '@/api/functions';
import { supabase } from '@/lib/supabase';
import { getPlanConfig, type PlanCode, type PlanConfig } from '@/lib/planLimits';
import {
  CheckCircle2,
  Zap,
  Building2,
  Search,
  Eye,
  Mail,
  CreditCard,
  ExternalLink,
  AlertCircle,
  TrendingUp,
  Users,
  Shield,
  Crown,
  BarChart3,
} from 'lucide-react';

function normalizePlanCode(plan?: string | null): PlanCode {
  const p = (plan || 'free_trial').toLowerCase();

  if (p === 'free' || p === 'free_trial') return 'free_trial';
  if (p === 'starter') return 'starter';
  if (p === 'growth' || p === 'growth_plus') return 'growth';
  if (p.startsWith('enterprise')) return 'enterprise';

  return 'free_trial';
}

type DisplayPlanCard = {
  code: PlanCode;
  name: string;
  price: string;
  period: string;
  description: string;
  seats: string;
  highlights: string[];
  limitsLine: string;
  highlight?: boolean;
};

function formatPrice(plan: PlanCode, config: PlanConfig): string {
  if (plan === 'free_trial') return '$0';
  if (plan === 'enterprise') return 'Custom';
  return `$${config.priceMonthly}`;
}

function formatPeriod(plan: PlanCode): string {
  return plan === 'enterprise' ? '' : '/mo';
}

function formatLimit(value: number | null): string {
  if (value === null) return 'Unlimited';
  return value.toLocaleString();
}

function buildPlanCards(): DisplayPlanCard[] {
  const freeTrial = getPlanConfig('free_trial');
  const starter = getPlanConfig('starter');
  const growth = getPlanConfig('growth');
  const enterprise = getPlanConfig('enterprise');

  return [
    {
      code: 'free_trial',
      name: freeTrial.label,
      price: formatPrice('free_trial', freeTrial),
      period: formatPeriod('free_trial'),
      description: 'Starter access to explore the platform without a credit card.',
      seats: '1 seat',
      limitsLine: '10 searches • 10 saves',
      highlights: [
        'Dashboard access',
        'Search access',
        '10 Command Center saves',
        'No Campaign Builder or Pulse',
      ],
    },
    {
      code: 'starter',
      name: starter.label,
      price: formatPrice('starter', starter),
      period: formatPeriod('starter'),
      description: 'Core freight intelligence and CRM for individual operators.',
      seats: '1 seat',
      limitsLine: '300 searches • 100 company views',
      highlights: [
        'Command Center',
        'Company Intelligence page',
        '100 saves',
        'No Campaign Builder or Pulse',
      ],
    },
    {
      code: 'growth',
      name: growth.label,
      price: formatPrice('growth', growth),
      period: formatPeriod('growth'),
      description: 'Outbound, enrichment, and prospecting workflows for active teams.',
      seats: '3–5 seats',
      limitsLine: '2,000 searches • 500 company views • 50 Pulse runs',
      highlights: [
        'Campaign Builder',
        'Pulse',
        '200 enrichment credits',
        '500 saves',
      ],
      highlight: true,
    },
    {
      code: 'enterprise',
      name: enterprise.label,
      price: formatPrice('enterprise', enterprise),
      period: formatPeriod('enterprise'),
      description: 'Advanced admin control, scale, and API-readiness for larger teams.',
      seats: '10+ seats',
      limitsLine: 'Custom limits • soft-cap ready',
      highlights: [
        'Everything in Growth',
        'Advanced admin controls',
        'Priority support',
        'Custom usage limits',
      ],
    },
  ];
}

function usagePct(used: number, max: number | null) {
  if (max === null || max === 0) return 0;
  return Math.min(Math.round((used / max) * 100), 100);
}

function ProgressMetric({
  icon: Icon,
  label,
  current,
  max,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  current: number;
  max: number | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
            <Icon className="h-4 w-4 text-slate-700" />
          </div>
          <span className="truncate text-sm font-medium text-slate-700">{label}</span>
        </div>
        <span className="text-xs font-semibold text-slate-900">
          {max === null ? 'Unlimited' : `${current} / ${max}`}
        </span>
      </div>

      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-slate-900 transition-all"
          style={{ width: `${usagePct(current, max)}%` }}
        />
      </div>
    </div>
  );
}

export default function Billing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subscription, setSubscription] = useState<any>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const checkoutSuccess = searchParams.get('checkout') === 'success';

  const planCards = useMemo(() => buildPlanCards(), []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;

    loadSubscription();

    if (checkoutSuccess) {
      const t = setTimeout(() => loadSubscription(), 4000);
      return () => clearTimeout(t);
    }
  }, [user, checkoutSuccess]);

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
      // fallback to auth metadata
    }
  }

  async function handleUpgrade(planCode: PlanCode) {
    if (planCode === 'enterprise') {
      window.location.href = 'mailto:support@logisticintel.com?subject=Enterprise Inquiry';
      return;
    }

    if (planCode === 'free_trial') return;

    setErr('');
    setUpgradeLoading(planCode);

    try {
      const result: any = await createStripeCheckout({
        plan_code: planCode,
        interval: 'month',
      });

      if (result?.url) {
        window.location.href = result.url;
      } else {
        throw new Error(result?.error || 'Unable to start checkout.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to start checkout. Please try again.');
    } finally {
      setUpgradeLoading(null);
    }
  }

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

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  const rawPlan =
    subscription?.plan_code ||
    (user as any).plan ||
    (user as any).user_metadata?.plan ||
    'free_trial';

  const currentPlanCode = normalizePlanCode(rawPlan);
  const currentPlan = getPlanConfig(currentPlanCode);

  const subscriptionStatus =
    subscription?.status ||
    (user as any).subscription_status ||
    (user as any).user_metadata?.subscription_status ||
    'incomplete';

  const isActive = subscriptionStatus === 'active';

  const stripeCustomerId =
    subscription?.stripe_customer_id ||
    (user as any).stripe_customer_id ||
    (user as any).user_metadata?.stripe_customer_id;

  const searchesUsed = (user as any).monthly_searches || 0;
  const companyViewsUsed = (user as any).monthly_companies_viewed || 0;
  const savesUsed =
    (user as any).monthly_command_center_saves ||
    (user as any).monthly_saved_companies ||
    0;
  const pulseUsed =
    (user as any).monthly_pulse_runs ||
    (user as any).monthly_emails_sent ||
    0;

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const seatPolicy =
    currentPlanCode === 'free_trial'
      ? '1 seat'
      : currentPlanCode === 'starter'
      ? '1 seat'
      : currentPlanCode === 'growth'
      ? '3 to 5 seats'
      : '10+ seats';

  const assignedSeats =
    subscription?.seats ||
    (user as any).seat_count ||
    (user as any).team_seat_count ||
    currentPlan.seatRules.default;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
        <div className="mb-6 md:mb-8">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Account
          </span>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                Billing & Plans
              </h1>
              <p className="mt-1 text-sm text-slate-600 md:text-base">
                Manage your subscription, usage, seats, and billing settings.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {stripeCustomerId && (
                <button
                  onClick={handlePortal}
                  disabled={isRedirecting}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {isRedirecting ? 'Opening…' : 'Manage in Stripe'}
                </button>
              )}

              {currentPlanCode === 'enterprise' && (
                <a
                  href="mailto:support@logisticintel.com?subject=Enterprise Inquiry"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                >
                  Contact Sales
                </a>
              )}
            </div>
          </div>
        </div>

        {checkoutSuccess && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-900">Subscription update received</p>
              <p className="mt-0.5 text-sm text-emerald-700">
                Your billing status is refreshing now.
              </p>
            </div>
          </div>
        )}

        {err && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-900">Billing action failed</p>
              <p className="mt-0.5 text-sm text-red-700">{err}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-sm md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  {currentPlanCode === 'enterprise' ? (
                    <Crown className="h-6 w-6 text-white" />
                  ) : (
                    <Zap className="h-6 w-6 text-white" />
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{currentPlan.label} Plan</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/10 text-white/70'
                      }`}
                    >
                      {subscriptionStatus}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-300">
                    {currentPlanCode === 'free_trial'
                      ? 'Free trial access'
                      : currentPlanCode === 'enterprise'
                      ? 'Custom enterprise pricing'
                      : `$${currentPlan.priceMonthly}/month`}
                    {renewalDate ? ` · Renews ${renewalDate}` : ''}
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        Seat Policy
                      </div>
                      <div className="mt-1 text-sm font-medium text-white">{seatPolicy}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        Seats Assigned
                      </div>
                      <div className="mt-1 text-sm font-medium text-white">{assignedSeats}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        Access Level
                      </div>
                      <div className="mt-1 text-sm font-medium text-white">
                        {currentPlanCode === 'enterprise'
                          ? 'Advanced admin'
                          : currentPlanCode === 'growth'
                          ? 'Team plan'
                          : 'Individual'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!stripeCustomerId && currentPlanCode !== 'enterprise' && (
                <button
                  onClick={() =>
                    handleUpgrade(currentPlanCode === 'free_trial' ? 'starter' : 'growth')
                  }
                  disabled={!!upgradeLoading}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50 md:w-auto"
                >
                  {upgradeLoading ? 'Processing…' : 'Upgrade Plan'}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                <BarChart3 className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Usage Snapshot</div>
                <div className="text-sm text-slate-500">Current billing period usage</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <ProgressMetric
                icon={Search}
                label="Searches"
                current={searchesUsed}
                max={currentPlan.limits.searches_per_month}
              />
              <ProgressMetric
                icon={Eye}
                label="Company Views"
                current={companyViewsUsed}
                max={currentPlan.limits.company_views_per_month}
              />
              <ProgressMetric
                icon={Building2}
                label="Command Center Saves"
                current={savesUsed}
                max={currentPlan.limits.command_center_saves_per_month}
              />
              <ProgressMetric
                icon={Mail}
                label="Pulse / Outreach"
                current={pulseUsed}
                max={currentPlan.limits.pulse_runs_per_month}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              Plans
            </span>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Compare plans</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose the right access level for your team and workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {planCards.map((plan) => {
              const isCurrent = plan.code === currentPlanCode;
              const currentIndex = planCards.findIndex((p) => p.code === currentPlanCode);
              const targetIndex = planCards.findIndex((p) => p.code === plan.code);
              const isUpgrade = targetIndex > currentIndex;
              const isDowngrade = targetIndex < currentIndex;
              const isLoadingThis = upgradeLoading === plan.code;

              return (
                <div
                  key={plan.code}
                  className={`relative flex h-full flex-col rounded-3xl border p-5 transition ${
                    isCurrent
                      ? 'border-slate-900 ring-1 ring-slate-900/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute right-4 top-0 -translate-y-1/2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                      Current
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {plan.name}
                    </div>
                    <div className="mt-3 flex items-end gap-1">
                      <span className="text-4xl font-bold tracking-tight text-slate-950">
                        {plan.price}
                      </span>
                      <span className="mb-1 text-sm text-slate-500">{plan.period}</span>
                    </div>
                    <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-600">
                      {plan.description}
                    </p>

                    <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                      <div className="text-sm font-medium text-slate-900">{plan.seats}</div>
                      <div className="mt-1 text-sm text-slate-600">{plan.limitsLine}</div>
                    </div>
                  </div>

                  <ul className="mt-5 flex-1 space-y-3">
                    {plan.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <button
                      onClick={() => {
                        if (isCurrent && stripeCustomerId) {
                          handlePortal();
                          return;
                        }

                        if (isCurrent) return;

                        if (isDowngrade && stripeCustomerId) {
                          handlePortal();
                          return;
                        }

                        handleUpgrade(plan.code);
                      }}
                      disabled={
                        isLoadingThis ||
                        isRedirecting ||
                        (isCurrent && !stripeCustomerId && currentPlanCode !== 'free_trial')
                      }
                      className={`inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                        isCurrent || isUpgrade
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {isLoadingThis
                        ? 'Processing…'
                        : isCurrent
                        ? stripeCustomerId
                          ? 'Manage Plan'
                          : 'Current Plan'
                        : plan.code === 'enterprise'
                        ? 'Upgrade to Enterprise'
                        : isUpgrade
                        ? `Upgrade to ${plan.name}`
                        : 'Downgrade'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Payment
                </span>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Payment Method</h3>
              </div>

              {stripeCustomerId && (
                <button
                  onClick={handlePortal}
                  disabled={isRedirecting}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Update
                </button>
              )}
            </div>

            {stripeCustomerId ? (
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">Payment method on file</p>
                  <p className="text-sm text-slate-500">Manage details in Stripe billing portal</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Active
                </span>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No payment method on file yet. Upgrade a paid plan to add one.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  History
                </span>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Billing History</h3>
              </div>

              {stripeCustomerId && (
                <button
                  onClick={handlePortal}
                  disabled={isRedirecting}
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Portal
                </button>
              )}
            </div>

            {stripeCustomerId ? (
              <p className="text-sm leading-6 text-slate-600">
                Full invoice history and downloadable PDFs are available in your Stripe billing
                portal.
              </p>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center">
                <TrendingUp className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">No billing history available yet.</p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Seats
              </span>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">Seat Management</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                  {currentPlanCode === 'enterprise' ? (
                    <Shield className="h-5 w-5 text-slate-700" />
                  ) : (
                    <Users className="h-5 w-5 text-slate-700" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">Current seat policy</p>
                  <p className="mt-1 text-sm text-slate-600">{seatPolicy}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Included</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    {currentPlanCode === 'growth'
                      ? '3–5'
                      : currentPlanCode === 'enterprise'
                      ? '10+'
                      : '1'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Assigned</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{assignedSeats}</div>
                </div>
              </div>

              <p className="text-sm leading-6 text-slate-600">
                Org admins can manage seats and billing visibility according to the active plan.
                Seat expansion beyond plan rules should route through billing or sales.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
