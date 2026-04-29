import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { createStripeCheckout, createStripePortalSession } from '@/api/functions';
import { supabase } from '@/lib/supabase';
import { getSavedCompanies } from '@/lib/api';
import { getLitCampaigns } from '@/lib/litCampaigns';
import {
  getPlanConfig,
  getTotalPrice,
  normalizeSeatCount,
  validateSeatCount,
  type BillingInterval,
  type PlanCode,
} from '@/lib/planLimits';
import { useEntitlements } from '@/lib/usage';
import {
  CheckCircle2,
  Zap,
  Building2,
  Search,
  Bookmark,
  Mail,
  CreditCard,
  ExternalLink,
  AlertCircle,
  TrendingUp,
  Users,
  Shield,
  Crown,
  BarChart3,
  ChevronDown,
  Sparkles,
  Layers3,
  Rocket,
  ArrowUpRight,
} from 'lucide-react';

function normalizePlanCode(plan?: string | null): PlanCode {
  const p = (plan || 'free_trial').toLowerCase();

  if (p === 'free' || p === 'free_trial') return 'free_trial';
  if (p === 'starter') return 'starter';
  if (p === 'growth' || p === 'growth_plus') return 'growth';
  if (p.startsWith('enterprise')) return 'enterprise';

  return 'free_trial';
}

function formatCurrency(value: number | null) {
  if (value === null) return 'Custom';
  return `$${value.toLocaleString()}`;
}

function usagePct(used: number, max: number | null) {
  if (max === null || max === 0) return 0;
  return Math.min(Math.round((used / max) * 100), 100);
}

type MetricCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  current: number;
  max: number | null;
  accentClass: string;
  upgradeHref?: string;
};

function MetricCard({
  icon: Icon,
  label,
  current,
  max,
  accentClass,
  upgradeHref = '/app/billing',
}: MetricCardProps) {
  const pct = usagePct(current, max);
  // Three states: ok (under limit), at-limit (used >= limit), over-limit
  // (used > limit; only happens for users created before enforcement
  // was wired). Both >= states show the same Upgrade CTA but the over-
  // limit path uses red and an explicit "Over limit" label.
  const reached = max !== null && max >= 0 && current >= max;
  const over = max !== null && current > max;

  const barClass = over
    ? 'bg-red-500'
    : reached
    ? 'bg-amber-500'
    : accentClass;
  const countClass = over
    ? 'text-red-700'
    : reached
    ? 'text-amber-700'
    : 'text-slate-900';
  const ringClass = over
    ? 'border-red-200 bg-red-50/40'
    : reached
    ? 'border-amber-200 bg-amber-50/40'
    : 'border-slate-200 bg-white/90';

  return (
    <div
      className={`group rounded-2xl border ${ringClass} p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentClass} text-white shadow-sm transition-transform duration-200 group-hover:scale-105`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-medium text-slate-700">{label}</span>
        </div>

        <span className={`text-xs font-semibold ${countClass}`}>
          {max === null ? 'Unlimited' : `${current} / ${max}`}
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barClass} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {(reached || over) && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span className={over ? 'font-semibold text-red-700' : 'font-semibold text-amber-700'}>
            {over ? 'Over limit' : 'Limit reached'}
          </span>
          <a
            href={upgradeHref}
            className="rounded-lg bg-slate-900 px-2.5 py-1 font-semibold text-white transition hover:bg-slate-800"
          >
            Upgrade
          </a>
        </div>
      )}
    </div>
  );
}

type PlanCardDef = {
  code: PlanCode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  seatsLabel: string;
  featureBullets: string[];
  accentBorder: string;
  accentIcon: string;
};

