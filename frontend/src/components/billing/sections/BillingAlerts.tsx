// State-driven alerts. Renders zero or more banners based on the REAL
// canonical state plus REAL usage warning thresholds (≥80% of any
// limited counter). All CTAs route to the existing checkout/portal
// flows — they never introduce new endpoints.

import { AlertTriangle, Clock, Sparkles, XCircle, ArrowRight, Mail } from 'lucide-react';
import type { CanonicalState } from './billingState';
import { daysUntil, formatDate } from './billingState';

interface UsageWarn {
  label: string;
  used: number;
  limit: number;
  pct: number;
}

interface Props {
  state: CanonicalState;
  trialEndIso?: string | null;
  paymentFailedAt?: string | null;
  canceledAt?: string | null;
  onUpgrade: () => void;          // wired to existing handleCheckout
  onUpdatePayment: () => void;    // wired to existing handlePortal
  onContactSales: () => void;     // wired to existing mailto
  onSeePlans: () => void;         // scrolls to plans section
  usageWarnings: UsageWarn[];
}

export function BillingAlerts({
  state,
  trialEndIso,
  paymentFailedAt,
  canceledAt,
  onUpgrade,
  onUpdatePayment,
  onContactSales,
  onSeePlans,
  usageWarnings,
}: Props) {
  const banners: JSX.Element[] = [];

  if (state === 'trial') {
    const days = daysUntil(trialEndIso);
    banners.push(
      <Banner
        key="trial"
        tone="amber"
        icon={Clock}
        title={days != null ? `Pro trial ending in ${days} day${days === 1 ? '' : 's'}` : 'Pro trial in progress'}
        body="Add a payment method now to keep your team's access uninterrupted."
        ctaLabel="Add payment"
        onCta={onUpgrade}
      />,
    );
  }

  if (state === 'pastdue') {
    const when = formatDate(paymentFailedAt) || 'a recent attempt';
    banners.push(
      <Banner
        key="pastdue"
        tone="red"
        icon={AlertTriangle}
        title={`Payment failed on ${when}`}
        body="We couldn't charge your card. Update payment in Stripe to restore full access."
        ctaLabel="Update card in Stripe"
        onCta={onUpdatePayment}
      />,
    );
  }

  if (state === 'canceled') {
    const when = formatDate(canceledAt);
    banners.push(
      <Banner
        key="canceled"
        tone="slate"
        icon={XCircle}
        title={when ? `Subscription canceled on ${when}` : 'Subscription canceled'}
        body="Reactivate any time to restore your team's full plan access."
        ctaLabel="Reactivate"
        onCta={onUpgrade}
      />,
    );
  }

  if (state === 'enterprise') {
    banners.push(
      <Banner
        key="ent"
        tone="violet"
        icon={Sparkles}
        title="Enterprise plan managed by contract"
        body="Seat changes, usage adjustments, and renewal dates are handled with your account team."
        ctaLabel="Contact account team"
        ctaIcon={Mail}
        onCta={onContactSales}
      />,
    );
  }

  if (state === 'free') {
    banners.push(
      <Banner
        key="free"
        tone="indigo"
        icon={Sparkles}
        title="Upgrade available"
        body="Move to a paid plan to unlock higher limits, Pulse, and Campaign Builder."
        ctaLabel="Compare plans"
        onCta={onSeePlans}
      />,
    );
  }

  for (const w of usageWarnings) {
    banners.push(
      <Banner
        key={`u-${w.label}`}
        tone={w.pct >= 100 ? 'red' : 'amber'}
        icon={AlertTriangle}
        title={`${w.label} at ${w.pct}% of plan limit`}
        body={`${w.used} of ${w.limit} used this period.`}
        ctaLabel="See plans"
        onCta={onSeePlans}
      />,
    );
  }

  if (banners.length === 0) return null;

  return <div className="space-y-3">{banners}</div>;
}

interface BannerProps {
  tone: 'amber' | 'red' | 'slate' | 'indigo' | 'violet';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  ctaLabel: string;
  ctaIcon?: React.ComponentType<{ className?: string }>;
  onCta: () => void;
}

const TONE: Record<BannerProps['tone'], { bg: string; border: string; iconBg: string; iconText: string; title: string; body: string; cta: string }> = {
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    title: 'text-amber-900',
    body: 'text-amber-800',
    cta: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    iconBg: 'bg-red-100',
    iconText: 'text-red-700',
    title: 'text-red-900',
    body: 'text-red-800',
    cta: 'bg-red-600 hover:bg-red-700 text-white',
  },
  slate: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-700',
    title: 'text-slate-900',
    body: 'text-slate-700',
    cta: 'bg-slate-900 hover:bg-slate-800 text-white',
  },
  indigo: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    iconBg: 'bg-indigo-100',
    iconText: 'text-indigo-700',
    title: 'text-indigo-900',
    body: 'text-indigo-800',
    cta: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  violet: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    iconBg: 'bg-violet-100',
    iconText: 'text-violet-700',
    title: 'text-violet-900',
    body: 'text-violet-800',
    cta: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
};

function Banner({ tone, icon: Icon, title, body, ctaLabel, ctaIcon: CtaIcon, onCta }: BannerProps) {
  const t = TONE[tone];
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border ${t.border} ${t.bg} p-4 sm:flex-row sm:items-start sm:justify-between`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${t.title}`}>{title}</p>
          <p className={`mt-0.5 text-sm ${t.body}`}>{body}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCta}
        className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${t.cta}`}
      >
        {CtaIcon ? <CtaIcon className="h-4 w-4" /> : null}
        {ctaLabel}
        {!CtaIcon ? <ArrowRight className="h-4 w-4" /> : null}
      </button>
    </div>
  );
}