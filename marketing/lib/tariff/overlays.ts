/**
 * Tariff overlay configuration — non-MFN duties layered on top of the
 * HTSUS general rate.
 *
 * Last reviewed: 2026-05-08. Cite each entry's `source` URL when the
 * calculator surfaces an overlay so users can verify against primary
 * sources. This file is intentionally narrow: it covers Section 301,
 * Section 232, Section 122 (the 2025+ reciprocal tariffs), and a
 * historical IEEPA pointer that the calculator surfaces as a refund
 * notice rather than a live duty.
 *
 * AD/CVD is NOT in this file. AD/CVD is product-specific, filer-
 * specific, and case-number-specific. The calculator surfaces a
 * generic "AD/CVD may apply — check ITC ADCVDmgr" notice rather than
 * trying to compute it.
 */

export type AdValoremOverlay = {
  type: "ad_valorem";
  rate: number; // 0.25 means 25%
};

export type SpecificOverlay = {
  type: "specific";
  amount: number; // USD per unit (HTSUS specific duty)
  unit: string; // "kg", "ton", "L", etc.
};

export type RefundableOverlay = {
  type: "refundable";
  rate: number;
  /** Brief note explaining why this is refundable (e.g. SCOTUS ruling). */
  note: string;
};

export type Overlay = (AdValoremOverlay | SpecificOverlay | RefundableOverlay) & {
  /** Human-readable name shown in the calculator breakdown. */
  name: string;
  /** What duty mechanism this represents (e.g. "Section 301 List 3"). */
  authority: string;
  /** When the overlay took effect (ISO date). */
  effective?: string;
  /** Authoritative source URL (USTR, CBP CSMS, Federal Register, etc.). */
  source: string;
  /**
   * Predicate. Returns true if this overlay applies to a given HS code +
   * origin pair. Most overlays match by HS chapter/heading + origin.
   */
  applies: (htsno: string, originIso: string) => boolean;
};

/** Strip dots from an HTS code so prefix matching is reliable. */
const norm = (s: string) => s.replace(/[^0-9]/g, "");

/** Returns true if `hts` starts with any of the given prefixes
 *  (after dot-stripping). */
function startsWithAny(hts: string, prefixes: string[]): boolean {
  const n = norm(hts);
  return prefixes.some((p) => n.startsWith(norm(p)));
}

/* ---------------------------------------------------------------------
 * Section 232 — steel, aluminum, copper
 *
 * Steel & aluminum: continuous since 2018 under Proclamation 9705/9704.
 * Copper: April 6, 2026 expansion (Proclamation 11008-equivalent series).
 * Rates and HS scope confirmed via CBP CSMS bulletins.
 * ------------------------------------------------------------------- */

const SECTION_232_STEEL_HEADINGS = [
  "7206", "7207", "7208", "7209", "7210", "7211", "7212",
  "7213", "7214", "7215", "7216", "7217", "7218", "7219",
  "7220", "7221", "7222", "7223", "7224", "7225", "7226",
  "7227", "7228", "7229", "7301", "7302", "7304", "7305",
  "7306", "7307", "7308", "7316",
];

const SECTION_232_ALUMINUM_HEADINGS = [
  "7601", "7604", "7605", "7606", "7607", "7608", "7609",
];

/** Copper coverage from the April 6, 2026 expansion: refined cathodes,
 *  rods, wire, plate, sheet, foil, tube, and select fittings + downstream
 *  derivatives. Chapter 99 lines 9903.82.06/.09/.15/.16 implement this. */
const SECTION_232_COPPER_HEADINGS = [
  "7402", "7403", "7404", "7405", "7406", "7407", "7408",
  "7409", "7410", "7411", "7412", "7413", "7415", "7418",
  "7419",
];

/* ---------------------------------------------------------------------
 * Section 301 — China (HTS 9903.88.xx series)
 *
 * Lists 1, 2, 3, 4A still in effect. List 4B suspended. Some exclusions
 * exist via specific 9903.88 codes — those are NOT modeled here; if a
 * user imports under a granted exclusion, they'd suppress the overlay
 * manually with their broker. The calculator shows the headline rate.
 * ------------------------------------------------------------------- */

/** List 3 covers HS chapters and headings approximately mapped here.
 *  This is a coarse approximation — a granular line-item lookup would
 *  require ingesting the USTR Annex tables. The calculator notes this
 *  uncertainty in the overlay description. */
const SECTION_301_LIST3_HEADINGS_PARTIAL = [
  "39", "44", "48", "70", "73", "76", "82", "83", "84",
  "85", "87", "94",
];

/* ---------------------------------------------------------------------
 * Section 122 — Reciprocal tariffs (April 5, 2025 EO + follow-ups)
 *
 * Universal 10% baseline ad valorem on most imports, with country-
 * specific stacking. Through July 24, 2026 surcharge of 10% per
 * Federal Register implementation. As of May 2026 the structure is
 * still binding for non-FTA origins.
 * ------------------------------------------------------------------- */

/** Countries explicitly carved out of the Section 122 baseline (FTA
 *  partners, USMCA, certain treaty-protected regimes). ISO-2 codes. */
const SECTION_122_EXEMPT_ORIGINS = new Set([
  "CA", "MX", // USMCA
  "IL", "JO", "BH", "OM", "MA", "AU", "CL", "CO", "PA", "PE", "SG", "KR",
]);

