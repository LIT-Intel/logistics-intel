/**
 * Tariff calculation primitives. Parses USITC HTSUS rate text into a
 * structured rate, applies overlays from `overlays.ts`, and returns a
 * line-by-line breakdown the calculator UI renders.
 *
 * This module never invents rates. If a rate string can't be parsed,
 * it returns `null` and the caller surfaces "rate unavailable — check
 * USITC directly" rather than guessing.
 */

import {
  OVERLAYS,
  IEEPA_NOTICE,
  ADCVD_NOTICE,
  adcvdMayApply,
  type Overlay,
} from "./overlays";

export type ParsedRate =
  | { type: "free" }
  | { type: "ad_valorem"; rate: number /* 0.044 = 4.4% */ }
  | { type: "specific"; amount: number; unit: string }
  | { type: "compound"; ad: number; specific: { amount: number; unit: string } }
  | null;

/**
 * Parse the `general` rate text from USITC into a structured form.
 * Examples seen in HTSUS:
 *   "Free"
 *   "4.4%"
 *   "1.7¢/kg"
 *   "0.583¢/kg + 6.4%"  (compound)
 *   ""                  (inherits from parent — caller walks up)
 */
export function parseRate(text: string | undefined | null): ParsedRate {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  if (/^free\b/i.test(t)) return { type: "free" };

  // Compound rate: e.g. "0.583¢/kg + 6.4%"
  const cMatch = t.match(/([0-9.]+)\s*(¢|cents?)\s*\/\s*([a-zA-Z]+)\s*\+\s*([0-9.]+)\s*%/i);
  if (cMatch) {
    return {
      type: "compound",
      ad: parseFloat(cMatch[4]) / 100,
      specific: {
        amount: parseFloat(cMatch[1]) / 100, // ¢ → $
        unit: cMatch[3].toLowerCase(),
      },
    };
  }

  // Specific only: "1.7¢/kg" or "$0.05/L"
  const sCent = t.match(/^([0-9.]+)\s*(¢|cents?)\s*\/\s*([a-zA-Z]+)$/i);
  if (sCent) {
    return {
      type: "specific",
      amount: parseFloat(sCent[1]) / 100,
      unit: sCent[3].toLowerCase(),
    };
  }
  const sDollar = t.match(/^\$\s*([0-9.]+)\s*\/\s*([a-zA-Z]+)$/);
  if (sDollar) {
    return {
      type: "specific",
      amount: parseFloat(sDollar[1]),
      unit: sDollar[2].toLowerCase(),
    };
  }

  // Ad valorem: "4.4%" or "10%"
  const adv = t.match(/^([0-9.]+)\s*%/);
  if (adv) {
    return { type: "ad_valorem", rate: parseFloat(adv[1]) / 100 };
  }

  return null;
}

/** Map of FTA partner ISO-2 → set of USITC special program codes the
 *  HTSUS uses inside the `special` rate parenthetical. We treat any
 *  code match as "FTA preference applies" and override with Free. */
const FTA_CODES: Record<string, string[]> = {
  AU: ["AU"],
  BH: ["BH"],
  CA: ["CA", "MX", "S"], // USMCA: "S" for Singapore was the old USSFTA — separate
  CL: ["CL"],
  CO: ["CO"],
  IL: ["IL"],
  JO: ["JO"],
  KR: ["KR"],
  MA: ["MA"],
  MX: ["MX"],
  OM: ["OM"],
  PA: ["P", "PA"],
  PE: ["PE"],
  SG: ["SG"],
};

/** USMCA-specific check — Canada/Mexico use "S+" or "CA"/"MX" codes
 *  in the special rate parenthetical. */
function ftaApplies(specialText: string | undefined, originIso: string): boolean {
  if (!specialText || !originIso) return false;
  const codes = FTA_CODES[originIso] || [];
  if (!codes.length) return false;
  // Special rate looks like: "Free (A,AU,B,BH,CL,CO,...)". Extract codes.
  const m = specialText.match(/\(([^)]+)\)/);
  if (!m) return false;
  const present = m[1].split(/[,\s]+/).map((c) => c.trim().toUpperCase());
  return codes.some((c) => present.includes(c));
}

export type CalcLine = {
  label: string;
  authority?: string;
  rate?: number; // ad valorem, e.g. 0.044
  amount: number; // USD owed for this line
  source?: string;
  note?: string;
  type: "general" | "fta" | "overlay" | "specific";
};

export type CalcResult = {
  htsno: string;
  description: string;
  origin: string;
  customsValue: number;
  unitQuantity?: number;
  unit?: string;
  lines: CalcLine[];
  totalDuty: number;
  effectiveRate: number; // totalDuty / customsValue
  notices: { headline: string; body: string; source: string }[];
  /** USITC HTS line lookup URL for verification. */
  htsLookupUrl: string;
  /** Caveats the UI must surface. */
  caveats: string[];
};

export type HtsLine = {
  htsno: string;
  description: string;
  general: string;
  special: string;
  other: string;
};

/**
 * Compute duty given a resolved HTS line (from USITC), origin ISO, and
 * customs value. Walks overlays, applies FTA preference where matched,
 * and returns a structured breakdown.
 *
 * `unitQuantity` + `unit` are required only when the parsed rate is a
 * specific or compound rate (e.g. 1.7¢/kg) — for pure ad valorem rates
 * the customs value alone is sufficient.
 */
