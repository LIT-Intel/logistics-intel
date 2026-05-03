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
  /** `tone` controls the leading-dot color + the tier badge accent only —
   *  the surface is always the same Pulse-Coach dark gradient so the
   *  Billing alerts visually match the Profile-page premium quota cards
   *  and Settings upgrade nudges. */
  tone: 'amber' | 'red' | 'slate' | 'indigo' | 'violet';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  ctaLabel: string;
  ctaIcon?: React.ComponentType<{ className?: string }>;
  onCta: () => void;
}

const TONE_DOT: Record<BannerProps['tone'], string> = {
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  slate: 'bg-slate-400',
  indigo: 'bg-blue-400',
  violet: 'bg-violet-400',
};

const TONE_LABEL: Record<BannerProps['tone'], string> = {
  amber: 'Action needed',
  red: 'Payment issue',
  slate: 'Status',
  indigo: 'Upgrade',
  violet: 'Enterprise',
};

function Banner({ tone, icon: Icon, title, body, ctaLabel, ctaIcon: CtaIcon, onCta }: BannerProps) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 px-5 py-4 sm:px-6"
      style={{
        background: 'linear-gradient(160deg,#0F172A 0%,#1E293B 100%)',
        boxShadow: 'inset 0 -1px 0 rgba(0,240,255,0.18), 0 1px 3px rgba(15,23,42,0.06)',
      }}
    >
      {/* radial accent — same trick as the Profile-page Pulse Coach card */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-50"
        style={{
          background: 'radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)',
        }}
      />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
            style={{
              background: 'rgba(0,240,255,0.10)',
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <Icon className="h-4 w-4" style={{ color: '#00F0FF' }} />
          </div>
          <div className="min-w-0">
            <div
              className="font-display flex items-center gap-2 text-[12.5px] font-bold tracking-wide text-white"
            >
              Pulse Coach
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]`}
                style={{
                  color: '#00F0FF',
                  borderColor: 'rgba(0,240,255,0.35)',
                  background: 'rgba(0,240,255,0.08)',
                  fontFamily: 'ui-monospace,monospace',
                }}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
                {TONE_LABEL[tone]}
              </span>
            </div>
            <p className="font-display mt-1.5 text-[13px] font-semibold text-white">{title}</p>
            <p className="font-body mt-1 text-[12px] leading-snug text-slate-300">{body}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCta}
          className="font-display group/btn relative inline-flex h-8 shrink-0 items-center gap-1.5 self-start overflow-hidden rounded-lg border border-white/10 px-3 text-[11.5px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.35)] transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.45)] sm:self-center"
          style={{
            background: 'linear-gradient(180deg,#0F172A 0%,#0B1220 100%)',
          }}
        >
          {CtaIcon ? <CtaIcon className="h-3 w-3" style={{ color: '#00F0FF' }} /> : null}
          {ctaLabel}
          {!CtaIcon ? <ArrowRight className="h-3 w-3" style={{ color: '#00F0FF' }} /> : null}
        </button>
      </div>
    </div>
  );
}