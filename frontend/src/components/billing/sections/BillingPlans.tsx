// Plans grid. Real prices from PLAN_LIMITS (single source of truth in the
// app, aligned with the Supabase `plans` table). Visual styling follows
// the LIT billing design package: 16px radius cards, gradient "Most
// popular" ribbon, dark "Current plan" ribbon, lift on hover, and a
// trailing 17%-off chip on annual paid plans.
//
// 2026-04-29 billing-truth rewrite:
//   - Five tiles: Free Trial, Starter, Growth, Scale, Enterprise.
//   - Every paid plan is a flat package price — no per-seat math here.
//   - The Growth/Scale seat counts are display-only ("includes 3 seats" /
//     "includes 5 seats"); there is no seat selector that can change the
//     displayed price of any other plan card.
//   - Demo, regular, and admin users all see the same card prices because
//     no input to this grid varies by role.

import {
  Check,
  Minus,
  Crown,
  Layers3,
  Rocket,
  Sparkles,
  Building2,
  Tag,
  CheckCircle2,
  ArrowUpCircle,
  Calendar,
} from 'lucide-react';
import {
  PLAN_LIMITS,
  getTotalPrice,
  type BillingInterval,
  type PlanCode,
} from '@/lib/planLimits';

interface Props {
  currentPlanCode: PlanCode;
  cycle: BillingInterval;
  onSelectPlan: (planCode: PlanCode) => void;
  onContactSales: () => void;
  onManageCurrent: () => void;
  actionLoading: string | null;
  canManage: boolean;
  hasStripeCustomer: boolean;
}

const META: Record<
  PlanCode,
  {
    icon: React.ComponentType<{ className?: string }>;
    accent: string; // dot/check color
    tag: string;
    bullets: string[];
    featured: boolean;
  }
> = {
  free_trial: {
    icon: Sparkles,
    accent: '#94a3b8',
    tag: 'Explore the product before committing.',
    bullets: [
      '10 company discoveries',
      '10 saved accounts',
      'Dashboard + Search access',
      'Trial expires when usage is exhausted',
    ],
    featured: false,
  },
  starter: {
    icon: Layers3,
    accent: '#3b82f6',
    tag: 'For solo operators running freight outbound.',
    bullets: [
      '1 seat included',
      '100 company discoveries / month',
      '50 saved companies',
      'Company Intelligence pages',
    ],
    featured: false,
  },
  growth: {
    icon: Rocket,
    accent: '#10b981',
    tag: 'Multi-user prospecting + campaigns.',
    bullets: [
      '3 seats included',
      '750 company discoveries / month',
      '250 saved companies',
      '35 Pulse briefs / month',
      '1,000 campaign emails / month',
      '75 enrichment credits / month',
    ],
    featured: true,
  },
  scale: {
    icon: Building2,
    accent: '#6366f1',
    tag: 'Larger teams, bigger discovery, deeper outreach.',
    bullets: [
      '5 seats included',
      '2,000 company discoveries / month',
      '1,500 saved companies',
      '80 Pulse briefs / month',
      '2,500 campaign emails / month',
      '200 enrichment credits / month',
    ],
    featured: false,
  },
  enterprise: {
    icon: Crown,
    accent: '#8b5cf6',
    tag: 'Custom seats, limits, onboarding, and terms.',
    bullets: [
      '10+ seats',
      'Custom search & save limits',
      'Custom enrichment & campaign limits',
      'Dedicated onboarding & support',
    ],
    featured: false,
  },
};

const ORDER: PlanCode[] = ['free_trial', 'starter', 'growth', 'scale', 'enterprise'];

