// Billing page header — breadcrumb + title + role/status pills.
// Sits on the page background (#F4F6FB), white surface so the title
// reads cleanly against the lighter body. Sticky so the user always
// sees their permission level + current subscription state while
// scrolling.

import { ChevronRight, Send } from 'lucide-react';
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
      <nav
        className="flex items-center gap-1.5 font-['DM_Sans',_system-ui,_sans-serif] text-[12px] text-slate-400"
        aria-label="Breadcrumb"
      >
        <span>Settings</span>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="font-medium text-slate-600">Plan &amp; billing</span>
      </nav>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-slate-950">
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
    <div className="mb-4 flex flex-col gap-3 rounded-[12px] border border-blue-200 bg-gradient-to-r from-[#EFF6FF] to-[#F5F9FF] p-3 sm:flex-row sm:items-center">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-blue-100 text-blue-700">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-3.5 w-3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-slate-950">Read-only view</p>
        <p className="mt-0.5 text-[12.5px] text-slate-600">
          You can see your workspace's plan and usage, but only admins can change billing.
          Contact your admin to make changes.
        </p>
      </div>
      <a
        href="mailto:support@logisticintel.com?subject=Billing%20admin%20access"
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <Send className="h-3 w-3" />
        Contact admin
      </a>
    </div>
  );
}