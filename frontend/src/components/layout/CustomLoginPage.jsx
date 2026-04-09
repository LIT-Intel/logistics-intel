import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CircleDot,
  Globe2,
  MapPinned,
  MessageSquareText,
  Search,
  Sparkles,
  TrendingUp,
  Users2,
  Workflow,
  X,
} from "lucide-react";
import { SignIn } from "@clerk/clerk-react";

const ProspectingPreview = () => {
  const prompt =
    "I'm looking for supply chain or logistics professionals at companies generating $500M+ in revenue.";

  const results = [
    {
      name: "Melissa Carter",
      title: "VP, Global Supply Chain",
      company: "Avery Industrial Group",
      meta: "$1.2B revenue • Atlanta, GA",
      signal: "Import activity up 18%",
    },
    {
      name: "Daniel Kim",
      title: "Director of Logistics",
      company: "NorthBridge Consumer Products",
      meta: "$860M revenue • Chicago, IL",
      signal: "New lane expansion detected",
    },
    {
      name: "Priya Shah",
      title: "Head of Transportation",
      company: "Westlake Foods",
      meta: "$2.4B revenue • Dallas, TX",
      signal: "Shipment volume spike in Q2",
    },
  ];

  return (
    <div className="relative w-full max-w-2xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.10),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.08),transparent_28%)]" />

      <div className="relative border-b border-slate-200 bg-slate-950 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
              <img
                src="/pulse-icon-master.svg"
                alt="Pulse"
                className="h-5 w-5 object-contain"
              />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-300">
                Pulse
              </div>
              <div className="text-sm font-semibold text-white">
                AI prospecting for logistics teams
              </div>
            </div>
          </div>

          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
            Live search
          </div>
        </div>
      </div>

      <div className="relative p-6">
        <div className="mb-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-inner">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            <MessageSquareText className="h-3.5 w-3.5 text-indigo-600" />
            Prompt
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium leading-6 text-slate-700 shadow-sm">
            {prompt}
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Matched contacts",
              value: "148",
              icon: Users2,
            },
            {
              label: "Qualified accounts",
              value: "39",
              icon: Building2,
            },
            {
              label: "Active buying signals",
              value: "17",
              icon: TrendingUp,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </span>
                  <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
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

        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Prospect results
              </div>
              <div className="mt-1 text-sm font-medium text-slate-600">
                Contacts surfaced from supply chain intelligence
              </div>
            </div>

            <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 sm:block">
              ZoomInfo-style view
            </div>
          </div>

          <div className="space-y-3">
            {results.map((item) => (
              <div
                key={`${item.name}-${item.company}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-indigo-200 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-slate-600">
                      {item.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {item.company}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-medium">
                        <Building2 className="h-3.5 w-3.5" />
                        {item.meta}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">
                    {item.signal}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Search,
              title: "Search",
              text: "Target the right accounts",
            },
            {
              icon: Globe2,
              title: "Signals",
              text: "Spot shipment movement",
            },
            {
              icon: Workflow,
              title: "Act",
              text: "Move faster on outreach",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-900">
                  {item.title}
                </div>
                <div className="mt-1 text-sm text-slate-500">{item.text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default function CustomLoginPage({ onClose }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  const inviteToken = (searchParams.get("token") || "").trim();
  const inviteEmail = (searchParams.get("email") || "").trim().toLowerCase();
  const nextParam = (searchParams.get("next") || "").trim();

  const signupPath = inviteToken
    ? `/signup?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : "/signup";

  const forceRedirectUrl = inviteToken
    ? `/accept-invite?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`
    : nextParam || "/app/dashboard";

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      <div className="flex w-full flex-col lg:w-[48%]">
        <div className="flex items-center justify-between p-6 sm:p-8">
          <div className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-3 shadow-lg shadow-slate-200">
            <img
              src="/lit-logo-horizontal.svg"
              alt="Logistic Intel"
              className="h-7 w-auto object-contain"
            />
          </div>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-1 items-center justify-center px-8 pb-10 pt-4 sm:px-12 lg:px-20">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center lg:text-left">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">
                <img
                  src="/pulse-icon-master.svg"
                  alt="Pulse"
                  className="h-3.5 w-3.5 object-contain"
                />
                Pulse intelligence active
              </div>

              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
                Welcome back.
              </h1>

              <p className="mt-4 text-lg font-medium leading-relaxed text-slate-500">
                Find logistics buyers, track shipper movement, and turn supply
                chain signals into pipeline.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              {clerkPubKey ? (
                <SignIn
                  routing="path"
                  path="/login"
                  signUpUrl={signupPath}
                  forceRedirectUrl={forceRedirectUrl}
                  appearance={{
                    elements: {
                      rootBox: "w-full",
                      card: "shadow-none border-0 bg-transparent",
                      header: "hidden",
                      headerTitle: "hidden",
                      headerSubtitle: "hidden",
                      socialButtonsBlockButton:
                        "rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md",
                      socialButtonsBlockButtonText: "font-bold",
                      dividerLine: "bg-slate-200",
                      dividerText:
                        "text-slate-400 font-black uppercase tracking-widest text-xs",
                      formButtonPrimary:
                        "relative w-full overflow-hidden rounded-2xl bg-indigo-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700",
                      formFieldInput:
                        "w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 text-sm font-bold transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100",
                      formFieldLabel:
                        "text-xs font-black uppercase tracking-widest text-slate-500",
                      footerActionLink: "font-bold text-indigo-600 underline",
                      identityPreviewText: "text-slate-700 font-bold",
                      alertText: "text-sm",
                      formResendCodeLink: "font-bold text-indigo-600 underline",
                      otpCodeFieldInput:
                        "rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold",
                    },
                    variables: {
                      colorPrimary: "#4f46e5",
                      colorText: "#0f172a",
                      colorTextSecondary: "#64748b",
                      colorBackground: "#ffffff",
                      colorInputBackground: "#f8fafc",
                      colorInputText: "#0f172a",
                      borderRadius: "1rem",
                    },
                  }}
                />
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                  Clerk is not configured yet. Add{" "}
                  <span className="font-bold">VITE_CLERK_PUBLISHABLE_KEY</span> in
                  Vercel to enable the new login flow.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                  <CircleDot className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-900">
                    Built for freight and supply chain professionals
                  </div>
                  <div className="mt-1 text-sm font-medium leading-relaxed text-slate-600">
                    Monitor accounts, surface the right contacts, and move from
                    intelligence to outreach without leaving the workspace.
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-xs font-medium text-slate-400">
              New to Logistic Intel?{" "}
              <button
                onClick={() => navigate(signupPath)}
                className="font-bold text-indigo-600 underline"
              >
                Start your free trial
              </button>
            </p>
          </div>
        </div>
      </div>

      <div className="hidden w-[52%] lg:flex flex-col relative overflow-hidden bg-slate-50 border-l border-slate-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(99,102,241,0.12)_0%,transparent_46%)]" />
        <div className="absolute top-10 right-10 opacity-[0.06]">
          <MapPinned className="h-72 w-72 text-indigo-600" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-10 py-12 relative z-10">
          <div className="mb-10 w-full max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              Prospect faster with Pulse
            </div>

            <h2 className="text-3xl font-black tracking-tight text-slate-900">
              Search like a logistics seller.
            </h2>

            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-500">
              Use natural language to surface qualified supply chain contacts,
              shipment signals, and account movement from one intelligence layer.
            </p>
          </div>

          <div className="w-full flex justify-center">
            <PulsePreview />
          </div>

          <div className="mt-10 grid w-full max-w-2xl gap-4 md:grid-cols-3">
            {[
              {
                icon: Search,
                title: "Prospecting",
                text: "Describe the account profile you want and get qualified contacts fast.",
              },
              {
                icon: TrendingUp,
                title: "Signals",
                text: "See shipment changes, lane movement, and buying triggers in context.",
              },
              {
                icon: Workflow,
                title: "Action",
                text: "Save to CRM and move directly into outreach without tool switching.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-900">
                    {item.title}
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-slate-500">
                    {item.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
