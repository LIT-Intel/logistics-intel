// Billing hero card. Real data only — fields hide cleanly when not
// available (e.g., no seats data, no payment method on file). The
// primary CTA varies by canonical state and always wires into the
// EXISTING checkout / portal handlers.

import {
  Crown,
  Rocket,
  Layers3,
  Sparkles,
  CreditCard,
  Calendar,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import type { PlanCode } from '@/lib/planLimits';
import type { CanonicalState } from './billingState';
import { StatusPill } from './StatusPill';

interface Props {
  planCode: PlanCode;
  planLabel: string;
  state: CanonicalState;
  amountDisplay: string;       // e.g. "$129/mo" or "Custom" or "Free"
  cycle: 'monthly' | 'yearly' | null;
  renewalDate: string | null;
  daysUntilRenewal: number | null;
  paymentMethodLabel: string;  // "Visa •••• 4242" if known else "Not on file"
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
  enterprise: Crown,
};

const PLAN_ACCENT: Record<PlanCode, string> = {
  free_trial: 'text-violet-300',
  starter: 'text-blue-300',
  growth: 'text-emerald-300',
  enterprise: 'text-amber-300',
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
      className="overflow-hidden rounded-[18px] border border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white shadow-sm"
    >
      <div className="grid grid-cols-1 gap-6 p-6 md:p-7 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: plan + state + amount + CTAs */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 shadow-inner">
              <Icon className={`h-6 w-6 ${accent}`} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{planLabel}</h2>
                <StatusPill state={state} />
              </div>
              {billingEmail ? (
                <p className="mt-1 truncate text-sm text-slate-300">
                  Billing contact: <span className="text-white">{billingEmail}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">{amountDisplay}</span>
            {cycle ? (
              <span className="mb-1 text-sm text-slate-300">
                {cycle === 'monthly' ? 'monthly' : 'annual'}
              </span>
            ) : null}
          </div>

          {showCycleToggle && cycle && onCycleChange ? (
            <div className="inline-flex w-fit rounded-2xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => onCycleChange('monthly')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  cycle === 'monthly' ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => onCycleChange('yearly')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  cycle === 'yearly' ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'
                }`}
              >
                Annual
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled || isLoading}
              className="inline-flex items-center justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? 'Processing…' : primaryLabel}
            </button>
            <button
              type="button"
              onClick={onSecondary}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {secondaryLabel}
            </button>
          </div>
        </div>

        {/* Right: stats grid */}
        <div className="grid grid-cols-2 gap-3 self-start">
          <Stat icon={DollarSign} label="Amount" value={amountDisplay} />
          <Stat
            icon={Calendar}
            label="Renewal"
            value={
              renewalDate
                ? daysUntilRenewal != null
                  ? `${renewalDate}`
                  : renewalDate
                : '—'
            }
            sub={daysUntilRenewal != null ? `in ${daysUntilRenewal} days` : null}
          />
          <Stat
            icon={RefreshCw}
            label="Cycle"
            value={cycle ? (cycle === 'monthly' ? 'Monthly' : 'Annual') : '—'}
          />
          <Stat icon={CreditCard} label="Payment" value={paymentMethodLabel} />
          {seats.assigned != null && seats.included ? (
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Seats</div>
              <div className="mt-1 text-sm font-medium text-white">
                {seats.assigned} assigned · {seats.included} included
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-white">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-cyan-300">{sub}</div> : null}
    </div>
  );
}