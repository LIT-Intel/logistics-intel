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
        {tab === 'tools' && (
          <ToolsTab
            readOnly={readOnly || isInvited}
            partner={partner}
            referralLink={referralLink}
          />
        )}
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

function buildUtmUrl(baseUrl, source, medium, campaign) {
  if (!baseUrl) return '';
  try {
    const u = new URL(baseUrl);
    if (source)   u.searchParams.set('utm_source', source);
    if (medium)   u.searchParams.set('utm_medium', medium);
    if (campaign) u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch {
    return baseUrl;
  }
}

const TEMPLATE_CATALOG = [
  {
    id: 'cold-email',
    name: 'Cold intro email',
    channel: 'Email',
    icon: Mail,
    body: (link) => [
      `Subject: Live shipment data on the freight teams you already know`,
      ``,
      `Hi {first name},`,
      ``,
      `If you're working with shippers, brokers, or freight forwarders, you'll appreciate Logistic Intel — they pull live customs and ocean data on 3.2M+ companies, with monthly shipment volumes, lane breakdowns, and verified contacts.`,
      ``,
      `It replaces the "I think they import a lot" guesswork with hard numbers, and it's becoming the standard playbook on freight sales teams.`,
      ``,
      `Worth a 15-minute look?`,
      `${link}`,
      ``,
      `— {your name}`,
    ].join('\n'),
  },
  {
    id: 'warm-email',
    name: 'Warm intro email',
    channel: 'Email',
    icon: Mail,
    body: (link) => [
      `Subject: Thought of you — Logistic Intel`,
      ``,
      `Hi {first name},`,
      ``,
      `Quick one. You came to mind when I was using Logistic Intel earlier this week — given how dialed-in you are on {company} and the lanes you cover, I think you'd get a lot out of it.`,
      ``,
      `It's freight intelligence: live import shipments, lane volumes, carrier mixes, and verified decision-maker contacts. Shows you exactly which shippers are moving freight, where it's going, and how to reach the right person.`,
      ``,
      `If you want to take a look: ${link}`,
      ``,
      `Happy to walk through it together if useful.`,
      ``,
      `— {your name}`,
    ].join('\n'),
  },
  {
    id: 'linkedin-dm',
    name: 'LinkedIn DM',
    channel: 'LinkedIn',
    icon: Linkedin,
    body: (link) => [
      `Hey {first name} — saw your work on {recent post / lane}.`,
      ``,
      `Wanted to flag Logistic Intel. It pulls live import shipments, monthly volumes, lane mix, and verified contacts on shippers — basically replaces the "guess which companies import freight" step. The freight teams I work with use it to source new accounts.`,
      ``,
      `If it's useful: ${link}`,
    ].join('\n'),
  },
  {
    id: 'linkedin-post',
    name: 'LinkedIn post',
    channel: 'LinkedIn',
    icon: Linkedin,
    body: (link) => [
      `If you're in freight sales and still building target lists from D&B exports, you're behind.`,
      ``,
      `Logistic Intel pulls live import shipments on 3.2M+ companies — monthly volumes, lane breakdown, carrier mix, and verified contacts. You can see exactly who's moving freight, where it's going, and how to reach the right person.`,
      ``,
      `It's the difference between "this company might import" and "this company imported 412 TEUs from Shanghai last month." Try it: ${link}`,
    ].join('\n'),
  },
  {
    id: 'newsletter',
    name: 'Newsletter blurb',
    channel: 'Newsletter',
    icon: Newspaper,
    body: (link) => [
      `**Tool of the week: Logistic Intel**`,
      ``,
      `If you sell into shippers or brokers, this one's worth a click. Logistic Intel surfaces live customs and ocean shipment data on 3.2M+ companies — monthly volumes, lane mix, carrier breakdown, and verified contacts in one workspace. Replaces the "I think they import a lot" guesswork with hard numbers.`,
      ``,
      `Take a look: ${link}`,
    ].join('\n'),
  },
];

function ToolsTab({ readOnly, partner, referralLink }) {
  const linkActive = Boolean(referralLink);
  const linkLabel = referralLink || 'Referral link inactive — finish onboarding to activate';

  // Copy state per-template so the UI shows "Copied" briefly.
  const [copiedId, setCopiedId] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  // UTM builder state
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const utmUrl = referralLink
    ? buildUtmUrl(referralLink, utmSource.trim(), utmMedium.trim(), utmCampaign.trim())
    : '';
  const [utmCopied, setUtmCopied] = useState(false);

  async function copyToClipboard(text, key) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (key === 'utm') {
        setUtmCopied(true);
        setTimeout(() => setUtmCopied(false), 1500);
      } else {
        setCopiedId(key);
        setTimeout(() => setCopiedId((id) => (id === key ? null : id)), 1500);
      }
    } catch {
      /* ignore — clipboard may be blocked */
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
        gap: 16,
        maxWidth: 1240,
        margin: '0 auto',
      }}
    >
      {/* ── Left column ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Referral link + UTM builder */}
        <Card>
          <SectionHeader
            icon={LinkIcon}
            label="Referral link"
            subtitle={
              linkActive
                ? 'Share this link in any channel. Attribution is automatic.'
                : 'Activate by completing onboarding and Stripe Connect.'
            }
            right={
              linkActive ? (
                <Badge tone="success" dot>active</Badge>
              ) : (
                <Badge tone="warn" dot>inactive</Badge>
              )
            }
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: T.bgSubtle,
              border: `1px solid ${T.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <code
              style={{
                flex: 1,
                fontFamily: T.ffMono,
                fontSize: 12.5,
                color: linkActive ? T.ink : T.inkFaint,
                wordBreak: 'break-all',
              }}
            >
              {linkLabel}
            </code>
            <button
              type="button"
              style={{
                ...Btn.primary,
                padding: '7px 12px',
                fontSize: 12,
                opacity: linkActive && !readOnly ? 1 : 0.55,
                cursor: linkActive && !readOnly ? 'pointer' : 'not-allowed',
              }}
              disabled={!linkActive || readOnly}
              onClick={() => copyToClipboard(referralLink, 'main-link')}
            >
              {copiedId === 'main-link' ? <Check size={12} /> : <Copy size={12} />}
              {copiedId === 'main-link' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* UTM builder */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: `1px solid ${T.borderSoft}`,
            }}
          >
            <div
              style={{
                fontFamily: T.ffDisplay,
                fontSize: 12.5,
                fontWeight: 700,
                color: T.ink,
                marginBottom: 4,
              }}
            >
              UTM campaign builder
            </div>
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 12 }}>
              Tag your link to track which channel converts best.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
              }}
            >
              <UtmInput label="Source"   placeholder="newsletter" value={utmSource}   onChange={setUtmSource} />
              <UtmInput label="Medium"   placeholder="email"      value={utmMedium}   onChange={setUtmMedium} />
              <UtmInput label="Campaign" placeholder="april-2026" value={utmCampaign} onChange={setUtmCampaign} />
            </div>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 12px',
                background: T.bgSubtle,
                border: `1px solid ${T.borderSoft}`,
                borderRadius: 10,
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontFamily: T.ffMono,
                  fontSize: 11.5,
                  color: linkActive ? T.ink : T.inkFaint,
                  wordBreak: 'break-all',
                }}
              >
                {utmUrl || 'Activate your referral link first.'}
              </code>
              <button
                type="button"
                style={{
                  ...Btn.ghost,
                  padding: '6px 10px',
                  fontSize: 11.5,
                  opacity: utmUrl && !readOnly ? 1 : 0.55,
                  cursor: utmUrl && !readOnly ? 'pointer' : 'not-allowed',
                }}
                disabled={!utmUrl || readOnly}
                onClick={() => copyToClipboard(utmUrl, 'utm')}
              >
                {utmCopied ? <Check size={11} /> : <Copy size={11} />}
                {utmCopied ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </div>
        </Card>

        {/* Outreach templates */}
        <Card>
          <SectionHeader
            icon={Mail}
            label="Outreach templates"
            subtitle="Copy ready-to-send messages with your referral link injected."
          />
          {TEMPLATE_CATALOG.map((tpl, i) => {
            const RowIcon = tpl.icon;
            const body = tpl.body(referralLink || '{your referral link}');
            const expanded = previewId === tpl.id;
            return (
              <div
                key={tpl.id}
                style={{
                  padding: '12px 0',
                  borderBottom:
                    i < TEMPLATE_CATALOG.length - 1
                      ? `1px solid ${T.borderSoft}`
                      : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: T.brandSoft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <RowIcon size={14} color={T.brand} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: T.ffDisplay,
                        fontSize: 13,
                        fontWeight: 600,
                        color: T.ink,
                      }}
                    >
                      {tpl.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: T.inkFaint,
                        fontFamily: T.ffDisplay,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {tpl.channel.toUpperCase()}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{ ...Btn.ghost, padding: '6px 10px', fontSize: 12 }}
                    disabled={readOnly}
                    onClick={() => setPreviewId(expanded ? null : tpl.id)}
                  >
                    <Eye size={12} />
                    {expanded ? 'Hide' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    style={{ ...Btn.ghost, padding: '6px 10px', fontSize: 12 }}
                    disabled={readOnly}
                    onClick={() => copyToClipboard(body, tpl.id)}
                  >
                    {copiedId === tpl.id ? <Check size={12} /> : <Copy size={12} />}
                    {copiedId === tpl.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {expanded && (
                  <pre
                    style={{
                      marginTop: 10,
                      padding: 12,
                      background: T.bgSubtle,
                      border: `1px solid ${T.borderSoft}`,
                      borderRadius: 10,
                      fontFamily: T.ffMono,
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: T.ink,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {body}
                  </pre>
                )}
              </div>
            );
          })}
          {!linkActive && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                background: T.amberBg,
                border: `1px solid ${T.amberBorder}`,
                borderRadius: 10,
                fontSize: 12,
                color: T.inkMuted,
                lineHeight: 1.55,
              }}
            >
              Templates show a placeholder where your referral link will go.
              Activate the link to populate it automatically.
            </div>
          )}
        </Card>
      </div>

      {/* ── Right column ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Brand assets — honest empty state until real files ship */}
        <Card>
          <SectionHeader
            icon={ImageIcon}
            label="Brand assets"
            subtitle="Logos, banners, screenshots, and pitch decks."
            right={<Badge tone="neutral">Coming soon</Badge>}
          />
          <div
            style={{
              padding: '24px 16px',
              background: T.bgSubtle,
              border: `1px dashed ${T.border}`,
              borderRadius: 10,
              fontSize: 12.5,
              color: T.inkSoft,
              lineHeight: 1.55,
              textAlign: 'center',
            }}
          >
            We're polishing the partner asset kit (logos, banners, deck, screenshots).
            We'll email approved partners the moment downloads are live.
          </div>
        </Card>

        {/* Support card */}
        <Card>
          <SectionHeader icon={LifeBuoy} label="Need a hand?" />
          <div
            style={{
              fontSize: 12.5,
              color: T.inkSoft,
              lineHeight: 1.6,
              marginBottom: 14,
            }}
          >
            {partner?.accountManagerEmail ? (
              <>
                Your account manager is{' '}
                <a
                  href={`mailto:${partner.accountManagerEmail}`}
                  style={{ color: T.brand, textDecoration: 'underline' }}
                >
                  {partner.accountManagerEmail}
                </a>
                . Expect replies within one business day.
              </>
            ) : (
              <>
                Email{' '}
                <a
                  href="mailto:partnerships@logisticintel.com"
                  style={{ color: T.brand, textDecoration: 'underline' }}
                >
                  partnerships@logisticintel.com
                </a>{' '}
                — every partner gets a reply within one business day.
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={`mailto:${partner?.accountManagerEmail || 'partnerships@logisticintel.com'}`}
              style={{ ...Btn.primary, textDecoration: 'none' }}
            >
              <Mail size={13} />
              Email partnerships
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}

function UtmInput({ label, placeholder, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.inkMuted,
          fontFamily: T.ffDisplay,
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '7px 10px',
          fontSize: 12.5,
          fontFamily: T.ffMono,
          color: T.ink,
          background: T.bgCanvas,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}
