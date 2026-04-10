import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Zap,
  Activity,
  Radar,
  Workflow,
  CheckCircle2,
  Globe,
  Search,
  BarChart3,
  BellRing,
  Target,
} from "lucide-react";
import {
  loginWithGoogle,
  loginWithMicrosoft,
  loginWithEmailPassword,
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
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  Search
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  Pulse
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  Outreach
                </div>
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

  const welcomeName = useMemo(() => {
    const nameFromUser = user?.displayName || user?.email?.split("@")[0];
    try {
      const cached = JSON.parse(localStorage.getItem("lit:user") || "null");
      const cachedName = cached?.name || cached?.displayName || cached?.email?.split("@")[0];
      return nameFromUser || cachedName || null;
    } catch {
      return nameFromUser || null;
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      nav(loginRedirectPath, { replace: true });
    }
  }, [user?.id, loginRedirectPath, nav]);

  async function handleGoogle() {
    try {
      setErr("");
      await loginWithGoogle(loginRedirectPath);
    } catch (e) {
      setErr(e?.message || "Google sign-in failed");
    }
  }

  async function handleMicrosoft() {
    try {
      setErr("");
      await loginWithMicrosoft(loginRedirectPath);
    } catch (e) {
      setErr(e?.message || "Microsoft sign-in failed");
    }
  }

  async function handleEmailPassword(e) {
    e?.preventDefault?.();
    try {
      setErr("");
      setLoading(true);
      await loginWithEmailPassword(email, password);
      nav(loginRedirectPath, { replace: true });
    } catch (e) {
      setErr(e?.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      <div className="flex w-full flex-col lg:w-1/2">
        <div className="p-8">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-200">
              <Zap className="h-6 w-6 text-white fill-current" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">
              Logistic<span className="text-indigo-600">Intel</span>
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-8 sm:px-12 lg:px-24">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center lg:text-left">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">
                <Radar className="h-3.5 w-3.5" />
                Pulse Intelligence Active
              </div>

              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
                {welcomeName ? `Welcome back, ${welcomeName}.` : "Welcome back."}
              </h1>

              <p className="mt-4 text-lg font-medium leading-relaxed text-slate-500">
                Track freight signals, monitor shipper movement, and act faster with
                Pulse, CRM, and live market intelligence in one workspace.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: Radar, title: "Pulse", text: "Live shipper monitoring" },
                { icon: BarChart3, title: "Intel", text: "BOL-based shipment visibility" },
                { icon: Workflow, title: "Outreach", text: "CRM and campaign workflow" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-black uppercase tracking-[0.14em] text-slate-900">
                      {item.title}
                    </div>
                    <div className="mt-1 text-sm font-medium leading-relaxed text-slate-500">
                      {item.text}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              {err && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {err}
                </div>
              )}

              <form onSubmit={handleEmailPassword} className="grid grid-cols-1 gap-4">
                <label className="space-y-2 text-sm font-medium text-slate-600">
                  <span>Work email</span>
                  <input
                    type="email"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-[#3C4EF5] focus:outline-none focus:ring-2 focus:ring-[#3C4EF5]/30"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-600">
                  <span>Password</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-[#3C4EF5] focus:outline-none focus:ring-2 focus:ring-[#3C4EF5]/30"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-[#3C4EF5] focus:ring-[#3C4EF5]" />
                    Remember this device
                  </label>
                  <button
                    type="button"
                    className="font-medium text-[#3C4EF5] hover:underline"
                    onClick={() => nav("/reset-password")}
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3C4EF5] via-[#4F46E5] to-[#22D3EE] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#3C4EF5]/30 transition focus:outline-none focus:ring-2 focus:ring-[#22D3EE] focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span>or continue with</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="grid gap-3">
                  <button
                    onClick={handleGoogle}
                    type="button"
                    className="group inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:border-slate-300"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-4 w-4" />
                    <span className="group-hover:text-slate-700">Continue with Google</span>
                  </button>

                  <button
                    onClick={handleMicrosoft}
                    type="button"
                    className="group inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:border-slate-300"
                  >
                    <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" className="h-4 w-4" />
                    <span className="group-hover:text-slate-700">Continue with Microsoft</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-900">
                  Built for revenue teams in logistics
                </div>
                <div className="mt-1 text-sm font-medium leading-relaxed text-slate-600">
                  Search live shipper intelligence, save targets to CRM, and turn
                  market movement into outreach opportunities faster.
                </div>
              </div>
            </div>

            <p className="text-center text-xs font-medium text-slate-400">
              New to Logistic Intel?{" "}
              <button
                onClick={() => nav(signupPath)}
                className="font-bold text-indigo-600 underline"
              >
                Start your free trial
              </button>
            </p>

            <p className="text-center text-xs font-medium text-slate-400">
              By signing in, you agree to our Terms of Service and Privacy Policy.
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
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Radar className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Pulse Monitoring</h4>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">
                  Watch real shipment and trade movement across target accounts with
                  live alerting built for logistics sales teams.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Market Intelligence</h4>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">
                  Turn BOL-backed shipment data into clear buying signals, route
                  trends, and commercial timing opportunities.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">CRM + Outreach</h4>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">
                  Save companies, organize workflows, and launch campaigns from the
                  same intelligence workspace without switching tools.
                </p>
              </div>
            </div>
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
