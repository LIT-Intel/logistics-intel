import React from "react";
import { Target } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import type { OutboundCampaign } from "../types";
import { useOutboundStats } from "../hooks/useOutboundStats";

// Compact KPI strip — Sent / Opens / Replies / Meetings + Campaigns count.
// Sent / Opens / Replies pull from lit_outreach_history via useOutboundStats;
// Meetings has no first-class event yet so it stays a labelled placeholder.

interface KPI {
  label: string;
  value: string;
  sub: string;
  pending: boolean;
}

function buildKpis(
  campaigns: OutboundCampaign[],
  stats: ReturnType<typeof useOutboundStats>,
): KPI[] {
  const total = campaigns.length;
  const active = campaigns.filter((c) => c.status === "active").length;
  const draft = campaigns.filter((c) => c.status === "draft").length;
  const fmt = (n: number) => n.toLocaleString();
  const pct = (num: number, denom: number) =>
    denom > 0 ? `${Math.round((num / denom) * 100)}%` : "—";
  return [
    {
      label: "Sent",
      value: stats.loading ? "…" : fmt(stats.sent),
      sub: stats.sent === 0 ? "no sends yet" : `${stats.bounced} bounced`,
      pending: false,
    },
    {
      label: "Opens",
      value: stats.loading ? "…" : fmt(stats.opened),
      sub: stats.sent > 0 ? `${pct(stats.opened, stats.sent)} open rate` : "tracking pending",
      pending: stats.sent > 0 && stats.opened === 0,
    },
    {
      label: "Replies",
      value: stats.loading ? "…" : fmt(stats.replied),
      sub: stats.sent > 0 ? `${pct(stats.replied, stats.sent)} reply rate` : "tracking pending",
      pending: stats.sent > 0 && stats.replied === 0,
    },
    {
      label: "Meetings",
      value: "—",
      sub: "calendar integration soon",
      pending: true,
    },
    {
      label: "Campaigns",
      value: total.toLocaleString(),
      sub: `${active} active · ${draft} draft`,
      pending: false,
    },
  ];
}

export function PulseBar({ campaigns }: { campaigns: OutboundCampaign[] }) {
  const stats = useOutboundStats();
  const tiles = buildKpis(campaigns, stats);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-[#FAFBFC]">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-[repeat(5,1fr)_auto]">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="px-3 py-2"
            style={{
              borderRight:
                i < tiles.length - 1 ? "1px solid #F1F5F9" : "none",
              borderBottom: "1px solid #F1F5F9",
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <div
                className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
                style={{ fontFamily: fontDisplay }}
              >
                {t.label}
              </div>
              {t.pending ? (
                <span
                  className="rounded-full bg-slate-200/60 px-1.5 py-0 text-[8px] font-semibold text-slate-500"
                  style={{ fontFamily: fontDisplay }}
                >
                  pending
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span
                className="text-[15px] font-bold leading-tight tracking-tight text-[#0F172A]"
                style={{ fontFamily: fontMono }}
              >
                {t.value}
              </span>
            </div>
            <div
              className="mt-0.5 truncate text-[10px] text-slate-400"
              style={{ fontFamily: fontBody }}
            >
              {t.sub}
            </div>
          </div>
        ))}
        {/* Goal strip */}
        <div className="bg-gradient-to-b from-[#F0F9FF] to-white px-3 py-2 lg:min-w-[170px]">
          <div className="flex items-center justify-between gap-1">
            <div
              className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#0369A1]"
              style={{ fontFamily: fontDisplay }}
            >
              <Target className="h-2.5 w-2.5" />
              Goal
            </div>
            <span
              className="text-[9px] font-bold text-[#0369A1]"
              style={{ fontFamily: fontMono }}
            >
              —
            </span>
          </div>
          <div
            className="mt-0.5 text-[12px] font-bold leading-tight text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            Set a target
          </div>
          <div className="mt-1 h-0.5 overflow-hidden rounded bg-[#E0F2FE]">
            <div
              className="h-full rounded"
              style={{
                width: "0%",
                background: "linear-gradient(90deg,#3B82F6,#0369A1)",
              }}
            />
          </div>
          <div
            className="mt-0.5 truncate text-[10px] font-medium text-[#0369A1]"
            style={{ fontFamily: fontBody }}
          >
            Quarterly goal — coming soon
          </div>
        </div>
      </div>
    </div>
  );
}