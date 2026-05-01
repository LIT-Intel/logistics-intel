// Billing hero — light premium card matching the LIT billing design
// package. Subtle white → blue gradient with cyan + violet ambient glows.
// Real data only; fields hide cleanly when not available. The primary
// CTA varies by canonical state and always wires into the EXISTING
// checkout / portal handlers.

import {
  Crown,
  Rocket,
  Layers3,
  Sparkles,
  CreditCard,
  Calendar,
  RefreshCw,
  DollarSign,
  Building2,
  ExternalLink,
  Info,
} from 'lucide-react';
import type { PlanCode } from '@/lib/planLimits';
import type { CanonicalState } from './billingState';
import { StatusPill } from './StatusPill';

interface Props {
  planCode: PlanCode;
  planLabel: string;
  state: CanonicalState;
  amountDisplay: string;
  cycle: 'monthly' | 'yearly' | null;
  renewalDate: string | null;
  daysUntilRenewal: number | null;
  paymentMethodLabel: string;
  billingEmail: string | null;
  seats: { assigned: number | null; included: string | null };
  showCycleToggle: boolean;
  onCycleChange?: (next: 'monthly' | 'yearly') => void;
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  secondaryLabel: string;
  primaryDisabled?: boolean;
  isLoading?: boolean;
}

const PLAN_ICON: Record<PlanCode, React.ComponentType<{ className?: string }>> = {
  free_trial: Sparkles,
  starter: Layers3,
  growth: Rocket,
  scale: Building2,
  enterprise: Crown,
};

const PLAN_ACCENT: Record<PlanCode, string> = {
  free_trial: 'bg-violet-100 text-violet-600',
  starter: 'bg-blue-100 text-blue-600',
  growth: 'bg-emerald-100 text-emerald-600',
  scale: 'bg-indigo-100 text-indigo-600',
  enterprise: 'bg-amber-100 text-amber-600',
};

