/**
 * laneRegions — deterministic origin-region palette for trade-lane maps.
 *
 * CEO direction (2026-08-13): lane lines must be color-differentiated by
 * origin region/country so the map reads as a network of distinct supply
 * chains, and the floating lane cards must carry the SAME color so the
 * card ↔ line mapping is instant.
 *
 * 8 regional buckets + a neutral fallback, keyed by ISO-3166-1 alpha-2
 * origin country code. Hues follow the app's Tailwind-anchored language:
 *   East Asia → blues, Southeast Asia → teals, South Asia → purples,
 *   Europe → ambers, Americas → greens, Middle East → roses,
 *   Africa → oranges, Oceania → cyans, unknown → indigo.
 *
 * `base` is the idle stroke (500-weight, calm on the light basemap),
 * `selected` is the brighter/deeper selected stroke (700-weight), and
 * `glow` is the rgba casing color behind hover/selected lines.
 */

export type LaneRegion =
  | "eastAsia"
  | "southeastAsia"
  | "southAsia"
  | "europe"
  | "americas"
  | "middleEast"
  | "africa"
  | "oceania"
  | "other";

export type LaneRegionColor = {
  region: LaneRegion;
  /** Human label for legends, e.g. "East Asia". */
  label: string;
  /** Idle lane stroke. */
  base: string;
  /** Selected lane stroke (brighter/deeper). */
  selected: string;
  /** rgba glow for the hover/selected casing. */
  glow: string;
};

const REGION_DEFS: Record<LaneRegion, { label: string; base: string; selected: string }> = {
  eastAsia: { label: "East Asia", base: "#3B82F6", selected: "#1D4ED8" }, // blue 500/700
  southeastAsia: { label: "Southeast Asia", base: "#14B8A6", selected: "#0F766E" }, // teal 500/700
  southAsia: { label: "South Asia", base: "#8B5CF6", selected: "#6D28D9" }, // violet 500/700
  europe: { label: "Europe", base: "#F59E0B", selected: "#B45309" }, // amber 500/700
  americas: { label: "Americas", base: "#10B981", selected: "#047857" }, // emerald 500/700
  middleEast: { label: "Middle East", base: "#F43F5E", selected: "#BE123C" }, // rose 500/700
  africa: { label: "Africa", base: "#F97316", selected: "#C2410C" }, // orange 500/700
  oceania: { label: "Oceania", base: "#06B6D4", selected: "#0E7490" }, // cyan 500/700
  other: { label: "Other", base: "#6366F1", selected: "#4338CA" }, // indigo 500/700
};

const REGION_BY_CODE: Record<string, LaneRegion> = {};

function assign(region: LaneRegion, codes: string[]) {
  for (const c of codes) REGION_BY_CODE[c] = region;
}

assign("eastAsia", ["CN", "HK", "MO", "TW", "JP", "KR", "KP", "MN"]);
assign("southeastAsia", [
  "VN", "TH", "MY", "ID", "PH", "SG", "KH", "MM", "LA", "BN", "TL",
]);
assign("southAsia", ["IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF"]);
assign("europe", [
  "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "CH", "AT",
  "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "RS", "BA", "MK",
  "AL", "ME", "XK", "DK", "SE", "NO", "FI", "IS", "EE", "LV", "LT", "UA",
  "BY", "MD", "RU", "GE", "AM", "AZ", "TR", "CY", "MT", "MC", "AD", "SM", "LI",
]);
assign("americas", [
  "US", "CA", "MX", "GT", "HN", "SV", "NI", "CR", "PA", "BZ", "CU", "DO",
  "HT", "JM", "TT", "BB", "BS", "PR", "VI", "CO", "VE", "EC", "PE", "BR",
  "CL", "AR", "UY", "PY", "BO", "GY", "SR", "GF",
]);
assign("middleEast", [
  "AE", "SA", "QA", "KW", "BH", "OM", "YE", "IQ", "IR", "IL", "PS", "JO",
  "LB", "SY",
]);
assign("africa", [
  "EG", "MA", "DZ", "TN", "LY", "ZA", "NG", "KE", "ET", "GH", "CI", "SN",
  "TZ", "UG", "MZ", "AO", "CM", "ZM", "ZW", "BW", "NA", "MU", "MG", "SD",
  "DJ", "SO", "RW", "BJ", "TG", "ML", "BF", "NE", "TD", "GA", "CG", "CD",
  "GN", "LR", "SL", "GM", "MR", "LS", "SZ", "MW",
]);
assign("oceania", ["AU", "NZ", "PG", "FJ", "SB", "VU", "NC", "PF", "WS", "TO", "GU"]);

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Region bucket for an ISO alpha-2 country code ("" / unknown → other). */
export function laneRegionForCountry(code: string | null | undefined): LaneRegion {
  const c = String(code || "").toUpperCase().trim();
  return REGION_BY_CODE[c] || "other";
}

/**
 * Full color record for an origin country code — deterministic, so the
 * same origin always paints the same hue across sessions and surfaces.
 */
export function laneRegionColor(code: string | null | undefined): LaneRegionColor {
  const region = laneRegionForCountry(code);
  const def = REGION_DEFS[region];
  return {
    region,
    label: def.label,
    base: def.base,
    selected: def.selected,
    glow: hexToRgba(def.base, 0.32),
  };
}
