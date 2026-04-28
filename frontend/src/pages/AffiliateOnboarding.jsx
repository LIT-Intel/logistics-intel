// /affiliate/onboarding — public, partner-branded onboarding for invited
// affiliates. Replaces the old /app/affiliate/invite first-touch which
// redirected logged-out users to the regular /login screen.
//
// Flow:
//   1. Validate the token via affiliate-invite-lookup (public).
//   2. If user is logged out → show partner-branded auth (sign up by default,
//      or "I already have an account" toggle to sign in). Email is pre-filled
//      from the invite and locked. Name/company are pre-filled, editable.
//      User must accept partner terms to proceed.
//   3. After auth → call accept-affiliate-invite to claim → redirect to
//      /app/affiliate where Stripe Connect can be activated.
//   4. If user is already logged in → claim immediately and redirect.
//
// The invite token is the authorization for the lookup; the page never
// shows it back to the user verbatim — but it does preserve it through the
// auth handshake so we can claim it after sign-in.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Loader2,
  Mail,
  Lock,
  User as UserIcon,
  Building2,
  Award,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import {
  signInWithEmailPassword,
  registerWithEmailPassword,
  supabase,
} from "@/auth/supabaseAuthClient";
import { useAuth } from "@/auth/AuthProvider";
import { T, Btn } from "@/components/affiliate/tokens";
import { Badge, Card } from "@/components/affiliate/primitives";

// ── API helpers ─────────────────────────────────────────────────────────
async function callInviteLookup(token) {
  const url = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/affiliate-invite-lookup`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok && data.ok !== true) return { ok: false, status: res.status, ...data };
  return data;
}

async function callAcceptInvite(token) {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data: sess } = await supabase.auth.getSession();
  const accessToken = sess?.session?.access_token;
  if (!accessToken) return { ok: false, code: "NO_SESSION", error: "Not authenticated" };
  const url = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/accept-affiliate-invite`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok && data.ok !== true) return { ok: false, status: res.status, ...data };
  return data;
}

// ── Layout shell ────────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bgApp,
        fontFamily: T.ffBody,
        color: T.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 980 }}>{children}</div>
    </div>
  );
}

// Two-column layout: left = invite/value side, right = action card.
function Split({ left, right }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 5fr) minmax(0, 6fr)",
        gap: 28,
        alignItems: "stretch",
      }}
    >
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

