import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  Radar,
  Workflow,
  CheckCircle2,
  Globe,
  Mail,
  Lock,
  BarChart3,
  BellRing,
  Target,
  Search,
} from "lucide-react";
import {
  signInWithEmailPassword,
  loginWithGoogle,
  loginWithMicrosoft,
} from "@/auth/supabaseAuthClient";
import { useAuth } from "@/auth/AuthProvider";

const PulsePreview = () => {
  return (
    <div className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.10)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.10),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.08),transparent_30%)]" />

      <div className="relative border-b border-slate-200 bg-slate-950 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
              <Radar className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-indigo-300">
                Pulse
              </div>
              <div className="text-sm font-semibold text-white">
                Live freight intelligence monitoring
              </div>
            </div>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
            Live Sync
          </div>
        </div>
      </div>

      <div className="relative p-6">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Signals Tracked",
              value: "12,482",
              icon: Activity,
              tone: "from-indigo-500/12 to-indigo-500/4 text-indigo-600 border-indigo-200",
            },
            {
              label: "Companies Watched",
              value: "3,204",
              icon: Target,
              tone: "from-sky-500/12 to-sky-500/4 text-sky-600 border-sky-200",
            },
            {
              label: "Alert Accuracy",
              value: "94.2%",
              icon: BellRing,
              tone: "from-emerald-500/12 to-emerald-500/4 text-emerald-600 border-emerald-200",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`rounded-2xl border bg-gradient-to-br ${item.tone} p-4`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </span>
                  <div className="rounded-xl bg-white/80 p-2">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-black tracking-tight text-slate-900">
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                  Pulse Activity
                </h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Recent signal movement across watched shippers
                </p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 shadow-sm">
                Last 7 Days
              </div>
            </div>
            <div className="flex h-48 items-end gap-2 rounded-2xl bg-white px-4 pb-4 pt-6 shadow-inner">
              {[42, 58, 48, 76, 62, 88, 72, 94, 68, 84, 73, 97].map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center justify-end gap-2">
                  <div
                    className={`w-full rounded-t-xl ${
                      i === 11
                        ? "bg-gradient-to-t from-indigo-600 to-sky-400"
                        : i > 7
                        ? "bg-gradient-to-t from-slate-800 to-slate-500"
                        : "bg-gradient-to-t from-slate-300 to-slate-200"
                    }`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-indigo-100 p-2.5 text-indigo-600">
                  <Search className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                    Live Watchlist
                  </div>
                  <div className="text-sm text-slate-500">
                    Monitored accounts with active change signals
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  ["Tesla", "Import volume +18.4%", "Upward momentum"],
                  ["Rivian", "New routing activity", "Lane shift detected"],
                  ["Porsche", "Shipment pattern spike", "Pulse alert fired"],
                ].map(([name, metric, note]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">{name}</div>
                      <div className="text-xs font-medium text-slate-500">{metric}</div>
                    </div>
                    <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">
                      {note}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-5 text-white shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-2.5 text-sky-300">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em]">
                    From signal to action
                  </div>
                  <div className="text-sm text-slate-300">
                    Search, monitor, save, and launch outreach from one workspace
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black uppercase tracking-[0.14em]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">Search</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">Pulse</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">Outreach</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ModernLoginPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();

  const inviteToken = (searchParams.get("token") || "").trim();
  const inviteEmail = (searchParams.get("email") || "").trim().toLowerCase();
  const nextParam = (searchParams.get("next") || "").trim();

  const signupPath = inviteToken
    ? `/signup?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : "/signup";

  const postLoginDest = inviteToken
    ? `/accept-invite?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : nextParam || "/app/dashboard";

  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading2, setLoading2] = useState(false);

  // Redirect already-authenticated users
  useEffect(() => {
    if (!loading && user) {
      nav(postLoginDest, { replace: true });
    }
  }, [user, loading, nav, postLoginDest]);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading2(true);
    try {
      await signInWithEmailPassword(email, password);
      nav(postLoginDest, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Sign-in failed. Check your email and password.");
    } finally {
      setLoading2(false);
    }
  }

  async function handleGoogle() {
    setErr("");
    try {
      await loginWithGoogle(postLoginDest);
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed.");
    }
  }

  async function handleMicrosoft() {
    setErr("");
    try {
      await loginWithMicrosoft(postLoginDest);
    } catch (e: any) {
      setErr(e?.message || "Microsoft sign-in failed.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      {/* Left panel — auth form */}
      <div className="flex w-full flex-col lg:w-1/2">
        <div className="p-8">
          <div className="flex items-center">
            <img src="/logo_horizontal.png" alt="Logistics Intel" className="h-8 w-auto" />
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-8 sm:px-12 lg:px-24">
          <div className="w-full max-w-md space-y-8">
            {/* Header */}
            <div className="text-center lg:text-left">
              {inviteToken && (
                <div className="mb-4 inline-flex rounded-full bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-indigo-600">
                  Workspace invitation
                </div>
              )}
              {!inviteToken && (
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">
                  <Radar className="h-3.5 w-3.5" />
                  Pulse Intelligence Active
                </div>
              )}
              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
                {inviteToken ? "Sign in to accept your invite." : "Welcome back."}
              </h1>
              <p className="mt-4 text-lg font-medium leading-relaxed text-slate-500">
                {inviteToken
                  ? `Sign in with ${inviteEmail || "your account"} to join your workspace.`
                  : "Track freight signals, monitor shipper movement, and act faster with live market intelligence."}
              </p>
            </div>

            {/* Feature badges (non-invite only) */}
            {!inviteToken && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { icon: Radar, title: "Pulse", text: "Live shipper monitoring" },
                  { icon: BarChart3, title: "Intel", text: "BOL-based shipment visibility" },
                  { icon: Workflow, title: "Outreach", text: "CRM and campaign workflow" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-black uppercase tracking-[0.14em] text-slate-900">{item.title}</div>
                      <div className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{item.text}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* OAuth buttons */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={handleGoogle}
                className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md"
              >
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  className="h-4 w-4"
                />
                Google
              </button>
              <button
                onClick={handleMicrosoft}
                className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md"
              >
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
                  alt="Office 365"
                  className="h-4 w-4"
                />
                Office 365
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs font-black uppercase">
                <span className="bg-white px-4 text-slate-400 tracking-widest">or continue with email</span>
              </div>
            </div>

            {/* Email form */}
            {err && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {err}
              </div>
            )}

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Email
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    disabled={Boolean(inviteEmail)}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => nav("/reset-password")}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading2}
                className="relative w-full overflow-hidden rounded-2xl bg-indigo-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {loading2 ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <p className="text-center text-xs font-medium text-slate-400">
              New to Logistic Intel?{" "}
              <button
                type="button"
                onClick={() => nav(signupPath)}
                className="font-bold text-indigo-600 underline"
              >
                {inviteToken ? "Create an account" : "Start your free trial"}
              </button>
            </p>

            {!inviteToken && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-900">
                    Built for revenue teams in logistics
                  </div>
                  <div className="mt-1 text-sm font-medium leading-relaxed text-slate-600">
                    Search live shipper intelligence, save targets to CRM, and turn market movement into outreach opportunities faster.
                  </div>
                </div>
              </div>
            )}

            <p className="text-center text-xs font-medium text-slate-400">
              By signing in, you agree to our{" "}
              <a href="/terms" className="font-bold text-indigo-600 underline">Terms of Service</a>{" "}
              and{" "}
              <a href="/privacy" className="font-bold text-indigo-600 underline">Privacy Policy</a>.
            </p>
          </div>
        </div>

        <div className="p-8 flex flex-wrap gap-x-8 gap-y-4 justify-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
          <span>© {new Date().getFullYear()} Logistic Intel LLC</span>
          <a href="/security" className="hover:text-indigo-500 transition-colors">Security</a>
          <a href="/status" className="hover:text-indigo-500 transition-colors">Status</a>
          <a href="/help" className="hover:text-indigo-500 transition-colors">Help Center</a>
        </div>
      </div>

      {/* Right panel — product preview */}
      <div className="hidden w-1/2 lg:flex flex-col relative overflow-hidden bg-slate-50 border-l border-slate-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.12)_0%,transparent_50%)]" />
        <div className="absolute top-0 right-0 p-12 opacity-5">
          <Globe className="h-96 w-96 text-indigo-600" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-12 relative z-10">
          <div className="mb-12 w-full transform transition-transform duration-500 hover:scale-[1.01]">
            <PulsePreview />
          </div>

          <div className="w-full max-w-xl space-y-8">
            {[
              {
                icon: Radar,
                color: "bg-indigo-100 text-indigo-600",
                title: "Pulse Monitoring",
                text: "Watch real shipment and trade movement across target accounts with live alerting built for logistics sales teams.",
              },
              {
                icon: BarChart3,
                color: "bg-sky-100 text-sky-600",
                title: "Market Intelligence",
                text: "Turn BOL-backed shipment data into clear buying signals, route trends, and commercial timing opportunities.",
              },
              {
                icon: Workflow,
                color: "bg-emerald-100 text-emerald-600",
                title: "CRM + Outreach",
                text: "Save companies, organize workflows, and launch campaigns from the same intelligence workspace without switching tools.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">{item.title}</h4>
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-12 bg-white border-t border-slate-100">
          <p className="mb-6 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Trusted by revenue and operations teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-30 grayscale hover:grayscale-0 transition-all">
            <span className="text-xl font-black italic tracking-tighter">snowflake</span>
            <span className="text-xl font-black tracking-tighter">Adobe</span>
            <span className="text-xl font-black italic tracking-tighter">Gartner</span>
            <span className="text-xl font-black tracking-tighter">ZOOM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
