import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import type { OutboundCampaign } from "../types";

interface Tip {
  icon: React.ReactNode;
  accent: string;
  title: string;
  body: string;
  cta: string;
  ctaHref?: string;
}

function buildTips(campaigns: OutboundCampaign[]): Tip[] {
  const total = campaigns.length;
  const draft = campaigns.filter((c) => c.status === "draft").length;
  const active = campaigns.filter((c) => c.status === "active").length;

  const tips: Tip[] = [];

  if (total === 0) {
    tips.push({
      icon: <Sparkles className="h-3.5 w-3.5" />,
      accent: "#8B5CF6",
      title: "Pick a starter play to begin.",
      body: "Lane launch, competitor conquest, and win-back templates get you to a launchable sequence in under five minutes.",
      cta: "Browse plays",
    });
  }
  if (draft > 0) {
    tips.push({
      icon: <Target className="h-3.5 w-3.5" />,
      accent: "#3B82F6",
      title: `${draft} draft${draft === 1 ? "" : "s"} waiting on you.`,
      body: "Drafts don't send — open one to add a sequence step or connect Gmail and launch.",
      cta: "Review drafts",
    });
  }
  if (active === 0 && total > 0) {
    tips.push({
      icon: <Zap className="h-3.5 w-3.5" />,
      accent: "#F59E0B",
      title: "No active campaigns yet.",
      body: "Connecting an inbox and launching a sequence unlocks the live funnel and Pulse metrics on this page.",
      cta: "Connect inbox",
    });
  }

  if (tips.length === 0) {
    tips.push({
      icon: <Sparkles className="h-3.5 w-3.5" />,
      accent: "#3B82F6",
      title: "Outbound running clean.",
      body: "Pulse Coach surfaces signal-driven plays and diagnostic alerts as your campaigns generate data.",
      cta: "Browse plays",
    });
  }
  return tips;
}

export function CoachCard({
  campaigns,
  onCta,
}: {
  campaigns: OutboundCampaign[];
  onCta?: (cta: string) => void;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("lit.outbound.coach.collapsed") !== "1";
  });
  const [tipIdx, setTipIdx] = useState(0);
  const tips = buildTips(campaigns);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "lit.outbound.coach.collapsed",
      open ? "0" : "1",
    );
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.25)] transition hover:scale-105"
        style={{ background: "linear-gradient(135deg,#0F172A,#1E293B)" }}
        aria-label="Open Pulse Coach"
      >
        <Sparkles style={{ width: 20, height: 20, color: "#00F0FF" }} />
      </button>
    );
  }

  const t = tips[Math.min(tipIdx, tips.length - 1)];

  return (
    <div
      className="fixed bottom-6 right-6 z-30 w-[340px] overflow-hidden rounded-2xl border shadow-[0_24px_60px_rgba(15,23,42,0.35)]"
      style={{
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full"
        style={{
          background: `radial-gradient(circle, ${t.accent}40, transparent 70%)`,
        }}
      />

      <div className="flex items-center gap-2 border-b border-white/5 px-3.5 py-3">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md border"
          style={{
            background: "rgba(0,240,255,0.1)",
            borderColor: "rgba(0,240,255,0.3)",
          }}
        >
          <Sparkles style={{ width: 12, height: 12, color: "#00F0FF" }} />
        </div>
        <div
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-200"
          style={{ fontFamily: fontDisplay }}
        >
          Pulse Coach
        </div>
        <span
          className="text-[10px] text-slate-500"
          style={{ fontFamily: fontMono }}
        >
          {tipIdx + 1}/{tips.length}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() =>
              setTipIdx((i) => (i - 1 + tips.length) % tips.length)
            }
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-400 hover:bg-white/5"
            aria-label="Previous tip"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setTipIdx((i) => (i + 1) % tips.length)}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-400 hover:bg-white/5"
            aria-label="Next tip"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-400 hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="relative p-4">
        <div className="flex gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border"
            style={{
              background: `${t.accent}22`,
              borderColor: `${t.accent}55`,
              color: t.accent,
            }}
          >
            {t.icon}
          </div>
          <div className="min-w-0">
            <div
              className="text-sm font-semibold leading-tight tracking-tight text-white"
              style={{ fontFamily: fontDisplay }}
            >
              {t.title}
            </div>
            <div
              className="mt-1.5 text-xs leading-relaxed text-slate-400"
              style={{ fontFamily: fontBody }}
            >
              {t.body}
            </div>
          </div>
        </div>
        <div className="mt-3.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => onCta?.(t.cta)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
            style={{ fontFamily: fontDisplay }}
          >
            <ArrowRight className="h-3 w-3" />
            {t.cta}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}