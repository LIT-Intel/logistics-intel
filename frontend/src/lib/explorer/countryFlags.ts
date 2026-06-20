// Tiny helper: ISO-2 country code → Unicode flag emoji.
// Used by the Company Search tab to put a flag next to each row's
// location string (e.g. "🇺🇸 New Britain, CT").
//
// How it works: Unicode encodes flags as two Regional Indicator
// Symbols. ISO-2 letters A-Z map to U+1F1E6..U+1F1FF. We translate
// each letter and concatenate.
//
// Returns an empty string for unknown / malformed input so callers
// can write `<span>{flag(c)}{name}</span>` without a null check.

const RI_OFFSET = 0x1F1E6 - 'A'.charCodeAt(0);

export function countryFlag(code: string | null | undefined): string {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length !== 2) return '';
  if (!/^[A-Z]{2}$/.test(trimmed)) return '';
  const a = trimmed.charCodeAt(0) + RI_OFFSET;
  const b = trimmed.charCodeAt(1) + RI_OFFSET;
  return String.fromCodePoint(a, b);
}

/**
 * Best-effort label for "where is this company" — pieces together
 * city, state, and country (with flag) for compact display.
 */
export function compactLocation(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined,
): { flag: string; text: string } {
  const flag = countryFlag(country);
  const parts: string[] = [];
  if (city) parts.push(String(city).trim());
  if (state) parts.push(String(state).trim());
  // Country redundant if it's US — the flag already says so.
  if (country && country.toUpperCase() !== 'US') {
    parts.push(String(country).trim());
  }
  return { flag, text: parts.join(', ') };
}
