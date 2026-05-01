import React from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// LIT Settings Design Primitives v2
// Matches design_handoff_settings_redesign — Space Grotesk (font-display) for
// headings/labels/buttons, DM Sans (font-body) for body copy and inputs.
// ─────────────────────────────────────────────────────────────────────────────

// ── SCard ────────────────────────────────────────────────────────────────────
export type SCardProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  dense?: boolean;
  danger?: boolean;
  className?: string;
};

export function SCard({ title, subtitle, right, children, dense, danger, className }: SCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden",
        danger ? "border-rose-200" : "border-slate-200",
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pt-4 pb-3.5">
          <div className="min-w-0">
            {title && (
              <div className="font-display text-[14px] font-bold text-slate-900 tracking-[-0.01em]">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="font-body text-[12.5px] text-slate-500 mt-0.5 leading-[1.45] max-w-[560px]">
                {subtitle}
              </div>
            )}
          </div>
          {right && (
            <div className="flex items-center gap-2 shrink-0">{right}</div>
          )}
        </header>
      )}
      <div className={cn(dense ? "px-5 py-3" : "px-5 py-4")}>{children}</div>
    </article>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
export type SectionHeaderProps = {
  kicker: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
};

export function SectionHeader({ kicker, title, description, right }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">
          {kicker}
        </p>
        <h2 className="mt-1 font-display text-[22px] font-bold text-slate-900 tracking-[-0.02em]">
          {title}
        </h2>
        {description && (
          <p className="mt-1 font-body text-[13px] text-slate-500 leading-[1.5] max-w-[680px]">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ── Pill (status badge) ───────────────────────────────────────────────────────
export type PillTone =
  | "slate"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "violet"
  | "cyan";

export type PillProps = {
  tone?: PillTone;
  dot?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const PILL_TONE: Record<PillTone, string> = {
  slate:  "bg-slate-100 text-slate-600 border-slate-200",
  blue:   "bg-blue-50 text-blue-700 border-blue-200",
  green:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber:  "bg-amber-50 text-amber-700 border-amber-200",
  red:    "bg-rose-50 text-rose-700 border-rose-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  cyan:   "bg-cyan-50 text-cyan-700 border-cyan-200",
};

const DOT_TONE: Record<PillTone, string> = {
  slate:  "bg-slate-400",
  blue:   "bg-blue-500",
  green:  "bg-emerald-500",
  amber:  "bg-amber-400",
  red:    "bg-rose-400",
  violet: "bg-violet-500",
  cyan:   "bg-cyan-500",
};

export function Pill({ tone = "slate", dot, icon, children, className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-[11px] font-semibold tracking-[0.01em] whitespace-nowrap",
        PILL_TONE[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT_TONE[tone])} />
      )}
      {icon && <span className="h-3 w-3 shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

// ── SToggle ───────────────────────────────────────────────────────────────────
export type SToggleProps = {
  on: boolean;
  onToggle: () => void;
  title: string;
  description?: string;
  disabled?: boolean;
  small?: boolean;
};

export function SToggle({ on, onToggle, title, description, disabled, small }: SToggleProps) {
  const trackW = small ? "w-8" : "w-[34px]";
  const trackH = small ? "h-[18px]" : "h-5";
  const thumbSz = small ? "h-3.5 w-3.5" : "h-4 w-4";
  const thumbOn = small ? "left-[14px]" : "left-[15px]";
  const thumbOff = "left-0.5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60",
        on
          ? "bg-blue-50/40 border-blue-100"
          : "bg-white border-slate-200 hover:bg-slate-50",
      )}
    >
      <span className="min-w-0">
        <span className="block font-display text-[13px] font-semibold text-slate-900">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block font-body text-[12px] text-slate-500">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative block shrink-0 rounded-full transition",
          trackW,
          trackH,
          on ? "bg-blue-500" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 inline-block rounded-full bg-white shadow transition-all duration-150",
            thumbSz,
            on ? thumbOn : thumbOff,
          )}
        />
      </span>
    </button>
  );
}

// ── Raw toggle (for matrix cells) ────────────────────────────────────────────
export function RawToggle({
  on,
  onToggle,
  label,
  small,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  small?: boolean;
}) {
  const trackW = small ? "w-8" : "w-[34px]";
  const trackH = small ? "h-[18px]" : "h-5";
  const thumbSz = small ? "h-3.5 w-3.5" : "h-4 w-4";
  const thumbOn = small ? "left-[14px]" : "left-[15px]";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        "relative rounded-full transition",
        trackW,
        trackH,
        on ? "bg-blue-500" : "bg-slate-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 inline-block rounded-full bg-white shadow transition-all duration-150",
          thumbSz,
          on ? thumbOn : "left-0.5",
        )}
      />
    </button>
  );
}

// ── Button variants ───────────────────────────────────────────────────────────
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export function BtnPrimary({ children, className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)] hover:from-[#2563EB] hover:to-[#1d4ed8] disabled:opacity-60 disabled:cursor-not-allowed transition",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BtnGhost({ children, className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-display text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BtnDanger({ children, className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-display text-[13px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed transition",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BtnDark({ children, className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 font-display text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ── Form inputs ───────────────────────────────────────────────────────────────
export function SInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-body text-[13px] text-slate-900 outline-none transition",
        "focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    />
  );
}

export function STextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-body text-[13px] text-slate-900 outline-none transition resize-none",
        "focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    />
  );
}

export function SSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 font-body text-[13px] text-slate-900 outline-none transition",
          "focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
          "disabled:cursor-not-allowed disabled:opacity-60",
          props.className,
        )}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M3 5L6.5 8.5L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

// ── SField (label wrapper) ────────────────────────────────────────────────────
export function SField({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-display text-[12px] font-semibold text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

// ── StatusMsg ─────────────────────────────────────────────────────────────────
export function StatusMsg({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-body text-[13px] text-rose-700">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {error}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-body text-[13px] text-emerald-700">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {success}
    </div>
  );
}

// Legacy exports kept for backward compat with any remaining usages
export type { PillProps as PillV1Props };
export { Pill as SBadge };
