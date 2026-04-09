import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
  Box,
  Search,
  Globe,
} from "lucide-react";
import { SignUp } from "@clerk/clerk-react";

// A lightweight animated preview inspired by the marketing mockups. This
// component cycles through simple states to create the illusion of live
// shipment intelligence without requiring external dependencies.
const AnimatedPreview = () => {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPulse((prev) => (prev + 1) % 4);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full max-w-lg aspect-[4/3] bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-white/10 ring-8 ring-white/5 scale-90 sm:scale-100">
      <div className="h-10 bg-white/5 border-b border-white/10 flex items-center px-4 gap-2">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/50" />
          <div className="w-2 h-2 rounded-full bg-amber-500/50" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
        </div>
        <div className="mx-auto bg-white/10 rounded-full h-4 w-1/2 flex items-center px-3">
          <Search className="h-2 w-2 text-white/30 mr-2" />
          <div className="h-1.5 w-12 bg-white/20 rounded" />
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-16 rounded-xl bg-white/5 border border-white/10 p-3 transition-all duration-700 ${
                pulse === i ? "border-indigo-500/50 bg-indigo-500/5" : ""
              }`}
            >
              <div className="h-2 w-8 bg-white/10 rounded mb-2" />
              <div className="h-3 w-12 bg-indigo-400/40 rounded" />
            </div>
          ))}
        </div>

        <div className="h-32 rounded-2xl bg-white/5 border border-white/10 p-4 relative overflow-hidden">
          <div className="flex items-end justify-between gap-1 h-full pt-4">
            {[40, 70, 45, 90, 65, 80, 50, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-indigo-500/20 rounded-t-sm transition-all duration-1000"
                style={{ height: `${pulse === 0 ? h : Math.random() * 80 + 20}%` }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Box className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-24 bg-white/20 rounded" />
                  <div className="h-1.5 w-16 bg-white/10 rounded" />
                </div>
              </div>
              <div className="h-2 w-12 bg-emerald-500/20 rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 shadow-xl pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
            Live Intelligence Sync
          </span>
        </div>
      </div>
    </div>
  );
};

export default function Signup() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Create an account — Logistics Intel";
  }, []);

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      <div className="flex w-full flex-col lg:w-1/2">
        <div className="p-8">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-200">
              <Zap className="h-6 w-6 text-white fill-current" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">
              Logistics<span className="text-indigo-600">Intel</span>
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-8 sm:px-12 lg:px-24">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
                Ready to optimize?
              </h1>
              <p className="mt-4 text-lg font-medium text-slate-500">
                Join thousands of logistics professionals using shipment
                intelligence to win.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <SignUp
                routing="path"
                path="/signup"
                signInUrl="/login"
                forceRedirectUrl="/app/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-none border-0 bg-transparent",
                    header: "hidden",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton:
                      "rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
                    socialButtonsBlockButtonText: "font-bold",
                    dividerLine: "bg-slate-200",
                    dividerText: "text-slate-400 font-black uppercase tracking-widest text-xs",
                    formButtonPrimary:
                      "bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-4 text-sm font-black uppercase tracking-widest shadow-xl shadow-indigo-100",
                    formFieldInput:
                      "rounded-2xl border border-slate-200 bg-slate-50 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-indigo-100",
                    footerActionLink: "text-indigo-600 font-bold underline",
                    identityPreviewText: "text-slate-700 font-bold",
                    formFieldLabel:
                      "text-xs font-black uppercase tracking-widest text-slate-500",
                    alertText: "text-sm",
                  },
                }}
              />
            </div>

            <p className="text-center text-xs font-medium text-slate-400">
              By signing up, you agree to our{" "}
              <a href="/terms" className="font-bold text-indigo-600 underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" className="font-bold text-indigo-600 underline">
                Privacy Policy
              </a>
              .
            </p>

            <p className="text-center text-xs font-medium text-slate-400">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="font-bold text-indigo-600 underline"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>

        <div className="p-8 flex flex-wrap gap-x-8 gap-y-4 justify-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
          <span>© {new Date().getFullYear()} Logistics Intel LLC</span>
          <a href="/security" className="hover:text-indigo-500 transition-colors">
            Security
          </a>
          <a href="/status" className="hover:text-indigo-500 transition-colors">
            Status
          </a>
          <a href="/help" className="hover:text-indigo-500 transition-colors">
            Help Center
          </a>
        </div>
      </div>

      <div className="hidden w-1/2 lg:flex flex-col relative overflow-hidden bg-slate-50 border-l border-slate-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.1)_0%,transparent_50%)]" />
        <div className="absolute top-0 right-0 p-12 opacity-5">
          <Globe className="h-96 w-96 text-indigo-600" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-12 relative z-10">
          <div className="mb-12 transform hover:scale-105 transition-transform duration-500">
            <AnimatedPreview />
          </div>

          <div className="w-full max-w-md space-y-8">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">
                  Millions of shipments
                </h4>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">
                  Verified shipment intelligence from real BOL data, not just scraped profiles.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">
                  Enterprise Ready
                </h4>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed font-medium">
                  SSO, SOC2 compliance, and role-based access for global logistics teams.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-12 bg-white border-t border-slate-100">
          <p className="mb-6 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Trusted by Global Operations at
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
