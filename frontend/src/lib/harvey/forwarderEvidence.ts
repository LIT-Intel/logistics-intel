/**
 * Harvey 2.0: ImportYeti directory service-provider normalization.
 *
 * top_forwarders is a provider-reported COMPANY-LEVEL historical list.
 * It is NOT proof of who booked a particular lane or 12-month period.
 * "Carrier" and "Forwarder" must be distinct for sales intelligence.
 * Denormalized TEU can be source-corrupt; never use this field for a
 * verified shipment-volume claim without the upstream quality gate.
 */
export type ProviderRole =
  | "direct_to_carrier"
  | "ocean_carrier"
  | "freight_intermediary"
  | "unclassified";

export type ForwarderEvidence = {
  name: string;
  normalizedName: string;
  role: ProviderRole;
  classificationBasis: "explicit_source_label" | "reviewed_alias" | "unverified";
  confidence: "high" | "medium" | "unverified";
  reportedTeu: number | null;
  reportedPercent: number | null;
  metricQuality: "provider_reported_unverified";
  relationshipScope: "company_history_unspecified";
  laneVerified: false;
  windowVerified: false;
  source: "lit_company_directory.top_forwarders";
};

// Reviewed labels only, deliberately NOT a general free-text classifier.
// NVOCC/forwarder services and VOCC ocean vessel operations may overlap.
// An unknown name is always unclassified rather than hallucinated.
const DIRECT = /^(?:bco\s*[-(]?\s*direct(?:\s+to\s+carrier)?\s*\)?|bco\s*\(direct\))$/i;
const CARRIERS: Array<[RegExp, string]> = [
  [/^hapag[ -]?lloyd(?:\s+a\s*g)?$/i, "Hapag-Lloyd"],
  [/^ocean network express(?:\s+pte\s+ltd)?$/i, "Ocean Network Express"],
  [/^orient overseas container line(?:\s+ltd)?$/i, "OOCL"],
  [/^hyundai merchant marine$/i, "Hyundai Merchant Marine"],
  [/^maersk(?:\s+line)?$/i, "Maersk"],
  [/^msc(?:\s+mediterranean shipping company)?$/i, "MSC"],
  [/^cma[- ]?cgm$/i, "CMA CGM"],
];
const INTERMEDIARIES: Array<[RegExp, string]> = [
  [/^expeditors international(?: of washington(?: inc)?)?$/i, "Expeditors International"],
  [/^dsv air\s*&\s*sea inc\.?(?: dba\.? dsv ocean transport)?$/i, "DSV Air & Sea"],
  [/^dsv ocean transport a\/s$/i, "DSV Ocean Transport"],
  [/^kuehne\s*\+\s*nagel(?:\s*\(.*\))?$/i, "Kuehne+Nagel"],
  [/^dhl global forwarding(?:\s*\(.*\))?$/i, "DHL Global Forwarding"],
  [/^flexport international(?: llc)?$/i, "Flexport"],
  [/^c\.h\. robinson(?:\s*\(.*\))?$/i, "C.H. Robinson"],
  [/^ecu worldwide$/i, "ECU Worldwide"],
];

function finiteNonnegative(input: unknown): number | null {
  if (typeof input !== "number" && typeof input !== "string") return null;
  const v = Number(input);
  return Number.isFinite(v) && v >= 0 ? v : null;
}
export function classifyProviderName(name: string): Pick<ForwarderEvidence,
  "normalizedName" | "role" | "classificationBasis" | "confidence"> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (DIRECT.test(clean)) return {
    normalizedName: "BCO - Direct to Carrier",
    role: "direct_to_carrier", classificationBasis: "explicit_source_label", confidence: "high"
  };
  for (const [pattern, canonical] of CARRIERS) {
    if (pattern.test(clean)) return {
      normalizedName: canonical, role: "ocean_carrier",
      classificationBasis: "reviewed_alias", confidence: "medium"
    };
  }
  for (const [pattern, canonical] of INTERMEDIARIES) {
    if (pattern.test(clean)) return {
      normalizedName: canonical, role: "freight_intermediary",
      classificationBasis: "reviewed_alias", confidence: "medium"
    };
  }
  return {
    normalizedName: clean, role: "unclassified",
    classificationBasis: "unverified", confidence: "unverified"
  };
}

export function normalizeDirectoryForwarders(input: unknown): ForwarderEvidence[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).flatMap((item): ForwarderEvidence[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string") return [];
    const name = row.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 220) return [];
    const info = classifyProviderName(name);
    const pct = finiteNonnegative(row.percent);
    return [{
      name, ...info,
      reportedTeu: finiteNonnegative(row.teu),
      reportedPercent: pct !== null && pct <= 100 ? pct : null,
      metricQuality: "provider_reported_unverified",
      relationshipScope: "company_history_unspecified",
      laneVerified: false, windowVerified: false,
      source: "lit_company_directory.top_forwarders",
    }];
  });
}
