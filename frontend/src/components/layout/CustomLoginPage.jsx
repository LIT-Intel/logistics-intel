// frontend/src/components/layout/CustomLoginPage.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { loginWithGoogle, loginWithMicrosoft, loginWithEmailPassword } from "@/auth/supabaseAuthClient";
import { useAuth } from "@/auth/AuthProvider";
import FluidHoverSkin from "@/components/ui/FluidHoverSkin";

export default function CustomLoginPage({ onClose }) {
  const nav = useNavigate();
  const { user } = useAuth?.() || { user: null };
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
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

  async function handleGoogle() {
    try {
      setErr("");
      await loginWithGoogle();
      nav("/app/dashboard");
    } catch (e) {
      setErr(e?.message || "Google sign-in failed");
    }
  }

  async function handleMicrosoft() {
    try {
      setErr("");
      await loginWithMicrosoft();
      nav("/app/dashboard");
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
      nav("/app/dashboard");
    } catch (e) {
      setErr(e?.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1129] px-4 py-12 sm:px-6 lg:px-8">
      <FluidHoverSkin
        className="pointer-events-none absolute inset-0 opacity-80"
        colors={["rgba(60,78,245,0.5)", "rgba(171,52,245,0.45)", "rgba(34,211,238,0.35)"]}
        intensity={0.7}
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#151a42_0%,rgba(9,13,31,0.92)_55%,rgba(7,10,24,0.98)_100%)]" />
        <div className="absolute -left-24 top-[-10%] h-80 w-80 rounded-full bg-[#3C4EF5]/25 blur-3xl" />
        <div className="absolute right-[-15%] bottom-[-10%] h-[420px] w-[420px] rounded-full bg-[#22D3EE]/20 blur-[120px]" />
        <div className="absolute left-1/2 top-1/4 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#AB34F5]/10 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl overflow-hidden rounded-[34px] border border-white/14 bg-white shadow-[0_35px_150px_rgba(6,11,26,0.55)] md:grid md:grid-cols-[1.05fr,1fr]">
        <div className="relative hidden overflow-hidden border-r border-white/10 bg-gradient-to-br from-[#202a83] via-[#3C4EF5] to-[#58c3ff] md:flex md:flex-col md:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%)]" />
          <div className="pointer-events-none absolute inset-[18px] rounded-[26px] border border-white/20" />

          <div className="relative flex h-full flex-col gap-10 px-10 py-12 text-white">
            <div className="flex items-center gap-3 text-white/80">
              <img src="/logo.png" alt="Logistics Intel logo" className="h-10 w-10 rounded-lg border border-white/20 bg-white/10 p-1" loading="lazy" />
              <span className="text-sm uppercase tracking-[0.35em] text-white/50">Logistics Intel</span>
            </div>

            <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.45em] text-white/40">Account Access</p>
              {welcomeName ? (
                <>
                  <h2 className="text-4xl font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-[#3C4EF5] to-fuchsia-300">
                    {welcomeName}
                  </h2>
                  <p className="max-w-sm text-base text-white/70">
                    Welcome back. Your saved searches, shipment alerts, and prospect queues are ready whenever you are.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-4xl font-semibold leading-tight">Freight Intelligence Platform</h2>
                  <p className="max-w-sm text-base text-white/70">
                    Search companies by trade activity, track shipments, and automate outreach from one unified workspace.
                  </p>
                </>
              )}
            </div>

            <dl className="mt-auto grid gap-6 text-sm text-white/60 sm:grid-cols-2">
              <div>
                <dt className="uppercase tracking-[0.3em] text-white/40">Coverage</dt>
                <dd className="text-lg font-semibold text-white">3.2M+ companies</dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.3em] text-white/40">Signals</dt>
                <dd className="text-lg font-semibold text-white">Daily shipment updates</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="relative bg-white px-8 py-10 sm:px-10">
          <div className="absolute -left-9 top-12 hidden h-28 w-28 rounded-full bg-[#3C4EF5]/10 blur-3xl sm:block" />
          <div className="relative">
            <div className="mb-8 space-y-3">
              {welcomeName ? (
                <>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                    Welcome Back
                  </span>
                  <h1 className="text-3xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-r from-[#3C4EF5] via-[#22D3EE] to-[#AB34F5]">
                    {welcomeName}
                  </h1>
                  <p className="text-sm text-slate-500">
                    We saved your workspace so you can pick up your outreach and account intel instantly.
                  </p>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                    Access Portal
                  </span>
                  <h1 className="text-3xl font-bold leading-tight text-slate-900">Sign in to Logistics Intel</h1>
                  <p className="text-sm text-slate-500">
                    Use your business credentials to access shipment intelligence, company profiles, and outreach tools.
                  </p>
                </>
              )}
            </div>

            {err && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                {err}
              </div>
            )}

            <form onSubmit={handleEmailPassword} className="grid grid-cols-1 gap-4">
              <label className="space-y-2 text-sm font-medium text-slate-600">
                <span>Work email</span>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-[#3C4EF5] focus:outline-none focus:ring-2 focus:ring-[#3C4EF5]/30"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-[#3C4EF5] focus:outline-none focus:ring-2 focus:ring-[#3C4EF5]/30"
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
                <button type="button" className="font-medium text-[#3C4EF5] hover:underline" onClick={() => nav("/request-demo")}>Need help?</button>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3C4EF5] via-[#4F46E5] to-[#22D3EE] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#3C4EF5]/30 transition focus:outline-none focus:ring-2 focus:ring-[#22D3EE] focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70"
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span>or continue with</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid gap-3">
                <Button variant="outline" onClick={handleGoogle} className="group inline-flex items-center justify-center gap-3 rounded-xl border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-300">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-4 w-4" />
                  <span className="group-hover:text-slate-700">Continue with Google</span>
                </Button>
                <Button variant="outline" onClick={handleMicrosoft} className="group inline-flex items-center justify-center gap-3 rounded-xl border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-300">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" className="h-4 w-4" />
                  <span className="group-hover:text-slate-700">Continue with Microsoft</span>
                </Button>
              </div>
            </div>

            <div className="mt-8 text-sm text-slate-500">
              Don’t have an account?{" "}
              <button className="font-semibold text-[#3C4EF5] hover:underline" type="button" onClick={() => nav("/signup")}>
                Start your 14‑day trial
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
