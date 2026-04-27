import React, { useState } from 'react';
import {
  BookOpen,
  Link as LinkIcon,
  Link2,
  LayoutDashboard,
  Users,
  Wallet,
  Wrench,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  PieChart,
  Check,
  Clock,
  X,
  UserPlus,
  QrCode,
  Copy,
  Plus,
  Download,
  ExternalLink,
  Calendar,
  Mail,
  LifeBuoy,
  Image as ImageIcon,
  FileDown,
  Linkedin,
  Newspaper,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { T, Btn } from './tokens';
import { Badge, Card, StatCell, SectionHeader } from './primitives';

const TABS = [
  { k: 'overview',  l: 'Overview',  Icon: LayoutDashboard },
  { k: 'referrals', l: 'Referrals', Icon: Users },
  { k: 'payouts',   l: 'Payouts',   Icon: Wallet },
  { k: 'tools',     l: 'Tools',     Icon: Wrench },
];

const STATUS_BADGE = {
  pending:     { tone: 'warn',    l: 'Pending review' },
  invited:     { tone: 'warn',    l: 'Invited · finish onboarding' },
  active:      { tone: 'success', l: 'Active' },
  suspended:   { tone: 'danger',  l: 'Suspended' },
  deactivated: { tone: 'danger',  l: 'Deactivated' },
};

function StatusBadgeAff({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.active;
  return <Badge tone={s.tone} dot>{s.l}</Badge>;
}

const TIER_LABEL = {
  starter: 'Starter tier',
  growth:  'Growth tier',
  elite:   'Elite tier',
};

function formatTierLine(partner) {
  if (!partner) return '—';
  const tier = TIER_LABEL[partner.tier] || 'Tier pending';
  const rate =
    partner.commissionPct && partner.commissionMonths
      ? `${partner.commissionPct}% recurring / ${partner.commissionMonths} mo`
      : 'Program terms subject to approval';
  const id = partner.refCode ? `AFF-${partner.refCode}` : '—';
  return (
    <>
      Partner ID{' '}
      <span style={{ fontFamily: T.ffMono, color: T.ink }}>{id}</span> · {tier} · {rate}
    </>
  );
}

export default function AffiliateDashboardView({
  affiliateStatus = 'active',
  stripeStatus = 'not_connected',
  partner = null,
  stats = null,
  referrals = [],
  payouts = [],
  activity = [],
  earningsByMonth = [],
  commissionBreakdown = null,
  referralLink = null,
  onCreateReferralLink,
  onConnectStripe,
}) {
  const [tab, setTab] = useState('overview');
  // Suspended OR deactivated partners see the dashboard read-only.
  const readOnly =
    affiliateStatus === 'suspended' || affiliateStatus === 'deactivated';
  const isInvited = affiliateStatus === 'invited';

  return (
    <div
      style={{
        background: T.bgApp,
        minHeight: '100%',
        fontFamily: T.ffBody,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#fff',
          borderBottom: `1px solid ${T.border}`,
          padding: '20px 32px',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontFamily: T.ffDisplay, fontSize: 20, fontWeight: 700,
                  letterSpacing: '-0.02em', color: T.ink,
                }}
              >
                Partner dashboard
              </div>
              <StatusBadgeAff status={affiliateStatus} />
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              {formatTierLine(partner)}
            </div>
          </div>
          {readOnly ? (
            <Badge tone="warn" dot>Read-only · suspended</Badge>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={Btn.ghost}>
                <BookOpen size={13} />
                Partner handbook
              </button>
              <button
                type="button"
                style={{
                  ...Btn.primary,
                  opacity: referralLink ? 1 : 0.55,
                  cursor: referralLink ? 'pointer' : 'not-allowed',
                }}
                disabled={!referralLink}
                onClick={onCreateReferralLink}
                title={referralLink ? undefined : 'Referral links available once your partner record is provisioned'}
              >
                <LinkIcon size={13} />
                New referral link
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex', gap: 4, marginTop: 18, marginBottom: -21,
            flexWrap: 'wrap',
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.k;
            const TabIcon = t.Icon;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                style={{
                  background: 'none', border: 'none',
                  padding: '10px 14px', fontSize: 13, fontWeight: 600,
                  fontFamily: T.ffDisplay,
                  color: active ? T.brand : T.inkSoft, cursor: 'pointer',
                  borderBottom: active ? `2px solid ${T.brand}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <TabIcon size={13} />
                {t.l}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {tab === 'overview' && (
          <OverviewTab
            readOnly={readOnly}
            isInvited={isInvited}
            stripeStatus={stripeStatus}
            stats={stats}
            activity={activity}
            earningsByMonth={earningsByMonth}
            commissionBreakdown={commissionBreakdown}
            onConnectStripe={onConnectStripe}
          />
        )}
        {tab === 'referrals' && (
          <ReferralsTab
            readOnly={readOnly || isInvited}
            referralLink={referralLink}
            referrals={referrals}
          />
        )}
        {tab === 'payouts' && (
          <PayoutsTab
            stripeStatus={stripeStatus}
            partner={partner}
            payouts={payouts}
          />
        )}
        {tab === 'tools' && <ToolsTab readOnly={readOnly || isInvited} partner={partner} />}
      </div>
    </div>
  );
}

/* ── Overview ─────────────────────────────── */

function StripeConnectBanner({ status, onConnectStripe }) {
  const map = {
    not_connected: {
      tone: 'warn',
      t: 'Connect Stripe to receive payouts',
      d: 'Finish Stripe Connect Express onboarding to unlock monthly payouts.',
      cta: 'Connect Stripe',
    },
    onboarding_started: {
      tone: 'warn',
      t: 'Stripe onboarding in progress',
      d: 'Complete the remaining Stripe steps to enable payouts.',
      cta: 'Resume onboarding',
    },
    verification_required: {
      tone: 'warn',
      t: 'Stripe needs additional verification',
      d: 'Upload requested documents in Stripe to continue.',
      cta: 'Open Stripe',
    },
    restricted: {
      tone: 'danger',
      t: 'Payouts restricted',
      d: 'Your Stripe account is restricted. Contact partnerships.',
      cta: 'Contact support',
    },
  }[status];
  if (!map) return null;
  return (
    <div
      style={{
        background: map.tone === 'danger' ? T.redBg : T.amberBg,
        border: `1px solid ${map.tone === 'danger' ? T.redBorder : T.amberBorder}`,
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <AlertTriangle
        size={18}
        color={map.tone === 'danger' ? T.red : T.amber}
        style={{ flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: T.ffDisplay, fontSize: 13.5, fontWeight: 700,
            color: T.ink,
          }}
        >
          {map.t}
        </div>
        <div style={{ fontSize: 12.5, color: T.inkMuted, marginTop: 2 }}>
          {map.d}
        </div>
      </div>
      <button type="button" style={Btn.primary} onClick={onConnectStripe}>
        {map.cta}
        <ArrowRight size={13} />
      </button>
    </div>
  );
}

function InvitedWelcomeCard({ stripeStatus, onConnectStripe }) {
  const isStripeStarted = stripeStatus === 'onboarding_started';
  return (
    <Card style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
        <Badge tone="brand" dot>Welcome to the Partner Program</Badge>
      </div>
      <div
        style={{
          fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700,
          color: T.ink, letterSpacing: '-0.02em', marginTop: 8,
        }}
      >
        One last step — connect Stripe to activate your partnership.
      </div>
      <div
        style={{
          fontSize: 14, color: T.inkSoft, marginTop: 10, lineHeight: 1.55,
          maxWidth: 640,
        }}
      >
        Your invite is claimed. Connect Stripe Connect Express below so we can pay
        out monthly commissions. Stripe handles identity, tax, and bank verification —
        Logistic Intel never sees your details. Your referral link goes live as soon
        as Stripe payouts are enabled.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        <button type="button" style={Btn.primary} onClick={onConnectStripe}>
          {isStripeStarted ? 'Resume Stripe onboarding' : 'Connect Stripe'}
          <ArrowRight size={13} />
        </button>
        <a
          href="mailto:partnerships@logisticintel.com"
          style={{ ...Btn.ghost, textDecoration: 'none' }}
        >
          Email partnerships
        </a>
      </div>
    </Card>
  );
}

function OverviewTab({
  readOnly,
  isInvited,
  stripeStatus,
  stats,
  activity,
  earningsByMonth,
  commissionBreakdown,
  onConnectStripe,
}) {
  // For invited partners, show only the welcome card. KPIs/charts/activity
  // would all be zeros — empty zeros aren't helpful at this stage and the
  // user just needs the Stripe CTA front and centre.
  if (isInvited) {
    return (
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 16,
          maxWidth: 1240, margin: '0 auto',
        }}
      >
        <InvitedWelcomeCard
          stripeStatus={stripeStatus}
          onConnectStripe={onConnectStripe}
        />
      </div>
    );
  }

  const needsStripe = stripeStatus !== 'payouts_enabled';
  const safeStats = stats || {
    lifetimeEarnings: '$0',
    lifetimeDelta: null,
    available: '$0',
    availableDelta: 'vs $50 min',
    pending: '$0',
    pendingDelta: null,
    activeReferrals: '0',
    activeReferralsDelta: null,
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        maxWidth: 1240, margin: '0 auto',
      }}
    >
      {needsStripe && !readOnly && (
        <StripeConnectBanner status={stripeStatus} onConnectStripe={onConnectStripe} />
      )}

      {/* KPI row */}
      <Card>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 24,
          }}
        >
          <StatCell label="Lifetime earnings" value={safeStats.lifetimeEarnings} delta={safeStats.lifetimeDelta} />
          <StatCell label="Available to pay out" value={safeStats.available} delta={safeStats.availableDelta} />
          <StatCell label="Pending (clears in 30d)" value={safeStats.pending} delta={safeStats.pendingDelta} />
          <StatCell label="Active referrals" value={safeStats.activeReferrals} delta={safeStats.activeReferralsDelta} />
        </div>
      </Card>

      {/* Chart + breakdown */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16,
        }}
      >
        <Card>
          <SectionHeader
            icon={TrendingUp}
            label="Earnings, last 12 months"
            subtitle="Monthly cleared commissions"
          />
          <EarningsChart data={earningsByMonth} />
        </Card>
        <Card>
          <SectionHeader icon={PieChart} label="Commission status" />
          {commissionBreakdown && commissionBreakdown.length > 0 ? (
            commissionBreakdown.map((r) => (
              <div key={r.l} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginBottom: 5,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12.5, color: T.inkMuted,
                      fontFamily: T.ffDisplay, fontWeight: 500,
                    }}
                  >
                    {r.l}
                  </span>
                  <span
                    style={{
                      fontFamily: T.ffMono, fontSize: 13, fontWeight: 600,
                      color: T.ink,
                    }}
                  >
                    {r.v}
                  </span>
                </div>
                <div
                  style={{
                    height: 6, background: T.bgSunken,
                    borderRadius: 3, overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${r.pct}%`, height: '100%',
                      background:
                        r.tone === 'success' ? T.green
                        : r.tone === 'warn' ? T.amber
                        : T.red,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <EmptyMini label="No commissions yet." />
          )}
          <div
            style={{
              height: 1, background: T.borderSoft, margin: '14px 0 12px',
            }}
          />
          <div
            style={{
              fontSize: 11.5, color: T.inkFaint, lineHeight: 1.55,
            }}
          >
            Commissions clear 30 days after invoice payment. Refunds within this window void the commission.
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700, color: T.ink,
            }}
          >
            Recent activity
          </div>
          <button type="button" style={Btn.quiet}>View all</button>
        </div>
        {activity && activity.length > 0 ? (
          activity.map((r, i) => {
            const ActIcon =
              r.tone === 'success' ? Check
              : r.tone === 'warn' ? Clock
              : r.tone === 'danger' ? X
              : r.kind === 'payout' ? Wallet
              : UserPlus;
            return (
              <div
                key={i}
                style={{
                  padding: '14px 20px',
                  borderBottom: i < activity.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div
                  style={{
                    width: 30, height: 30, borderRadius: 7,
                    background:
                      r.tone === 'success' ? T.greenBg
                      : r.tone === 'warn' ? T.amberBg
                      : r.tone === 'danger' ? T.redBg
                      : T.brandSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ActIcon
                    size={13}
                    color={
                      r.tone === 'success' ? T.green
                      : r.tone === 'warn' ? T.amber
                      : r.tone === 'danger' ? T.red
                      : T.brand
                    }
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 600, color: T.ink,
                    }}
                  >
                    {r.t}
                  </div>
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                    {r.d}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: T.ffMono, fontSize: 13, fontWeight: 600,
                    color:
                      r.tone === 'success' ? T.green
                      : r.tone === 'danger' ? T.red
                      : T.ink,
                  }}
                >
                  {r.amt}
                </div>
                <div
                  style={{
                    fontSize: 11.5, color: T.inkFaint,
                    fontFamily: T.ffDisplay, width: 64, textAlign: 'right',
                  }}
                >
                  {r.time}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyRow label="No activity yet. Once referrals start signing up, you'll see them here." />
        )}
      </Card>
    </div>
  );
}

function EarningsChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 180,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.inkFaint, fontSize: 12.5,
          background: T.bgSubtle, borderRadius: 8,
          border: `1px dashed ${T.border}`,
        }}
      >
        No cleared commissions yet — chart will populate after your first paid referral.
      </div>
    );
  }
  const values = data.map((d) => d.value);
  const max = Math.max(...values) || 1;
  const months = data.map((d) => d.label);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 580 + 10},${170 - (v / max) * 150}`)
    .join(' ');
  const area = `10,170 ${pts} 590,170`;
  return (
    <div>
      <svg viewBox="0 0 600 180" style={{ width: '100%', height: 180 }}>
        <defs>
          <linearGradient id="aff-earn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1="0"
            x2="600"
            y1={180 - p * 160 - 10}
            y2={180 - p * 160 - 10}
            stroke={T.borderSoft}
            strokeDasharray="3,3"
          />
        ))}
        <polygon points={area} fill="url(#aff-earn)" />
        <polyline
          points={pts}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={(i / (values.length - 1)) * 580 + 10}
            cy={170 - (v / max) * 150}
            r="3"
            fill="#fff"
            stroke="#3b82f6"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 6, fontSize: 10.5, color: T.inkFaint,
          fontFamily: T.ffDisplay,
        }}
      >
        {months.map((m) => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}

function EmptyMini({ label }) {
  return (
    <div
      style={{
        fontSize: 12.5, color: T.inkFaint,
        padding: '20px 0', textAlign: 'center',
      }}
    >
      {label}
    </div>
  );
}

function EmptyRow({ label }) {
  return (
    <div
      style={{
        padding: '32px 24px', textAlign: 'center',
        fontSize: 12.5, color: T.inkFaint,
        background: T.bgSubtle, borderTop: `1px dashed ${T.border}`,
      }}
    >
      {label}
    </div>
  );
}

/* ── Referrals ─────────────────────────────── */

function ReferralsTab({ readOnly, referralLink, referrals }) {
  const [copied, setCopied] = useState(false);
  const linkAvailable = Boolean(referralLink);
  const displayLink = referralLink || 'Available once your partner record is provisioned.';

  const copy = async () => {
    if (!linkAvailable) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        maxWidth: 1240, margin: '0 auto',
      }}
    >
      <Card>
        <SectionHeader
          icon={LinkIcon}
          label="Your default referral link"
          subtitle="90-day attribution. Tracks signups and subscriptions."
          right={
            !readOnly && (
              <button
                type="button"
                style={{
                  ...Btn.ghost,
                  opacity: linkAvailable ? 1 : 0.55,
                  cursor: linkAvailable ? 'pointer' : 'not-allowed',
                }}
                disabled={!linkAvailable}
              >
                <Plus size={13} />
                New link
              </button>
            )
          }
        />
        <div
          style={{
            display: 'flex', gap: 8, alignItems: 'center',
            background: T.bgSubtle, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: '10px 12px',
          }}
        >
          <Link2 size={14} color={T.inkFaint} />
          <span
            style={{
              flex: 1,
              fontFamily: T.ffMono,
              fontSize: 13,
              color: linkAvailable ? T.ink : T.inkFaint,
            }}
          >
            {displayLink}
          </span>
          <button
            type="button"
            style={{ ...Btn.ghost, padding: '6px 10px', fontSize: 12 }}
            onClick={copy}
            disabled={readOnly || !linkAvailable}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            style={{ ...Btn.ghost, padding: '6px 10px', fontSize: 12 }}
            disabled={readOnly || !linkAvailable}
          >
            <QrCode size={12} />
            QR
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
            marginTop: 18,
            paddingTop: 16,
            borderTop: `1px solid ${T.borderSoft}`,
          }}
        >
          <StatCell label="Clicks (90d)"  value="0" />
          <StatCell label="Signups (90d)" value="0" />
          <StatCell label="Paying"        value="0" />
          <StatCell label="Conversion"    value="—" />
        </div>
      </Card>

      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700,
              color: T.ink, flex: 1,
            }}
          >
            Referred customers
          </div>
          {['All', 'Paying', 'Trialing', 'Churned'].map((f, i) => (
            <button
              key={f}
              type="button"
              style={{
                ...Btn.quiet,
                padding: '5px 10px',
                background: i === 0 ? T.brandSoft : 'transparent',
                color: i === 0 ? T.brand : T.inkSoft,
              }}
            >
              {f}
            </button>
          ))}
          <button type="button" style={Btn.ghost}>
            <Download size={12} />
            Export CSV
          </button>
        </div>
        {referrals && referrals.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.bgSubtle, textAlign: 'left' }}>
                {['Customer', 'Plan', 'Signed up', 'Status', 'MRR', 'Earned', 'Next pays out'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px', fontSize: 10.5, fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: T.inkFaint, fontFamily: T.ffDisplay,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrals.map((r, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: i < referrals.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                  }}
                >
                  <td
                    style={{
                      padding: '12px 16px', fontFamily: T.ffDisplay,
                      fontWeight: 600, color: T.ink,
                    }}
                  >
                    {r.name}
                  </td>
                  <td style={{ padding: '12px 16px', color: T.inkMuted }}>
                    {r.plan}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: T.ffMono, color: T.inkSoft }}>
                    {r.signedUp}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge
                      tone={
                        r.status === 'Paying' ? 'success'
                        : r.status === 'Trialing' ? 'warn'
                        : 'neutral'
                      }
                      dot
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: T.ffMono, color: T.ink }}>
                    {r.mrr}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px', fontFamily: T.ffMono,
                      color: T.brandDeep, fontWeight: 600,
                    }}
                  >
                    {r.earned}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: T.ffMono, color: T.inkSoft }}>
                    {r.payout}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyRow label="No referrals yet. Share your link to start tracking signups." />
        )}
      </Card>
    </div>
  );
}

/* ── Payouts ─────────────────────────────── */

function PayoutsTab({ stripeStatus, partner, payouts }) {
  const connected = stripeStatus === 'payouts_enabled';
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        maxWidth: 1240, margin: '0 auto',
      }}
    >
      <Card>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 12,
              background: connected ? T.greenBg : T.amberBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {connected ? (
              <ShieldCheck size={22} color={T.green} />
            ) : (
              <ShieldAlert size={22} color={T.amber} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  fontFamily: T.ffDisplay, fontSize: 15, fontWeight: 700,
                  color: T.ink,
                }}
              >
                Stripe Connect · Express
              </div>
              <Badge tone={connected ? 'success' : 'warn'} dot>
                {connected ? 'Payouts enabled' : 'Verification required'}
              </Badge>
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>
              Account{' '}
              <span style={{ fontFamily: T.ffMono, color: T.ink }}>
                {partner?.stripeAccountId || '—'}
              </span>{' '}
              · {partner?.payoutCurrency || 'USD'} · Monthly schedule · $50 minimum
            </div>
          </div>
          <button
            type="button"
            style={{ ...Btn.ghost, opacity: connected ? 1 : 0.55, cursor: connected ? 'pointer' : 'not-allowed' }}
            disabled={!connected}
          >
            <ExternalLink size={13} />
            Open Stripe dashboard
          </button>
        </div>
      </Card>

      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700,
              color: T.ink,
            }}
          >
            Payout history
          </div>
          <button type="button" style={Btn.ghost}>
            <Download size={12} />
            Download 1099 report
          </button>
        </div>
        {payouts && payouts.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.bgSubtle, textAlign: 'left' }}>
                {['Period', 'Paid on', 'Amount', 'Commissions', 'Stripe transfer', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px', fontSize: 10.5, fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: T.inkFaint, fontFamily: T.ffDisplay,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.map((r, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: i < payouts.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
                  }}
                >
                  <td
                    style={{
                      padding: '12px 16px', fontFamily: T.ffDisplay,
                      fontWeight: 600, color: T.ink,
                    }}
                  >
                    {r.period}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: T.ffMono, color: T.inkMuted }}>
                    {r.paidOn}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px', fontFamily: T.ffMono,
                      fontWeight: 600, color: T.brandDeep,
                    }}
                  >
                    {r.amount}
                  </td>
                  <td style={{ padding: '12px 16px', color: T.inkMuted }}>
                    {r.commissions}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: T.ffMono, color: T.inkSoft }}>
                    {r.transfer}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge tone={r.tone || 'neutral'} dot>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyRow label="No payouts yet. Payouts run monthly once you have $50+ in cleared commissions." />
        )}
      </Card>
    </div>
  );
}

/* ── Tools ─────────────────────────────── */

function ToolsTab({ readOnly, partner }) {
  const templates = [
    { name: 'Cold intro email',      ch: 'Email',      lines: 3, Icon: Mail },
    { name: 'Warm intro email',      ch: 'Email',      lines: 3, Icon: Mail },
    { name: 'LinkedIn message',      ch: 'LinkedIn',   lines: 2, Icon: Linkedin },
    { name: 'LinkedIn post caption', ch: 'LinkedIn',   lines: 4, Icon: Linkedin },
    { name: 'Newsletter blurb',      ch: 'Newsletter', lines: 3, Icon: Newspaper },
  ];

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16,
        maxWidth: 1240, margin: '0 auto',
      }}
    >
      <Card>
        <SectionHeader
          icon={Mail}
          label="Outreach templates"
          subtitle="Copy-paste. Variables are auto-filled with your link and name."
        />
        {templates.map((r, i) => {
          const RowIcon = r.Icon;
          return (
            <div
              key={r.name}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 0',
                borderBottom: i < templates.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}
            >
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: T.brandSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <RowIcon size={14} color={T.brand} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 600,
                    color: T.ink,
                  }}
                >
                  {r.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5, color: T.inkFaint,
                    fontFamily: T.ffDisplay, letterSpacing: '0.04em',
                  }}
                >
                  {r.ch.toUpperCase()} · {r.lines} variants
                </div>
              </div>
              <button
                type="button"
                style={{ ...Btn.ghost, padding: '6px 10px', fontSize: 12 }}
                disabled={readOnly}
              >
                <Copy size={12} />
                Copy
              </button>
              <button
                type="button"
                style={{ ...Btn.ghost, padding: '6px 10px', fontSize: 12 }}
                disabled={readOnly}
              >
                <Eye size={12} />
                Preview
              </button>
            </div>
          );
        })}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <SectionHeader
            icon={ImageIcon}
            label="Brand assets"
            subtitle="Logos, banners, product shots. Follow brand guidelines."
          />
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            }}
          >
            {['Logo kit', 'Banners', 'Screenshots', 'Icon set', 'One-pager', 'Pitch deck'].map((a) => (
              <button
                key={a}
                type="button"
                style={{
                  ...Btn.ghost,
                  padding: '18px 10px',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <FileDown size={16} />
                {a}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeader icon={LifeBuoy} label="Need a hand?" />
          <div
            style={{
              fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14,
            }}
          >
            {partner?.accountManager ? (
              <>
                Your account manager is{' '}
                <strong style={{ color: T.ink }}>{partner.accountManager}</strong>. Expect replies within one business day.
              </>
            ) : (
              <>
                An account manager will be assigned once your partner record is provisioned. In the meantime, email{' '}
                <a
                  href="mailto:partnerships@logisticintel.com"
                  style={{ color: T.brand, textDecoration: 'underline' }}
                >
                  partnerships@logisticintel.com
                </a>
                .
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                ...Btn.primary,
                opacity: partner?.accountManager ? 1 : 0.55,
                cursor: partner?.accountManager ? 'pointer' : 'not-allowed',
              }}
              disabled={!partner?.accountManager}
            >
              <Calendar size={13} />
              Book 1:1
            </button>
            <button type="button" style={Btn.ghost}>
              <Mail size={13} />
              Email partnerships
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
