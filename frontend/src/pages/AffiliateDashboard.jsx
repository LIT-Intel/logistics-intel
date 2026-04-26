// /app/affiliate — orchestrator that dispatches to the design-system
// affiliate components based on the authenticated user's real affiliate
// state. No fake earnings, no fake referrals, no fake payouts.
//
// Phase B wires:
//   - useAffiliateState reads real Supabase data (partner / referrals /
//     commissions / payouts) when the backend tables exist.
//   - Application form submits to the affiliate-apply edge function.
//   - Stripe Connect button calls stripe-connect-onboard and redirects
//     to the returned account-link URL.
//   - When the user returns to /app/affiliate?stripe=return we hit
//     stripe-connect-status to refresh the partner's stripe_status.
//
// Design source: docs/design-specs/lit-design-system/affiliate/

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import {
  useAffiliateState,
  submitAffiliateApplication,
  startStripeConnect,
  refreshStripeConnectStatus,
} from '@/lib/affiliate';
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

function GlobalNotice({ tone, children, onDismiss }) {
  if (!children) return null;
  const palette = {
    success: { bg: T.greenBg, border: T.greenBorder, color: T.green },
    warn:    { bg: T.amberBg, border: T.amberBorder, color: T.amber },
    danger:  { bg: T.redBg,   border: T.redBorder,   color: T.red },
    info:    { bg: T.brandSoft, border: T.brandBorder, color: T.brand },
  }[tone || 'info'];
  return (
    <div
      style={{
        margin: '16px 32px 0',
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: T.ffBody,
      }}
    >
      <div style={{ flex: 1, fontSize: 12.5, color: T.inkMuted }}>
        <strong style={{ color: palette.color, fontFamily: T.ffDisplay }}>
          {tone === 'success' ? 'Done' : tone === 'danger' ? 'Error' : 'Heads up'}:
        </strong>{' '}
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.inkSoft, fontSize: 16, padding: '4px 8px',
            fontFamily: T.ffBody,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function AffiliateDashboard() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;
  const aff = useAffiliateState(userId);
  const location = useLocation();
  const navigate = useNavigate();

  const [notice, setNotice] = useState(null);
  const [stripeBusy, setStripeBusy] = useState(false);

  const submittedAt = useMemo(
    () => formatSubmittedAt(aff.application?.submittedAt),
    [aff.application?.submittedAt],
  );

  // Handle ?stripe=return / ?stripe=refresh query params after Stripe
  // Connect onboarding redirects the user back.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const stripeFlag = params.get('stripe');
    if (!stripeFlag) return;
    let cancelled = false;
    (async () => {
      if (stripeFlag === 'return' || stripeFlag === 'refresh') {
        const result = await refreshStripeConnectStatus();
        if (cancelled) return;
        if (result.ok) {
          if (result.stripe_status === 'payouts_enabled') {
            setNotice({ tone: 'success', text: 'Stripe payouts are now enabled.' });
          } else if (result.stripe_status === 'verification_required') {
            setNotice({
              tone: 'warn',
              text: 'Stripe still needs additional verification — open your Stripe dashboard to finish.',
            });
          } else if (stripeFlag === 'refresh') {
            setNotice({
              tone: 'info',
              text: 'Stripe onboarding paused. Resume when you’re ready.',
            });
          }
          await aff.refresh();
        } else if (result.code === 'STRIPE_NOT_CONFIGURED') {
          setNotice({
            tone: 'warn',
            text: 'Stripe Connect is not configured yet. Contact support to enable payouts.',
          });
        } else {
          setNotice({
            tone: 'danger',
            text: result.error || 'Could not refresh Stripe status.',
          });
        }
      }
      // Strip the stripe= param from the URL so reloads don't re-trigger.
      params.delete('stripe');
      const next = `${location.pathname}${
        params.toString() ? `?${params.toString()}` : ''
      }`;
      navigate(next, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const handleSubmitApplication = useCallback(
    async (form) => {
      const result = await submitAffiliateApplication(form);
      if (result?.ok) {
        await aff.refresh();
      }
      return result;
    },
    [aff],
  );

  const handleConnectStripe = useCallback(async () => {
    if (stripeBusy) return;
    setStripeBusy(true);
    try {
      const result = await startStripeConnect();
      if (!result?.ok) {
        if (result?.code === 'STRIPE_NOT_CONFIGURED') {
          setNotice({
            tone: 'warn',
            text: 'Stripe Connect is not configured yet. Contact support to enable payouts.',
          });
        } else {
          setNotice({
            tone: 'danger',
            text: result?.error || 'Could not start Stripe Connect onboarding.',
          });
        }
        return;
      }
      if (result.url) {
        window.location.href = result.url;
      }
    } finally {
      setStripeBusy(false);
    }
  }, [stripeBusy]);

  if (authLoading || aff.loading) {
    return <LoadingShell />;
  }

  // Bare-shell wrapper that lets us hang a top-of-page notice across
  // every state without having to thread it into each design component.
  const wrapWithNotice = (node) => (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {notice && (
        <GlobalNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </GlobalNotice>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>{node}</div>
    </div>
  );

  switch (aff.status) {
    case 'no_backend':
      return wrapWithNotice(
        <AffiliateApplication state="form" backendUnavailable />,
      );

    case 'not_applied':
      return wrapWithNotice(
        <AffiliateApplication
          state="form"
          onSubmit={handleSubmitApplication}
        />,
      );

    case 'pending':
      return wrapWithNotice(
        <AffiliateApplication
          state="pending"
          submittedAt={submittedAt}
          reviewer={aff.application?.reviewer}
        />,
      );

    case 'rejected':
      return wrapWithNotice(
        <AffiliateApplication
          state="rejected"
          rejectionReason={aff.application?.rejectionReason}
        />,
      );

    case 'active':
    case 'suspended':
      return wrapWithNotice(
        <AffiliateDashboardView
          affiliateStatus={aff.status}
          stripeStatus={aff.partner?.stripeStatus || 'not_connected'}
          partner={aff.partner}
          referralLink={aff.referralLink}
          stats={aff.stats}
          referrals={aff.referrals}
          payouts={aff.payouts}
          activity={aff.activity}
          earningsByMonth={aff.earningsByMonth}
          commissionBreakdown={null}
          onConnectStripe={handleConnectStripe}
        />,
      );

    default:
      return wrapWithNotice(
        <AffiliateApplication state="form" backendUnavailable />,
      );
  }
}
