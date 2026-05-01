import React from "react";
import { Sparkles, Users, Eye, Reply, CalendarCheck, Clock, ShieldCheck } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";

interface Item {
  l: string;
  v: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  pending?: boolean;
}

// All forecast tiles surface as "preview" placeholders. When a Pulse forecast
// backend ships these will hydrate from /pulse/forecast (per CLAUDE.md §5).
function buildItems(audienceCount: number): Item[] {
  return [
    {
      l: "Audience size",
      v: audienceCount > 0 ? audienceCount.toLocaleString() : "—",
      sub: audienceCount > 0 ? "selected recipients" : "select recipients",
      Icon: Users,
      color: "#0F172A",
    },
    {
      l: "Predicted opens",
      v: "—",
      sub: "preview · backend pending",
      Icon: Eye,
      color: "#3B82F6",
      pending: true,
    },
    {
      l: "Predicted replies",
      v: "—",
      sub: "preview · backend pending",
      Icon: Reply,
      color: "#10B981",
      pending: true,
    },
    {
      l: "Predicted meetings",
      v: "—",
      sub: "preview · backend pending",
      Icon: CalendarCheck,
      color: "#8B5CF6",
      pending: true,
    },
    {
      l: "Send window",
      v: "—",
      sub: "set per recipient timezone",
      Icon: Clock,
      color: "#F59E0B",
      pending: true,
    },
    {
      l: "Domain health",
      v: "—",
      sub: "checks once Gmail connects",
      Icon: ShieldCheck,
      color: "#06B6D4",
      pending: true,
    },
  ];
}

export function ForecastStrip({ audienceCount }: { audienceCount: number }) {
  const items = buildItems(audienceCount);
  return (
    <div className="flex flex-wrap items-stretch gap-x-0 gap-y-3 border-b border-slate-200 bg-gradient-to-b from-[#F0F9FF] to-white px-4 py-2.5 lg:flex-nowrap lg:gap-y-0">
      <div className="flex items-center gap-2 border-slate-200 pr-4 lg:border-r">
        <div
          className="flex h-[26px] w-[26px] items-center justify-center rounded-md border"
          style={{
            background: "rgba(59,130,246,0.12)",
            borderColor: "rgba(59,130,246,0.25)",
          }}
        >
          <Sparkles className="h-3 w-3 text-[#3B82F6]" />
        </div>
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#0369A1]"
            style={{ fontFamily: fontDisplay }}
          >
            Pulse Forecast
          </div>
          <div
            className="text-[10px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            preview · live forecast ships with the dispatcher
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap gap-y-3 lg:flex-nowrap">
        {items.map((it, i) => (
          <div
            key={it.l}
            className="flex-1 px-3 py-0.5"
            style={{
              borderLeft: i ? "1px solid #E0F2FE" : "none",
              minWidth: 130,
            }}
          >
            <div
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400"
              style={{ fontFamily: fontDisplay }}
            >
              <it.Icon className="h-2.5 w-2.5" />
              {it.l}
              {it.pending ? (
                <span className="ml-1 rounded-sm border border-slate-200 bg-white px-1 text-[8px] font-semibold text-slate-400">
                  pending
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className="text-base font-bold tracking-tight"
                style={{ fontFamily: fontDisplay, color: it.color }}
              >
                {it.v}
              </span>
            </div>
            <div
              className="text-[10px] text-slate-400"
              style={{ fontFamily: fontBody }}
            >
              {it.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}