import React from "react";
import { cn } from "@/lib/utils";

type LitHeaderIconBtnProps = {
  icon: React.ReactNode;
  label: string;
  badge?: string | number | null;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

export default function LitHeaderIconBtn({
  icon,
  label,
  badge,
  onClick,
  disabled,
  className,
}: LitHeaderIconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors duration-150",
        "hover:border-slate-300 hover:bg-slate-50",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        {icon}
      </span>
      {badge != null && badge !== "" && (
        <span
          className={cn(
            "font-mono absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full",
            "border-[1.5px] border-white bg-red-500 px-[3px] text-[9px] font-bold text-white",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}