function getPlanCards(): PlanCardDef[] {
  return [
    {
      code: 'free_trial',
      icon: Sparkles,
      title: 'Free Trial',
      description: 'Explore the product and validate fit before committing.',
      seatsLabel: '1 seat',
      featureBullets: [
        '10 company discoveries',
        '10 saved accounts',
        'Dashboard + Search access',
        'No Pulse or Campaign Builder',
      ],
      accentBorder: 'hover:border-violet-300',
      accentIcon: 'bg-violet-500',
    },
    {
      code: 'starter',
      icon: Layers3,
      title: 'Starter',
      description: 'Core intelligence and CRM workflows for solo operators.',
      seatsLabel: '1 seat',
      featureBullets: [
        '250 company discoveries',
        '250 saved accounts',
        'Company Intelligence pages',
        'No Pulse or Campaign Builder',
      ],
      accentBorder: 'hover:border-blue-300',
      accentIcon: 'bg-blue-500',
    },
    {
      code: 'growth',
      icon: Rocket,
      title: 'Growth',
      description: 'Multi-user prospecting, campaigns, and outreach at scale.',
      seatsLabel: '3 to 7 seats',
      featureBullets: [
        '2,000 shared discoveries',
        '500 saved accounts',
        'Pulse + Campaign Builder',
        '100 enrichment credits',
      ],
      accentBorder: 'hover:border-emerald-300',
      accentIcon: 'bg-emerald-500',
    },
    {
      code: 'enterprise',
      icon: Crown,
      title: 'Enterprise',
      description: 'Admin controls, scale, and commercial flexibility for larger teams.',
      seatsLabel: '6+ seats',
      featureBullets: [
        'Everything in Growth',
        'Custom usage limits',
        'Priority support',
        'Contact sales only',
      ],
      accentBorder: 'hover:border-amber-300',
      accentIcon: 'bg-amber-500',
    },
  ];
}

function getPlanNarrative(planCode: PlanCode) {
  if (planCode === 'free_trial') {
    return {
      headline: 'You’re testing the platform with limited access',
      body:
        'You can search companies, save a small number of accounts, and get a feel for the product. This tier is designed to validate fit quickly without opening up the full workflow.',
      upsell:
        'Upgrade to Starter when you’re ready for real prospecting volume and deeper company intelligence.',
    };
  }

  if (planCode === 'starter') {
    return {
      headline: 'You have core access for solo prospecting',
      body:
        'Starter is built for individual operators who need company discovery, account saving, and company intelligence pages without team-level automation.',
      upsell:
        'Move to Growth to unlock Pulse, Campaign Builder, team collaboration, and shared outbound workflows.',
    };
  }

  if (planCode === 'growth') {
    return {
      headline: 'You’re on the active team growth plan',
      body:
        'Growth gives your team shared discovery capacity, saved account workflows, Pulse access, and campaign execution. This is the tier where pipeline generation starts compounding across users.',
      upsell:
        'If you need more seats, custom usage controls, or deeper admin oversight, Enterprise is the next move.',
    };
  }

  return {
    headline: 'You’re positioned for scaled deployment',
    body:
      'Enterprise is for teams that need broader rollout, stronger governance, and custom commercial flexibility across billing, seats, and usage policies.',
    upsell:
      'Work with sales to expand capacity, tailor limits, and structure the right deployment model for your organization.',
  };
}

