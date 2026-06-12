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
import { CalendarClock, Info, X } from "lucide-react";
import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz";

interface Props {
  value: string | null;            // ISO-8601 UTC string or null
  timezone: string;                // IANA TZ
  onChange: (utcIso: string | null, tz: string) => void;
  disabled?: boolean;
  /**
   * Campaign status — when "active", the picker surfaces a help note explaining
   * that changing this time shifts the entire sequence (Day 2/3/4 all move
   * with the anchor). Recipients who already received earlier steps keep their
   * current cadence; this only affects future sends.
   */
  campaignStatus?: string | null;
}

// Convert UTC ISO to a "YYYY-MM-DDTHH:mm" string in the given TZ for the
// datetime-local input. Uses date-fns-tz so DST transitions are handled
// correctly (the prior custom Intl-based math captured the offset for the
// current instant and mis-applied it to the picked moment, causing campaigns
// scheduled near a DST boundary to fire 1 hour early/late).
export function utcToLocalInputValue(utcIso: string | null, tz: string): string {
  if (!utcIso) return "";
  try {
    const zoned = toZonedTime(utcIso, tz);
    return formatTz(zoned, "yyyy-MM-dd'T'HH:mm", { timeZone: tz });
  } catch {
    return "";
  }
}

// Convert "YYYY-MM-DDTHH:mm" wall-clock string in target TZ → UTC ISO.
// `fromZonedTime` knows the IANA TZ offset for the *picked* moment (not "now"),
// so it correctly disambiguates DST gap times (spring forward — the impossible
// 2:30 AM resolves to 3:30 AM wall / 07:30Z in NY) and ambiguous fall-back
// times (it picks the earlier of the two 1:30 AMs by default).
export function localInputToUtcIso(local: string, tz: string): string | null {
  if (!local) return null;
  try {
    const utc = fromZonedTime(local, tz);
    if (Number.isNaN(utc.getTime())) return null;
    return utc.toISOString();
  } catch {
    return null;
  }
}

// "Jun 12 · 9:00 AM EDT" — compact human label for the button.
export function formatButtonLabel(utcIso: string, tz: string): string {
  try {
    const d = new Date(utcIso);
    if (Number.isNaN(d.getTime())) return utcIso;
    const md = formatTz(d, "MMM d", { timeZone: tz });
    const t = formatTz(d, "h:mm a", { timeZone: tz });
    const tzShort = formatTz(d, "zzz", { timeZone: tz });
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

export function LaunchSchedulePicker({ value, timezone, onChange, disabled, campaignStatus }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const isActiveCampaign = campaignStatus === "active";

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
        title={
          isActiveCampaign
            ? `Scheduled for ${buttonLabel} — changing this on an active campaign shifts the whole sequence.`
            : isSet
              ? `Scheduled for ${buttonLabel}`
              : "Pick a launch time for this campaign"
        }
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

          {isActiveCampaign ? (
            <div
              role="note"
              className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10.5px] leading-snug text-amber-900"
            >
              <Info className="mt-[1px] h-3 w-3 shrink-0 text-amber-600" />
              <span>
                Changing this on an <strong>active</strong> campaign shifts the
                entire sequence — Day 2, 3, 4 all move with it. Recipients who
                already received earlier steps keep their current cadence.
              </span>
            </div>
          ) : null}

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
