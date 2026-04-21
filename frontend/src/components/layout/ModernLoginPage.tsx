import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, Check, Search, Ship, BarChart3 } from "lucide-react";
import {
  loginWithGoogle,
  loginWithMicrosoft,
  loginWithEmailPassword,
} from "@/auth/supabaseAuthClient";
import { useAuth } from "@/auth/AuthProvider";

function BrandPanel() {
  const features = [
    { icon: Search,    text: "Search 3.2M+ companies with live shipment data" },
    { icon: Ship,      text: "Monitor freight movement and carrier activity" },
    { icon: BarChart3, text: "Pick up your campaigns and CRM pipeline" },
  ];

  return (
    <div className="flex flex-col justify-between rounded-l-[28px] bg-slate-900 px-10 py-10 text-white">
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

      <div className="my-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-400 ring-1 ring-cyan-400/20">
          Trusted by freight professionals
        </div>

        <h2 className="text-3xl font-bold leading-tight text-white">
          Welcome back to Logistics Intel
        </h2>

        <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
          Pick up where you left off — shipment data, campaigns, and company intelligence are waiting.
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

export default function ModernLoginPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth?.() || { user: null };

  const inviteToken = (searchParams.get("token") || "").trim();
  const inviteEmail = (searchParams.get("email") || "").trim().toLowerCase();
  const nextParam   = (searchParams.get("next")  || "").trim();

  const signupPath = inviteToken
    ? `/signup?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : "/signup";

  const loginRedirectPath = inviteToken
    ? `/accept-invite?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : nextParam || "/app/dashboard";

  const [err, setErr]         = useState("");
  const [email, setEmail]     = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.id) nav(loginRedirectPath, { replace: true });
  }, [user?.id, loginRedirectPath, nav]);

  async function handleGoogle() {
    try {
      setErr("");
      await loginWithGoogle(loginRedirectPath);
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed");
    }
  }

  async function handleMicrosoft() {
    try {
      setErr("");
      await loginWithMicrosoft(loginRedirectPath);
    } catch (e: any) {
      setErr(e?.message || "Microsoft sign-in failed");
    }
  }

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      setErr("");
      setLoading(true);
      await loginWithEmailPassword(email, password);
      nav(loginRedirectPath, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] shadow-2xl shadow-slate-900/20 lg:grid lg:grid-cols-[5fr_6fr]">
        {/* ── Left: brand panel ── */}
        <BrandPanel />

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
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => nav(signupPath)}
                className="font-semibold text-indigo-600 hover:underline"
              >
                Sign Up
              </button>
            </span>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold text-slate-900">
              {inviteToken ? "Log in to accept your invite" : "Log in to your account"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {inviteToken
                ? "Log in and we'll take you straight to your workspace."
                : "Access your shipment intelligence and outreach tools."}
            </p>
          </div>

          {err && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {/* Social buttons */}
          <SocialButtons onGoogle={handleGoogle} onMicrosoft={handleMicrosoft} />

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-widest text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailPassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => nav("/reset-password")}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" id="remember" className="h-4 w-4 rounded border-slate-300 accent-indigo-600" />
              <label htmlFor="remember">Remember me</label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Log In"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            By continuing you agree to our{" "}
            <a href="/terms" className="underline hover:text-slate-600">Terms</a>
            {" "}and{" "}
            <a href="/privacy" className="underline hover:text-slate-600">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
