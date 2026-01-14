import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function ModernSignupPage() {
  const nav = useNavigate();
  const { signInWithGoogle, signInWithMicrosoft, registerWithEmailPassword } = useAuth();
  const [err, setErr] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleEmailSignup(e: React.FormEvent) {
    e?.preventDefault?.();
    try {
      setErr("");
      setLoading(true);
      await registerWithEmailPassword({ fullName, email, password });
      nav("/app/dashboard");
    } catch (e: any) {
      if (e?.message?.includes("Email not confirmed")) {
        setErr("Please check your email to verify your account before signing in.");
      } else {
        setErr(e?.message || "Sign-up failed");
      }
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
      setErr(e?.message || "Google sign-up failed");
    }
  }

  async function handleMicrosoft() {
    try {
      setErr("");
      await signInWithMicrosoft();
      nav("/app/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Microsoft sign-up failed");
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Hero Section with Product Preview */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        </div>

        {/* Gradient Overlays */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">LI</span>
            </div>
            <span className="text-white font-semibold text-xl">Logistics Intel</span>
          </div>

          {/* Main Hero Content */}
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
                Welcome to<br />Logistic Intel
              </h1>
              <p className="text-lg text-slate-300 leading-relaxed max-w-md">
                Create your account to unlock trade intelligence, shipment tracking, and AI-driven outreach.
              </p>
            </div>

            {/* Value Props */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-white font-semibold mb-1">3.2M+ Global Companies</h3>
                  <p className="text-slate-400 text-sm">Access real shipment data from importers and exporters worldwide</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-white font-semibold mb-1">AI-Powered Intelligence</h3>
                  <p className="text-slate-400 text-sm">Generate RFPs, analyze trade lanes, and automate outreach</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-white font-semibold mb-1">14-Day Free Trial</h3>
                  <p className="text-slate-400 text-sm">Full access to all features, no credit card required</p>
                </div>
              </div>
            </div>

            {/* Mock Dashboard Preview */}
            <div className="relative rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center space-y-2 p-8">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg mb-4">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-slate-300 text-sm">Your freight intelligence platform awaits</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-slate-400 text-sm">
            Trusted by freight forwarders, 3PLs, and logistics providers worldwide
          </div>
        </div>
      </div>

      {/* Right Side - Signup Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">LI</span>
            </div>
            <span className="text-slate-900 font-semibold text-xl">Logistics Intel</span>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Create your account</h2>
              <p className="text-slate-600">Start your 14-day free trial today</p>
            </div>

            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {err}
              </div>
            )}

            {/* OAuth Buttons */}
            <div className="space-y-3">
              <Button
                type="button"
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
                <span className="text-slate-700 font-medium">Sign up with Google</span>
              </Button>

              <Button
                type="button"
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
                <span className="text-slate-700 font-medium">Sign up with Office 365</span>
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-slate-500 font-medium">or</span>
              </div>
            </div>

            {/* Email Signup Form */}
            <form onSubmit={handleEmailSignup} className="space-y-4">
              {/* Full Name Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Full name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    required
                  />
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Work email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
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
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">Must be at least 6 characters</p>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Creating account..." : "Start 14-day free trial"}
              </Button>
            </form>

            {/* Sign In Link */}
            <div className="text-center">
              <p className="text-sm text-slate-600">
                Have an account?{" "}
                <button
                  onClick={() => nav("/login")}
                  className="font-semibold text-blue-600 hover:text-blue-700"
                >
                  Sign in instead
                </button>
              </p>
            </div>

            {/* Terms */}
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              By signing up, I agree to ZoomInfo's{" "}
              <a href="/terms" className="text-blue-600 hover:underline">Terms of Use</a> and{" "}
              <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
