// Enterprise marketing card — dark indigo/violet gradient with feature
// pills. CTAs route to the existing contact handler (mailto, since no
// dedicated booking endpoint exists in the live app).

import { ArrowUpRight, Mail, Calendar, Crown } from 'lucide-react';

interface Props {
  onContactSales: () => void;
  onBookDemo: () => void; // same handler ok if no dedicated endpoint
}

const PILLS = [
  'Custom usage limits',
  'SSO + SCIM ready',
  'Dedicated CSM',
  'Priority SLA',
  'Volume seat pricing',
  'Annual contracts',
];

export function EnterpriseCard({ onContactSales, onBookDemo }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-300/30 bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-6 text-white shadow-sm md:p-7">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/15 blur-3xl" />
      <div className="absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-fuchsia-400/20 blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 shadow-inner">
            <Crown className="h-5 w-5 text-amber-300" />
          </span>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Enterprise
            </span>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              Built for teams that need more
            </h3>
          </div>
        </div>

        <p className="mt-4 max-w-xl text-sm leading-6 text-white/85">
          Custom usage limits, dedicated success management, and commercial flexibility.
          Engineered for teams scaling outbound across multiple regions.
        </p>

        <ul className="mt-5 flex flex-wrap gap-2">
          {PILLS.map((p) => (
            <li
              key={p}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/95 backdrop-blur"
            >
              <ArrowUpRight className="h-3 w-3 text-cyan-300" />
              {p}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onContactSales}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            <Mail className="h-4 w-4" />
            Contact sales
          </button>
          <button
            type="button"
            onClick={onBookDemo}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            <Calendar className="h-4 w-4" />
            Book a demo
          </button>
        </div>
      </div>
    </div>
  );
}