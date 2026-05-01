import React from "react";
import { AlertTriangle, Clock4, MoreHorizontal, Edit3 } from "lucide-react";
import { ChannelChip } from "./ChannelChip";
import { FunnelStrip } from "./FunnelStrip";
import { Sparkline } from "./Sparkline";
import { fontDisplay, fontBody } from "../tokens";
import type { OutboundCampaign } from "../types";

const STATUS_STYLES: Record<
  OutboundCampaign["status"],
  { dot: string; color: string; bg: string; border: string; label: string }
> = {
  active: {
    dot: "#22C55E",
    color: "#15803d",
    bg: "#F0FDF4",
    border: "#BBF7D0",
    label: "Active",
  },
  paused: {
    dot: "#F59E0B",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
    label: "Paused",
  },
  draft: {
    dot: "#94A3B8",
    color: "#64748b",
    bg: "#F1F5F9",
    border: "#E2E8F0",
    label: "Draft",
  },
  archived: {
    dot: "#94A3B8",
    color: "#64748b",
    bg: "#F1F5F9",
    border: "#E2E8F0",
    label: "Archived",
  },
};

function healthColorFor(c: OutboundCampaign): string {
  if (c.health === "great") return "#10B981";
  if (c.health === "good") return "#3B82F6";
  if (c.health === "attention") return "#F59E0B";
  return "#94A3B8";
}

export function CampaignRow({
  campaign,
  onOpen,
}: {
  campaign: OutboundCampaign;
  onOpen: (c: OutboundCampaign) => void;
}) {
  const c = campaign;
  const status = STATUS_STYLES[c.status];
  const healthColor = healthColorFor(c);

  return (
    <div
      onClick={() => onOpen(c)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(c);
      }}
      className="cursor-pointer rounded-xl border bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)]"
      style={{
        borderColor: c.alert ? "#FDE68A" : "#E5E7EB",
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: healthColor,
            boxShadow: `0 0 0 3px ${healthColor}22`,
          }}
        />
        <div
          className="text-sm font-bold tracking-tight text-[#0F172A]"
          style={{ fontFamily: fontDisplay }}
        >
          {c.name}
        </div>
        <div className="flex gap-1">
          {c.channels.map((ch, i) => (
            <ChannelChip key={`${c.id}-ch-${i}`} kind={ch} size={20} iconSize={10} />
          ))}
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
          style={{
            color: status.color,
            background: status.bg,
            borderColor: status.border,
            fontFamily: fontDisplay,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: status.dot }}
          />
          {status.label}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {c.recipients !== null ? (
            <span
              className="hidden text-[11px] text-slate-500 sm:inline-flex sm:items-center sm:gap-1.5"
              style={{ fontFamily: fontBody }}
            >
              <Clock4 className="h-3 w-3 text-slate-400" />
              {c.recipients} recipient{c.recipients === 1 ? "" : "s"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {c.status !== "draft" ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <FunnelStrip funnel={c.funnel} />
          {c.spark ? (
            <Sparkline values={c.spark} color={healthColor} width={88} height={28} />
          ) : null}
        </div>
      ) : (
        <div
          className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400"
          style={{ fontFamily: fontBody }}
        >
          <Edit3 className="h-3 w-3" />
          Draft — open to add a sequence step or connect an inbox.
        </div>
      )}

      {c.alert ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2">
          <AlertTriangle className="h-3 w-3 text-[#B45309]" />
          <span
            className="text-[11px] font-medium text-[#B45309]"
            style={{ fontFamily: fontBody }}
          >
            {c.alert}
          </span>
        </div>
      ) : null}
    </div>
  );
}