/**
 * Country name → ISO 3166-1 alpha-2 code lookup. Sanity stores the
 * `country` field as a free-text string (sometimes a full name, sometimes
 * already a code) so this normalizer handles both. Adding a country?
 * Add it here once and every flag on the site updates.
 */

const NAME_TO_ISO: Record<string, string> = {
  // Common shipping origins
  china: "CN",
  "people's republic of china": "CN",
  prc: "CN",
  hongkong: "HK",
  "hong kong": "HK",
  taiwan: "TW",
  vietnam: "VN",
  "viet nam": "VN",
  india: "IN",
  bangladesh: "BD",
  pakistan: "PK",
  "south korea": "KR",
  korea: "KR",
  japan: "JP",
  thailand: "TH",
  malaysia: "MY",
  singapore: "SG",
  indonesia: "ID",
  philippines: "PH",
  cambodia: "KH",
  turkey: "TR",
  türkiye: "TR",
  uae: "AE",
  "united arab emirates": "AE",
  "saudi arabia": "SA",
  israel: "IL",
  egypt: "EG",
  morocco: "MA",
  // Americas
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  america: "US",
  canada: "CA",
  mexico: "MX",
  brazil: "BR",
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  peru: "PE",
  ecuador: "EC",
  panama: "PA",
  // Europe
  germany: "DE",
  netherlands: "NL",
  holland: "NL",
  belgium: "BE",
  france: "FR",
  spain: "ES",
  portugal: "PT",
  italy: "IT",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  britain: "GB",
  ireland: "IE",
  poland: "PL",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  greece: "GR",
  switzerland: "CH",
  austria: "AT",
  romania: "RO",
  czechia: "CZ",
  "czech republic": "CZ",
  hungary: "HU",
  // Oceania / Africa
  australia: "AU",
  "new zealand": "NZ",
  "south africa": "ZA",
  nigeria: "NG",
  kenya: "KE",
  // Multi-country region labels — fall back to a representative anchor
  europe: "EU",
  "european union": "EU",
  eu: "EU",
  "southeast asia": "VN",
  asia: "CN",
  mediterranean: "IT",
  latam: "BR",
  "latin america": "BR",
  caribbean: "DO",
};

const ISO_RE = /^[A-Za-z]{2}$/;

/**
 * Normalize anything the Sanity `country` field could hold into an
 * ISO 3166-1 alpha-2 code (uppercase). Unknown input → null so the
 * caller can fall back to a globe glyph.
 *
 * EU is special-cased — flagcdn.com serves the EU flag at `eu.svg`,
 * so we keep it as an alias for region pages.
 */
export function toCountryISO(input?: string | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  if (ISO_RE.test(raw)) return raw.toUpperCase();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  return NAME_TO_ISO[key] ?? null;
}

/**
 * Try several candidate fields on a Sanity port object. Sanity
 * sometimes stores country in `country`, sometimes in `code` (UN/LOCODE
 * prefix), sometimes both. UN/LOCODE prefix is always the country ISO.
 */
export function portISO(port?: { country?: string; code?: string } | null): string | null {
  if (!port) return null;
  if (port.code && port.code.length >= 2) {
    const prefix = port.code.slice(0, 2).toUpperCase();
    if (ISO_RE.test(prefix)) return prefix;
  }
  return toCountryISO(port.country);
}
