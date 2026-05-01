import React, { useEffect, useRef, useState } from "react";
import {
  Archive,
  Edit3,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { fontDisplay } from "../tokens";
import type { OutboundCampaign } from "../types";

export type CampaignRowAction =
  | "edit"
  | "archive"
  | "unarchive"
  | "pause"
  | "resume"
  | "delete";

export function CampaignRowMenu({
  campaign,
  onAction,
}: {
  campaign: OutboundCampaign;
  onAction: (a: CampaignRowAction, c: OutboundCampaign) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const isArchived = campaign.status === "archived";
  const isActive = campaign.status === "active";
  const isPaused = campaign.status === "paused";

  const fire = (action: CampaignRowAction) => (e: React.MouseEvent) => {
    // Critical: stop the row's onClick from also firing — otherwise clicking
    // Delete or Archive bubbles up and navigates to the builder.
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
    onAction(action, campaign);
  };

  return (
    <div
      ref={ref}
      className="relative"
      onClick={(e) => {
        // Belt-and-suspenders: prevent ALL clicks inside the menu wrapper
        // from reaching the parent row.
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50"
        aria-label="Campaign actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
        >
          <Item
            icon={<Edit3 className="h-3 w-3" />}
            label="Edit"
            onClick={fire("edit")}
          />
          {isActive ? (
            <Item
              icon={<PauseCircle className="h-3 w-3 text-amber-600" />}
              label="Pause"
              onClick={fire("pause")}
            />
          ) : null}
          {isPaused ? (
            <Item
              icon={<PlayCircle className="h-3 w-3 text-emerald-600" />}
              label="Resume"
              onClick={fire("resume")}
            />
          ) : null}
          {!isArchived ? (
            <Item
              icon={<Archive className="h-3 w-3 text-slate-500" />}
              label="Archive"
              onClick={fire("archive")}
            />
          ) : (
            <Item
              icon={<RotateCcw className="h-3 w-3 text-slate-500" />}
              label="Restore to draft"
              onClick={fire("unarchive")}
            />
          )}
          <div className="border-t border-slate-100" />
          <Item
            icon={<Trash2 className="h-3 w-3 text-rose-600" />}
            label="Delete"
            destructive
            onClick={fire("delete")}
          />
        </div>
      ) : null}
    </div>
  );
}

function Item({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  destructive?: boolean;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:bg-slate-50"
      style={{
        fontFamily: fontDisplay,
        color: destructive ? "#b91c1c" : "#334155",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
