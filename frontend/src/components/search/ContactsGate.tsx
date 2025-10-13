import React from 'react';
import { Lock, Star, ArrowRight } from 'lucide-react';

type ContactsGateProps = {
  position?: 'center' | 'top';
  companyName?: string;
  onUpgrade?: () => void;
  onLearnMore?: () => void;
};

export default function ContactsGate({
  position = 'center',
  companyName = 'this company',
  onUpgrade,
  onLearnMore,
}: ContactsGateProps) {
  return (
    <div
      className={[
        'relative isolate overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-sm',
        position === 'center' ? 'mx-auto mt-10 w-full max-w-3xl' : 'w-full',
      ].join(' ')}
      aria-labelledby="contacts-gate-title"
      role="region"
    >
      {/* soft gradient watermark */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-gradient-to-br from-violet-200 to-fuchsia-200 blur-2xl" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-indigo-100 to-purple-200 blur-2xl" />
      </div>

      <div className="flex items-start gap-4 p-6 sm:p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white shadow">
          <Lock className="h-5 w-5" aria-hidden />
        </div>

        <div className="flex-1">
          <h3 id="contacts-gate-title" className="text-lg font-semibold text-zinc-900">
            Contacts are a Pro feature
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            Upgrade to view decision-makers, verified emails, and direct dials for{' '}
            <span className="font-medium text-zinc-800">{companyName}</span>. You’ll also unlock CRM export and sequencing.
          </p>

          {/* mini “floating contact” watermark card */}
          <div className="mt-5 hidden rounded-xl border border-zinc-200 bg-white/70 p-4 shadow-sm backdrop-blur-sm sm:block">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-80" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-900">Sample Contact</div>
                <div className="truncate text-xs text-zinc-600">Sr. Manager, Supply Chain</div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                <Star className="h-3.5 w-3.5" /> Verified
              </span>
            </div>
          </div>

          {/* CTAs */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onUpgrade}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Upgrade to Pro <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onLearnMore}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
            >
              Learn more
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
