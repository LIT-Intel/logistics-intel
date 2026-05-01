// Status pill for the Billing header. Driven by the REAL subscription
// status from the live `subscriptions` table (canonical: active, past_due,
// cancelled, incomplete, trialing) plus a virtual "free" / "enterprise"
// derived from plan_code. Palette matches the LIT billing design package.

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Crown,
  Sparkles,
  Circle,
  UserCog,
} from 'lucide-react';
import type { CanonicalState } from './billingState';

const STYLES: Record<
  CanonicalState,
  {
    bg: string;
    border: string;
    text: string;
    dot: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  active: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)]',
    label: 'Active',
    icon: CheckCircle2,
  },
  trial: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    text: 'text-cyan-700',
    dot: 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.45)]',
    label: 'Trial',
    icon: Sparkles,
  },
  pastdue: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]',
    label: 'Past due',
    icon: AlertTriangle,
  },
  canceled: {
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    text: 'text-slate-600',
    dot: 'bg-slate-400',
    label: 'Canceled',
    icon: XCircle,
  },
  free: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.45)]',
    label: 'Free plan',
    icon: Circle,
  },
  enterprise: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    dot: 'bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.45)]',
    label: 'Enterprise',
    icon: Crown,
  },
};

export function StatusPill({ state }: { state: CanonicalState }) {
  const s = STYLES[state];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border ${s.border} ${s.bg} ${s.text} px-2.5 py-[3px] text-[10.5px] font-semibold tracking-[0.01em]`}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.dot}`} />
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

export function RoleBadge({
  canManage,
  isSuperAdmin,
}: {
  canManage: boolean;
  isSuperAdmin: boolean;
}) {
  const label = isSuperAdmin ? 'Superadmin' : canManage ? 'Admin' : 'Member';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-[3px] text-[10.5px] font-semibold text-blue-700">
      <UserCog className="h-3 w-3" />
      {label}
    </span>
  );
}