export default function Billing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subscription, setSubscription] = useState<any>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [selectedSeats, setSelectedSeats] = useState<number>(3);

  // Phase F — real usage counters, scoped to the current billing month.
  // Only three meters are rendered (Searches Used / Saved Companies /
  // Active Campaigns) because these are the only counters we have real
  // writers for today. Pulse runs and enrichment credits are intentionally
  // removed until their writers exist.
  const [realSearches, setRealSearches] = useState<number>(0);
  const [realSaves, setRealSaves] = useState<number>(0);
  const [realActiveCampaigns, setRealActiveCampaigns] = useState<number>(0);

  const checkoutSuccess = searchParams.get('checkout') === 'success';
  const planCards = useMemo(() => getPlanCards(), []);

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

  // Phase F — load the three real usage counters (Searches Used / Saved
  // Companies / Active Campaigns). Each promise is independent and any
  // failure only clears its own counter to 0; the rest still populate.
  // Silent-fail on every branch — never blocks the Billing page render.
  async function loadRealUsageCounters() {
    if (!user?.id) return;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Searches this month — same query the Dashboard uses in Phase C.
    supabase
      .from('lit_activity_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', (user as any).id)
      .eq('event_type', 'search')
      .gte('created_at', monthStart)
      .then(
        (res: any) => {
          if (!res?.error && typeof res?.count === 'number') {
            setRealSearches(res.count);
          }
        },
        () => {
          /* silent */
        },
      );

    // Saved companies — all-time count via getSavedCompanies (no monthly
    // scoping; plan limits are "in Command Center right now", not "this
    // month"). Mirrors the Dashboard aggregate.
    getSavedCompanies()
      .then((resp: any) => {
        const rows = Array.isArray(resp?.rows) ? resp.rows : Array.isArray(resp) ? resp : [];
        setRealSaves(rows.length || 0);
      })
      .catch(() => {
        /* silent */
      });

    // Active campaigns — filter by status. Mirrors Dashboard filter.
    getLitCampaigns()
      .then((resp: any) => {
        const rows = Array.isArray(resp?.rows) ? resp.rows : Array.isArray(resp) ? resp : [];
        const active = rows.filter(
          (c: any) => c?.status === 'active' || c?.status === 'live',
        ).length;
        setRealActiveCampaigns(active);
      })
      .catch(() => {
        /* silent */
      });
  }

  useEffect(() => {
    const rawPlan =
      subscription?.plan_code ||
      (user as any)?.plan ||
      (user as any)?.user_metadata?.plan ||
      'free_trial';

    const planCode = normalizePlanCode(rawPlan);

    const seatCount =
      subscription?.seats ||
      (user as any)?.seat_count ||
      (user as any)?.team_seat_count ||
      undefined;

    setSelectedSeats(normalizeSeatCount(planCode, seatCount));
  }, [subscription, user]);

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

  async function handleCheckout(planCode: PlanCode) {
    if (planCode === 'enterprise') {
      window.location.href =
        'mailto:support@logisticintel.com?subject=Enterprise Inquiry';
      return;
    }

    if (planCode === 'free_trial') return;

    const seats = planCode === 'starter' ? 1 : selectedSeats;
    const validation = validateSeatCount(planCode, seats);

    if (!validation.valid) {
      setErr(validation.message || 'Invalid seat selection.');
      return;
    }

    setErr('');
    setActionLoading(planCode);

    try {
      const result: any = await createStripeCheckout({
        plan_code: planCode,
        interval: billingInterval === 'yearly' ? 'year' : 'month',
        seats,
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

  const stripeCustomerId =
    subscription?.stripe_customer_id ||
    (user as any).stripe_customer_id ||
    (user as any).user_metadata?.stripe_customer_id;

  // Phase G — read real entitlements from get-entitlements (single source
  // of truth). Falls back to the legacy lit_activity_events / saved-rows
  // counts so the page never shows nothing while the snapshot loads.
  const { entitlements } = useEntitlements();
  const searchesUsed = entitlements?.used?.company_search ?? realSearches;
  const savesUsed = entitlements?.used?.saved_company ?? realSaves;
  const activeCampaignsUsed = realActiveCampaigns;
  // Real plan limits from DB (NULL == unlimited). Falls back to the
  // hardcoded planLimits.ts values until entitlements load.
  const limitSearches =
    entitlements?.limits?.company_search ?? currentPlan.limits.searches_per_month;
  const limitSaves =
    entitlements?.limits?.saved_company ?? currentPlan.limits.command_center_saves_per_month;

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const assignedSeats =
    subscription?.seats ||
    (user as any).seat_count ||
    (user as any).team_seat_count ||
    currentPlan.seatRules.default;

  const narrative = getPlanNarrative(currentPlanCode);

  const selectedGrowthTotal = getTotalPrice('growth', billingInterval, selectedSeats);
  const starterTotal = getTotalPrice('starter', billingInterval, 1);

  const intervalLabel = billingInterval === 'monthly' ? '/mo' : '/yr';

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(circle at 0% 0%, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0) 28%), radial-gradient(circle at 100% 10%, rgba(6,182,212,0.08) 0%, rgba(6,182,212,0) 32%), linear-gradient(180deg, #F8FAFC 0%, #F8FAFC 60%, #FFFFFF 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
        <div className="mb-5 md:mb-7">
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-500">
            Account · Billing
          </span>

          <div className="mt-1.5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1
                className="text-xl font-bold tracking-tight text-slate-950 md:text-[26px]"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Billing &amp; Plans
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage seats, billing, usage, and plan access across your workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setBillingInterval('monthly')}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    billingInterval === 'monthly'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval('yearly')}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    billingInterval === 'yearly'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Yearly
                </button>
              </div>

              {stripeCustomerId && (
                <button
                  onClick={handlePortal}
                  disabled={isRedirecting}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-md disabled:opacity-50"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {isRedirecting ? 'Opening…' : 'Manage in Stripe'}
                </button>
              )}
            </div>
          </div>
        </div>

        {checkoutSuccess && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-900">Billing update received</p>
              <p className="mt-0.5 text-sm text-emerald-700">
                Your subscription status is refreshing now.
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
          <div className="xl:col-span-2 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-sm md:p-7">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 shadow-inner">
                    {currentPlanCode === 'enterprise' ? (
                      <Crown className="h-6 w-6 text-amber-300" />
                    ) : currentPlanCode === 'growth' ? (
                      <Rocket className="h-6 w-6 text-emerald-300" />
                    ) : currentPlanCode === 'starter' ? (
                      <Layers3 className="h-6 w-6 text-blue-300" />
                    ) : (
                      <Sparkles className="h-6 w-6 text-violet-300" />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{currentPlan.title || currentPlan.label} {currentPlan.label === currentPlan.title ? '' : ''}</h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          subscriptionStatus === 'active'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white/10 text-white/70'
                        }`}
                      >
                        {subscriptionStatus}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-300">
                      {currentPlanCode === 'free_trial'
                        ? 'Free access'
                        : currentPlanCode === 'enterprise'
                        ? 'Custom commercial terms'
                        : `${formatCurrency(
                            getTotalPrice(
                              currentPlanCode,
                              billingInterval,
                              currentPlanCode === 'growth' ? assignedSeats : 1
                            )
                          )}${intervalLabel}`}
                      {renewalDate ? ` · Renews ${renewalDate}` : ''}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-lg font-semibold text-white">{narrative.headline}</p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                    {narrative.body}
                  </p>
                  <div className="mt-4 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <ArrowUpRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-300" />
                    <p className="text-sm leading-6 text-indigo-100">{narrative.upsell}</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Seat Policy
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {currentPlanCode === 'growth'
                        ? '3 to 7 seats'
                        : currentPlanCode === 'enterprise'
                        ? '6+ seats'
                        : '1 seat'}
                    </div>
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
                        ? 'Team collaboration'
                        : 'Individual'}
                    </div>
                  </div>
                </div>
              </div>

              {!stripeCustomerId && currentPlanCode !== 'enterprise' && (
                <button
                  onClick={() =>
                    handleCheckout(currentPlanCode === 'free_trial' ? 'starter' : 'growth')
                  }
                  disabled={!!actionLoading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-md disabled:opacity-50 lg:w-auto"
                >
                  {actionLoading ? 'Processing…' : 'Upgrade Plan'}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                <BarChart3 className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Usage Snapshot</div>
                <div className="text-sm text-slate-500">Current billing period usage</div>
              </div>
            </div>

            {/* Phase F — three real meters only. Pulse Runs + Enrichment
                Credits tiles removed until real writers exist. Active
                Campaigns has no plan cap today (passed max={null}), so it
                renders as "N · Unlimited" with no misleading progress bar. */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricCard
                icon={Search}
                label="Searches Used"
                current={searchesUsed}
                max={limitSearches}
                accentClass="bg-blue-500"
              />
              <MetricCard
                icon={Bookmark}
                label="Saved Companies"
                current={savesUsed}
                max={limitSaves}
                accentClass="bg-violet-500"
              />
              <MetricCard
                icon={Mail}
                label="Active Campaigns"
                current={activeCampaignsUsed}
                max={null}
                accentClass="bg-emerald-500"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Plans
              </span>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">Compare plans</h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose the right access level for your current team stage.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="font-medium text-slate-900">
                {billingInterval === 'monthly' ? 'Monthly billing' : 'Yearly billing'}
              </span>
              {billingInterval === 'yearly' && (
                <span className="ml-2 text-emerald-600">best value</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {planCards.map((plan) => {
              const isCurrent = plan.code === currentPlanCode;
              const currentIndex = planCards.findIndex((p) => p.code === currentPlanCode);
              const targetIndex = planCards.findIndex((p) => p.code === plan.code);
              const isUpgrade = targetIndex > currentIndex;
              const isDowngrade = targetIndex < currentIndex;
              const isLoadingThis = actionLoading === plan.code;

              const cardPrice =
                plan.code === 'enterprise'
                  ? null
                  : plan.code === 'growth'
                  ? getTotalPrice(plan.code, billingInterval, selectedSeats)
                  : getTotalPrice(plan.code, billingInterval, 1);

              return (
                <div
                  key={plan.code}
                  className={`group relative flex h-full flex-col rounded-3xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${plan.accentBorder} ${
                    isCurrent ? 'border-slate-900 ring-1 ring-slate-900/10' : 'border-slate-200'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute right-4 top-0 -translate-y-1/2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                      Current
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl ${plan.accentIcon} text-white shadow-sm transition-transform duration-200 group-hover:scale-105`}
                      >
                        <plan.icon className="h-5 w-5" />
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {plan.title}
                      </div>
                    </div>

                    <div className="mt-4 flex items-end gap-1">
                      <span className="text-4xl font-bold tracking-tight text-slate-950">
                        {plan.code === 'enterprise' ? 'Custom' : formatCurrency(cardPrice)}
                      </span>
                      <span className="mb-1 text-sm text-slate-500">
                        {plan.code === 'enterprise' ? '' : intervalLabel}
                      </span>
                    </div>

                    {plan.code === 'growth' && (
                      <p className="mt-2 text-xs font-medium text-slate-500">
                        From {formatCurrency(getTotalPrice('growth', billingInterval, 3))}
                        {billingInterval === 'monthly' ? ' monthly' : ' yearly'} for 3 seats
                      </p>
                    )}

                    <p className="mt-3 min-h-[52px] text-sm leading-6 text-slate-600">
                      {plan.description}
                    </p>

                    <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                      <div className="text-sm font-medium text-slate-900">{plan.seatsLabel}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {plan.code === 'starter'
                          ? '250 discoveries • 250 saved accounts'
                          : plan.code === 'growth'
                          ? '2,000 shared discoveries • 500 saved accounts'
                          : plan.code === 'free_trial'
                          ? '10 discoveries • 10 saved accounts'
                          : 'Custom usage limits'}
                      </div>
                    </div>

                    {plan.code === 'growth' && (
                      <div className="mt-4">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Seats
                        </label>
                        <div className="relative">
                          <select
                            value={selectedSeats}
                            onChange={(e) => setSelectedSeats(Number(e.target.value))}
                            className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                          >
                            {[3, 4, 5].map((seat) => (
                              <option key={seat} value={seat}>
                                {seat} seats
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Need more than 5 seats? Move to Enterprise.
                        </p>
                      </div>
                    )}
                  </div>

                  <ul className="mt-5 flex-1 space-y-3">
                    {plan.featureBullets.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <button
                      onClick={() => {
                        if (isCurrent) {
                          if (stripeCustomerId) {
                            handlePortal();
                          }
                          return;
                        }

                        if (plan.code === 'enterprise') {
                          handleCheckout('enterprise');
                          return;
                        }

                        if (isDowngrade) {
                          handlePortal();
                          return;
                        }

                        handleCheckout(plan.code);
                      }}
                      disabled={isLoadingThis || isRedirecting}
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
                        ? 'Contact Sales'
                        : isDowngrade
                        ? 'Manage Downgrade'
                        : `Upgrade to ${plan.title}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
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
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
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
                  className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
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
                  <p className="mt-1 text-sm text-slate-600">
                    {currentPlanCode === 'growth'
                      ? '3 to 7 seats'
                      : currentPlanCode === 'enterprise'
                      ? '6+ seats'
                      : '1 seat'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Included</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    {currentPlanCode === 'growth'
                      ? '3–7'
                      : currentPlanCode === 'enterprise'
                      ? '6+'
                      : '1'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Assigned</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{assignedSeats}</div>
                </div>
              </div>

              <p className="text-sm leading-6 text-slate-600">
                Growth supports self-serve seats up to 7. Enterprise begins at 6 seats and is
                handled through sales for commercial control.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
