// Affiliate tie-in. Three states based on REAL affiliate role from
// usePartnerStatus(). Routes use the existing affiliate routes mounted
// in App.jsx.

import { ArrowUpRight, Sparkles, ShieldCheck, Handshake } from 'lucide-react';

export type AffiliateState = 'none' | 'affiliate' | 'admin';

interface Props {
  state: AffiliateState;
  onApply: () => void;     // routes to /partners/apply
  onOpenDash: () => void;  // routes to /app/affiliate
  onOpenAdmin: () => void; // routes to /app/admin/partner-program
}

export function AffiliateTieIn({ state, onApply, onOpenDash, onOpenAdmin }: Props) {
  if (state === 'admin') {
    return (
      <Card
        icon={ShieldCheck}
        iconBg="bg-amber-100 text-amber-700"
        eyebrow="Partner admin"
        title="Affiliate program admin"
        body="You manage the LIT Partners program. Approve applications, review payouts, and tune commission tiers."
        ctaLabel="Open partner admin"
        onCta={onOpenAdmin}
      />
    );
  }

  if (state === 'affiliate') {
    return (
      <Card
        icon={Handshake}
        iconBg="bg-emerald-100 text-emerald-700"
        eyebrow="LIT Partners"
        title="You're a LIT affiliate"
        body="Track referrals, view commissions, and manage payouts in your affiliate dashboard."
        ctaLabel="Open affiliate dashboard"
        onCta={onOpenDash}
      />
    );
  }

  return (
    <Card
      icon={Sparkles}
      iconBg="bg-indigo-100 text-indigo-700"
      eyebrow="LIT Partners"
      title="Earn credits and commission with LIT Partners"
      body="Refer customers and earn recurring revenue. Apply to join the partner program — review takes 1–3 business days."
      ctaLabel="Apply"
      onCta={onApply}
    />
  );
}

function Card({
  icon: Icon,
  iconBg,
  eyebrow,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              {eyebrow}
            </span>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCta}
          className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {ctaLabel}
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}