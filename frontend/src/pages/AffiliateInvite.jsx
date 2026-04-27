// /app/affiliate/invite — invite acceptance page.
//
// Behavior:
//   1. Reads token from ?token=...
//   2. If user is logged out → prompt to sign in / sign up (token preserved
//      via /login?next=/app/affiliate/invite?token=...).
//   3. If user is logged in → calls accept-affiliate-invite. On success,
//      redirects to /app/affiliate. On failure, shows the matching error.
//   4. Idempotent: re-claims by the same user just redirect.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Hourglass, LogIn, ArrowRight } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/auth/supabaseAuthClient';
import { T, Btn } from '@/components/affiliate/tokens';
import { Badge, Card } from '@/components/affiliate/primitives';

async function callAcceptInvite(token) {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { data: sess } = await supabase.auth.getSession();
  const accessToken = sess?.session?.access_token;
  if (!accessToken) return { ok: false, error: 'Not authenticated' };
  const url = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/accept-affiliate-invite`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok && data.ok !== true) return { ok: false, status: res.status, ...data };
  return data;
}

const ERROR_LABEL = {
  INVITE_NOT_FOUND: 'This invite link is invalid or has already been removed.',
  ALREADY_CLAIMED: 'This invitation has already been claimed by another account.',
  REVOKED: 'This invitation was revoked. Contact the partnerships team if you believe this is a mistake.',
  EXPIRED: 'This invitation has expired. Ask the partnerships team to send a new one.',
  ALREADY_PARTNER: 'You’re already a partner. Heading to your partner dashboard.',
};

function Centered({ children }) {
  return (
    <div
      style={{
        background: T.bgApp,
        minHeight: '100%',
        padding: '56px 40px',
        fontFamily: T.ffBody,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>{children}</div>
    </div>
  );
}

export default function AffiliateInvite() {
  const [params] = useSearchParams();
  const token = useMemo(() => (params.get('token') || '').trim(), [params]);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('idle'); // idle | claiming | success | error | needs_auth | no_token
  const [errorCode, setErrorCode] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const claim = useCallback(async () => {
    setPhase('claiming');
    const result = await callAcceptInvite(token);
    if (result.ok) {
      setPhase('success');
      // Redirect to dashboard after a moment.
      setTimeout(() => navigate('/app/affiliate', { replace: true }), 800);
    } else if (result.code === 'ALREADY_PARTNER') {
      setPhase('success');
      setTimeout(() => navigate('/app/affiliate', { replace: true }), 800);
    } else {
      setPhase('error');
      setErrorCode(result.code ?? null);
      setErrorMessage(result.error ?? null);
    }
  }, [token, navigate]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setPhase('no_token');
      return;
    }
    if (!user) {
      setPhase('needs_auth');
      return;
    }
    if (phase === 'idle') claim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token]);

  // ── No token in URL ──
  if (phase === 'no_token') {
    return (
      <Centered>
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 12, background: T.redBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
            }}
          >
            <AlertTriangle size={22} color={T.red} />
          </div>
          <div style={{ fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700, color: T.ink }}>
            Missing invite token
          </div>
          <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.55 }}>
            This invitation link is missing the secure token. Open the link from the email we sent you, or contact{' '}
            <a href="mailto:partnerships@logisticintel.com" style={{ color: T.brand, textDecoration: 'underline' }}>
              partnerships@logisticintel.com
            </a>
            .
          </div>
        </Card>
      </Centered>
    );
  }

  // ── User not logged in ──
  if (phase === 'needs_auth') {
    const next = `/app/affiliate/invite?token=${encodeURIComponent(token)}`;
    const loginHref = `/login?next=${encodeURIComponent(next)}`;
    const signupHref = `/signup?next=${encodeURIComponent(next)}`;
    return (
      <Centered>
        <Card style={{ padding: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <Badge tone="brand">LIT Partner Program</Badge>
          </div>
          <div style={{ fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em' }}>
            Accept your partner invitation
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 10, lineHeight: 1.55 }}>
            You’ve been invited to the Logistic Intel Partner Program. Sign in or create an account to claim your invite, then connect Stripe to enable monthly payouts.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            <Link to={loginHref} style={{ ...Btn.primary, textDecoration: 'none' }}>
              <LogIn size={13} /> Sign in to claim
            </Link>
            <Link to={signupHref} style={{ ...Btn.ghost, textDecoration: 'none' }}>
              Create an account
            </Link>
          </div>
          <div
            style={{
              marginTop: 18,
              padding: 12,
              background: T.bgSubtle,
              borderRadius: 10,
              fontSize: 12, color: T.inkFaint,
              fontFamily: T.ffMono,
              wordBreak: 'break-all',
            }}
          >
            Token preserved through login: <span style={{ color: T.ink }}>{token.slice(0, 12)}…</span>
          </div>
        </Card>
      </Centered>
    );
  }

  // ── In progress ──
  if (phase === 'claiming' || authLoading) {
    return (
      <Centered>
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: `3px solid ${T.bgSunken}`, borderTopColor: T.brand,
              animation: 'lit-aff-invite-spin 0.8s linear infinite',
              margin: '0 auto 18px',
            }}
          />
          <style>{`@keyframes lit-aff-invite-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontFamily: T.ffDisplay, fontSize: 18, fontWeight: 700, color: T.ink }}>
            Claiming your invitation…
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 8 }}>
            One moment.
          </div>
        </Card>
      </Centered>
    );
  }

  // ── Success ──
  if (phase === 'success') {
    return (
      <Centered>
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 12, background: T.greenBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
            }}
          >
            <CheckCircle2 size={22} color={T.green} />
          </div>
          <div style={{ fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em' }}>
            Welcome to the Partner Program
          </div>
          <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.55 }}>
            Your partner record is created. Heading to your dashboard so you can connect Stripe and activate payouts.
          </div>
          <div style={{ marginTop: 22 }}>
            <Link to="/app/affiliate" style={{ ...Btn.primary, textDecoration: 'none' }}>
              Continue <ArrowRight size={13} />
            </Link>
          </div>
        </Card>
      </Centered>
    );
  }

  // ── Error states ──
  const errorTitleByCode = {
    EXPIRED: 'Invitation expired',
    REVOKED: 'Invitation revoked',
    ALREADY_CLAIMED: 'Invitation already claimed',
    INVITE_NOT_FOUND: 'Invitation not found',
  };
  const title = errorCode && errorTitleByCode[errorCode]
    ? errorTitleByCode[errorCode]
    : 'Couldn’t accept this invitation';
  const message = (errorCode && ERROR_LABEL[errorCode]) || errorMessage || 'Something went wrong. Try the link again, or contact partnerships@logisticintel.com.';

  return (
    <Centered>
      <Card style={{ padding: 32, textAlign: 'center' }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: 12, background: T.amberBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}
        >
          <Hourglass size={22} color={T.amber} />
        </div>
        <div style={{ fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em' }}>
          {title}
        </div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.55 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 22 }}>
          <button type="button" style={Btn.ghost} onClick={() => claim()}>
            Try again
          </button>
          <Link to="/app/affiliate" style={{ ...Btn.primary, textDecoration: 'none' }}>
            Go to dashboard
          </Link>
        </div>
      </Card>
    </Centered>
  );
}
