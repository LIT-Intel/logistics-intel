import React from "react";
import { Target } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import type { OutboundCampaign } from "../types";

// PulseBar surfaces top-of-page outbound KPIs. There is no aggregation
// endpoint over lit_outreach_history yet, so every metric here renders as
// an honest "—" placeholder with an "awaiting data" sub-label. Counts
// derived purely from the loaded campaign list (totals, drafts) are real.

interface KPI {
  label: string;
  value: string;
  sub: string;
  pending: boolean;
}

function buildKpis(campaigns: OutboundCampaign[]): KPI[] {
  const total = campaigns.length;
  const active = campaigns.filter((c) => c.status === "active").length;
  const draft = campaigns.filter((c) => c.status === "draft").length;
  return [
    {
      label: "Sent",
      value: "—",
      sub: "awaiting outreach data",
      pending: true,
    },
    {
      label: "Opens",
      value: "—",
      sub: "awaiting outreach data",
      pending: true,
    },
    {
      label: "Replies",
      value: "—",
      sub: "awaiting outreach data",
      pending: true,
    },
    {
      label: "Meetings",
      value: "—",
      sub: "awaiting outreach data",
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

export function PulseBar({
  campaigns,
}: {
  campaigns: OutboundCampaign[];
}) {
  const tiles = buildKpis(campaigns);
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[repeat(5,1fr)_auto]">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white p-4">
          <div className="flex items-center justify-between">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400"
              style={{ fontFamily: fontDisplay }}
            >
              {t.label}
            </div>
            {t.pending ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                pending
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <div
              className="text-2xl font-bold tracking-tight text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              {t.value}
            </div>
          </div>
          <div
            className="mt-1 text-[11px] text-slate-400"
            style={{ fontFamily: fontBody }}
          >
            {t.sub}
          </div>
        </div>
      ))}
      {/* Goal strip — placeholder until quarterly goal is configured */}
      <div className="flex flex-col justify-center bg-gradient-to-b from-[#F0F9FF] to-white p-4 lg:min-w-[200px]">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0369A1]"
            style={{ fontFamily: fontDisplay }}
          >
            <Target className="h-3 w-3" />
            Goal
          </div>
          <span
            className="text-[10px] font-bold text-[#0369A1]"
            style={{ fontFamily: fontMono }}
          >
            —
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span
            className="text-sm font-bold text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            Set a target
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded bg-[#E0F2FE]">
          <div
            className="h-full rounded"
            style={{
              width: "0%",
              background: "linear-gradient(90deg,#3B82F6,#0369A1)",
            }}
          />
        </div>
        <div
          className="mt-1 text-[10px] font-medium text-[#0369A1]"
          style={{ fontFamily: fontBody }}
        >
          Quarterly meeting goal — coming soon
        </div>
      </div>
    </div>
  );
}