// Status pill for the Billing header. Driven by the REAL subscription
// status from the live `subscriptions` table (canonical: active, past_due,
// cancelled, incomplete, trialing) plus a virtual "free" / "enterprise"
// derived from plan_code.

import { CheckCircle2, AlertTriangle, Clock, Sparkles, XCircle, Crown } from 'lucide-react';
import type { CanonicalState } from './billingState';

const STYLES: Record<CanonicalState, { bg: string; border: string; text: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    label: 'Active',
    icon: CheckCircle2,
  },
  trial: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    label: 'Trial',
    icon: Clock,
  },
  pastdue: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    label: 'Past due',
    icon: AlertTriangle,
  },
  canceled: {
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    text: 'text-slate-700',
    label: 'Canceled',
    icon: XCircle,
  },
  free: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    label: 'Free',
    icon: Sparkles,
  },
  enterprise: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    label: 'Enterprise',
    icon: Crown,
  },
};

export function StatusPill({ state }: { state: CanonicalState }) {
  const s = STYLES[state];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${s.border} ${s.bg} ${s.text} px-3 py-1 text-xs font-semibold`}
    >
      <Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

export function RoleBadge({ canManage, isSuperAdmin }: { canManage: boolean; isSuperAdmin: boolean }) {
  const label = isSuperAdmin ? 'Super admin' : canManage ? 'Billing admin' : 'Member';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}