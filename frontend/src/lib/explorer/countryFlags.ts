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

// Full country NAME → ISO-2. Market/directory rows store the full name
// ("United States", "China") while ImportYeti rows store 2-letter codes — the
// old code only understood codes, so full-name rows resolved to garbage (the
// first two letters, e.g. "UN") and their flag 404'd. Covers the countries that
// actually show up in freight data; unknowns fall through to code detection.
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', USA: 'US', 'U.S.A': 'US', 'U.S': 'US', US: 'US', AMERICA: 'US',
  CANADA: 'CA', MEXICO: 'MX', 'UNITED KINGDOM': 'GB', UK: 'GB', 'GREAT BRITAIN': 'GB', ENGLAND: 'GB',
  CHINA: 'CN', "CHINA (MAINLAND)": 'CN', 'HONG KONG': 'HK', TAIWAN: 'TW', JAPAN: 'JP', 'SOUTH KOREA': 'KR', KOREA: 'KR',
  INDIA: 'IN', VIETNAM: 'VN', 'VIET NAM': 'VN', THAILAND: 'TH', INDONESIA: 'ID', MALAYSIA: 'MY', SINGAPORE: 'SG',
  PHILIPPINES: 'PH', BANGLADESH: 'BD', PAKISTAN: 'PK', CAMBODIA: 'KH',
  GERMANY: 'DE', FRANCE: 'FR', ITALY: 'IT', SPAIN: 'ES', NETHERLANDS: 'NL', BELGIUM: 'BE', 'THE NETHERLANDS': 'NL',
  POLAND: 'PL', SWEDEN: 'SE', SWITZERLAND: 'CH', AUSTRIA: 'AT', PORTUGAL: 'PT', IRELAND: 'IE', DENMARK: 'DK',
  NORWAY: 'NO', FINLAND: 'FI', 'CZECH REPUBLIC': 'CZ', CZECHIA: 'CZ', GREECE: 'GR', TURKEY: 'TR', TÜRKIYE: 'TR',
  BRAZIL: 'BR', ARGENTINA: 'AR', CHILE: 'CL', COLOMBIA: 'CO', PERU: 'PE', ECUADOR: 'EC',
  AUSTRALIA: 'AU', 'NEW ZEALAND': 'NZ', 'SOUTH AFRICA': 'ZA', 'UNITED ARAB EMIRATES': 'AE', UAE: 'AE',
  'SAUDI ARABIA': 'SA', ISRAEL: 'IL', EGYPT: 'EG', NIGERIA: 'NG', RUSSIA: 'RU',
};

// Resolve any messy country value ("US" / "Us" / "United States" / "Or 97005, Us")
// to a validated ISO-2 code, or '' when nothing recognisable is present.
export function resolveCountryIso(country: string | null | undefined): string {
  const raw = (country ?? '').trim();
  if (!raw) return '';
  const up = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return up;               // already an ISO-2 code
  if (COUNTRY_NAME_TO_ISO[up]) return COUNTRY_NAME_TO_ISO[up];
  // Try a trailing/standalone 2-letter token (address tails like "…, US").
  const tail = up.match(/\b([A-Z]{2})\b\s*$/);
  if (tail && COUNTRY_NAME_TO_ISO[tail[1]]) return COUNTRY_NAME_TO_ISO[tail[1]];
  // First whole word that's a known country name (e.g. "UNITED STATES OF …").
  for (const name of Object.keys(COUNTRY_NAME_TO_ISO)) {
    if (up.includes(name)) return COUNTRY_NAME_TO_ISO[name];
  }
  return '';
}

/**
 * Best-effort label for "where is this company" — pieces together
 * city, state, and country (with flag) for compact display.
 */
export function compactLocation(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined,
): { flag: string; flagCode: string; text: string } {
  const iso = resolveCountryIso(country);
  const isUS = iso === 'US';
  const flag = countryFlag(iso);

  const parts: string[] = [];
  if (city) parts.push(String(city).trim());
  if (state) parts.push(String(state).trim());
  // Country redundant when it's US — the flag already says so.
  if (country && !isUS) parts.push(String(country).trim());
  return { flag, flagCode: iso, text: parts.join(', ') };
}
