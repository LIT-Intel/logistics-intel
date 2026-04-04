import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Zap, Mail, KeyRound, CheckCircle2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { auth, resetPassword, updatePassword } from "@/auth/supabaseAuthClient";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Determine mode: 'request' (send email) or 'reset' (set new password after clicking link)
  const [mode, setMode] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    document.title = "Reset Password — Logistics Intel";

    // Supabase sends the reset link with a token in the URL hash or as query params.
    // When the user lands here after clicking the email link, the onAuthStateChange
    // fires with the PASSWORD_RECOVERY event, which means we switch to reset mode.
    if (!auth) return;

    // Check if we have a token_hash in query params (PKCE flow)
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    if (tokenHash && type === "recovery") {
      setMode("reset");
      return;
    }

    // Also check URL hash fragment (legacy implicit flow)
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setMode("reset");
      return;
    }

    // Listen for Supabase PASSWORD_RECOVERY event
    const { data: { subscription } } = auth.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
      }
    });

    return () => subscription.unsubscribe();
  }, [searchParams]);

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await resetPassword(email);
      setSuccess(`Reset link sent to ${email}. Check your inbox (and spam folder).`);
    } catch (error: any) {
      setErr(error?.message || "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setSuccess("Password updated successfully!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (error: any) {
      setErr(error?.message || "Failed to update password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-200">
            <Zap className="h-6 w-6 fill-current text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-slate-900">
            Logistics<span className="text-indigo-600">Intel</span>
          </span>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm ring-1 ring-black/[0.02]">

          {/* ── Success state ── */}
          {success && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {mode === "reset" ? "Password updated!" : "Check your inbox"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">{success}</p>
              </div>
              <button
                onClick={() => navigate("/login")}
                className="mt-2 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Go to sign in
              </button>
            </div>
          )}

          {/* ── Request reset form ── */}
          {!success && mode === "request" && (
            <>
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
                    <Mail className="h-5 w-5 text-indigo-600" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">Account Recovery</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Enter your email and we'll send you a secure reset link.
                </p>
              </div>

              {err && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {err}
                </div>
              )}

              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <div className="mt-6 flex items-center justify-center">
                <button
                  onClick={() => navigate("/login")}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </button>
              </div>
            </>
          )}

          {/* ── Set new password form ── */}
          {!success && mode === "reset" && (
            <>
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
                    <KeyRound className="h-5 w-5 text-indigo-600" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">New Password</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Choose a strong password with at least 8 characters.
                </p>
              </div>

              {err && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {err}
                </div>
              )}

              <form onSubmit={handleSetNewPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm font-medium transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Updating password..." : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
