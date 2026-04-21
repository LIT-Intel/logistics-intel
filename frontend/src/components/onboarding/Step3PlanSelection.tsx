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
    description: 'Get started with core features',
    features: [
      '10 searches/month',
      'Basic command center',
      'Limited company views',
      'Email support',
    ],
    highlighted: false,
  },
  {
    code: 'starter' as PlanCode,
    name: 'Starter',
    description: 'For individual professionals',
    features: [
      '100 searches/month',
      'Full command center',
      'Company enrichment',
      'Priority email support',
      'API access',
    ],
    highlighted: false,
  },
  {
    code: 'growth' as PlanCode,
    name: 'Growth',
    description: 'For growing teams',
    features: [
      '500 searches/month per seat',
      'Team collaboration',
      'Campaign builder',
      'Pulse monitoring',
      'Enrichment credits',
      '24/7 phone support',
      '3–7 seats',
    ],
    highlighted: true,
  },
  {
    code: 'enterprise' as PlanCode,
    name: 'Enterprise',
    description: 'For large organizations',
    features: [
      'Unlimited everything',
      'Custom integrations',
      'Dedicated account manager',
      'SSO & SAML',
      'Advanced reporting',
      '6+ seats',
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
