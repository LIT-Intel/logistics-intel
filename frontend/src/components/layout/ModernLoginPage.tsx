import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Mail,
  Lock,
  Building2,
  ShieldCheck,
  LineChart,
  Check,
} from "lucide-react";
import {
  loginWithGoogle,
  loginWithMicrosoft,
  loginWithEmailPassword,
} from "@/auth/supabaseAuthClient";
import { useAuth } from "@/auth/AuthProvider";

function BackgroundPattern() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_24%),linear-gradient(180deg,#f7fbff_0%,#eef4ff_100%)]" />
      <svg
        className="absolute -right-24 top-8 h-[70vh] w-[48vw] opacity-65"
        viewBox="0 0 566 721"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="litWave" x1="566" y1="120" x2="120" y2="680" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff2a6d" />
            <stop offset="0.45" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        {Array.from({ length: 16 }).map((_, i) => (
          <path
            key={i}
            d={`M560 ${170 + i * 16}C455 ${175 + i * 9} 320 ${250 + i * 15} 220 ${390 + i * 18}C140 ${500 + i * 14} 90 ${620 + i * 10} 40 ${705 - i * 8}`}
            stroke="url(#litWave)"
            strokeOpacity={0.6 - i * 0.026}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="absolute inset-y-0 right-0 w-[42vw] bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.06),transparent_54%)]" />
      <div className="absolute left-10 top-28 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-indigo-300/10 blur-3xl" />
    </div>
  );
}

function Header({ mode }: { mode: "login" | "signup" }) {
  const isLogin = mode === "login";
  return (
    <div className="mb-6 flex items-center justify-between">
      <img
        src="/lit-logo-horizontal%20(1).svg"
        alt="Logistics Intel"
        className="h-10 w-auto sm:h-11"
      />
      <div className="text-sm font-medium text-slate-600">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <a
          href={isLogin ? "/signup" : "/login"}
          className="inline-flex rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:text-cyan-700"
        >
          {isLogin ? "Sign Up" : "Log In"}
        </a>
      </div>
    </div>
  );
}

function Banner() {
  return (
    <div className="mx-auto mb-4 w-full max-w-[980px] rounded-2xl border border-slate-200 bg-[linear-gradient(90deg,rgba(15,23,42,0.94)_0%,rgba(30,41,59,0.92)_100%)] px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="group relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#031235] ring-1 ring-cyan-300/20 transition duration-300 hover:shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:ring-cyan-300/50">
            <img
              src="/lit-icon-master.svg"
              alt="Logistics Intel icon"
              className="h-7 w-7 object-contain"
            />
          </div>
          <div>
            <div className="text-lg font-semibold text-white">Looking for freight data?</div>
            <div className="text-sm text-slate-300">
              Logistics Intel gives your team live shipment intelligence, outreach tools, and company visibility in one workspace.
            </div>
          </div>
        </div>
        <button
          type="button"
          className="hidden rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 md:inline-flex"
        >
          Learn more
        </button>
      </div>
    </div>
  );
}

function TrialBar({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="mx-auto mb-4 w-full max-w-[980px] rounded-2xl border border-slate-200 bg-white/85 px-5 py-3 text-center shadow-sm backdrop-blur-sm">
      <span className="text-sm text-slate-600">
        ✨ {text}{" "}
        <a href={href} className="font-semibold text-cyan-600 hover:text-cyan-700">
          {cta}
        </a>
      </span>
    </div>
  );
}

function LeftPanel({ inviteMode = false }: { inviteMode?: boolean }) {
  const items = inviteMode
    ? [
        "Accept your workspace invitation securely",
        "Join the correct organization automatically",
        "Access the tools and pages assigned to your plan",
      ]
    : [
        "Track live shipper movement and market changes",
        "Save companies, manage CRM, and launch outreach",
        "Unlock shipment intelligence based on your subscription",
      ];

  return (
    <div className="bg-white px-8 py-9 sm:px-10">
      <div className="mb-6">
        <img
          src="/lit-logo-horizontal%20(1).svg"
          alt="Logistics Intel"
          className="mb-6 h-8 w-auto"
        />
        <h1 className="text-[50px] font-semibold leading-[1.01] tracking-[-0.05em] text-slate-900">
          {inviteMode ? "Join your workspace" : "Log In"}
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-7 text-slate-500">
          {inviteMode
            ? "Create your account and finish joining your Logistics Intel workspace."
            : "Access shipment intelligence, company insights, and outreach workflows."}
        </p>
      </div>

      <div className="group rounded-[28px] border border-slate-200 bg-slate-50 p-5 transition duration-300 hover:border-cyan-300/70 hover:shadow-[0_0_30px_rgba(34,211,238,0.16)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Built for freight teams</div>
            <div className="text-xs text-slate-500">Search, monitor, and sell from one workspace</div>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-3.5 w-3.5" />
              </div>
              <div className="text-sm leading-6 text-slate-600">{item}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <LineChart className="h-4 w-4" />
            </div>
            <div className="text-[32px] font-semibold tracking-[-0.04em] text-slate-900">3.2M+</div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Companies</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="text-[32px] font-semibold tracking-[-0.04em] text-slate-900">Live</div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Intel Sync</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenterDivider() {
  return (
    <div className="relative hidden items-center justify-center bg-white lg:flex">
      <div className="h-[340px] w-px bg-slate-200" />
      <div className="absolute rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        or
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
    <div className="space-y-4">
      <button
        type="button"
        onClick={onGoogle}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt="Google"
          className="h-5 w-5"
        />
        Google
      </button>

      <button
        type="button"
        onClick={onMicrosoft}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      >
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
          alt="Office 365"
          className="h-5 w-5"
        />
        Office 365
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
  const nextParam = (searchParams.get("next") || "").trim();

  const signupPath = inviteToken
    ? `/signup?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : "/signup";

  const loginRedirectPath = inviteToken
    ? `/accept-invite?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : nextParam || "/search";

  const [err, setErr] = useState("");
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.id) {
      nav(loginRedirectPath, { replace: true });
    }
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
    <div className="relative min-h-screen overflow-hidden text-slate-900">
      <BackgroundPattern />

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <Header mode="login" />
        <Banner />
        <TrialBar text="New to Logistics Intel?" cta="Start your free trial now" href={signupPath} />

        <div className="mx-auto grid w-full max-w-[980px] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:grid-cols-[0.98fr_auto_1fr]">
          <LeftPanel inviteMode={Boolean(inviteToken)} />
          <CenterDivider />

          <div className="bg-white px-8 py-9 sm:px-10">
            <div className="mb-6 lg:text-center">
              <div className="text-sm font-medium text-slate-500">
                Continue with your account
              </div>
            </div>

            {err && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {err}
              </div>
            )}

            <form onSubmit={handleEmailPassword} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-12 py-4 text-base text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-12 py-4 text-base text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                  Remember me
                </label>

                <button
                  type="button"
                  className="font-medium text-indigo-600 hover:underline"
                  onClick={() => nav("/reset-password")}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#ef2b22] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#dd241b] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Signing in..." : "Log In"}
              </button>
            </form>

            <div className="my-6 block lg:hidden">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span>or continue with</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="hidden lg:block">
                <div className="mb-4 text-sm font-medium text-slate-500">
                  Continue with
                </div>
              </div>
              <SocialButtons onGoogle={handleGoogle} onMicrosoft={handleMicrosoft} />
            </div>

            <div className="mt-8 text-center text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => nav(signupPath)}
                className="font-semibold text-indigo-600 hover:underline"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-slate-500">
          By continuing, you agree to Logistics Intel&apos;s{" "}
          <a href="/terms" className="font-medium text-slate-700 hover:text-cyan-600">
            Terms & Conditions
          </a>{" "}
          and{" "}
          <a href="/privacy" className="font-medium text-slate-700 hover:text-cyan-600">
            Privacy Policy
          </a>
          .
{" "}
<a
  href="https://logo.dev"
  target="_blank"
  rel="noopener"
  className="ml-1 font-medium text-slate-700 hover:text-cyan-600"
>
  Logos provided by Logo.dev
</a>
