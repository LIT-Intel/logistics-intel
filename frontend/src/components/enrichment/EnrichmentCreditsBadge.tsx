/**
 * EnrichmentCreditsBadge
 *
 * Surfaces the current month's enrichment credit burn / quota on any
 * surface that lets users spend credits (company profile → contacts panel,
 * pulse drawer, future phone-unlock button).
 *
 * Credit math (Phase 1 → Phase 3):
 *   - 1 credit = 1 email unlock (Apollo "export credit", ~$0.05-0.20)
 *   - Phase 3 (phones) will charge 10 credits per mobile-phone unlock
 *
 * The hook returns `null` credits when the server snapshot doesn't include
 * them yet (e.g. older get-entitlements still deployed). We render a neutral
 * placeholder rather than failing — the security boundary is server-side.
 */
import { Sparkles, AlertTriangle } from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';

export interface EnrichmentCreditsBadgeProps {
  className?: string;
  /**
   * Compact mode hides the explainer caption — use on space-constrained
   * surfaces (e.g. contact card row, drawer header).
   */
  compact?: boolean;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '∞';
  return new Intl.NumberFormat('en-US').format(n);
}

export default function EnrichmentCreditsBadge({
  className = '',
  compact = false,
}: EnrichmentCreditsBadgeProps) {
  const { credits, isChecking } = useEntitlements();

  // RPC not deployed / still loading — render neutral placeholder.
  if (isChecking || !credits) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Credits this month: —
      </div>
    );
  }

  const used = credits.used_this_month ?? 0;
  const quota = credits.quota;
  const remaining = credits.remaining;
  const unlimited = quota === null || quota === undefined;
  const lowBudget = !unlimited && typeof remaining === 'number' && remaining < Math.max(10, Math.floor((quota ?? 0) * 0.1));
  const exhausted = !unlimited && typeof remaining === 'number' && remaining <= 0;

  const tone = exhausted
    ? 'border-rose-300 bg-rose-50 text-rose-700'
    : lowBudget
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-blue-200 bg-blue-50 text-blue-700';

  const tooltip = unlimited
    ? 'Enterprise plan — unlimited enrichment credits this month.'
    : `1 credit = 1 email unlock. Phone unlocks (coming soon) cost 10 credits each. ${fmt(remaining)} credits remaining this month — resets ${credits.reset_at ? new Date(credits.reset_at).toLocaleDateString() : 'on the 1st'}.`;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${tone} ${className}`}
      title={tooltip}
    >
      {exhausted ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      <span>
        Credits this month: <strong className="tabular-nums">{fmt(used)}</strong>
        {!unlimited && (
          <>
            {' / '}
            <span className="tabular-nums">{fmt(quota)}</span>
            {' '}
            <span className="text-[11px] opacity-80">({fmt(remaining)} left)</span>
          </>
        )}
        {unlimited && <span className="ml-1 opacity-80">(unlimited)</span>}
      </span>
      {!compact && !unlimited && (
        <span className="hidden md:inline text-[11px] opacity-70 border-l border-current/20 pl-2 ml-1">
          Phone unlocks = 10×
        </span>
      )}
    </div>
  );
}
