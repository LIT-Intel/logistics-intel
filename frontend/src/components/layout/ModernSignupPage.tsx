import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, User, Check, Search, Ship, BarChart3 } from "lucide-react";
import {
  loginWithGoogle,
  loginWithMicrosoft,
  registerWithEmailPassword,
} from "@/auth/supabaseAuthClient";
import { useAuth } from "@/auth/AuthProvider";

// ─── Left branded panel ────────────────────────────────────────────────────────
function BrandPanel({ inviteMode = false }: { inviteMode?: boolean }) {
  const features = inviteMode
    ? [
        { icon: Check,     text: "Accept your workspace invitation securely" },
        { icon: Check,     text: "Join the correct organization automatically" },
        { icon: Check,     text: "Access tools assigned to your subscription plan" },
      ]
    : [
        { icon: Search,    text: "Search 3.2M+ companies with live shipment data" },
        { icon: Ship,      text: "Track freight movement, lanes, and carrier activity" },
        { icon: BarChart3, text: "Launch outreach campaigns to your best-fit shippers" },
      ];

  return (
    <div className="flex flex-col justify-between rounded-l-[28px] bg-slate-900 px-10 py-10 text-white">
      {/* Logo */}
      <img
        src="/lit-logo-horizontal.svg"
        alt="Logistics Intel"
        className="h-8 w-auto"
        onError={(e) => {
          const el = e.currentTarget;
          el.style.display = "none";
          const parent = el.parentElement;
          if (parent) {
            const text = document.createElement("span");
            text.className = "text-lg font-bold text-white tracking-tight";
            text.textContent = "Logistics Intel";
            parent.insertBefore(text, el);
          }
        }}
      />

      {/* Headline */}
      <div className="my-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-400 ring-1 ring-cyan-400/20">
          {inviteMode ? "Workspace Invitation" : "Free Trial — No credit card required"}
        </div>

        <h2 className="text-3xl font-bold leading-tight text-white">
          {inviteMode
            ? "Join your team on Logistics Intel"
            : "The intelligence layer for freight sales"}
        </h2>

        <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
          {inviteMode
            ? "Your team is waiting. Create your account and get instant access to your shared workspace."
            : "Real-time shipment data, company insights, and outreach tools in one platform built for freight professionals."}
        </p>

        <ul className="mt-8 space-y-4">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-400">
                <Check className="h-3 w-3" />
              </span>
              <span className="text-sm text-slate-300">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-6 border-t border-slate-700/60 pt-6">
        <div>
          <div className="text-2xl font-bold text-white">3.2M+</div>
          <div className="mt-0.5 text-xs uppercase tracking-widest text-slate-500">Companies tracked</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">Live</div>
          <div className="mt-0.5 text-xs uppercase tracking-widest text-slate-500">Shipment intel sync</div>
        </div>
      </div>
    </div>
  );
}

// ─── Social sign-in buttons ────────────────────────────────────────────────────
function SocialButtons({
  onGoogle,
  onMicrosoft,
}: {
  onGoogle: () => void;
  onMicrosoft: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={onGoogle}
        className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt="Google"
          className="h-4 w-4"
        />
        Google
      </button>

      <button
        type="button"
        onClick={onMicrosoft}
        className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
      >
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
          alt="Microsoft"
          className="h-4 w-4"
        />
        Microsoft
      </button>
    </div>
  );
}

// ─── Main signup page ──────────────────────────────────────────────────────────
export default function ModernSignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth?.() || { user: null };

  const inviteToken = (searchParams.get("token") || "").trim();
  const inviteEmail = (searchParams.get("email") || "").trim().toLowerCase();
  const nextParam   = (searchParams.get("next")  || "").trim();
  const isInviteFlow = Boolean(inviteToken);

  const [fullName, setFullName]       = useState("");
  const [email, setEmail]             = useState(inviteEmail);
  const [password, setPassword]       = useState("");
  const [err, setErr]                 = useState("");
  const [loading, setLoading]         = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const postInvitePath = isInviteFlow
    ? `/accept-invite?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : nextParam || "/onboarding";

  useEffect(() => {
    if (inviteEmail) setEmail(inviteEmail);
  }, [inviteEmail]);

  // Already logged-in users get redirected immediately
  useEffect(() => {
    if (user?.id) navigate(postInvitePath, { replace: true });
  }, [user?.id, navigate, postInvitePath]);

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    try {
      setErr("");
      setLoading(true);
      await registerWithEmailPassword({
        fullName,
        email,
        password,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      });

      if (isInviteFlow) {
        setSignupSuccess(true);
        setTimeout(() => navigate(postInvitePath, { replace: true }), 900);
      } else {
        setSignupSuccess(true);
      }
    } catch (e: any) {
      setErr(e?.message || "Sign-up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    try {
      setErr("");
      await loginWithGoogle(postInvitePath);
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed.");
    }
  }

  async function handleMicrosoftSignup() {
    try {
      setErr("");
      await loginWithMicrosoft(postInvitePath);
    } catch (e: any) {
      setErr(e?.message || "Microsoft sign-in failed.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] shadow-2xl shadow-slate-900/20 lg:grid lg:grid-cols-[5fr_6fr]">
        {/* ── Left: brand panel ── */}
        <BrandPanel inviteMode={isInviteFlow} />

        {/* ── Right: form ── */}
        <div className="bg-white px-8 py-10 sm:px-12">
          {/* Top header */}
          <div className="mb-8 flex items-center justify-between">
            <img
              src="/lit-icon-master.svg"
              alt="LIT"
              className="h-8 w-8"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <span className="text-sm text-slate-500">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate(isInviteFlow ? `/login?token=${encodeURIComponent(inviteToken)}${inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""}` : "/login")}
                className="font-semibold text-indigo-600 hover:underline"
              >
                Log In
              </button>
            </span>
          </div>

          {signupSuccess ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-8 w-8" />
              </div>
              <h2 className="mt-5 text-2xl font-bold text-slate-900">
                {isInviteFlow ? "Account created!" : "Check your email"}
              </h2>
              <p className="mt-3 max-w-sm text-sm text-slate-500">
                {isInviteFlow
                  ? "Your account is ready. Taking you to your workspace now…"
                  : `We sent a confirmation link to ${email}. Click it to activate your account and you'll be guided through workspace setup.`}
              </p>
              {!isInviteFlow && (
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="mt-8 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Go to Log In
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mb-7">
                <h1 className="text-2xl font-bold text-slate-900">
                  {isInviteFlow ? "Accept your invitation" : "Create your account"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {isInviteFlow
                    ? "Set a password to join your team."
                    : "Start your free trial — no credit card required."}
                </p>
              </div>

              {err && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {err}
                </div>
              )}

              {/* Social buttons */}
              <SocialButtons onGoogle={handleGoogleSignup} onMicrosoft={handleMicrosoftSignup} />

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium uppercase tracking-widest text-slate-400">or</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Email form */}
              <form onSubmit={handleEmailSignup} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Jane Smith"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      disabled={Boolean(inviteEmail)}
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 disabled:opacity-75"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Creating account…" : isInviteFlow ? "Create Account & Join" : "Create free account"}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-400">
                By signing up you agree to our{" "}
                <a href="https://logisticintel.com/legal/terms" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">Terms</a>
                {" "}and{" "}
                <a href="https://logisticintel.com/legal/privacy" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">Privacy Policy</a>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
