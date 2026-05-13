// AdminShared.tsx — UI primitives for the admin dashboard.
//
// Translated from the design handoff prototype (design/AdminShared.jsx)
// into Tailwind utilities so they slot into the rest of the app's
// component library. Visuals match the prototype 1:1: same radius,
// shadow, type sizes, hover behavior, and motion durations.

import React from "react";
import {
  ArrowRight,
  ChevronDown,
  Database,
  Inbox,
  Search,
  type LucideIcon,
} from "lucide-react";

export type Tone = "slate" | "blue" | "cyan" | "green" | "amber" | "red" | "violet";

const TONE_BG: Record<Tone, string> = {
  slate: "bg-slate-100", blue: "bg-blue-50", cyan: "bg-cyan-50",
  green: "bg-emerald-50", amber: "bg-amber-50", red: "bg-rose-50", violet: "bg-violet-50",
};
const TONE_TEXT: Record<Tone, string> = {
  slate: "text-slate-600", blue: "text-blue-700", cyan: "text-cyan-700",
  green: "text-emerald-700", amber: "text-amber-700", red: "text-rose-700", violet: "text-violet-700",
};
const TONE_BORDER: Record<Tone, string> = {
  slate: "border-slate-200", blue: "border-blue-200", cyan: "border-cyan-200",
  green: "border-emerald-200", amber: "border-amber-200", red: "border-rose-200", violet: "border-violet-200",
};
const TONE_DOT: Record<Tone, string> = {
  slate: "bg-slate-400", blue: "bg-blue-500", cyan: "bg-cyan-500",
  green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", violet: "bg-violet-500",
};

const fontDisplay = "'Space Grotesk', system-ui, sans-serif";
const fontBody = "'DM Sans', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', ui-monospace, monospace";

export const aBtnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-600 shadow-[0_1px_4px_rgba(59,130,246,0.3)] hover:from-blue-600 hover:to-blue-700 transition";
export const aBtnGhost =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 transition";
export const aBtnDanger =
  "inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-700 hover:bg-rose-50 transition";
export const aBtnWarn =
  "inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12.5px] font-semibold text-amber-800 hover:bg-amber-100 transition";
export const aBtnDark =
  "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-slate-800 transition";

export function APanel({
  title,
  subtitle,
  right,
  children,
  danger,
  pad,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  danger?: boolean;
  pad?: number;
}) {
  const padding = pad != null ? pad : 18;
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] ${
        danger ? "border-rose-200" : "border-slate-200"
      }`}
    >
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            {title ? (
              <div
                className="flex items-center gap-2 text-[14px] font-bold tracking-[-0.005em] text-slate-900"
                style={{ fontFamily: fontDisplay }}
              >
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div className="mt-0.5 text-[12.5px] text-slate-500" style={{ fontFamily: fontBody }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
        </div>
      )}
      <div className="min-h-0 flex-1" style={{ padding }}>
        {children}
      </div>
    </div>
  );
}

export function APill({
  tone = "slate",
  children,
  dot,
  icon: Icon,
  mono,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  icon?: LucideIcon;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_BG[tone]} ${TONE_TEXT[tone]} ${TONE_BORDER[tone]}`}
      style={{ fontFamily: mono ? fontMono : fontDisplay, letterSpacing: "0.01em" }}
    >
      {dot ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} /> : null}
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

export function AKPI({
  label,
  value,
  sub,
  trend,
  tone = "slate",
  unit,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  trend?: string | null;
  tone?: Tone;
  unit?: string;
  icon?: LucideIcon;
}) {
  const trendIsUp = trend?.startsWith("+");
  const trendIsDown = trend?.startsWith("-");
  const trendColor = trendIsUp
    ? "text-emerald-700"
    : trendIsDown
      ? trend!.match(/ms|%/) && !trend!.includes("err")
        ? "text-emerald-700"
        : "text-rose-700"
      : "text-slate-500";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon ? (
            <div className={`flex h-5.5 w-5.5 items-center justify-center rounded-md ${TONE_BG[tone]} ${TONE_TEXT[tone]}`} style={{ width: 22, height: 22 }}>
              <Icon className="h-3 w-3" />
            </div>
          ) : null}
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500"
            style={{ fontFamily: fontDisplay }}
          >
            {label}
          </span>
        </div>
        {trend ? (
          <span className={`text-[10.5px] font-semibold ${trendColor}`} style={{ fontFamily: fontMono }}>
            {trend}
          </span>
        ) : null}
      </div>
      <div className="leading-[1.05] text-[26px] font-bold tracking-[-0.02em] text-slate-950" style={{ fontFamily: fontDisplay }}>
        {value}
        {unit ? (
          <span className="ml-1 text-[13px] font-semibold text-slate-400">{unit}</span>
        ) : null}
      </div>
      {sub ? <div className="text-[11.5px] text-slate-400" style={{ fontFamily: fontBody }}>{sub}</div> : null}
    </div>
  );
}

