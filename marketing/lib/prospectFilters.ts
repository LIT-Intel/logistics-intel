/**
 * prospectFilters — single source of truth for the list lead-magnet filter
 * dropdowns (Top 25 Shippers + Free Freight Prospect List).
 *
 * WHY THIS FILE EXISTS (Bug 1 fix):
 *   The old ProspectListClient offered FABRICATED industry values ("Consumer
 *   Goods", "Industrial", "Food & Beverage", …) that do NOT exist in
 *   lit_company_directory.industry. An exact `.in("industry", <value>)` on a
 *   non-existent value returns 0 rows, so the magnet dead-ended on normal
 *   filter combos. These are the REAL, MCP-verified DB industry values (the
 *   top buckets by row count in lit_company_directory), so UI == DB.
 *
 *   Origin country + destination region have NO clean column in the directory
 *   (country is 100% "United States" — the importer HQ, not the shipment
 *   origin). They are implemented server-side as SOFT refinements over the
 *   top_dimensions lane text and NEVER zero the result set — so we keep the
 *   dropdowns useful without lying about a hard filter. The edge function owns
 *   the country→port synonym expansion; the marketing side only needs the list
 *   of common origins to offer.
 */

/**
 * REAL industry values from lit_company_directory (verified via MCP, ordered by
 * row count desc). Exact-match `.in("industry", …)` on any of these returns
 * rows. "Energy, Utilities & Waste" keeps the DB's exact spelling (with the
 * comma) — do NOT "clean" it or the match drops to 0.
 */
export const PROSPECT_INDUSTRIES: string[] = [
  "Manufacturing",
  "Retail",
  "Business Services",
  "Construction",
  "Transportation",
  "Consumer Services",
  "Hospitality",
  "Energy, Utilities & Waste",
  "Software",
  "Agriculture",
  "Media & Internet",
  "Education",
  "Minerals & Mining",
  "Telecommunications",
  "Organizations",
];

/**
 * Common shipment-origin countries offered in the dropdown. These are applied
 * as SOFT lane-text refinements server-side (never a hard `country` filter),
 * so any value here is safe and never dead-ends. Matches the synonym hints the
 * edge function expands (China → Yantian/Shanghai/…, Vietnam → Vung Tau/…).
 */
export const PROSPECT_ORIGIN_COUNTRIES: string[] = [
  "China",
  "Vietnam",
  "India",
  "Germany",
  "Mexico",
  "South Korea",
  "Japan",
  "Italy",
  "Taiwan",
  "Thailand",
  "Canada",
];

export const PROSPECT_REGIONS: { value: string; label: string }[] = [
  { value: "southeast", label: "Southeast US" },
  { value: "west_coast", label: "West Coast US" },
  { value: "northeast", label: "Northeast US" },
  { value: "midwest", label: "Midwest US" },
  { value: "southwest", label: "Southwest US" },
  { value: "mountain", label: "Mountain US" },
];

export const PROSPECT_MODES: string[] = ["Ocean FCL", "Ocean LCL", "Air", "Rail", "Truck"];

export const PROSPECT_VOLUME_RANGES: { value: string; label: string }[] = [
  { value: "", label: "Any volume" },
  { value: "medium", label: "25+ shipments / yr" },
  { value: "high", label: "100+ shipments / yr" },
  { value: "enterprise", label: "500+ shipments / yr" },
];
