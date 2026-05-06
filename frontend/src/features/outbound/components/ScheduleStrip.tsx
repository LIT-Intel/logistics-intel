import React, { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import type { BuilderStep } from "../types";

// ScheduleStrip — projected per-step send times. Lives above the timeline
// so users see real datetimes update live as they tweak delays. Computes
// step N as step N-1's projected send time + step N's (delay_days +
// delay_hours + delay_minutes). Wait steps consume their own delay; the
// next non-wait step inherits that.

const TZ_LABEL = (() => {
  try {
    const dt = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return dt || Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  } catch {
    return "local";
  }
})();

function fmtAbsolute(date: Date): string {
  // e.g. "May 6, 9:00 AM"
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtRelative(ms: number): string {
  if (ms <= 0) return "immediately";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `+${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `+${h} hr${h === 1 ? "" : "s"}`;
  const d = Math.floor(min / (60 * 24));
  const remH = Math.round((min - d * 60 * 24) / 60);
  if (remH > 0) return `+${d}d ${remH}h`;
  return `+${d} day${d === 1 ? "" : "s"}`;
}

function stepDelayMs(s: BuilderStep): number {
  const days = s.kind === "wait" ? Math.max(0, s.waitDays || 0) : Math.max(0, s.delayDays || 0);
  const minutes = s.kind === "wait"
    ? Math.max(0, Math.min(59, s.waitMinutes || 0))
    : Math.max(0, Math.min(59, s.delayMinutes || 0));
  return days * 86_400_000 + minutes * 60_000;
}

function channelLabel(kind: BuilderStep["kind"]): string {
  if (kind === "email") return "Email";
  if (kind === "linkedin_invite") return "LinkedIn invite";
  if (kind === "linkedin_message") return "LinkedIn message";
  if (kind === "call") return "Call";
  return "Wait";
}

export function ScheduleStrip({ steps, launching }: { steps: BuilderStep[]; launching?: boolean }) {
  const rows = useMemo(() => {
    const out: Array<{
      idx: number;
      kind: BuilderStep["kind"];
      label: string;
      title: string;
      at: Date;
      relMs: number;
    }> = [];
    let cursor = Date.now();
    let nonWaitCount = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      cursor += stepDelayMs(s);
      const at = new Date(cursor);
      if (s.kind === "wait") {
        out.push({
          idx: i,
          kind: s.kind,
          label: `Wait`,
          title: `Pause ${fmtRelative(stepDelayMs(s))}`.replace("+", ""),
          at,
          relMs: cursor - Date.now(),
        });
        continue;
      }
      nonWaitCount += 1;
      const subject = (s.kind === "email" ? s.subject : s.title) || "";
      out.push({
        idx: i,
        kind: s.kind,
        label: `${channelLabel(s.kind)} #${nonWaitCount}`,
        title: subject.trim() || "(no subject)",
        at,
        relMs: cursor - Date.now(),
      });
    }
    return out;
  }, [steps]);

  if (rows.length === 0) return null;

  return (
    <div
      className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-slate-200 bg-[#F8FAFC] px-3 py-2"
      style={{ fontFamily: fontBody }}
      aria-label="Projected campaign schedule"
    >
      <div
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1"
        style={{ fontFamily: fontDisplay }}
      >
        <CalendarClock className="h-3 w-3 text-blue-600" />
        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
          Projected schedule
        </span>
        <span className="text-[10px] font-mono text-slate-400">{TZ_LABEL}</span>
      </div>
      <div className="flex flex-1 items-stretch gap-1">
        {rows.map((r) => {
          const isWait = r.kind === "wait";
          return (
            <div
              key={r.idx}
              className="flex min-w-[150px] shrink-0 flex-col rounded-md border px-2 py-1"
              style={{
                background: isWait ? "#FFFBEB" : "#fff",
                borderColor: isWait ? "#FDE68A" : "#E5E7EB",
              }}
              title={`${r.label} — ${fmtAbsolute(r.at)} (${fmtRelative(r.relMs)})`}
            >
              <div
                className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400"
                style={{ fontFamily: fontDisplay }}
              >
                {r.label}
                <span className="ml-1.5 text-slate-400">{fmtRelative(r.relMs)}</span>
              </div>
              <div
                className="truncate text-[12px] font-semibold text-[#0F172A]"
                style={{ fontFamily: fontDisplay }}
              >
                {fmtAbsolute(r.at)}
              </div>
              <div
                className="truncate text-[10px] text-slate-500"
                style={{ fontFamily: fontMono }}
              >
                {r.title}
              </div>
            </div>
          );
        })}
        <div
          className="ml-auto shrink-0 self-center rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500"
          style={{ fontFamily: fontBody }}
        >
          {launching ? "Launching now…" : "Times update live as you edit delays"}
        </div>
      </div>
    </div>
  );
}
