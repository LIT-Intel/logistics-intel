// Affiliate tie-in. Three states based on REAL affiliate role from
// usePartnerStatus(). Routes use the existing affiliate routes mounted
// in App.jsx. Premium amber/orange gradient styling matches the LIT
// billing design package.

import { Sparkles, ShieldCheck, BarChart3, Gift } from 'lucide-react';

export type AffiliateState = 'none' | 'affiliate' | 'admin';

interface Props {
  state: AffiliateState;
  onApply: () => void; // routes to /partners/apply
  onOpenDash: () => void; // routes to /app/affiliate
  onOpenAdmin: () => void; // routes to /app/admin/partner-program
}

export function AffiliateTieIn({ state, onApply, onOpenDash, onOpenAdmin }: Props) {
  if (state === 'admin') {
    return (
      <Card
        ctaIcon={ShieldCheck}
        title="Affiliate program admin"
        body="Review partner applications, approve payouts, and manage commission rules across the program."
        ctaLabel="Open partner admin"
        onCta={onOpenAdmin}
      />
    );
  }

  if (state === 'affiliate') {
    return (
      <Card
        ctaIcon={BarChart3}
        title="You're a LIT affiliate"
        body="Track referrals, payouts, and conversion rate. Share your link and earn recurring revenue on every paid workspace you send."
        ctaLabel="Open affiliate dashboard"
        onCta={onOpenDash}
      />
    );
  }

  return (
    <Card
      ctaIcon={Sparkles}
      title="Earn credits and commission with LIT Partners"
      body="Refer freight teams you already know. Get recurring commission for 12 months — paid monthly via Stripe Connect."
      ctaLabel="Apply to become an affiliate"
      onCta={onApply}
    />
  );
}

function Card({
  title,
  body,
  ctaLabel,
  ctaIcon: CtaIcon,
  onCta,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaIcon: React.ComponentType<{ className?: string }>;
  onCta: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_14px_rgba(15,23,42,0.03)]">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 bg-gradient-to-r from-white via-[#FFF7ED] to-[#FEF3C7] px-6 py-5 sm:gap-[18px] max-[820px]:grid-cols-[auto_1fr] [&>button]:max-[820px]:col-span-2">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_4px_12px_rgba(245,158,11,0.3)]">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-bold tracking-[-0.01em] text-slate-950">{title}</div>
          <p className="mt-1 max-w-[560px] text-[12.5px] leading-[1.5] text-amber-900/85">{body}</p>
        </div>
        <button
          type="button"
          onClick={onCta}
          className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-b from-amber-500 to-amber-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(245,158,11,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-150 hover:from-amber-600 hover:to-amber-700"
        >
          <CtaIcon className="h-3.5 w-3.5" />
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}