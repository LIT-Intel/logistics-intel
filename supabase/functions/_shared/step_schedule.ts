// Sub-project J.2 — step-level time-of-day + weekday-only scheduling.
//
// Shared between send-campaign-email (dispatcher) and
// queue-campaign-recipients (initial enrollment).
//
// Inputs come from lit_campaign_steps.time_of_day_local (Postgres `time`)
// and .weekdays_only (boolean). The "local" half is interpreted in the
// campaign's send_timezone (IANA TZ string, e.g. "America/New_York").
//
// Hard rules:
//   - Backwards-compatible. When time_of_day_local is NULL AND weekdays_only
//     is false, the input timestamp is returned unchanged.
//   - "earlier than calculated time => bump forward one day" — preserves
//     the invariant that the adjusted time is never before the delay-
//     computed time. Critical so we never accidentally fire a step before
//     its delay window completes.
//   - Weekday bump applies AFTER the time-of-day snap so the final result
//     never lands on a weekend when weekdays_only=true.
//
// Time zones are resolved via Intl.DateTimeFormat — Deno's runtime ships
// the full ICU/tz data so any valid IANA TZ string works without an
// extra dependency.

export interface StepScheduleHints {
  timeOfDayLocal: string | null; // "HH:MM:SS" or "HH:MM" from Postgres time
  weekdaysOnly: boolean;
  timezone: string; // IANA TZ, e.g. "America/New_York"; "UTC" is fine
}

/**
 * Adjust a UTC ISO timestamp so it (a) lands at `timeOfDayLocal` in the
 * given timezone on the same or next local day, and (b) optionally bumps
 * past Sat/Sun to the next Monday.
 *
 * Both rules are skipped when the corresponding hint is unset. This keeps
 * the existing delay-based dispatcher behavior bit-for-bit identical when
 * no step-level hints are provided.
 */
export function applyStepSchedule(baseUtcIso: string, hints: StepScheduleHints): string {
  let when = new Date(baseUtcIso);
  if (Number.isNaN(when.getTime())) return baseUtcIso;

  if (hints.timeOfDayLocal) {
    when = snapToLocalTimeOfDay(when, hints.timeOfDayLocal, hints.timezone);
  }
  if (hints.weekdaysOnly) {
    when = bumpToWeekday(when, hints.timezone, hints.timeOfDayLocal);
  }
  return when.toISOString();
}

/**
 * Parse "HH:MM[:SS]" → { hour, minute, second }.
 */
function parseTime(t: string): { hour: number; minute: number; second: number } {
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(t.trim());
  if (!m) return { hour: 0, minute: 0, second: 0 };
  return {
    hour: Math.min(23, Math.max(0, Number(m[1]) || 0)),
    minute: Math.min(59, Math.max(0, Number(m[2]) || 0)),
    second: Math.min(59, Math.max(0, Number(m[3] ?? 0) || 0)),
  };
}

/**
 * Return the UTC milliseconds offset for a given UTC instant in the given
 * IANA timezone. Positive when the local zone is ahead of UTC (e.g. Tokyo).
 *
 * Implementation: format the instant in the target zone using
 * Intl.DateTimeFormat → parse back as if those local fields were UTC →
 * subtract from the original UTC instant. The difference is the zone's
 * offset (with DST resolved for that exact instant).
 */
function tzOffsetMs(instantUtcMs: number, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(instantUtcMs));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  // hour "24" can appear when hour12:false; normalize to 0.
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - instantUtcMs;
}

/**
 * Return the local Y/M/D in `timezone` for a given UTC instant.
 */
function localYmd(instantUtcMs: number, timezone: string): { y: number; m: number; d: number; weekday: number } {
  // Use weekday short to extract day-of-week without a second formatter call.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(instantUtcMs));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

/**
 * Build a Date representing local Y-M-D h:m:s in `timezone` as a UTC instant.
 *
 * Two-pass because DST can shift the offset between the rough guess
 * and the actual instant. Single pass usually suffices; two passes
 * is the standard idiom for "build a UTC instant from local fields".
 */
function localToUtc(
  y: number, m: number, d: number, h: number, mi: number, s: number,
  timezone: string,
): Date {
  // First guess: treat the local fields as if they were UTC.
  const guessUtcMs = Date.UTC(y, m - 1, d, h, mi, s);
  const offset1 = tzOffsetMs(guessUtcMs, timezone);
  // Subtract that offset to get the real UTC instant whose local
  // representation matches our target fields.
  const trueUtcMs = guessUtcMs - offset1;
  // Re-check; DST boundaries can shift the offset by ±1h between guesses.
  const offset2 = tzOffsetMs(trueUtcMs, timezone);
  if (offset1 === offset2) return new Date(trueUtcMs);
  return new Date(guessUtcMs - offset2);
}

/**
 * Snap the given UTC instant to `timeOfDayLocal` in `timezone`. If the
 * snapped value is earlier than the input, bump forward one local day so
 * the result is always >= the input.
 *
 * This guarantees we never fire a step before its delay window completes,
 * even when the delay would otherwise land at, say, 3 PM local and the
 * step asks for 9 AM.
 */
function snapToLocalTimeOfDay(base: Date, timeOfDayLocal: string, timezone: string): Date {
  const { hour, minute, second } = parseTime(timeOfDayLocal);
  const baseMs = base.getTime();
  const { y, m, d } = localYmd(baseMs, timezone);
  let snapped = localToUtc(y, m, d, hour, minute, second, timezone);
  if (snapped.getTime() < baseMs) {
    // Bump one local day. We rebuild from the local Y-M-D so DST
    // transitions on the day after don't drift the clock.
    const nextLocalDayMs = snapped.getTime() + 86_400_000;
    const next = localYmd(nextLocalDayMs, timezone);
    snapped = localToUtc(next.y, next.m, next.d, hour, minute, second, timezone);
  }
  return snapped;
}

/**
 * If the given instant falls on a weekend in `timezone`, bump forward to
 * the next Monday at the same time-of-day (or midnight if not provided).
 */
function bumpToWeekday(when: Date, timezone: string, timeOfDayLocal: string | null): Date {
  const { weekday, y, m, d } = localYmd(when.getTime(), timezone);
  if (weekday !== 0 && weekday !== 6) return when;
  // Sat = 6 → +2 days; Sun = 0 → +1 day.
  const daysToAdd = weekday === 6 ? 2 : 1;
  const targetMs = when.getTime() + daysToAdd * 86_400_000;
  const next = localYmd(targetMs, timezone);
  let hour = 0, minute = 0, second = 0;
  if (timeOfDayLocal) {
    const t = parseTime(timeOfDayLocal);
    hour = t.hour; minute = t.minute; second = t.second;
  } else {
    // Preserve the original local time-of-day when no explicit ToD was given.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(when);
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
    hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
    minute = Number(map.minute);
    second = Number(map.second);
    // Suppress unused warnings on y/m/d
    void y; void m; void d;
  }
  return localToUtc(next.y, next.m, next.d, hour, minute, second, timezone);
}
