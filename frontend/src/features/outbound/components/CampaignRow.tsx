import React from "react";
import { AlertTriangle, Clock4, Edit3 } from "lucide-react";
import { ChannelChip } from "./ChannelChip";
import { FunnelStrip } from "./FunnelStrip";
import { Sparkline } from "./Sparkline";
import { CampaignRowMenu, type CampaignRowAction } from "./CampaignRowMenu";
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
  onAction,
}: {
  campaign: OutboundCampaign;
  onOpen: (c: OutboundCampaign) => void;
  onAction: (a: CampaignRowAction, c: OutboundCampaign) => void;
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
      className="cursor-pointer rounded-lg border bg-white px-3 py-2.5 transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
      style={{
        borderColor: c.alert ? "#FDE68A" : "#E5E7EB",
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: healthColor,
            boxShadow: `0 0 0 2.5px ${healthColor}22`,
          }}
        />
        <div
          className="text-[13px] font-bold tracking-tight text-[#0F172A]"
          style={{ fontFamily: fontDisplay }}
        >
          {c.name}
        </div>
        <div className="flex gap-0.5">
          {c.channels.map((ch, i) => (
            <ChannelChip key={`${c.id}-ch-${i}`} kind={ch} size={18} iconSize={9} />
          ))}
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          style={{
            color: status.color,
            background: status.bg,
            borderColor: status.border,
            fontFamily: fontDisplay,
          }}
        >
          <span
            className="h-1 w-1 rounded-full"
            style={{ background: status.dot }}
          />
          {status.label}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {c.recipients !== null ? (
            <span
              className="hidden text-[10px] text-slate-500 sm:inline-flex sm:items-center sm:gap-1"
              style={{ fontFamily: fontBody }}
            >
              <Clock4 className="h-2.5 w-2.5 text-slate-400" />
              {c.recipients} recipient{c.recipients === 1 ? "" : "s"}
            </span>
          ) : null}
          <CampaignRowMenu campaign={c} onAction={onAction} />
        </div>
      </div>

      {c.status !== "draft" && c.status !== "archived" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <FunnelStrip funnel={c.funnel} />
          {c.spark ? (
            <Sparkline values={c.spark} color={healthColor} width={72} height={22} />
          ) : null}
        </div>
      ) : c.status === "archived" ? (
        <div
          className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400"
          style={{ fontFamily: fontBody }}
        >
          Archived — restore from the actions menu to keep editing.
        </div>
      ) : (
        <div
          className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400"
          style={{ fontFamily: fontBody }}
        >
          <Edit3 className="h-2.5 w-2.5" />
          Draft — open to add a sequence step or connect an inbox.
        </div>
      )}

      {c.alert ? (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1.5">
          <AlertTriangle className="h-2.5 w-2.5 text-[#B45309]" />
          <span
            className="text-[10px] font-medium text-[#B45309]"
            style={{ fontFamily: fontBody }}
          >
            {c.alert}
          </span>
        </div>
      ) : null}
    </div>
  );
}