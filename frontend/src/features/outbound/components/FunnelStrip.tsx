import React from "react";
import { fontDisplay, fontMono } from "../tokens";
import type { CampaignFunnel } from "../types";

/**
 * Each bar's fill % comes from a different denominator depending on the
 * stage.
 *
 * - enrolled: anchor stage, always 100% width by definition.
 * - sent: uniqueSent / enrolled. Multi-step campaigns send N times per
 *   recipient, so funnel.sent can exceed enrolled; uniqueSent counts
 *   distinct recipients who received at least one send, capping at
 *   enrolled.
 * - opened / clicked / replied: pre-computed *Rate fields from the RPC
 *   (these divide by sent — the correct denominator for engagement
 *   rates — and are already 0-100). Falling back to value/enrolled
 *   would mismatch what users see in the KPI hero.
 */
type StageDef = {
  key: keyof CampaignFunnel;
  label: string;
  color: string;
  rateField?: keyof CampaignFunnel;
};

const STAGES: StageDef[] = [
  { key: "enrolled", label: "Enrolled", color: "#94A3B8" },
  { key: "sent", label: "Sent", color: "#64748B" },
  { key: "opened", label: "Opened", color: "#3B82F6", rateField: "openRate" },
  { key: "clicked", label: "Clicked", color: "#6366F1", rateField: "clickRate" },
  { key: "replied", label: "Replied", color: "#10B981", rateField: "replyRate" },
];

export function FunnelStrip({ funnel }: { funnel: CampaignFunnel | null }) {
  if (!funnel) {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400"
          style={{ fontFamily: fontDisplay }}
        >
          Funnel
        </span>
        <span className="text-[11px] text-slate-500">
          No metrics yet — launch this campaign to start collecting.
        </span>
      </div>
    );
  }

  const enrolledDenominator = funnel.enrolled || 1;

  return (
    <div className="flex flex-1 gap-1.5">
      {STAGES.map((stage, i) => {
        const value = Number(funnel[stage.key] ?? 0);
        const pct = computePct(stage, funnel, enrolledDenominator);
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
                    className="ml-1 text-[11px] text-slate-400"
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
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400"
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

function computePct(
  stage: StageDef,
  funnel: CampaignFunnel,
  enrolledDenominator: number,
): number {
  if (stage.key === "enrolled") return 100;
  if (stage.key === "sent") {
    // uniqueSent / enrolled — caps at 100% by definition.
    const u = Number(funnel.uniqueSent ?? 0);
    return Math.min(100, (u / enrolledDenominator) * 100);
  }
  if (stage.rateField) {
    // RPC rates already divide by sent (correct denominator). Null when
    // sent === 0 — fall back to 0 width.
    const r = funnel[stage.rateField];
    if (r == null) return 0;
    return Math.min(100, Math.max(0, Number(r)));
  }
  // Fallback (shouldn't hit) — use the raw value over enrolled.
  return Math.min(100, (Number(funnel[stage.key] ?? 0) / enrolledDenominator) * 100);
}
