import React from "react";
import { cn } from "@/lib/utils";

export type PillProps = {
  label: string;
  tone?: "default" | "primary" | "success" | "warning";
};

export function Pill({ label, tone = "default" }: PillProps) {
  const toneMap: Record<NonNullable<PillProps["tone"]>, string> = {
    default:
      "bg-slate-100/80 text-slate-700 ring-1 ring-inset ring-slate-200/80",
    primary:
      "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200/80",
    success:
      "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70",
    warning:
      "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em]",
        toneMap[tone],
      )}
    >
      {label}
    </span>
  );
}

export type KpiCardProps = {
  title: string;
  value: string;
  helper?: string;
  accent?: "indigo" | "emerald" | "sky" | "slate";
};

export function KpiCard({
  title,
  value,
  helper,
  accent = "slate",
}: KpiCardProps) {
  const accentMap: Record<
    NonNullable<KpiCardProps["accent"]>,
    { badge: string; border: string }
  > = {
    indigo: {
      badge: "bg-indigo-50 text-indigo-700 ring-indigo-100/80",
      border: "border-indigo-100",
    },
    emerald: {
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-100/80",
      border: "border-emerald-100",
    },
    sky: {
      badge: "bg-sky-50 text-sky-700 ring-sky-100/80",
      border: "border-sky-100",
    },
    slate: {
      badge: "bg-slate-100 text-slate-700 ring-slate-200/80",
      border: "border-slate-200",
    },
  };

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/90 p-4 shadow-sm transition hover:shadow-md",
        accentMap[accent].border,
      )}
    >
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
        <span>{title}</span>
        {helper && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.2em]",
              accentMap[accent].badge,
            )}
          >
            {helper}
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export type SettingsHeaderProps = {
  title: string;
  description: string;
  workspaceName?: string;
};

export function SettingsHeader({
  title,
  description,
  workspaceName = "Spark Fusion",
}: SettingsHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-600">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </div>
      <div className="flex flex-col items-start gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">
            LIT
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
              Active workspace
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {workspaceName}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Manage access, messaging, and credits across your LIT Search teams.
        </p>
      </div>
    </div>
  );
}
