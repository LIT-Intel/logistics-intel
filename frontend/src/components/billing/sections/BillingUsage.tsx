// Real usage meters. Renders only categories that come from the live
// useEntitlements() snapshot (backed by get-entitlements). Unknown
// categories render the design's empty state — never fabricated.

import { Search, Bookmark, Mail, FileSearch, FileBarChart2, Sparkles, Zap, BookOpen } from 'lucide-react';
import type { FeatureKey } from '@/lib/usage';

export interface UsageMeter {
  key: FeatureKey | string;
  label: string;
  used: number;
  limit: number | null; // null = unlimited
  icon?: React.ComponentType<{ className?: string }>;
}

const DEFAULT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  company_search: Search,
  saved_company: Bookmark,
  campaign_send: Mail,
  company_profile_view: FileSearch,
  pulse_brief: FileBarChart2,
  contact_enrichment: Sparkles,
  export_pdf: BookOpen,
  ai_brief: Zap,
};

export function BillingUsage({
  meters,
  resetAt,
}: {
  meters: UsageMeter[];
  resetAt: string | null;
}) {
  if (meters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-slate-700">Usage data not available yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Once your team starts using LIT this period, your usage will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Usage
          </span>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">
            This billing period
          </h3>
        </div>
        {resetAt ? (
          <p className="text-xs text-slate-500">Resets {resetAt}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {meters.map((m) => (
          <Meter key={m.key} meter={m} />
        ))}
      </div>
    </div>
  );
}

function Meter({ meter }: { meter: UsageMeter }) {
  const Icon = meter.icon || DEFAULT_ICON[meter.key] || Search;
  const limit = meter.limit;
  const used = meter.used;
  const pct = limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const over = limit !== null && used > limit;
  const reached = limit !== null && pct >= 80;

  // 6px progress bar per design spec
  const barColor = over
    ? 'bg-red-500'
    : pct >= 100
    ? 'bg-red-500'
    : pct >= 80
    ? 'bg-amber-500'
    : 'bg-gradient-to-r from-blue-500 to-blue-600';

  const iconBg = over || pct >= 100 ? 'bg-red-100 text-red-700' : reached ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold text-slate-900">{meter.label}</span>
        </div>
        <span className={`text-xs font-semibold ${over ? 'text-red-700' : reached ? 'text-amber-700' : 'text-slate-700'}`}>
          {limit === null ? `${used} · Unlimited` : `${used} / ${limit}`}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${barColor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}