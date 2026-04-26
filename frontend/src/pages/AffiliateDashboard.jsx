// /app/affiliate — orchestrator that dispatches to the design-system
// affiliate components based on the authenticated user's real affiliate
// state. No fake earnings, no fake referrals, no fake payouts. When the
// affiliate backend isn't live yet (Phase A), this renders an honest
// application shell with submit disabled.
//
// Design source: docs/design-specs/lit-design-system/affiliate/
//   - AffiliateApplication.jsx
//   - AffiliateDashboard.jsx
//   - StripeConnectFlow.jsx
//   - tokens.jsx

import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useAffiliateState } from '@/lib/affiliate';
import AffiliateApplication from '@/components/affiliate/AffiliateApplication';
import AffiliateDashboardView from '@/components/affiliate/AffiliateDashboardView';
import { T } from '@/components/affiliate/tokens';

function formatSubmittedAt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return null;
  }
}

function LoadingShell() {
  return (
    <div
      style={{
        background: T.bgApp,
        minHeight: '100%',
        fontFamily: T.ffBody,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: `3px solid ${T.bgSunken}`,
          borderTopColor: T.brand,
          animation: 'lit-aff-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes lit-aff-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AffiliateDashboard() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;
  const aff = useAffiliateState(userId);

  const submittedAt = useMemo(
    () => formatSubmittedAt(aff.application?.submittedAt),
    [aff.application?.submittedAt]
  );

  if (authLoading || aff.loading) {
    return <LoadingShell />;
  }

  switch (aff.status) {
    case 'no_backend':
      return <AffiliateApplication state="form" backendUnavailable />;

    case 'not_applied':
      return <AffiliateApplication state="form" />;

    case 'pending':
      return (
        <AffiliateApplication
          state="pending"
          submittedAt={submittedAt}
          reviewer={aff.application?.reviewer}
        />
      );

    case 'rejected':
      return (
        <AffiliateApplication
          state="rejected"
          rejectionReason={aff.application?.rejectionReason}
        />
      );

    case 'active':
    case 'suspended':
      return (
        <AffiliateDashboardView
          affiliateStatus={aff.status}
          stripeStatus={aff.partner?.stripeStatus || 'not_connected'}
          partner={aff.partner}
          referralLink={aff.referralLink}
          stats={null}
          referrals={[]}
          payouts={[]}
          activity={[]}
          earningsByMonth={[]}
          commissionBreakdown={null}
        />
      );

    default:
      return <AffiliateApplication state="form" backendUnavailable />;
  }
}
