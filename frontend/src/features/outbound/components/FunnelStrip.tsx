import React from "react";
import { fontDisplay, fontMono } from "../tokens";
import type { CampaignFunnel } from "../types";

const STAGES: Array<{ key: keyof CampaignFunnel; label: string; color: string }> = [
  { key: "enrolled", label: "Enrolled", color: "#94A3B8" },
  { key: "sent", label: "Sent", color: "#64748B" },
  { key: "opened", label: "Opened", color: "#3B82F6" },
  { key: "replied", label: "Replied", color: "#10B981" },
  { key: "booked", label: "Booked", color: "#8B5CF6" },
];

export function FunnelStrip({ funnel }: { funnel: CampaignFunnel | null }) {
  if (!funnel) {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400"
          style={{ fontFamily: fontDisplay }}
        >
          Funnel
        </span>
        <span className="text-[11px] text-slate-500">
          No outreach data yet — appears once the first step sends.
        </span>
      </div>
    );
  }

  const total = funnel.enrolled || 1;
  return (
    <div className="flex flex-1 gap-1.5">
      {STAGES.map((stage, i) => {
        const value = Number(funnel[stage.key] ?? 0);
        const pct = (value / total) * 100;
        const prev = i > 0 ? Number(funnel[STAGES[i - 1].key] ?? 0) : null;
        const conv = prev && prev > 0 ? ((value / prev) * 100).toFixed(0) : null;
        return (
          <div key={stage.key} className="flex flex-1 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-1">
              <div>
                <span
                  className="text-xs font-bold"
                  style={{ fontFamily: fontMono, color: stage.color }}
                >
                  {value.toLocaleString()}
                </span>
                {conv !== null && (
                  <span
                    className="ml-1 text-[9px] text-slate-400"
                    style={{ fontFamily: fontMono }}
                  >
                    {conv}%
                  </span>
                )}
              </div>
            </div>
            <div className="h-1 overflow-hidden rounded bg-slate-100">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: stage.color,
                }}
              />
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400"
              style={{ fontFamily: fontDisplay }}
            >
              {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}