function ResponsiveStyle() {
  return (
    <style>{`
      @media (max-width: 880px) {
        .lit-aff-onb-split {
          grid-template-columns: 1fr !important;
        }
      }
      @keyframes lit-aff-onb-spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}

function ValuePanel({ invite }) {
  const pct = invite?.commission_pct ?? 30;
  const months = invite?.commission_months ?? 12;
  const attribution = invite?.attribution_days ?? 90;
  return (
    <Card style={{ padding: 28, height: "100%" }}>
      <Badge tone="brand" dot>LIT Partner Program</Badge>
      <div
        style={{
          marginTop: 14,
          fontFamily: T.ffDisplay,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          color: T.ink,
        }}
      >
        Welcome to the Partner Program.
      </div>
      <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: T.inkMuted }}>
        You've been personally invited to refer logistics teams to Logistic
        Intel and earn recurring commission on every customer you bring in.
      </div>

      <div
        style={{
          marginTop: 22,
          padding: 16,
          background: T.bgSubtle,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Row icon={Award} label="Commission rate" value={`${pct}%`} sub="recurring on subscription revenue" />
          <Row icon={CalendarDays} label="Commission window" value={`${months} months`} sub="per referred customer" />
          <Row icon={ShieldCheck} label="Attribution window" value={`${attribution} days`} sub="cookie + email match" />
        </div>
      </div>

      <ul
        style={{
          marginTop: 22,
          paddingLeft: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {[
          "Stripe Connect Express — automatic monthly payouts",
          "Real-time referral and earnings dashboard",
          "Partner-ready outreach and email templates",
        ].map((line) => (
          <li
            key={line}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 13.5,
              color: T.inkMuted,
              lineHeight: 1.55,
            }}
          >
            <CheckCircle2 size={15} color={T.green} style={{ marginTop: 2, flex: "0 0 auto" }} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div
        style={{
          marginTop: 22,
          padding: 12,
          borderRadius: 10,
          background: T.bgSunken,
          fontSize: 12, color: T.inkSoft, lineHeight: 1.55,
        }}
      >
        Your invite is reserved for <strong style={{ color: T.ink }}>{invite?.email}</strong> only.
        Program terms are listed in your partner agreement.
      </div>
    </Card>
  );
}

function Row({ icon: Icon, label, value, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: T.brandSoft, color: T.brand,
          display: "flex", alignItems: "center", justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        <Icon size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkFaint }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: T.ffMono, fontSize: 18, fontWeight: 600, color: T.brandDeep }}>{value}</span>
          <span style={{ fontSize: 12, color: T.inkSoft }}>{sub}</span>
        </div>
      </div>
    </div>
  );
}

// ── Form primitives ─────────────────────────────────────────────────────
const inputBase = {
  width: "100%",
  padding: "10px 12px 10px 38px",
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  background: T.bgCanvas,
  fontSize: 14,
  fontFamily: T.ffBody,
  color: T.ink,
  outline: "none",
  boxSizing: "border-box",
};
const inputDisabled = {
  ...inputBase,
  background: T.bgSubtle,
  color: T.inkSoft,
  cursor: "not-allowed",
};
const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: T.inkMuted,
  marginBottom: 6,
  letterSpacing: "0.01em",
};

function FieldIcon({ icon: Icon }) {
  return (
    <span
      style={{
        position: "absolute",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        color: T.inkFaint,
        pointerEvents: "none",
        display: "flex",
      }}
    >
      <Icon size={14} />
    </span>
  );
}

// ── Main page ───────────────────────────────────────────────────────────
export default function AffiliateOnboarding() {
  const [params] = useSearchParams();
  const token = useMemo(() => (params.get("token") || "").trim(), [params]);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("loading"); // loading | error | form | claiming | success
  const [errCode, setErrCode] = useState(null);
  const [errMsg, setErrMsg] = useState(null);
  const [invite, setInvite] = useState(null);

  // Form state
  const [mode, setMode] = useState("signup"); // signup | signin
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  // ── Step 1: lookup token ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPhase("error");
      setErrCode("INVITE_NOT_FOUND");
      return;
    }
    (async () => {
      const res = await callInviteLookup(token);
      if (cancelled) return;
      if (!res.ok) {
        setPhase("error");
        setErrCode(res.code ?? "INVITE_NOT_FOUND");
        setErrMsg(res.error ?? null);
        return;
      }
      setInvite(res.invite);
      setName(res.invite?.name ?? "");
      setCompany(res.invite?.company ?? "");
      setPhase("await_auth");
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Step 2: claim once authenticated ──────────────────────────────────
  const claim = useCallback(async () => {
    setPhase("claiming");
    const result = await callAcceptInvite(token);
    if (result.ok || result.code === "ALREADY_PARTNER") {
      setPhase("success");
      setTimeout(() => navigate("/app/affiliate", { replace: true }), 900);
      return;
    }
    setPhase("error");
    setErrCode(result.code ?? null);
    setErrMsg(result.error ?? null);
  }, [token, navigate]);

  // If user is already logged in once invite is validated, claim immediately.
  useEffect(() => {
    if (authLoading) return;
    if (phase !== "await_auth") return;
    if (user) {
      claim();
    } else {
      setPhase("form");
    }
  }, [authLoading, user, phase, claim]);

  // ── Form handlers ─────────────────────────────────────────────────────
  async function onSignup(e) {
    e?.preventDefault();
    if (!invite?.email) return;
    if (!acceptedTerms) {
      setFormErr("You must accept the partner terms to continue.");
      return;
    }
    if (!password || password.length < 8) {
      setFormErr("Password must be at least 8 characters.");
      return;
    }
    setFormErr("");
    setBusy(true);
    try {
      const data = await registerWithEmailPassword({
        fullName: name || invite.name || "",
        email: invite.email,
        password,
      });
      // If session was returned (email confirmation disabled), go straight to claim.
      if (data?.session) {
        await claim();
        return;
      }
      // If email confirmation is required, attempt sign-in immediately. With
      // most Supabase projects this just works because email confirmation
      // is disabled for invited flows. If it fails, surface the message.
      try {
        await signInWithEmailPassword(invite.email, password);
        await claim();
      } catch (signInErr) {
        setBusy(false);
        setFormErr(
          "Account created. Please confirm your email, then return to this link to finish.",
        );
      }
    } catch (err) {
      setBusy(false);
      const msg = err?.message || "Sign-up failed.";
      // If the user already exists, switch to sign-in mode automatically.
      if (/registered|exist|already/i.test(msg)) {
        setMode("signin");
        setFormErr("An account exists for this email. Sign in to claim your invite.");
      } else {
        setFormErr(msg);
      }
    }
  }

  async function onSignin(e) {
    e?.preventDefault();
    if (!invite?.email) return;
    if (!acceptedTerms) {
      setFormErr("You must accept the partner terms to continue.");
      return;
    }
    if (!password) {
      setFormErr("Enter your password.");
      return;
    }
    setFormErr("");
    setBusy(true);
    try {
      await signInWithEmailPassword(invite.email, password);
      await claim();
    } catch (err) {
      setBusy(false);
      setFormErr(err?.message || "Sign-in failed.");
    }
  }

  // ── Renderers ─────────────────────────────────────────────────────────
  if (phase === "loading" || phase === "await_auth") {
    return (
      <Shell>
        <ResponsiveStyle />
        <Card style={{ padding: 32, textAlign: "center" }}>
          <Loader2
            size={22}
            color={T.brand}
            style={{ animation: "lit-aff-onb-spin 0.9s linear infinite" }}
          />
          <div style={{ marginTop: 12, fontSize: 14, color: T.inkSoft }}>
            Validating your partner invitation…
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === "claiming") {
    return (
      <Shell>
        <ResponsiveStyle />
        <Card style={{ padding: 32, textAlign: "center" }}>
          <Loader2
            size={22}
            color={T.brand}
            style={{ animation: "lit-aff-onb-spin 0.9s linear infinite" }}
          />
          <div style={{ marginTop: 12, fontFamily: T.ffDisplay, fontSize: 16, fontWeight: 700, color: T.ink }}>
            Activating your partner account…
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: T.inkSoft }}>
            One moment — this only takes a second.
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === "success") {
    return (
      <Shell>
        <ResponsiveStyle />
        <Card style={{ padding: 36, textAlign: "center" }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 14,
              background: T.greenBg, color: T.green,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 18px",
            }}
          >
            <CheckCircle2 size={26} />
          </div>
          <div style={{ fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>
            Welcome to the Partner Program
          </div>
          <div style={{ marginTop: 10, fontSize: 14, color: T.inkMuted, lineHeight: 1.6 }}>
            Your partner account is active. Heading to your dashboard so you
            can connect Stripe and start sharing your referral link.
          </div>
          <div style={{ marginTop: 22 }}>
            <Link to="/app/affiliate" style={{ ...Btn.primary, textDecoration: "none" }}>
              Continue <ArrowRight size={13} />
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === "error") {
    const ERROR_TITLE = {
      INVITE_NOT_FOUND: "Invitation not found",
      ALREADY_CLAIMED: "Invitation already claimed",
      REVOKED: "Invitation revoked",
      EXPIRED: "Invitation expired",
      ALREADY_PARTNER: "You're already a partner",
    };
    const ERROR_BODY = {
      INVITE_NOT_FOUND: "This invitation link is invalid or no longer exists. Open the link from the email exactly as you received it, or contact the partnerships team.",
      ALREADY_CLAIMED: "This invitation has already been claimed. If that wasn't you, contact the partnerships team.",
      REVOKED: "This invitation has been revoked. Contact the partnerships team if you believe this is a mistake.",
      EXPIRED: "This invitation has expired. Ask the partnerships team to send a new one.",
      ALREADY_PARTNER: "You already have an active partner account. Heading to your dashboard.",
    };
    const title = (errCode && ERROR_TITLE[errCode]) || "Couldn't accept this invitation";
    const body = (errCode && ERROR_BODY[errCode]) || errMsg || "Something went wrong. Try again or contact partnerships@logisticintel.com.";

    if (errCode === "ALREADY_PARTNER") {
      // Auto-redirect rather than dead-end the user.
      setTimeout(() => navigate("/app/affiliate", { replace: true }), 1200);
    }

    return (
      <Shell>
        <ResponsiveStyle />
        <Card style={{ padding: 32, textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 12,
              background: T.amberBg, color: T.amber,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            {errCode === "EXPIRED" ? <Hourglass size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div style={{ fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>
            {title}
          </div>
          <div style={{ marginTop: 10, fontSize: 13.5, color: T.inkMuted, lineHeight: 1.6 }}>
            {body}
          </div>
          <div style={{ marginTop: 22, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <a
              href="mailto:partnerships@logisticintel.com"
              style={{ ...Btn.ghost, textDecoration: "none" }}
            >
              Contact partnerships
            </a>
            <Link to="/" style={{ ...Btn.primary, textDecoration: "none" }}>
              Back to home <ArrowRight size={13} />
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  // ── form (logged-out) ─────────────────────────────────────────────────
  const isSignup = mode === "signup";
  return (
    <Shell>
      <ResponsiveStyle />
      <div className="lit-aff-onb-split" style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 5fr) minmax(0, 6fr)",
        gap: 28,
        alignItems: "stretch",
      }}>
        <ValuePanel invite={invite} />

        <Card style={{ padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: T.ffDisplay, fontSize: 19, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
              {isSignup ? "Create your partner account" : "Sign in to claim"}
            </div>
            <button
              type="button"
              onClick={() => { setMode(isSignup ? "signin" : "signup"); setFormErr(""); }}
              style={{ ...Btn.quiet, color: T.brand }}
            >
              {isSignup ? "I already have an account" : "I'm new here — sign up"}
            </button>
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4, lineHeight: 1.55 }}>
            {isSignup
              ? "Set a password for your Logistic Intel account. We'll claim your partner invite the moment you finish."
              : "Enter your existing password and we'll attach the partner role to your account."}
          </div>

          {formErr && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                background: T.redBg,
                border: `1px solid ${T.redBorder}`,
                borderRadius: 10,
                fontSize: 13,
                color: T.red,
              }}
            >
              {formErr}
            </div>
          )}

          <form
            onSubmit={isSignup ? onSignup : onSignin}
            style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div>
              <label style={labelStyle}>Email</label>
              <div style={{ position: "relative" }}>
                <FieldIcon icon={Mail} />
                <input
                  type="email"
                  value={invite?.email ?? ""}
                  disabled
                  style={inputDisabled}
                />
              </div>
            </div>

            {isSignup && (
              <>
                <div>
                  <label style={labelStyle}>Full name</label>
                  <div style={{ position: "relative" }}>
                    <FieldIcon icon={UserIcon} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      style={inputBase}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Company or brand <span style={{ color: T.inkFaint, fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ position: "relative" }}>
                    <FieldIcon icon={Building2} />
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Acme Logistics Advisors"
                      style={inputBase}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label style={labelStyle}>{isSignup ? "Create password" : "Password"}</label>
              <div style={{ position: "relative" }}>
                <FieldIcon icon={Lock} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "Minimum 8 characters" : "Your password"}
                  style={inputBase}
                  required
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              </div>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 13,
                color: T.inkMuted,
                lineHeight: 1.5,
                userSelect: "none",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                style={{ marginTop: 3, accentColor: T.brand }}
              />
              <span>
                I accept the{" "}
                <a href="/terms" target="_blank" rel="noreferrer" style={{ color: T.brand, textDecoration: "underline" }}>
                  partner program terms
                </a>{" "}
                and acknowledge that Stripe Connect Express is required to receive payouts.
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              style={{
                ...Btn.primary,
                width: "100%",
                justifyContent: "center",
                padding: "12px 16px",
                fontSize: 14,
                opacity: busy ? 0.6 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? (
                <>
                  <Loader2 size={14} style={{ animation: "lit-aff-onb-spin 0.9s linear infinite" }} />
                  Working…
                </>
              ) : (
                <>
                  {isSignup ? "Create account & activate" : "Sign in & claim invite"}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <div
            style={{
              marginTop: 18,
              fontSize: 12,
              color: T.inkFaint,
              lineHeight: 1.55,
            }}
          >
            Your invitation expires {invite?.expires_at ? new Date(invite.expires_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "soon"}.
            By continuing you agree to receive partner program emails from Logistic Intel.
          </div>
        </Card>
      </div>
    </Shell>
  );
}
