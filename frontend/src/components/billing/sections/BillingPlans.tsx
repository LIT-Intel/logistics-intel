// Plans grid. Real prices from PLAN_LIMITS (single source of truth in the
// app). Per-plan CTAs route to existing handlers — never fabricated.

import { CheckCircle2, Crown, Layers3, Rocket, Sparkles } from 'lucide-react';
import {
  PLAN_LIMITS,
  getTotalPrice,
  type BillingInterval,
  type PlanCode,
} from '@/lib/planLimits';

interface Props {
  currentPlanCode: PlanCode;
  cycle: BillingInterval;
  growthSeats: number;
  onSelectPlan: (planCode: PlanCode) => void;
  onContactSales: () => void;
  onManageCurrent: () => void;
  actionLoading: string | null;
  canManage: boolean;
  hasStripeCustomer: boolean;
}

const META: Record<PlanCode, {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  border: string;
  ribbon: string | null;
  description: string;
  bullets: string[];
}> = {
  free_trial: {
    icon: Sparkles,
    iconBg: 'bg-violet-500',
    border: 'hover:border-violet-300',
    ribbon: null,
    description: 'Explore the product and validate fit before committing.',
    bullets: ['10 company discoveries', '10 saved accounts', 'Dashboard + Search access'],
  },
  starter: {
    icon: Layers3,
    iconBg: 'bg-blue-500',
    border: 'hover:border-blue-300',
    ribbon: null,
    description: 'Core intelligence and CRM workflows for solo operators.',
    bullets: ['250 company discoveries', '100 saved accounts', 'Company Intelligence pages'],
  },
  growth: {
    icon: Rocket,
    iconBg: 'bg-emerald-500',
    border: 'hover:border-emerald-300',
    ribbon: 'Most popular',
    description: 'Multi-user prospecting, campaigns, and outreach at scale.',
    bullets: ['2,000 shared discoveries', '1,000 saved accounts', 'Pulse + Campaign Builder', '3–5 team seats'],
  },
  enterprise: {
    icon: Crown,
    iconBg: 'bg-amber-500',
    border: 'hover:border-amber-300',
    ribbon: null,
    description: 'Admin controls, scale, and commercial flexibility for larger teams.',
    bullets: ['Everything in Growth', 'Custom usage limits', 'Priority support', '6+ seats'],
  },
};

const ORDER: PlanCode[] = ['free_trial', 'starter', 'growth', 'enterprise'];

export function BillingPlans({
  currentPlanCode,
  cycle,
  growthSeats,
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
    <section id="lit-billing-plans" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Plans
          </span>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">Compare plans</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose the right access level for your current team stage.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">
            {cycle === 'monthly' ? 'Monthly billing' : 'Annual billing'}
          </span>
          {cycle === 'yearly' ? <span className="ml-2 text-emerald-600">best value</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((code) => {
          const m = META[code];
          const cfg = PLAN_LIMITS[code];
          const Icon = m.icon;
          const isCurrent = code === currentPlanCode;
          const targetIdx = ORDER.indexOf(code);
          const isUpgrade = targetIdx > currentIdx;

          const seats = code === 'growth' ? growthSeats : 1;
          const price = code === 'enterprise' ? null : getTotalPrice(code, cycle, seats);
          const priceLabel =
            code === 'enterprise' ? 'Custom' : price === null ? 'Custom' : `$${price.toLocaleString()}`;

          // CTA logic per design + existing flow
          let ctaLabel: string;
          let ctaHandler: () => void;
          let ctaPrimary = false;
          let ctaDisabled = false;

          if (isCurrent) {
            ctaLabel = canManage ? (hasStripeCustomer ? `You're on ${cfg.label}` : `Current plan`) : `You're on ${cfg.label}`;
            ctaHandler = canManage && hasStripeCustomer ? onManageCurrent : () => {};
            ctaDisabled = !canManage || !hasStripeCustomer;
          } else if (code === 'enterprise') {
            ctaLabel = 'Contact sales';
            ctaHandler = onContactSales;
            ctaPrimary = false;
          } else if (code === 'free_trial') {
            ctaLabel = 'Start free';
            ctaHandler = () => onSelectPlan(code);
            ctaDisabled = true; // free_trial is the default; nothing to checkout
          } else {
            ctaLabel = isUpgrade ? `Upgrade to ${cfg.label}` : `Switch to ${cfg.label}`;
            ctaHandler = () => onSelectPlan(code);
            ctaPrimary = isUpgrade;
          }

          if (!canManage && !isCurrent) {
            ctaDisabled = true;
          }

          const isLoadingThis = actionLoading === code;

          return (
            <div
              key={code}
              className={`group relative flex h-full flex-col rounded-[18px] border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${m.border} ${
                isCurrent ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200'
              }`}
            >
              {isCurrent ? (
                <div className="absolute right-4 top-0 -translate-y-1/2 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm">
                  Current plan
                </div>
              ) : m.ribbon ? (
                <div className="absolute right-4 top-0 -translate-y-1/2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm">
                  {m.ribbon}
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${m.iconBg} text-white shadow-sm`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {cfg.label}
                </div>
              </div>

              <div className="mt-4 flex items-end gap-1">
                <span className="text-3xl font-bold tracking-tight text-slate-950">{priceLabel}</span>
                <span className="mb-1 text-sm text-slate-500">
                  {code === 'enterprise' ? '' : intervalLabel}
                </span>
              </div>

              <p className="mt-3 min-h-[44px] text-sm leading-6 text-slate-600">{m.description}</p>

              <ul className="mt-4 flex-1 space-y-2.5">
                {m.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={ctaHandler}
                  disabled={ctaDisabled || isLoadingThis}
                  className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    ctaPrimary
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : isCurrent
                      ? 'bg-slate-100 text-slate-700'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isLoadingThis ? 'Processing…' : ctaLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}