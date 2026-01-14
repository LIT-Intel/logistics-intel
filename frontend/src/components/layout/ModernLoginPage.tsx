import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { User, Lock, Eye, EyeOff } from "lucide-react";

export default function ModernLoginPage() {
  const nav = useNavigate();
  const { signInWithGoogle, signInWithMicrosoft, signInWithEmailPassword } = useAuth();
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleEmailPassword(e: React.FormEvent) {
    e?.preventDefault?.();
    try {
      setErr("");
      setLoading(true);
      await signInWithEmailPassword(email, password);
      nav("/app/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      setErr("");
      await signInWithGoogle();
      nav("/app/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed");
    }
  }

  async function handleMicrosoft() {
    try {
      setErr("");
      await signInWithMicrosoft();
      nav("/app/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Microsoft sign-in failed");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#1a1f3a] via-[#0f1729] to-[#0a0e1f] flex items-center justify-center px-4 py-12">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Login Container */}
      <div className="relative z-10 w-full max-w-5xl">
        {/* Banner */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-slate-800/90 to-slate-900/90 border border-slate-700/50 backdrop-blur-xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-xl">LI</span>
                </div>
                <div>
                  <h2 className="text-white font-semibold text-lg">Looking for freight data?</h2>
                  <p className="text-slate-300 text-sm">Logistics Intel has 3.2M+ companies with real shipment intelligence</p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              onClick={() => nav("/signup")}
            >
              Learn more
            </Button>
          </div>
        </div>

        {/* Trial Banner */}
        <div className="mb-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl p-3 text-center shadow-lg">
          <p className="text-white text-sm flex items-center justify-center gap-2">
            <span className="text-cyan-400">✨</span>
            New to Logistics Intel?{" "}
            <button
              className="font-semibold text-cyan-400 hover:text-cyan-300 underline"
              onClick={() => nav("/signup")}
            >
              Start your free trial, now!
            </button>
          </p>
        </div>

        {/* Login Form */}
        <div className="rounded-2xl bg-white shadow-2xl overflow-hidden">
          <div className="p-12">
            <h1 className="text-4xl font-bold text-slate-900 text-center mb-12">Log In</h1>

            <div className="grid md:grid-cols-[1fr,auto,1fr] gap-8 items-start">
              {/* Email/Password Login */}
              <div className="space-y-6">
                {err && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {err}
                  </div>
                )}

                <form onSubmit={handleEmailPassword} className="space-y-5">
                  {/* Username/Email Field */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      Username <span className="text-slate-400 text-xs">(email)</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={() => nav("/reset-password")}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold py-3 rounded-xl shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? "Signing in..." : "Log In"}
                  </Button>
                </form>

                {/* Sign Up Link */}
                <div className="text-center text-sm text-slate-600 pt-4">
                  Don't have an account?{" "}
                  <button
                    onClick={() => nav("/signup")}
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Sign Up
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="hidden md:flex items-center justify-center">
                <div className="h-full w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
                <div className="absolute bg-white px-3 py-1.5 rounded-full border border-slate-200 text-xs font-medium text-slate-500">
                  or
                </div>
              </div>

              {/* OAuth Options */}
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-500 text-center mb-6">Continue with</p>

                {/* SSO Button */}
                <Button
                  variant="outline"
                  onClick={handleMicrosoft}
                  className="w-full justify-start gap-3 py-6 border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 rounded-xl transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <span className="text-blue-600 font-bold text-sm">SSO</span>
                  </div>
                  <span className="text-slate-700 font-medium">Single Sign-On (SSO)</span>
                </Button>

                {/* Google Button */}
                <Button
                  variant="outline"
                  onClick={handleGoogle}
                  className="w-full justify-start gap-3 py-6 border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 rounded-xl transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center group-hover:border-blue-300 transition-colors">
                    <img
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                      alt="Google"
                      className="w-5 h-5"
                    />
                  </div>
                  <span className="text-slate-700 font-medium">Google</span>
                </Button>

                {/* Office 365 Button */}
                <Button
                  variant="outline"
                  onClick={handleMicrosoft}
                  className="w-full justify-start gap-3 py-6 border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 rounded-xl transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center group-hover:border-blue-300 transition-colors">
                    <img
                      src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
                      alt="Microsoft"
                      className="w-5 h-5"
                    />
                  </div>
                  <span className="text-slate-700 font-medium">Office 365</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center text-sm text-slate-400">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </div>
      </div>
    </div>
  );
}