export function BillingHero({
  planCode,
  planLabel,
  state,
  amountDisplay,
  cycle,
  renewalDate,
  daysUntilRenewal,
  paymentMethodLabel,
  billingEmail,
  seats,
  showCycleToggle,
  onCycleChange,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
  primaryDisabled,
  isLoading,
}: Props) {
  const Icon = PLAN_ICON[planCode];
  const accent = PLAN_ACCENT[planCode];

  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-indigo-100 bg-gradient-to-br from-white via-[#F8FAFF] to-[#EEF4FF] shadow-[0_2px_4px_rgba(15,23,42,0.04),0_18px_40px_rgba(59,130,246,0.08)]"
    >
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-70"
        style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.18), transparent 65%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full opacity-70"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 65%)' }}
      />

      <div className="relative grid grid-cols-1 gap-8 p-7 md:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        {/* Left — plan + amount + CTAs */}
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-blue-600">
              Current subscription
            </span>
            <span className="h-[3px] w-[3px] rounded-full bg-slate-300" />
            <StatusPill state={state} />
            {billingEmail ? (
              <>
                <span className="h-[3px] w-[3px] rounded-full bg-slate-300" />
                <span className="text-[11.5px] text-slate-500">
                  Billing: <span className="font-semibold text-slate-700">{billingEmail}</span>
                </span>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-4">
            <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${accent} shadow-inner`}>
              <Icon className="h-6 w-6" />
            </span>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-[40px] font-bold leading-none tracking-[-0.03em] text-slate-950">
                {planLabel}
              </h2>
              {seats.assigned != null && seats.included ? (
                <span className="text-base font-medium text-slate-500">
                  · {seats.assigned}/{seats.included} seats
                </span>
              ) : seats.included ? (
                <span className="text-base font-medium text-slate-500">
                  · {seats.included} seat{seats.included === '1' ? '' : 's'} included
                </span>
              ) : null}
            </div>
          </div>

          <p className="max-w-xl text-[13.5px] leading-[1.55] text-slate-600">
            {renderContextLine({ state, planLabel, daysUntilRenewal, renewalDate })}
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled || isLoading}
              className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_6px_rgba(59,130,246,0.28),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                state === 'pastdue'
                  ? 'bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                  : 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
              }`}
            >
              {isLoading ? 'Processing…' : primaryLabel}
            </button>
            <button
              type="button"
              onClick={onSecondary}
              className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {secondaryLabel}
            </button>
            {primaryDisabled ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500">
                <Info className="h-3.5 w-3.5 text-slate-400" />
                Contact a workspace admin to change billing.
              </span>
            ) : null}
          </div>
        </div>

        {/* Right — data strip with optional cycle toggle */}
        <div className="flex min-w-0 flex-col gap-3 lg:items-end">
          {showCycleToggle && cycle && onCycleChange ? (
            <CycleToggle cycle={cycle} setCycle={onCycleChange} />
          ) : null}

          <div className="grid w-full grid-cols-2 gap-4 rounded-[14px] border border-slate-200 bg-white/75 p-[18px] shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur">
            <HeroStat
              icon={DollarSign}
              label="Amount"
              value={amountDisplay}
              sub={cycle ? (cycle === 'monthly' ? 'Billed monthly' : 'Billed yearly') : null}
            />
            <HeroStat
              icon={Calendar}
              label={
                state === 'trial'
                  ? 'Trial ends'
                  : state === 'canceled'
                  ? 'Access until'
                  : 'Next renewal'
              }
              value={renewalDate || '—'}
              sub={daysUntilRenewal != null ? `in ${daysUntilRenewal} days` : null}
            />
            <HeroStat
              icon={RefreshCw}
              label="Billing cycle"
              value={cycle ? (cycle === 'monthly' ? 'Monthly' : 'Annual') : '—'}
              sub={cycle === 'yearly' ? 'Save ~17%' : null}
            />
            <HeroStat
              icon={CreditCard}
              label="Payment method"
              value={paymentMethodLabel}
              sub={null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function renderContextLine({
  state,
  planLabel,
  daysUntilRenewal,
  renewalDate,
}: {
  state: CanonicalState;
  planLabel: string;
  daysUntilRenewal: number | null;
  renewalDate: string | null;
}) {
  switch (state) {
    case 'free':
      return "You're on the free plan. Upgrade to unlock Pulse, team seats, and unlimited Command Center.";
    case 'trial':
      return `${planLabel} trial — full access${
        daysUntilRenewal != null ? ` for ${daysUntilRenewal} more day${daysUntilRenewal === 1 ? '' : 's'}` : ''
      }${renewalDate ? `. Add a card to keep access after ${renewalDate}.` : '.'}`;
    case 'active':
      return `Your ${planLabel} plan renews automatically. Stripe is the source of truth — changes sync within a minute.`;
    case 'pastdue':
      return 'Your last payment failed. Update your card in Stripe to restore full access.';
    case 'canceled':
      return `Subscription canceled${
        renewalDate ? `. You keep ${planLabel} access until ${renewalDate}.` : '.'
      } Reactivate any time to resume.`;
    case 'enterprise':
      return 'Enterprise workspace billed by contract. Reach out to your account team for seat, usage, or term changes.';
    default:
      return '';
  }
}

function CycleToggle({
  cycle,
  setCycle,
}: {
  cycle: 'monthly' | 'yearly';
  setCycle: (c: 'monthly' | 'yearly') => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-[3px] shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {(
        [
          ['monthly', 'Monthly', null],
          ['yearly', 'Annual', '-17%'],
        ] as const
      ).map(([id, label, deal]) => {
        const active = cycle === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setCycle(id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
              active
                ? 'bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-[0_1px_4px_rgba(15,23,42,0.25)]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {deal && !active ? (
              <span className="rounded-full bg-emerald-50 px-1.5 py-[1px] text-[9.5px] font-bold text-emerald-700">
                {deal}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-[17px] font-bold tracking-[-0.01em] text-slate-950">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}