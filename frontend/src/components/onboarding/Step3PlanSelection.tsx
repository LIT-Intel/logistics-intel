/**
 * Step 3: Plan Selection
 * Displays plan options with features and pricing
 */

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

const plans = [
  {
    code: 'free_trial' as PlanCode,
    name: 'Free Trial',
    price: '$0',
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
    price: '$99',
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
    price: '$129',
    description: 'For growing teams',
    features: [
      '500 searches/month per seat',
      'Team collaboration',
      'Campaign builder',
      'Pulse monitoring',
      'Enrichment credits',
      '24/7 phone support',
      '3-7 seats',
    ],
    highlighted: true,
  },
  {
    code: 'enterprise' as PlanCode,
    name: 'Enterprise',
    price: 'Custom',
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

export function Step3PlanSelection({
  onNext,
  initialData,
}: Step3PlanSelectionProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>(
    initialData?.planCode || 'growth'
  );
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(
    initialData?.billingInterval || 'monthly'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ planCode: selectedPlan, billingInterval });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Choose your plan</h2>
        <p className="mt-2 text-slate-600">Select the plan that fits your needs</p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span
          className={`text-sm font-medium ${
            billingInterval === 'monthly' ? 'text-slate-900' : 'text-slate-600'
          }`}
        >
          Monthly
        </span>
        <button
          onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'yearly' : 'monthly')}
          className="relative inline-flex h-8 w-14 items-center rounded-full bg-slate-300"
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
              billingInterval === 'yearly' ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium ${
            billingInterval === 'yearly' ? 'text-slate-900' : 'text-slate-600'
          }`}
        >
          Yearly <span className="text-green-600 font-semibold">(Save 20%)</span>
        </span>
      </div>

      {/* Plans Grid */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.code}
              onClick={() => setSelectedPlan(plan.code)}
              className={`relative rounded-2xl border-2 p-6 cursor-pointer transition-all ${
                selectedPlan === plan.code
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              } ${plan.highlighted ? 'ring-2 ring-indigo-200 ring-offset-2' : ''}`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Most Popular
                  </span>
                </div>
              )}

              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <p className="text-sm text-slate-600 mt-1">{plan.description}</p>

              <div className="mt-4">
                <div className="text-3xl font-bold text-slate-900">{plan.price}</div>
                {plan.code !== 'free_trial' && plan.code !== 'enterprise' && (
                  <div className="text-xs text-slate-600">
                    per {billingInterval === 'monthly' ? 'month' : 'year'}
                  </div>
                )}
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Continue with {plans.find((p) => p.code === selectedPlan)?.name}
        </button>
      </form>
    </div>
  );
}
