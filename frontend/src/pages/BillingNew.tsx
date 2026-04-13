import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { createStripeCheckout, createStripePortalSession } from '@/api/functions';
import { supabase } from '@/lib/supabase';
import {
  getPlanConfig,
  getPlanLimits,
  type PlanCode,
  type PlanConfig,
} from '@/lib/planLimits';
import {
  CheckCircle2,
  Zap,
  Building2,
  Mail,
  FileText,
  ExternalLink,
  AlertCircle,
  CreditCard,
  TrendingUp,
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
  stats: {
    companies: string;
    emails: string;
    rfps: string;
    seats: string;
  };
  features: { label: string; included: boolean }[];
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
      description: 'Get started with limited access and no credit card required.',
      stats: {
        companies: formatLimit(freeTrial.limits.command_center_saves_per_month),
        emails: '0',
        rfps: '0',
        seats: '1',
      },
      features: [
        { label: '10 searches', included: true },
        { label: '10 Command Center saves', included: true },
        { label: 'Dashboard access', included: true },
        { label: 'Search access', included: true },
        { label: 'Campaign Builder', included: false },
        { label: 'Pulse', included: false },
      ],
    },
    {
      code: 'starter',
      name: starter.label,
      price: formatPrice('starter', starter),
      period: formatPeriod('starter'),
      description: 'For individual operators who need core freight intelligence and CRM.',
      stats: {
        companies: formatLimit(starter.limits.command_center_saves_per_month),
        emails: '0',
        rfps: '0',
        seats: '1',
      },
      features: [
        { label: '300 searches / month', included: true },
        { label: '100 company views / month', included: true },
        { label: 'Command Center access', included: true },
        { label: 'Company Intelligence page', included: true },
        { label: 'Campaign Builder', included: false },
        { label: 'Pulse', included: false },
      ],
    },
    {
      code: 'growth',
      name: growth.label,
      price: formatPrice('growth', growth),
      period: formatPeriod('growth'),
      description: 'For teams running outbound, enrichment, and prospecting workflows.',
      stats: {
        companies: formatLimit(growth.limits.command_center_saves_per_month),
        emails: formatLimit(growth.limits.pulse_runs_per_month),
        rfps: '0',
        seats: '3–5',
      },
      features: [
        { label: '2,000 searches / month', included: true },
        { label: '500 company views / month', included: true },
        { label: '200 enrichment credits / month', included: true },
        { label: '50 Pulse runs / month', included: true },
        { label: 'Campaign Builder', included: true },
        { label: '3 to 5 team seats', included: true },
      ],
      highlight: true,
    },
    {
      code: 'enterprise',
      name: enterprise.label,
      price: formatPrice('enterprise', enterprise),
      period: formatPeriod('enterprise'),
      description: 'For larger teams needing scale, admin control, and future API readiness.',
      stats: {
        companies: 'Unlimited',
        emails: 'Unlimited',
        rfps: 'Unlimited',
        seats: '10+',
      },
      features: [
        { label: 'Everything in Growth', included: true },
        { label: 'Advanced admin controls', included: true },
        { label: 'Priority support', included: true },
        { label: 'API-ready foundation', included: true },
        { label: 'Custom usage limits', included: true },
        { label: '10+ team seats', included: true },
      ],
    },
  ];
}

