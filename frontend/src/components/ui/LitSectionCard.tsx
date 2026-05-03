import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type LitSectionCardProps = {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  padded?: boolean;
  /** Tighter body padding for dense lists/forms. */
  dense?: boolean;
  accentHeader?: boolean;
  /** Red border + light tint to flag destructive or attention-required content. */
  danger?: boolean;
  /** Header becomes a chevron toggle that hides/shows the body. Mirrors the
   *  Profile-page right rail (CDPDetailsPanel) collapsible Section. */
  collapsible?: boolean;
  /** Initial open state when collapsible. Defaults to true. */
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
};

export default function LitSectionCard({
  title,
  sub,
  action,
  padded = true,
  dense,
  accentHeader,
  danger,
  collapsible,
  defaultOpen = true,
  className,
  bodyClassName,
  children,
}: LitSectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const showHeader = title != null || action != null;
  const headerInteractive = collapsible && title != null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        danger ? "border-red-200" : "border-slate-200",
        className,
      )}
    >
      {showHeader && (
        <div
          onClick={headerInteractive ? () => setOpen((v) => !v) : undefined}
          role={headerInteractive ? "button" : undefined}
          tabIndex={headerInteractive ? 0 : undefined}
          aria-expanded={collapsible ? open : undefined}
          onKeyDown={
            headerInteractive
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen((v) => !v);
                  }
                }
              : undefined
          }
          className={cn(
            "flex shrink-0 items-center justify-between gap-2 px-4 py-3",
            (open || !collapsible) ? "border-b border-slate-100" : "",
            accentHeader && "bg-[#FAFBFC]",
            headerInteractive && "cursor-pointer select-none transition hover:bg-slate-50/40",
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            {collapsible && (
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex h-4 w-4 items-center justify-center text-slate-400 transition-transform",
                  open ? "rotate-0" : "-rotate-90",
                )}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0">
              {title != null && (
                <div className="font-display truncate text-[13px] font-bold text-slate-900">
                  {title}
                </div>
              )}
              {sub != null && (
                <div className="font-body mt-px truncate text-[11px] text-slate-400">
                  {sub}
                </div>
              )}
            </div>
          </div>
          {action != null && (
            <div
              onClick={headerInteractive ? (e) => e.stopPropagation() : undefined}
              className="shrink-0"
            >
              {action}
            </div>
          )}
        </div>
      )}
      {(!collapsible || open) && (
        <div
          className={cn(
            "flex-1 min-h-0",
            padded ? (dense ? "p-3" : "p-4") : "",
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