export function BillingPlans({
  currentPlanCode,
  cycle,
  onSelectPlan,
  onContactSales,
  onManageCurrent,
  actionLoading,
  canManage,
  hasStripeCustomer,
}: Props) {
  const intervalLabel = cycle === 'monthly' ? '/mo' : '/yr';
  const currentIdx = ORDER.indexOf(currentPlanCode);

  return (
    <section
      id="lit-billing-plans"
      className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_14px_rgba(15,23,42,0.03)] md:p-6"
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-blue-600">
            Plans
          </span>
          <h2 className="mt-1.5 text-[20px] font-bold tracking-[-0.02em] text-slate-950">
            Compare plans
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-[1.5] text-slate-500">
            Pricing syncs from Stripe. Plan changes prorate against the current period and take
            effect immediately.
          </p>
        </div>
        <div className="inline-flex items-center gap-2">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[12px] text-slate-500">
            <span className="font-semibold text-slate-900">
              {cycle === 'monthly' ? 'Monthly billing' : 'Annual billing'}
            </span>
          </div>
          {cycle === 'yearly' ? (
            <div
              className="font-display inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold text-white"
              style={{
                background: 'linear-gradient(135deg,#0F172A,#1E293B)',
                boxShadow: '0 2px 8px rgba(15,23,42,0.18)',
              }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#00F0FF' }} />
              You're saving 17% vs monthly
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                // surfaced as a hint; cycle toggle lives on the hero
                document.getElementById('lit-billing-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="font-display inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-700"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Save 17% with annual
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {ORDER.map((code) => {
          const m = META[code];
          const cfg = PLAN_LIMITS[code];
          const Icon = m.icon;
          const isCurrent = code === currentPlanCode;
          const targetIdx = ORDER.indexOf(code);
          const isUpgrade = targetIdx > currentIdx;
          const isFeatured = m.featured && !isCurrent;

          // Flat package price — no seat math, no role math, no per-tile
          // input that can drift. `getTotalPrice` ignores the seats arg.
          const price = code === 'enterprise' ? null : getTotalPrice(code, cycle);
          const priceLabel =
            code === 'enterprise' ? 'Custom' : price === null ? 'Custom' : `$${price.toLocaleString()}`;
          const monthlyPrice = code === 'enterprise' ? null : getTotalPrice(code, 'monthly');

          // CTA logic per design + existing flow.
          let ctaLabel: string;
          let ctaIcon: React.ComponentType<{ className?: string }> = ArrowUpCircle;
          let ctaHandler: () => void;
          let ctaPrimary = false;
          let ctaDisabled = false;

          if (isCurrent) {
            ctaLabel = canManage
              ? hasStripeCustomer
                ? `You're on ${cfg.label}`
                : `Current plan`
              : `You're on ${cfg.label}`;
            ctaHandler = canManage && hasStripeCustomer ? onManageCurrent : () => {};
            ctaDisabled = !canManage || !hasStripeCustomer;
            ctaIcon = CheckCircle2;
          } else if (code === 'enterprise') {
            ctaLabel = 'Contact sales';
            ctaHandler = onContactSales;
            ctaIcon = Calendar;
          } else if (code === 'free_trial') {
            ctaLabel = 'Start free';
            ctaHandler = () => onSelectPlan(code);
            ctaDisabled = true; // free_trial is the default; nothing to checkout
            ctaIcon = Sparkles;
          } else {
            ctaLabel = isUpgrade ? `Upgrade to ${cfg.label}` : `Switch to ${cfg.label}`;
            ctaHandler = () => onSelectPlan(code);
            ctaPrimary = isUpgrade || isFeatured;
            ctaIcon = ArrowUpCircle;
          }

          if (!canManage && !isCurrent) {
            ctaDisabled = true;
          }

          const isLoadingThis = actionLoading === code;

          // Card chrome
          const borderClass = isCurrent
            ? 'border-2 border-blue-500'
            : isFeatured
            ? 'border border-blue-200'
            : 'border border-slate-200';
          const bgClass = isCurrent
            ? 'bg-gradient-to-b from-[#F5F9FF] to-white'
            : isFeatured
            ? 'bg-gradient-to-b from-white to-[#F8FAFF]'
            : 'bg-white';
          const shadowClass = isCurrent
            ? 'shadow-[0_8px_24px_rgba(59,130,246,0.12)]'
            : isFeatured
            ? 'shadow-[0_4px_16px_rgba(59,130,246,0.06)]'
            : 'shadow-[0_1px_3px_rgba(15,23,42,0.04)]';

          const CtaIcon = ctaIcon;

          return (
            <div
              key={code}
              className={`group relative flex h-full min-h-[480px] flex-col gap-4 rounded-[16px] p-5 transition-all duration-200 ${borderClass} ${bgClass} ${shadowClass} ${
                isCurrent ? '' : 'hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
              }`}
            >
              {/* Ribbons */}
              {isFeatured ? (
                <div className="absolute -top-2.5 left-5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-white shadow-[0_2px_8px_rgba(59,130,246,0.35)]">
                  Most popular
                </div>
              ) : null}
              {isCurrent ? (
                <div className="absolute -top-2.5 right-5 rounded-full bg-slate-900 px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                  Current plan
                </div>
              ) : null}

              {/* Heading */}
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: m.accent, boxShadow: `0 0 8px ${m.accent}66` }}
                  />
                  <Icon className="h-4 w-4 flex-shrink-0 text-slate-700" />
                  <div className="text-[15px] font-bold tracking-[-0.01em] text-slate-950">
                    {cfg.label}
                  </div>
                </div>
                <p className="text-[12.5px] leading-[1.45] text-slate-500">{m.tag}</p>
              </div>

              {/* Price */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[36px] font-bold leading-none tracking-[-0.03em] text-slate-950">
                    {priceLabel}
                  </span>
                  {code !== 'enterprise' && price != null && cycle === 'yearly' && monthlyPrice ? (
                    <span className="text-[14px] text-slate-400 line-through">
                      ${(monthlyPrice * 12).toLocaleString()}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {code === 'enterprise'
                    ? 'Annual contract'
                    : price === 0
                    ? 'forever'
                    : cycle === 'yearly'
                    ? 'per year · billed annually'
                    : intervalLabel}
                </div>
                {code !== 'enterprise' && cycle === 'yearly' && price && price > 0 ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-[1px] text-[10.5px] font-bold text-emerald-700">
                    <Tag className="h-2.5 w-2.5" />
                    17% off
                  </span>
                ) : null}
              </div>

              {/* Feature list */}
              <ul className="flex flex-1 flex-col gap-2">
                {m.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[12.5px] leading-[1.4] text-slate-700"
                  >
                    <Check
                      className="mt-[3px] h-3.5 w-3.5 flex-shrink-0"
                      style={{ color: m.accent }}
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div>
                <button
                  type="button"
                  onClick={ctaHandler}
                  disabled={ctaDisabled || isLoadingThis}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                    ctaPrimary
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_2px_6px_rgba(59,130,246,0.28),inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-blue-600 hover:to-blue-700'
                      : isCurrent
                      ? 'border border-slate-200 bg-white text-slate-700'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CtaIcon className="h-3.5 w-3.5" />
                  {isLoadingThis ? 'Processing…' : ctaLabel}
                </button>
                {!canManage && !isCurrent ? (
                  <div className="mt-2 text-center text-[11px] text-slate-400">
                    Contact your workspace admin
                  </div>
                ) : null}
              </div>

              {/* Disabled minus state for reference comparisons left intentionally
                  unused — features list uses real bullets only. */}
              <Minus className="hidden" />
            </div>
          );
        })}
      </div>
    </section>
  );
}