/* ---------------------------------------------------------------------
 * Overlay registry
 * ------------------------------------------------------------------- */

export const OVERLAYS: Overlay[] = [
  /* ---- Section 232 ---- */
  {
    name: "Section 232 — steel",
    authority: "Section 232 / Proclamation 9705",
    type: "ad_valorem",
    rate: 0.25,
    effective: "2018-03-23",
    source:
      "https://www.cbp.gov/trade/programs-administration/entry-summary/232-tariffs-aluminum-and-steel",
    applies: (hts) => startsWithAny(hts, SECTION_232_STEEL_HEADINGS),
  },
  {
    name: "Section 232 — aluminum",
    authority: "Section 232 / Proclamation 9704",
    type: "ad_valorem",
    rate: 0.10,
    effective: "2018-03-23",
    source:
      "https://www.cbp.gov/trade/programs-administration/entry-summary/232-tariffs-aluminum-and-steel",
    applies: (hts) => startsWithAny(hts, SECTION_232_ALUMINUM_HEADINGS),
  },
  {
    name: "Section 232 — copper (semi-finished)",
    authority: "Section 232 / 2026 copper expansion",
    type: "ad_valorem",
    rate: 0.50,
    effective: "2026-04-06",
    source: "https://content.govdelivery.com/accounts/USDHSCBP/bulletins/4117593",
    applies: (hts) => startsWithAny(hts, SECTION_232_COPPER_HEADINGS),
  },

  /* ---- Section 301 (China-only) ---- */
  {
    name: "Section 301 — List 3 (China)",
    authority: "Section 301 / USTR List 3",
    type: "ad_valorem",
    rate: 0.25,
    effective: "2018-09-24",
    source: "https://ustr.gov/issue-areas/enforcement/section-301-investigations/section-301-china",
    applies: (hts, origin) =>
      origin === "CN" && startsWithAny(hts, SECTION_301_LIST3_HEADINGS_PARTIAL),
  },

  /* ---- Section 122 reciprocal baseline ---- */
  {
    name: "Section 122 — reciprocal baseline",
    authority: "Section 122 / EO of April 5, 2025",
    type: "ad_valorem",
    rate: 0.10,
    effective: "2025-04-05",
    source:
      "https://www.federalregister.gov/documents/2025/04/07/2025-06063/regulating-imports-with-a-reciprocal-tariff-to-rectify-trade-practices-that-contribute-to-large-and",
    applies: (_hts, origin) =>
      origin !== "" && !SECTION_122_EXEMPT_ORIGINS.has(origin),
  },
];

/* ---------------------------------------------------------------------
 * IEEPA refunds (informational — surfaced separately from overlays)
 *
 * SCOTUS struck down IEEPA-based tariffs Feb 20, 2026 (Learning
 * Resources v Trump). CBP launched the CAPE refund portal April 20.
 * Refund cycle 60-90 days. We surface a notice on the calculator
 * result rather than charging the rate, since these duties are no
 * longer collected post-decision.
 * ------------------------------------------------------------------- */

export const IEEPA_NOTICE = {
  headline: "IEEPA tariff refunds available",
  body:
    "IEEPA-based tariffs were invalidated by the Supreme Court on February 20, 2026 (Learning Resources v Trump). " +
    "If your entries were assessed under HTSUS Chapter 99 IEEPA codes between Feb 1, 2025 and Feb 20, 2026, " +
    "refunds are available through CBP's Centralized Adjustment for Prior Entries (CAPE) portal. Phase 1 of " +
    "CAPE went live April 20, 2026. Typical payout cycle: 60–90 days.",
  source: "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds",
};

/* ---------------------------------------------------------------------
 * AD/CVD pointer (informational)
 *
 * AD/CVD orders are case-number specific (A-XXX-XXX, C-XXX-XXX) and
 * filer-specific. The calculator does not attempt to compute them but
 * surfaces a notice for HS chapters with active case clusters: 73
 * (steel pipe), 72 (steel), 76 (aluminum extrusions), 84/85 (some
 * machinery + electronics from China), 39 (some plastics), etc.
 * ------------------------------------------------------------------- */

export function adcvdMayApply(htsno: string, originIso: string): boolean {
  const n = norm(htsno).slice(0, 2);
  // Coarse heuristic — chapters with ongoing AD/CVD activity. The notice
  // is informational ("check ITC ADCVDmgr") so false-positives are OK.
  const flaggedChapters = new Set(["28", "29", "39", "40", "44", "48", "55",
    "56", "70", "72", "73", "74", "76", "84", "85", "94"]);
  if (!flaggedChapters.has(n)) return false;
  // China + Vietnam + Korea are the most common origins; other origins
  // also have orders but at lower base rate.
  const flaggedOrigins = new Set(["CN", "VN", "KR", "IN", "TR", "TW", "TH"]);
  return flaggedOrigins.has(originIso);
}

export const ADCVD_NOTICE = {
  headline: "AD/CVD may apply",
  body:
    "Antidumping and countervailing duty orders are case-number-specific and require filer-level lookup. " +
    "If your HS chapter and origin combination has active orders, real duty rates can stack 10–300% on top of " +
    "the rates shown here. Check the ITC's ADCVDmgr search and confirm with your customs broker before booking.",
  source: "https://www.usitc.gov/trade_remedy/731_ad_701_cvd/investigations.htm",
};