export function calculate(opts: {
  hts: HtsLine;
  originIso: string;
  customsValue: number;
  unitQuantity?: number;
  unit?: string;
}): CalcResult {
  const { hts, originIso, customsValue, unitQuantity, unit } = opts;
  const lines: CalcLine[] = [];
  const caveats: string[] = [];
  const notices: CalcResult["notices"] = [];

  // --- General MFN rate (or FTA if applicable) ---
  const ftaMatch = ftaApplies(hts.special, originIso);
  if (ftaMatch) {
    lines.push({
      label: `Free (${originIso} FTA preference)`,
      authority: `USITC HTSUS · special column`,
      amount: 0,
      type: "fta",
      note: hts.special,
    });
  } else {
    const parsed = parseRate(hts.general);
    if (!parsed) {
      caveats.push(
        "USITC returned an unrecognized rate format for this line — verify directly at hts.usitc.gov.",
      );
    } else if (parsed.type === "free") {
      lines.push({
        label: "General MFN — Free",
        authority: "USITC HTSUS · general column",
        amount: 0,
        type: "general",
      });
    } else if (parsed.type === "ad_valorem") {
      const amount = customsValue * parsed.rate;
      lines.push({
        label: `General MFN`,
        authority: "USITC HTSUS · general column",
        rate: parsed.rate,
        amount,
        type: "general",
      });
    } else if (parsed.type === "specific") {
      if (!unitQuantity || !unit) {
        caveats.push(
          `Specific duty applies (${parsed.amount.toFixed(4)}/${parsed.unit}). Provide unit quantity for an accurate calculation.`,
        );
        lines.push({
          label: `Specific duty: $${parsed.amount.toFixed(4)}/${parsed.unit}`,
          authority: "USITC HTSUS · general column",
          amount: 0,
          type: "specific",
          note: "Quantity required",
        });
      } else if (unit.toLowerCase() === parsed.unit) {
        const amt = parsed.amount * unitQuantity;
        lines.push({
          label: `Specific duty: $${parsed.amount.toFixed(4)}/${parsed.unit} × ${unitQuantity}`,
          authority: "USITC HTSUS · general column",
          amount: amt,
          type: "specific",
        });
      } else {
        caveats.push(
          `Unit mismatch: HTSUS uses ${parsed.unit}, you entered ${unit}. Convert quantity before calculating.`,
        );
      }
    } else if (parsed.type === "compound") {
      const adAmt = customsValue * parsed.ad;
      lines.push({
        label: "General MFN — ad valorem component",
        authority: "USITC HTSUS · general column",
        rate: parsed.ad,
        amount: adAmt,
        type: "general",
      });
      if (unitQuantity && unit?.toLowerCase() === parsed.specific.unit) {
        const sAmt = parsed.specific.amount * unitQuantity;
        lines.push({
          label: `General MFN — specific component: $${parsed.specific.amount.toFixed(4)}/${parsed.specific.unit} × ${unitQuantity}`,
          authority: "USITC HTSUS · general column",
          amount: sAmt,
          type: "specific",
        });
      } else {
        caveats.push(
          `Compound rate has a specific component ($${parsed.specific.amount.toFixed(4)}/${parsed.specific.unit}). Provide matching unit quantity for accuracy.`,
        );
      }
    }
  }

  // --- Section overlays ---
  for (const o of OVERLAYS) {
    if (!o.applies(hts.htsno, originIso)) continue;
    if (o.type === "ad_valorem") {
      const amt = customsValue * o.rate;
      lines.push({
        label: o.name,
        authority: o.authority,
        rate: o.rate,
        amount: amt,
        source: o.source,
        type: "overlay",
      });
    } else if (o.type === "specific") {
      if (unitQuantity && unit?.toLowerCase() === o.unit) {
        lines.push({
          label: `${o.name}: $${o.amount.toFixed(4)}/${o.unit} × ${unitQuantity}`,
          authority: o.authority,
          amount: o.amount * unitQuantity,
          source: o.source,
          type: "overlay",
        });
      } else {
        caveats.push(`${o.name} requires unit quantity in ${o.unit}.`);
      }
    }
  }

  // --- Informational notices ---
  // IEEPA refund eligibility — show on every result (broad relevance)
  notices.push(IEEPA_NOTICE);

  // AD/CVD pointer — shown only when origin × chapter heuristic flags
  if (adcvdMayApply(hts.htsno, originIso)) {
    notices.push(ADCVD_NOTICE);
  }

  // --- Totals ---
  const totalDuty = lines.reduce((sum, l) => sum + l.amount, 0);
  const effectiveRate = customsValue > 0 ? totalDuty / customsValue : 0;

  return {
    htsno: hts.htsno,
    description: hts.description,
    origin: originIso,
    customsValue,
    unitQuantity,
    unit,
    lines,
    totalDuty,
    effectiveRate,
    notices,
    htsLookupUrl: `https://hts.usitc.gov/?query=${encodeURIComponent(hts.htsno)}`,
    caveats,
  };
}
