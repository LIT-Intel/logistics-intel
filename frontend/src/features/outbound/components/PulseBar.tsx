import React from "react";
import {
  Send,
  MailOpen,
  Reply,
  CalendarClock,
  Megaphone,
  Target,
  type LucideIcon,
} from "lucide-react";
import { fontDisplay, fontBody, fontMono, ob } from "../tokens";
import type { OutboundCampaign } from "../types";
import { useOutboundStats } from "../hooks/useOutboundStats";

// KPI header — Sent / Opens / Replies / Meetings + Campaigns count + Goal.
// Restyled 2026-08 to the dashboard KPI card language (EnhancedKpiCard):
// white rounded-[14px] cards, slate-200 borders, soft 0 8px 30px shadow,
// Space Grotesk labels, JetBrains Mono numerals, #2563EB accents.
// Sent / Opens / Replies pull from lit_outreach_history via useOutboundStats;
// Meetings has no first-class event yet so it stays a labelled placeholder.

interface KPI {
  label: string;
  value: string;
  sub: string;
  pending: boolean;
  Icon: LucideIcon;
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
      Icon: Send,
    },
    {
      label: "Opens",
      value: stats.loading ? "…" : fmt(stats.opened),
      sub: stats.sent > 0 ? `${pct(stats.opened, stats.sent)} open rate` : "tracking pending",
      pending: stats.sent > 0 && stats.opened === 0,
      Icon: MailOpen,
    },
    {
      label: "Replies",
      value: stats.loading ? "…" : fmt(stats.replied),
      sub: stats.sent > 0 ? `${pct(stats.replied, stats.sent)} reply rate` : "tracking pending",
      pending: stats.sent > 0 && stats.replied === 0,
      Icon: Reply,
    },
    {
      label: "Meetings",
      value: "—",
      sub: "calendar integration soon",
      pending: true,
      Icon: CalendarClock,
    },
    {
      label: "Campaigns",
      value: total.toLocaleString(),
      sub: `${active} active · ${draft} draft`,
      pending: false,
      Icon: Megaphone,
    },
  ];
}

export function PulseBar({ campaigns }: { campaigns: OutboundCampaign[] }) {
  const stats = useOutboundStats();
  const tiles = buildKpis(campaigns, stats);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-[14px] border border-slate-200 p-3.5 transition-all duration-200 hover:border-[#BFDBFE]"
          style={{
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
          }}
        >
          <div className="flex items-center justify-between gap-1">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${ob.blueDark}14` }}
            >
              <t.Icon className="h-3.5 w-3.5" style={{ color: ob.blueDark }} />
            </span>
            {t.pending ? (
              <span
                className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500"
                style={{ fontFamily: fontDisplay }}
              >
                pending
              </span>
            ) : null}
          </div>
          <div
            className="mt-2 text-[22px] font-bold leading-none text-[#0F172A]"
            style={{ fontFamily: fontMono, letterSpacing: "-0.01em" }}
          >
            {t.value}
          </div>
          <div
            className="mt-1 text-[11px] font-semibold text-slate-700"
            style={{ fontFamily: fontDisplay }}
          >
            {t.label}
          </div>
          <div
            className="mt-0.5 truncate text-[11px] text-slate-400"
            style={{ fontFamily: fontBody }}
          >
            {t.sub}
          </div>
        </div>
      ))}

      {/* Goal card — same card language, brand-blue accent */}
      <div
        className="rounded-[14px] border border-slate-200 p-3.5 transition-all duration-200 hover:border-[#BFDBFE]"
        style={{
          background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
          boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
        }}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${ob.blueDark}14` }}
          >
            <Target className="h-3.5 w-3.5" style={{ color: ob.blueDark }} />
          </span>
          <span
            className="text-[11px] font-bold"
            style={{ fontFamily: fontMono, color: ob.blueDark }}
          >
            —
          </span>
        </div>
        <div
          className="mt-2 text-[14px] font-bold leading-tight text-[#0F172A]"
          style={{ fontFamily: fontDisplay }}
        >
          Set a target
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded bg-[#EFF6FF]">
          <div
            className="h-full rounded"
            style={{
              width: "0%",
              background: `linear-gradient(90deg, ${ob.blue}, ${ob.blueDark})`,
            }}
          />
        </div>
        <div
          className="mt-1 truncate text-[11px] text-slate-400"
          style={{ fontFamily: fontBody }}
        >
          Quarterly goal — coming soon
        </div>
      </div>
    </div>
  );
}
