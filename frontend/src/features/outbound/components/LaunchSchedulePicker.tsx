/**
 * LaunchSchedulePicker — compact button that opens a small popover for
 * setting the campaign's scheduled_start_at + timezone. The value is
 * persisted in UTC; TZ is display-only.
 *
 * Designed to fit in the CampaignBuilder header action cluster — the
 * collapsed button is ≤ 160px wide so it sits next to Preview / Activity
 * / Test send / Save / Launch on one row. Clicking opens a ~280px popover
 * anchored below the button with the datetime-local input, common TZs,
 * and a Clear link. Outside click + ESC close it (mirrors the overlay
 * pattern used elsewhere in outbound, e.g. EngagementDrillIn).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";

interface Props {
  value: string | null;            // ISO-8601 UTC string or null
  timezone: string;                // IANA TZ
  onChange: (utcIso: string | null, tz: string) => void;
  disabled?: boolean;
}

// Convert UTC ISO to a "YYYY-MM-DDTHH:mm" string in the given TZ for the
// datetime-local input.
function utcToLocalInputValue(utcIso: string | null, tz: string): string {
  if (!utcIso) return "";
  try {
    const d = new Date(utcIso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}

// Convert "YYYY-MM-DDTHH:mm" in target TZ → UTC ISO.
function localInputToUtcIso(local: string, tz: string): string | null {
  if (!local) return null;
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const partsNow = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(naive);
  const get = (t: string) => partsNow.find((p) => p.type === t)?.value ?? "00";
  const asUtcOfWall = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    parseInt(get("hour"), 10),
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10),
  );
  const offsetMs = asUtcOfWall - naive.getTime();
  return new Date(naive.getTime() - offsetMs).toISOString();
}

// "Jun 12 · 9:00 AM EDT" — compact human label for the button.
function formatButtonLabel(utcIso: string, tz: string): string {
  try {
    const d = new Date(utcIso);
    const md = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      month: "short",
      day: "numeric",
    }).format(d);
    const t = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
    const tzShort = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      timeZoneName: "short",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value || "";
    return `${md} · ${t}${tzShort ? ` ${tzShort}` : ""}`;
  } catch {
    return utcIso;
  }
}

const COMMON_TZS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function LaunchSchedulePicker({ value, timezone, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const tzOptions = useMemo(() => {
    const browser = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
    })();
    const set = new Set([browser, ...COMMON_TZS, timezone].filter(Boolean));
    return Array.from(set);
  }, [timezone]);

  const localInput = utcToLocalInputValue(value, timezone);
  const buttonLabel = value ? formatButtonLabel(value, timezone) : "Set launch time";
  const isSet = Boolean(value);

  // Outside click + ESC close the popover.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={isSet ? `Scheduled for ${buttonLabel}` : "Pick a launch time for this campaign"}
        className={[
          "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
          isSet
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        ].join(" ")}
        style={{ maxWidth: 160 }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarClock className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{buttonLabel}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Launch schedule"
          className="absolute right-0 top-full z-50 mt-1 w-[280px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="flex items-center justify-between pb-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
              Launch schedule
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <label className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
            Date &amp; time
          </label>
          <input
            type="datetime-local"
            value={localInput}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value
                ? localInputToUtcIso(e.target.value, timezone)
                : null;
              onChange(next, timezone);
            }}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-60"
          />

          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
            Timezone
          </label>
          <select
            value={timezone}
            disabled={disabled}
            onChange={(e) => onChange(value, e.target.value)}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-60"
          >
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange(null, timezone)}
              disabled={disabled || !isSet}
              className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
