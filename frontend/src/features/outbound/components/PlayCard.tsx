import React from "react";
import {
  Ship,
  Target,
  RefreshCw,
  Zap,
  FileText,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import { ChannelChip } from "./ChannelChip";
import type { Play } from "../types";

const ICON_MAP: Record<string, LucideIcon> = {
  ship: Ship,
  target: Target,
  "refresh-cw": RefreshCw,
  zap: Zap,
  "file-text": FileText,
  calendar: Calendar,
};

export function PlayCard({
  play,
  onUse,
}: {
  play: Play;
  onUse: () => void;
}) {
  const Icon = ICON_MAP[play.icon] ?? Zap;
  return (
    <button
      type="button"
      onClick={onUse}
      className="group relative flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-[#FAFBFC] p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
    >
      {play.badge ? (
        <span
          className="absolute -top-2 right-3.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-white shadow"
          style={{
            fontFamily: fontDisplay,
            background: `linear-gradient(90deg, ${play.accent}, ${play.accent}dd)`,
            boxShadow: `0 2px 8px ${play.accent}55`,
          }}
        >
          {play.badge}
        </span>
      ) : null}

      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{
            background: `${play.accent}15`,
            border: `1px solid ${play.accent}30`,
          }}
        >
          <Icon style={{ width: 18, height: 18, color: play.accent }} />
        </div>
        <div className="min-w-0">
          <div
            className="text-sm font-bold tracking-tight text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            {play.name}
          </div>
          <div
            className="truncate text-[11px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            {play.persona}
          </div>
        </div>
      </div>

      <div
        className="text-xs leading-snug text-slate-500"
        style={{ fontFamily: fontBody }}
      >
        {play.desc}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {play.channels.map((ch, i) => (
          <ChannelChip key={i} kind={ch} size={22} iconSize={11} />
        ))}
        <span
          className="ml-1 text-[10px] text-slate-400"
          style={{ fontFamily: fontMono }}
        >
          {play.steps} steps
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
        <span
          className="text-[10px] uppercase tracking-[0.08em] text-slate-400"
          style={{ fontFamily: fontDisplay, fontWeight: 600 }}
        >
          Starter play
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)] transition group-hover:brightness-110"
          style={{ fontFamily: fontDisplay }}
        >
          <Zap className="h-3 w-3" />
          Use this play
        </span>
      </div>
    </button>
  );
}