export default function BillingNew() {
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
      // Fallback to auth metadata if subscription row is not available yet
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
    (user as any).user_metadata?.subscription_status;

  const isActive = subscriptionStatus === 'active';

  const stripeCustomerId =
    subscription?.stripe_customer_id ||
    (user as any).stripe_customer_id ||
    (user as any).user_metadata?.stripe_customer_id;

  const companiesUsed =
    (user as any).monthly_companies_viewed ||
    (user as any).monthly_command_center_saves ||
    0;

  const emailsUsed = (user as any).monthly_emails_sent || 0;
  const rfpsUsed = (user as any).monthly_rfps_generated || 0;

  const companyLimit = currentPlan.limits.command_center_saves_per_month;
  const emailLimit = currentPlan.limits.pulse_runs_per_month;
  const rfpLimit: number | null = null;

  function usagePct(used: number, max: number | null) {
    if (max === null || max === 0) return 0;
    return Math.min(Math.round((used / max) * 100), 100);
  }

  function periodEnd() {
    if (!subscription?.current_period_end) return null;

    return new Date(subscription.current_period_end).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
            Account
          </span>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Billing & Plans</h1>
        </div>

        {checkoutSuccess && (
          <div className="flex items-start gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">You&apos;re all set!</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Your subscription is being activated. This may take a moment to reflect.
                {isActive ? ' Your plan is now active.' : ' Refreshing status…'}
              </p>
            </div>
          </div>
        )}

        {err && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{err}</p>
          </div>
        )}

        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{currentPlan.label} Plan</span>
                  {subscriptionStatus && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        isActive
                          ? 'bg-green-500/20 text-green-300 border-green-500/30'
                          : subscriptionStatus === 'past_due'
                          ? 'bg-red-500/20 text-red-300 border-red-500/30'
                          : 'bg-white/10 text-white/70 border-white/10'
                      }`}
                    >
                      {subscriptionStatus}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  {currentPlanCode === 'free_trial'
                    ? 'Free trial access'
                    : currentPlanCode === 'enterprise'
                    ? 'Custom pricing'
                    : `$${currentPlan.priceMonthly}/month`}
                  {periodEnd() ? ` · Renews ${periodEnd()}` : ''}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {stripeCustomerId && (
                <button
                  onClick={handlePortal}
                  disabled={isRedirecting}
                  className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {isRedirecting ? 'Opening…' : 'Manage in Stripe'}
                </button>
              )}

              {currentPlanCode === 'free_trial' && (
                <button
                  onClick={() => handleUpgrade('starter')}
                  disabled={!!upgradeLoading}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Upgrade Plan
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-6 border-t border-white/10 pt-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Building2 className="h-3 w-3" /> Command Center
                </span>
                <span className="text-xs font-medium text-white">
                  {companyLimit === null ? '∞' : `${companiesUsed} / ${companyLimit}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-400 transition-all"
                  style={{ width: `${usagePct(companiesUsed, companyLimit)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Mail className="h-3 w-3" /> Pulse / Outreach
                </span>
                <span className="text-xs font-medium text-white">
                  {emailLimit === null ? '∞' : `${emailsUsed} / ${emailLimit}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-400 transition-all"
                  style={{ width: `${usagePct(emailsUsed, emailLimit)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <FileText className="h-3 w-3" /> RFP / Quote
                </span>
                <span className="text-xs font-medium text-white">
                  {rfpLimit === null ? 'Unlimited' : `${rfpsUsed} / ${rfpLimit}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${usagePct(rfpsUsed, rfpLimit)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]">
          <div className="mb-6">
            <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
              Plans
            </span>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Choose your plan</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                    isCurrent
                      ? 'border-2 border-slate-900 shadow-lg'
                      : plan.highlight
                      ? 'border-slate-200 shadow-sm'
                      : 'border-slate-200'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute -top-px right-4 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-b-lg">
                      Current
                    </div>
                  )}

                  <div className="mb-4">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {plan.name}
                    </span>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                      <span className="text-sm text-slate-400">{plan.period}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">{plan.description}</p>
                  </div>

                  <div className="mb-4 space-y-1 text-xs text-slate-500">
                    <div>Command Center: {plan.stats.companies}</div>
                    <div>Outreach / Pulse: {plan.stats.emails}</div>
                    <div>RFP / Quotes: {plan.stats.rfps}</div>
                    <div>Seats: {plan.stats.seats}</div>
                  </div>

                  <ul className="flex-1 space-y-2 mb-5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        {f.included ? (
                          <svg
                            className="h-3.5 w-3.5 flex-shrink-0 text-green-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            className="h-3.5 w-3.5 flex-shrink-0 text-slate-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                        <span className={f.included ? 'text-slate-700' : 'text-slate-400'}>
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>

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
                    className={`w-full rounded-full py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isCurrent
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : isUpgrade
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {isLoadingThis ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Processing…
                      </span>
                    ) : isCurrent ? (
                      stripeCustomerId ? 'Manage Plan' : 'Current Plan'
                    ) : plan.code === 'enterprise' ? (
                      'Upgrade to Enterprise'
                    ) : isUpgrade ? (
                      `Upgrade to ${plan.name}`
                    ) : (
                      'Downgrade'
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            Need enterprise pricing?{' '}
            <a href="mailto:support@logisticintel.com" className="text-slate-700 underline">
              Contact sales
            </a>
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Payment
                </span>
                <h3 className="mt-2 text-base font-semibold text-slate-900">Payment Method</h3>
              </div>
              {stripeCustomerId && (
                <button
                  onClick={handlePortal}
                  disabled={isRedirecting}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Update
                </button>
              )}
            </div>

            {stripeCustomerId ? (
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex h-9 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900">
                  <CreditCard className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">Payment method on file</p>
                  <p className="text-xs text-slate-500">Manage details in Stripe portal</p>
                </div>
                <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-0.5 rounded-full">
                  Active
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                <CreditCard className="h-5 w-5 text-slate-300" />
                No payment method on file. Upgrade a plan to add one.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                  History
                </span>
                <h3 className="mt-2 text-base font-semibold text-slate-900">Billing History</h3>
              </div>
              {stripeCustomerId && (
                <button
                  onClick={handlePortal}
                  disabled={isRedirecting}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open Stripe Portal
                </button>
              )}
            </div>

            {stripeCustomerId ? (
              <p className="text-sm text-slate-500">
                Full invoice history and downloadable PDFs are available in your{' '}
                <button onClick={handlePortal} className="text-slate-900 underline hover:no-underline">
                  Stripe billing portal
                </button>
                .
              </p>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <TrendingUp className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">No billing history yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
