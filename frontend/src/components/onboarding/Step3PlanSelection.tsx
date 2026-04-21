import React, { useState } from 'react';
import { Check, Zap } from 'lucide-react';
import type { PlanCode } from '@/lib/planLimits';

interface Step3PlanSelectionProps {
  onNext: (data: { planCode: PlanCode; billingInterval: 'monthly' | 'yearly' }) => void;
  initialData?: {
    planCode?: PlanCode;
    billingInterval?: 'monthly' | 'yearly';
  };
}

const MONTHLY_PRICES: Record<string, number | null> = {
  free_trial: 0,
  starter:    99,
  growth:     129,
  enterprise: null,
};

const plans = [
  {
    code: 'free_trial' as PlanCode,
    name: 'Free Trial',
    description: 'Explore the product before committing',
    seat_line: '1 seat',
    usage_line: '10 discoveries • 10 saved accounts',
    features: [
      '10 company discoveries',
      '10 saved accounts',
      'Dashboard + Search access',
      'No Pulse or Campaign Builder',
    ],
    highlighted: false,
  },
  {
    code: 'starter' as PlanCode,
    name: 'Starter',
    description: 'Core intelligence for solo operators',
    seat_line: '1 seat',
    usage_line: '250 discoveries • 250 saved accounts',
    features: [
      '250 company discoveries',
      '250 saved accounts',
      'Company Intelligence pages',
      'No Pulse or Campaign Builder',
    ],
    highlighted: false,
  },
  {
    code: 'growth' as PlanCode,
    name: 'Growth',
    description: 'Multi-user prospecting and outreach at scale',
    seat_line: '3 to 7 seats',
    usage_line: '2,000 shared discoveries • 500 saved accounts',
    features: [
      '2,000 shared discoveries',
      '500 saved accounts',
      'Pulse + Campaign Builder',
      '100 enrichment credits',
    ],
    highlighted: true,
  },
  {
    code: 'enterprise' as PlanCode,
    name: 'Enterprise',
    description: 'Admin controls, scale, and commercial flexibility',
    seat_line: '6+ seats',
    usage_line: 'Custom usage limits',
    features: [
      'Everything in Growth',
      'Custom usage limits',
      'Priority support',
      'Contact sales only',
    ],
    highlighted: false,
  },
];

function formatPrice(code: PlanCode, interval: 'monthly' | 'yearly'): string {
  const base = MONTHLY_PRICES[code];
  if (base === null) return 'Custom';
  if (base === 0) return '$0';
  if (interval === 'yearly') return `$${Math.round(base * 0.8)}/mo`;
  return `$${base}`;
}

export function Step3PlanSelection({ onNext, initialData }: Step3PlanSelectionProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>(initialData?.planCode || 'growth');
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(
    initialData?.billingInterval || 'monthly'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ planCode: selectedPlan, billingInterval });
  };

  const selectedPlanName = plans.find((p) => p.code === selectedPlan)?.name || '';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Choose your plan</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Select the plan that fits your team's needs. You can upgrade anytime.
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={`text-sm font-medium ${billingInterval === 'monthly' ? 'text-slate-900' : 'text-slate-500'}`}>
          Monthly
        </span>
        <button
          type="button"
          onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'yearly' : 'monthly')}
          className={[
            'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
            billingInterval === 'yearly' ? 'bg-indigo-500' : 'bg-slate-300',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform',
              billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
        <span className={`text-sm font-medium ${billingInterval === 'yearly' ? 'text-slate-900' : 'text-slate-500'}`}>
          Yearly{' '}
          <span className="font-semibold text-emerald-600">— Save 20%</span>
        </span>
      </div>

      {/* Plans Grid */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.code;
            const priceDisplay = formatPrice(plan.code, billingInterval);
            const monthlyBase = MONTHLY_PRICES[plan.code];

            return (
              <div
                key={plan.code}
                onClick={() => setSelectedPlan(plan.code)}
                className={[
                  'relative cursor-pointer rounded-2xl border-2 p-5 transition-all',
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                  plan.highlighted ? 'ring-2 ring-indigo-200 ring-offset-2' : '',
                ].join(' ')}
              >
                {plan.highlighted && (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">
                      <Zap className="h-3 w-3" /> Most Popular
                    </span>
                  </div>
                )}

                <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{plan.description}</p>

                <div className="mt-4">
                  <div className="text-2xl font-bold text-slate-900">{priceDisplay}</div>
                  {monthlyBase !== null && monthlyBase > 0 && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {billingInterval === 'yearly' ? 'billed annually' : 'per month'}
                    </div>
                  )}
                  {billingInterval === 'yearly' && monthlyBase !== null && monthlyBase > 0 && (
                    <div className="mt-0.5 text-xs font-medium text-emerald-600">
                      Save ${Math.round(monthlyBase * 0.2 * 12)}/yr
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold text-slate-700">{plan.seat_line}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{plan.usage_line}</div>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="text-xs text-slate-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          Select {selectedPlanName} Plan →
        </button>
      </form>
    </div>
  );
}
