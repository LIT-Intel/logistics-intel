import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { createStripeCheckout, createStripePortalSession } from '@/api/functions';
import { supabase } from '@/lib/supabase';
import {
  CheckCircle2, Zap, Building2, Mail, FileText, ExternalLink,
  AlertCircle, CreditCard, TrendingUp, ChevronRight
} from 'lucide-react';

// ─── Plan definitions ────────────────────────────────────────────────────────

function getCanonicalPlan(plan = 'free'): string {
  const p = (plan || 'free').toLowerCase();
  if (p === 'free' || p === 'free_trial') return 'free_trial';
  if (p === 'pro' || p === 'standard' || p === 'starter') return 'standard';
  if (p === 'growth' || p === 'growth_plus') return 'growth';
  if (p.startsWith('enterprise')) return 'enterprise';
  return p;
}

const PLAN_DEFS = [
  {
    code: 'free_trial',
    name: 'Free Trial',
    price: '$0',
    period: '/mo',
    description: 'Get started, no credit card required',
    max_companies: 10,
    max_emails: 50,
    max_rfps: 5,
    features: [
      { label: '10 saved companies', included: true },
      { label: '50 email credits', included: true },
      { label: '5 RFP drafts', included: true },
      { label: 'Enrichment', included: false },
      { label: 'Campaigns', included: false },
    ],
    cta: 'Current Plan',
  },
  {
    code: 'standard',
    name: 'Standard',
    price: '$49',
    period: '/mo',
    description: 'For individual freight professionals',
    max_companies: 100,
    max_emails: 500,
    max_rfps: 50,
    features: [
      { label: '100 saved companies', included: true },
      { label: '500 email credits', included: true },
      { label: '50 RFP drafts', included: true },
      { label: 'Enrichment enabled', included: true },
      { label: 'Campaigns', included: false },
    ],
    cta: 'Upgrade',
  },
  {
    code: 'growth',
    name: 'Growth',
    price: '$299',
    period: '/mo',
    description: 'For teams managing carrier networks',
    max_companies: 500,
    max_emails: 2500,
    max_rfps: 200,
    features: [
      { label: '500 saved companies', included: true },
      { label: '2,500 email credits', included: true },
      { label: '200 RFP drafts', included: true },
      { label: 'Enrichment + Campaigns', included: true },
      { label: '5 team seats', included: true },
    ],
    cta: 'Upgrade',
    highlight: true,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Unlimited scale, SSO, custom data regions',
    max_companies: Infinity,
    max_emails: Infinity,
    max_rfps: Infinity,
    features: [
      { label: 'Unlimited companies', included: true },
      { label: 'Unlimited credits', included: true },
      { label: 'Unlimited RFPs', included: true },
      { label: 'SSO / SAML', included: true },
      { label: 'Dedicated support', included: true },
    ],
    cta: 'Contact Sales',
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Billing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subscription, setSubscription] = useState<any>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);
  const [err, setErr] = useState('');

  // Read checkout=success from URL after Stripe redirect
  const checkoutSuccess = searchParams.get('checkout') === 'success';

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  // Load subscription row from DB
  useEffect(() => {
    if (!user) return;
    loadSubscription();
    // If returning from successful checkout, poll once after 4s to pick up webhook update
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
    } catch (_) {
      // fallback to auth metadata
    }
  }

  async function handleUpgrade(planCode: string) {
    if (planCode === 'enterprise') {
      window.location.href = 'mailto:support@logisticintel.com?subject=Enterprise Inquiry';
      return;
    }
    setErr('');
    setUpgradeLoading(planCode);
    try {
      const result: any = await createStripeCheckout({ plan_code: planCode, interval: 'month' });
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

  const rawPlan = (subscription?.plan_code) || (user as any).plan || (user as any).user_metadata?.plan || 'free_trial';
  const canonicalPlan = getCanonicalPlan(rawPlan);
  const subscriptionStatus = subscription?.status || (user as any).subscription_status || (user as any).user_metadata?.subscription_status;
  const isActive = subscriptionStatus === 'active';
  const stripeCustomerId = subscription?.stripe_customer_id || (user as any).stripe_customer_id || (user as any).user_metadata?.stripe_customer_id;

  const currentPlanDef = PLAN_DEFS.find(p => p.code === canonicalPlan) || PLAN_DEFS[0];

  // Usage from user object
  const companiesUsed = (user as any).monthly_companies_viewed || 0;
  const emailsUsed = (user as any).monthly_emails_sent || 0;
  const rfpsUsed = (user as any).monthly_rfps_generated || 0;

  function usagePct(used: number, max: number) {
    if (max === Infinity || max === 0) return 0;
    return Math.min(Math.round((used / max) * 100), 100);
  }

  function periodEnd() {
    if (!subscription?.current_period_end) return null;
    return new Date(subscription.current_period_end).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Page header ── */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">Account</span>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Billing & Plans</h1>
        </div>

        {/* ── Post-checkout success banner ── */}
        {checkoutSuccess && (
          <div className="flex items-start gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">You're all set!</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Your subscription is being activated. This may take a moment to reflect.
                {isActive ? ' Your plan is now active.' : ' Refreshing status…'}
              </p>
            </div>
          </div>
        )}

        {/* ── Error banner ── */}
        {err && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{err}</p>
          </div>
        )}

        {/* ── Current subscription banner ── */}
        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{currentPlanDef.name} Plan</span>
                  {subscriptionStatus && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                      isActive
                        ? 'bg-green-500/20 text-green-300 border-green-500/30'
                        : subscriptionStatus === 'past_due'
                        ? 'bg-red-500/20 text-red-300 border-red-500/30'
                        : 'bg-white/10 text-white/70 border-white/10'
                    }`}>
                      {subscriptionStatus}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  {canonicalPlan !== 'free_trial' && currentPlanDef.price !== 'Custom'
                    ? `${currentPlanDef.price}/month`
                    : canonicalPlan === 'free_trial'
                    ? 'Free forever'
                    : 'Custom pricing'}
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
              {canonicalPlan === 'free_trial' && (
                <button
                  onClick={() => handleUpgrade('growth')}
                  disabled={!!upgradeLoading}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Upgrade Plan
                </button>
              )}
            </div>
          </div>

          {/* Usage bars */}
          <div className="mt-6 grid grid-cols-3 gap-6 border-t border-white/10 pt-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400"><Building2 className="h-3 w-3" /> Companies</span>
                <span className="text-xs font-medium text-white">
                  {currentPlanDef.max_companies === Infinity ? '∞' : `${companiesUsed} / ${currentPlanDef.max_companies}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${usagePct(companiesUsed, currentPlanDef.max_companies)}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400"><Mail className="h-3 w-3" /> Email Credits</span>
                <span className="text-xs font-medium text-white">
                  {currentPlanDef.max_emails === Infinity ? '∞' : `${emailsUsed} / ${currentPlanDef.max_emails}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${usagePct(emailsUsed, currentPlanDef.max_emails)}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400"><FileText className="h-3 w-3" /> RFP Drafts</span>
                <span className="text-xs font-medium text-white">
                  {currentPlanDef.max_rfps === Infinity ? '∞' : `${rfpsUsed} / ${currentPlanDef.max_rfps}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${usagePct(rfpsUsed, currentPlanDef.max_rfps)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Plan comparison cards ── */}
        <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]">
          <div className="mb-6">
            <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">Plans</span>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Choose your plan</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_DEFS.map((plan) => {
              const isCurrent = plan.code === canonicalPlan;
              const isUpgrade = PLAN_DEFS.findIndex(p => p.code === canonicalPlan) < PLAN_DEFS.findIndex(p => p.code === plan.code);
              const isDowngrade = PLAN_DEFS.findIndex(p => p.code === canonicalPlan) > PLAN_DEFS.findIndex(p => p.code === plan.code);
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
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plan.name}</span>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                      <span className="text-sm text-slate-400">{plan.period}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">{plan.description}</p>
                  </div>

                  <ul className="flex-1 space-y-2 mb-5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        {f.included ? (
                          <svg className="h-3.5 w-3.5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        )}
                        <span className={f.included ? 'text-slate-700' : 'text-slate-400'}>{f.label}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => {
                      if (isCurrent && stripeCustomerId) { handlePortal(); return; }
                      if (isCurrent) return;
                      if (isDowngrade) { handlePortal(); return; }
                      handleUpgrade(plan.code);
                    }}
                    disabled={isLoadingThis || isRedirecting || (isCurrent && !stripeCustomerId)}
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
                    ) : isUpgrade ? (
                      `Upgrade to ${plan.name}`
                    ) : plan.code === 'enterprise' ? (
                      'Contact Sales'
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
            <a href="mailto:support@logisticintel.com" className="text-slate-700 underline">Contact sales</a>
          </p>
        </div>

        {/* ── Payment method + Invoice history ── */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Payment method */}
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">Payment</span>
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
                <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-0.5 rounded-full">Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                <CreditCard className="h-5 w-5 text-slate-300" />
                No payment method on file. Upgrade a plan to add one.
              </div>
            )}
          </div>

          {/* Billing history */}
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">History</span>
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
