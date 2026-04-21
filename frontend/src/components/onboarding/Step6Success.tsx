/**
 * Step 6: Success & Integration Guide
 * Final onboarding step with next steps and resources
 */

import React from 'react';
import { Check, BookOpen, Settings, Users, Zap, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Step6SuccessProps {
  userName: string;
  orgName: string;
  planName: string;
}

export function Step6Success({ userName, orgName, planName }: Step6SuccessProps) {
  const navigate = useNavigate();

  const nextSteps = [
    {
      icon: Users,
      title: 'Invite your team',
      description: 'Add team members to your workspace',
      action: () => navigate('/app/settings?section=team'),
    },
    {
      icon: BookOpen,
      title: 'Read the docs',
      description: 'Learn about all features and capabilities',
      action: () => window.open('https://docs.logisticintel.com', '_blank'),
    },
    {
      icon: Settings,
      title: 'Configure settings',
      description: 'Set up your preferences and integrations',
      action: () => navigate('/app/settings'),
    },
    {
      icon: Zap,
      title: 'Start searching',
      description: 'Begin using Logistics Intel',
      action: () => navigate('/app/search'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Success Message */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-bold text-slate-900">Welcome to Logistics Intel!</h2>
          <p className="mt-2 text-lg text-slate-600">
            Hi {userName}, your {planName} plan is all set up
          </p>
        </div>

        {/* Account Summary */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Organization</span>
            <span className="font-semibold text-slate-900">{orgName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Plan</span>
            <span className="font-semibold text-slate-900">{planName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Status</span>
            <span className="inline-flex items-center gap-2 text-emerald-600 font-semibold">
              <div className="h-2 w-2 rounded-full bg-emerald-600" />
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-900">What's next?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {nextSteps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <button
                key={idx}
                onClick={step.action}
                className="group rounded-2xl border-2 border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <Icon className="h-6 w-6 text-indigo-600" />
                  <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                </div>
                <h4 className="font-semibold text-slate-900">{step.title}</h4>
                <p className="text-sm text-slate-600 mt-1">{step.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6">
        <h3 className="font-bold text-amber-900 mb-3">💡 Quick Tips</h3>
        <ul className="space-y-2 text-sm text-amber-900">
          <li className="flex gap-2">
            <Check className="h-5 w-5 flex-shrink-0" />
            <span>Use the search bar to find shippers and companies instantly</span>
          </li>
          <li className="flex gap-2">
            <Check className="h-5 w-5 flex-shrink-0" />
            <span>Save companies to your command center for tracking</span>
          </li>
          <li className="flex gap-2">
            <Check className="h-5 w-5 flex-shrink-0" />
            <span>Check Pulse to monitor shipment activity in real-time</span>
          </li>
          <li className="flex gap-2">
            <Check className="h-5 w-5 flex-shrink-0" />
            <span>Build campaigns to generate pipeline</span>
          </li>
        </ul>
      </div>

      {/* CTA Button */}
      <button
        onClick={() => navigate('/app/dashboard')}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
      >
        Go to Dashboard
      </button>

      {/* Support Info */}
      <div className="text-center text-sm text-slate-600">
        <p>
          Need help?{' '}
          <a href="mailto:support@logisticintel.com" className="font-semibold text-indigo-600 hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
