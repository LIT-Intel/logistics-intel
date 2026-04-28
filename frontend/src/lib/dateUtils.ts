/**
 * Date utility functions for ImportYeti and other date formats
 */

/**
 * Parse ImportYeti date format (DD/MM/YYYY) to ISO date string
 * @param dateString - Date in format "26/12/2025" or similar
 * @returns ISO date string "2025-12-26" or null if invalid
 */
export function parseImportYetiDate(dateString: string | null | undefined): string | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();
  if (!trimmed) {
    return null;
  }

  // Match DD/MM/YYYY format
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    // If it doesn't match, try to parse as-is (might already be ISO)
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return null;
  }

  const [, day, month, year] = match;
  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  // Validate ranges
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
    return null;
  }

  // Create date and validate it's real (e.g., not Feb 31)
  const date = new Date(yearNum, monthNum - 1, dayNum);
  if (date.getFullYear() !== yearNum || date.getMonth() !== monthNum - 1 || date.getDate() !== dayNum) {
    return null;
  }

  // Return ISO format
  return date.toISOString().split('T')[0];
}

/**
 * Format ISO date to user-friendly format
 * @param isoDate - ISO date string "2025-12-26"
 * @param options.fallback - Value returned when the input is null, empty, or unparseable. Defaults to 'Unknown' for backwards compatibility; card surfaces should pass '—'.
 * @returns Formatted date "Dec 26, 2025" or the fallback
 */
export function formatUserFriendlyDate(
  isoDate: string | null | undefined,
  options?: { fallback?: string }
): string {
  const fallback = options?.fallback ?? 'Unknown';

  if (!isoDate) {
    return fallback;
  }

  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) {
      return fallback;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return fallback;
  }
}

/**
 * Check if date is recent (within N days)
 * @param isoDate - ISO date string
 * @param daysThreshold - Number of days to consider recent (default 30)
 * @returns true if date is within threshold
 */
export function isRecentDate(isoDate: string | null | undefined, daysThreshold: number = 30): boolean {
  if (!isoDate) {
    return false;
  }

  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays >= 0 && diffDays <= daysThreshold;
  } catch {
    return false;
  }
}

/**
 * Check if date is old (older than N days)
 * @param isoDate - ISO date string
 * @param daysThreshold - Number of days to consider old (default 180)
 * @returns true if date is older than threshold
 */
export function isOldDate(isoDate: string | null | undefined, daysThreshold: number = 180): boolean {
  if (!isoDate) {
    return false;
  }

  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays > daysThreshold;
  } catch {
    return false;
  }
}

/**
 * Get date badge info based on recency
 * @param isoDate - ISO date string
 * @returns Badge info with label and color
 */
export function getDateBadgeInfo(isoDate: string | null | undefined): {
  label: string;
  color: 'green' | 'yellow' | 'gray' | null;
} | null {
  if (!isoDate) {
    return null;
  }

  if (isRecentDate(isoDate, 30)) {
    return {
      label: 'Recent',
      color: 'green'
    };
  }

  if (isOldDate(isoDate, 180)) {
    return {
      label: 'Inactive',
      color: 'yellow'
    };
  }

  return null;
}

/* ----------------------------------------------------------------------
 * Phase B.5 — shared future-date helpers.
 *
 * Background: shipment-date displays were rendering future-dated values
 * (e.g. ImportYeti rows that landed with a misparsed year) on cards,
 * tables, and the company profile hero. These helpers cap any value at
 * "today at call time" so a future date deterministically renders as the
 * caller-provided fallback (default "—") rather than fictional activity.
 *
 * Today is computed from `new Date()` at each call — no fixed seed —
 * so behavior tracks the wall clock rather than a build-time constant.
 * `parseImportYetiDate` already handles `DD/MM/YYYY`; capFutureDate
 * delegates to it before falling back to a generic Date constructor.
 * ---------------------------------------------------------------------- */

/**
 * Best-effort parse of a user-supplied shipment date. Returns a Date
 * object whose timestamp is comparable to `new Date()`, or null when the
 * input cannot be coerced into a valid calendar date. Recognises:
 *   - native Date objects (must not be Invalid Date)
 *   - ISO 8601 strings (e.g. "2026-04-26", "2026-04-26T12:00:00Z")
 *   - ImportYeti-style DD/MM/YYYY strings
 * Falls back to the Date constructor for any remaining string shape so
 * already-formatted strings ("Jan 5, 2026") still resolve.
 */
function parseShipmentDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // ImportYeti DD/MM/YYYY → ISO via the existing helper.
  const iy = parseImportYetiDate(trimmed);
  if (iy) {
    const d = new Date(iy);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Returns the original ISO/string value if the date is parseable AND not
 * meaningfully in the future; otherwise null. The original string is
 * preserved (rather than re-serialised) so downstream `formatDate` calls
 * render the same characters the row arrived with.
 *
 * Phase B.6 — timezone-tolerant cap. Previously the cap was a hard
 * `parsed > Date.now()` comparison. Postgres `last_shipment_date`
 * timestamps frequently arrive as midnight UTC (e.g. "2026-04-26
 * 00:00:00+00"), which a viewer in a UTC- timezone (e.g. PT/ET evening
 * the day before) would read as "tomorrow" and silently drop. The fix
 * is a 24-hour tolerance window: a date is only considered "future" if
 * it's more than one calendar day past now. This absorbs the
 * midnight-stamped row drift without re-introducing the original bug
 * of multi-day-future fictional activity slipping through.
 */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function capFutureDate(value: string | Date | null | undefined): string | null {
  const parsed = parseShipmentDate(value);
  if (!parsed) return null;
  if (parsed.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return null;
  if (value instanceof Date) {
    return parsed.toISOString();
  }
  return typeof value === 'string' ? value : null;
}

/**
 * Convenience: returns formatted "Jan 5, 2026" only when capFutureDate
 * succeeds, else the supplied fallback (default "—"). Use this at every
 * shipment-date render point so future dates never escape onto a card.
 */
export function formatSafeShipmentDate(
  value: string | Date | null | undefined,
  fallback: string = '—'
): string {
  const capped = capFutureDate(value);
  if (capped == null) return fallback;
  return formatUserFriendlyDate(capped, { fallback });
}

/**
 * Returns the newest date in the array that is parseable and ≤ today;
 * null if none qualify. Used when reducing a shipment list to a "most
 * recent valid" timestamp without inheriting any future-dated outliers.
 * The returned value is a normalised ISO string so callers can pass it
 * straight into formatUserFriendlyDate.
 */
export function latestValidPastDate(
  dates: Array<string | Date | null | undefined>
): string | null {
  let best: { ms: number; iso: string } | null = null;
  // Phase B.6 — same 24-hour tolerance as capFutureDate so a midnight-UTC
  // "today" row in a US timezone evening still qualifies.
  const futureCutoff = Date.now() + FUTURE_TOLERANCE_MS;
  for (const candidate of dates) {
    const parsed = parseShipmentDate(candidate);
    if (!parsed) continue;
    const ms = parsed.getTime();
    if (ms > futureCutoff) continue;
    if (!best || ms > best.ms) {
      best = { ms, iso: parsed.toISOString() };
    }
  }
  return best?.iso ?? null;
}
