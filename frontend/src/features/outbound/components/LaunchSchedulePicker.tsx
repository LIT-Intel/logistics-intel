/**
 * LaunchSchedulePicker — datetime-local + TZ select for setting the
 * campaign's scheduled_start_at. Sub-project J. The value is persisted
 * in UTC; TZ is display-only.
 */
import { useMemo } from "react";
import { CalendarClock } from "lucide-react";

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
    // toLocaleString in the target TZ, then reformat to input shape.
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
  // Parse local as if it were UTC, then adjust for TZ offset at that instant.
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  // Compute offset between naive and the same wall-clock in `tz`.
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
  const tzOptions = useMemo(() => {
    const browser = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
    })();
    const set = new Set([browser, ...COMMON_TZS, timezone].filter(Boolean));
    return Array.from(set);
  }, [timezone]);

  const localInput = utcToLocalInputValue(value, timezone);

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">
      <CalendarClock className="h-3 w-3 text-blue-600" />
      <span className="font-semibold uppercase tracking-[0.06em] text-slate-500">Launch</span>
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
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-60"
      />
      <select
        value={timezone}
        disabled={disabled}
        onChange={(e) => onChange(value, e.target.value)}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-60"
      >
        {tzOptions.map((tz) => (
          <option key={tz} value={tz}>{tz}</option>
        ))}
      </select>
    </div>
  );
}
