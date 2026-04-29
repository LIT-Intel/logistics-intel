import React from "react";
import { cn } from "@/lib/utils";

type LitSectionCardProps = {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  padded?: boolean;
  accentHeader?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
};

export default function LitSectionCard({
  title,
  sub,
  action,
  padded = true,
  accentHeader,
  className,
  bodyClassName,
  children,
}: LitSectionCardProps) {
  const showHeader = title != null || action != null;
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        className,
      )}
    >
      {showHeader && (
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3",
            accentHeader && "bg-[#FAFBFC]",
          )}
        >
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
          {action != null && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("flex-1 min-h-0", padded ? "p-4" : "", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}