export function ARow({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 transition hover:bg-slate-50 ${onClick ? "cursor-pointer" : ""}`}
    >
      {children}
    </div>
  );
}

export function ASpark({
  data,
  w = 90,
  h = 28,
  stroke = "#3B82F6",
  fill = "rgba(59,130,246,0.1)",
}: {
  data: number[];
  w?: number;
  h?: number;
  stroke?: string;
  fill?: string;
}) {
  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * (h - 4) - 2] as const);
  const d = "M " + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ");
  const area = d + ` L ${w.toFixed(1)},${h} L 0,${h} Z`;
  return (
    <svg width={w} height={h} className="block">
      <path d={area} fill={fill} />
      <path d={d} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ABar({
  value,
  max,
  tone = "blue",
  height = 6,
  showLabel,
}: {
  value: number;
  max: number;
  tone?: Tone;
  height?: number;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="flex w-full items-center gap-2.5">
      <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height }}>
        <div className={`h-full ${TONE_DOT[tone]} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? (
        <span className="min-w-[38px] text-right text-[11px] text-slate-500" style={{ fontFamily: fontMono }}>
          {pct.toFixed(0)}%
        </span>
      ) : null}
    </div>
  );
}

export function ADot({ tone = "green", live, size = 8 }: { tone?: Tone; live?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {live ? (
        <span
          className={`absolute inset-0 animate-ping rounded-full ${TONE_DOT[tone]} opacity-40`}
          style={{ animationDuration: "1.8s" }}
        />
      ) : null}
      <span className={`relative inline-block rounded-full ${TONE_DOT[tone]}`} style={{ width: size, height: size }} />
    </span>
  );
}

export function AInput({
  icon: Icon = Search,
  value,
  onChange,
  placeholder,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon; className?: string }) {
  return (
    <div className={`relative inline-flex items-center ${className ?? ""}`}>
      {Icon ? <Icon className="pointer-events-none absolute left-2.5 h-3 w-3 text-slate-400" /> : null}
      <input
        value={value as string}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full rounded-lg border-[1.5px] border-slate-200 bg-slate-50 py-1.5 text-[12.5px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 ${Icon ? "pl-7 pr-3" : "px-3"}`}
        style={{ fontFamily: fontBody }}
        {...rest}
      />
    </div>
  );
}

export function ASelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string } | string>;
  className?: string;
}) {
  return (
    <div className={`relative inline-flex ${className ?? ""}`}>
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none rounded-lg border-[1.5px] border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-[12.5px] text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
        style={{ fontFamily: fontBody }}
      >
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function AToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? "bg-blue-500" : "bg-slate-300"
      } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
          checked ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function AHead({
  cols,
}: {
  cols: Array<{ label: string; flex?: number; w?: number; align?: "left" | "right" | "center" }>;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
      {cols.map((c, i) => (
        <div
          key={i}
          className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
          style={{
            fontFamily: fontDisplay,
            flex: c.flex ?? (c.w ? "none" : 1),
            width: c.w,
            minWidth: c.w,
            textAlign: c.align || "left",
          }}
        >
          {c.label}
        </div>
      ))}
    </div>
  );
}

export function AEmpty({
  icon: Icon = Inbox,
  title,
  sub,
  cta,
}: {
  icon?: LucideIcon;
  title: string;
  sub?: React.ReactNode;
  cta?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-8 text-center">
      <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="text-[13px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
        {title}
      </div>
      {sub ? (
        <div className="mx-auto mt-1 max-w-md text-[12px] text-slate-500" style={{ fontFamily: fontBody }}>
          {sub}
        </div>
      ) : null}
      {cta ? <div className="mt-3 flex justify-center">{cta}</div> : null}
    </div>
  );
}

export function ASourceNotConnected({ tableName, hint }: { tableName: string; hint?: string }) {
  return (
    <AEmpty
      icon={Database}
      title="Source not connected yet"
      sub={
        <>
          The panel reads from <span className="font-mono text-[11px] text-slate-700">{tableName}</span> which isn't
          wired up yet.
          {hint ? <span className="block mt-1 text-slate-400">{hint}</span> : null}
        </>
      }
    />
  );
}

export function AIconBtn({
  icon: Icon,
  onClick,
  tone = "slate",
  title,
  disabled,
}: {
  icon: LucideIcon;
  onClick?: () => void;
  tone?: Tone;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition hover:border-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 ${TONE_TEXT[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export { fontDisplay, fontBody, fontMono };

export const ADMIN_FONT_TOKENS = { fontDisplay, fontBody, fontMono };

export function AArrow() {
  return <ArrowRight className="h-3 w-3" />;
}
