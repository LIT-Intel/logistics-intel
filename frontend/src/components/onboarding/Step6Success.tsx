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
      description: 'Add teammates to your workspace',
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
      description: 'Set up preferences and integrations',
      action: () => navigate('/app/settings'),
    },
    {
      icon: Zap,
      title: 'Start searching',
      description: 'Find shippers and freight intelligence',
      action: () => navigate('/app/search'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Success badge */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white">
              <Check className="h-7 w-7 text-emerald-500" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-bold text-slate-900">You're all set, {userName}!</h2>
          <p className="mt-2 text-base text-slate-500">
            Your <span className="font-semibold text-indigo-600">{planName}</span> workspace is ready to go.
          </p>
        </div>

        {/* Account summary */}
        <div className="mx-auto max-w-sm rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-cyan-50 p-5 text-left space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Organization</span>
            <span className="text-sm font-semibold text-slate-900">{orgName}</span>
          </div>
          <div className="h-px bg-indigo-100" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Plan</span>
            <span className="text-sm font-semibold text-indigo-700">{planName}</span>
          </div>
          <div className="h-px bg-indigo-100" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Status</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Next steps */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-slate-900">What would you like to do first?</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {nextSteps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <button
                key={idx}
                onClick={step.action}
                className="group flex items-start justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{step.description}</div>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/app/dashboard')}
        className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-base font-semibold text-white shadow-md shadow-indigo-200 transition hover:from-indigo-700 hover:to-violet-700"
      >
        Go to Dashboard →
      </button>

      <div className="text-center text-sm text-slate-500">
        Need help?{' '}
        <a href="mailto:support@logisticintel.com" className="font-semibold text-indigo-600 hover:underline">
          Contact support
        </a>
      </div>
    </div>
  );
}
