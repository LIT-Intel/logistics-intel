/**
 * Shared container-label normalization and canonical mapping.
 *
 * Used by the Company Detail panel (Equipment tab + Overview mini card),
 * the Discover page (Top Container filter chip), and any Dashboard surface
 * that wants to classify shipments by equipment type.
 *
 * Keep this file free of component-local imports so every surface can pull
 * from a single source of truth. No React, no framework coupling.
 */

/**
 * Canonical container codes we collapse vendor variants into. Anything not
 * confidently matching one of these passes through as its cleaned raw label
 * (uppercased, whitespace-collapsed) so meaning is never lost.
 */
export const CANONICAL_CONTAINER_CODES = [
  "20FT",
  "40FT",
  "40HC",
  "45FT",
  "REEFER",
  "DRY",
  "TANK",
] as const;

export type CanonicalContainerCode = (typeof CANONICAL_CONTAINER_CODES)[number];

const JUNK_TOKENS = new Set(["", "—", "null", "undefined", "n/a", "na"]);

/**
 * Cleans and uppercases a container-type label. Strips redundant
 * "container" tokens and collapses whitespace. Returns an empty string for
 * junk/missing inputs so callers can short-circuit.
 */
export function normalizeContainerTypeLabel(value?: string | null): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (JUNK_TOKENS.has(raw.toLowerCase())) return "";
  return raw
    .replace(/container/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Collapse a vendor container label into one of the {@link CANONICAL_CONTAINER_CODES}
 * while preserving the original cleaned label as `detail` for tooltips /
 * secondary display. Falls through to the cleaned label when no confident
 * canonical match is found — never invents a type.
 */
export function canonicalContainerLabel(
  rawValue?: string | null,
): { code: string; detail: string } {
  const normalized = normalizeContainerTypeLabel(rawValue);
  if (!normalized) return { code: "", detail: "" };
  const upper = normalized.toUpperCase();

  if (/\bREEFER\b|\bRF\b|\bREF\b|REFRIGERATE|FROZEN|CHILL/.test(upper)) {
    return { code: "REEFER", detail: normalized };
  }
  if (/\bTANK\b|ISO[- ]?TANK|LIQUID/.test(upper)) {
    return { code: "TANK", detail: normalized };
  }
  if (/\b40\b[^0-9]*(HC|HIGH[- ]?CUBE|HQ)/.test(upper) || /\b40HC\b|\b40HQ\b/.test(upper)) {
    return { code: "40HC", detail: normalized };
  }
  if (/\b45\b/.test(upper)) {
    return { code: "45FT", detail: normalized };
  }
  if (/\b40\b/.test(upper)) {
    return { code: "40FT", detail: normalized };
  }
  if (/\b20\b/.test(upper)) {
    return { code: "20FT", detail: normalized };
  }
  if (/\bDRY\b|\bGP\b|GENERAL[- ]?PURPOSE/.test(upper)) {
    return { code: "DRY", detail: normalized };
  }
  return { code: normalized, detail: normalized };
}

/**
 * Extracts just the canonical code (or empty string). Handy for filter
 * predicates that only care about the bucket, not the raw detail.
 */
export function canonicalContainerCode(rawValue?: string | null): string {
  return canonicalContainerLabel(rawValue).code;
}
