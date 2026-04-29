// Billing page header — breadcrumb + title + role/status pills. Sticky
// at the top of the page so the user always sees their permission level
// and current subscription state while scrolling.

import { ChevronRight } from 'lucide-react';
import { StatusPill, RoleBadge } from './StatusPill';
import type { CanonicalState } from './billingState';

interface Props {
  state: CanonicalState;
  canManage: boolean;
  isSuperAdmin: boolean;
}

export function BillingHeader({ state, canManage, isSuperAdmin }: Props) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <nav className="flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <span>Settings</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold text-slate-700">Plan &amp; billing</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950">
          Plan &amp; billing
        </h1>
        <div className="flex items-center gap-2">
          <RoleBadge canManage={canManage} isSuperAdmin={isSuperAdmin} />
          <StatusPill state={state} />
        </div>
      </div>
    </div>
  );
}

export function ReadOnlyBanner({ canManage }: { canManage: boolean }) {
  if (canManage) return null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-900">Read-only view</p>
          <p className="mt-0.5 text-sm text-blue-800">
            You can see your workspace's plan and usage, but only admins can change billing.
            Contact your admin to make changes.
          </p>
        </div>
      </div>
      <a
        href="mailto:support@logisticintel.com?subject=Billing%20admin%20access"
        className="inline-flex flex-shrink-0 items-center justify-center rounded-xl border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
      >
        Contact admin
      </a>
    </div>
  );
}