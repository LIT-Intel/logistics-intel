import React from "react";
import { Users } from "lucide-react";
import { fontDisplay, fontBody } from "../tokens";

export function ForecastStrip({ audienceCount }: { audienceCount: number }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-gradient-to-b from-[#F0F9FF] to-white px-4 py-2">
      <div className="flex items-center gap-2">
        <div
          className="flex h-[26px] w-[26px] items-center justify-center rounded-md border"
          style={{
            background: "rgba(15,23,42,0.06)",
            borderColor: "rgba(15,23,42,0.12)",
          }}
        >
          <Users className="h-3 w-3 text-[#0F172A]" />
        </div>
        <div>
          <div
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400"
            style={{ fontFamily: fontDisplay }}
          >
            Audience size
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-base font-bold tracking-tight text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              {audienceCount > 0 ? audienceCount.toLocaleString() : "—"}
            </span>
          </div>
          <div
            className="text-[11px] text-slate-400"
            style={{ fontFamily: fontBody }}
          >
            {audienceCount > 0 ? "selected recipients" : "select recipients"}
          </div>
        </div>
      </div>
    </div>
  );
}