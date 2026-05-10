/**
 * Procedural articles — slug-keyed HowTo schema config.
 *
 * Why this exists separately from Sanity: the four articles below are
 * step-by-step procedures that benefit from HowTo JSON-LD for AI
 * search ingestion (ChatGPT Search, Perplexity, Gemini all consume
 * HowTo when present). Rather than re-architect the Sanity schema to
 * hold an optional steps array, we keep this targeted config in code.
 * If/when the corpus grows enough that this map gets unwieldy, migrate
 * to a `howToSteps` field on the blogPost type.
 *
 * Add a new entry whenever a procedural article ships.
 *
 * Note: Google deprecated HowTo rich results in September 2023 for
 * most categories. The value of HowTo schema in 2026 is AI-search
 * surface area, not Google rich snippets.
 */

export type HowToStep = {
  name: string;
  text: string;
  url?: string;
};

export type HowToConfig = {
  name: string;
  description: string;
  estimatedCost?: { currency: string; value: number };
  totalTime?: string; // ISO 8601 duration e.g. "PT90D" (90 days)
  steps: HowToStep[];
};

export const HOW_TO_CONFIGS: Record<string, HowToConfig> = {
  "ieepa-tariff-refund-process-2026": {
    name: "Claim an IEEPA tariff refund through the CBP CAPE portal (2026)",
    description:
      "How importers reclaim IEEPA tariff duties after the Supreme Court's Feb 20 2026 invalidation, using CBP's Centralized Adjustment for Prior Entries (CAPE) portal in ACE.",
    totalTime: "PT90D",
    estimatedCost: { currency: "USD", value: 0 },
    steps: [
      {
        name: "Pull entry summaries from ACE",
        text:
          "Export every entry filed January 2025 through February 20, 2026 from ACE and filter to lines that include an HTSUS Chapter 99 IEEPA code.",
      },
      {
        name: "Reconcile by liquidation status",
        text:
          "Phase 1 CAPE accepts unliquidated entries, entries liquidated within 80 days of filing, and certain suspended entries. Other entries are pushed to later phases — segment your list accordingly.",
      },
      {
        name: "Build the CAPE CSV file",
        text:
          "Construct a CSV containing only the entry numbers. No other fields are required. Maximum 9,999 entries per declaration. Once accepted, a declaration cannot be amended.",
      },
      {
        name: "Submit the CAPE declaration",
        text:
          "Importer of record files directly in ACE, or a licensed customs broker submits on the importer's behalf via Power of Attorney. Third-party tariff consultants must partner with a licensed broker to upload.",
      },
      {
        name: "Wait for refund payout (60–90 days)",
        text:
          "CBP processes the declaration and issues refund including statutory interest within roughly 60 to 90 days of acceptance. Track status via the ACE entry record.",
      },
    ],
  },
  "section-232-copper-tariff-2026": {
    name: "Comply with the Section 232 copper tariff stack (April 6, 2026)",
    description:
      "Step-by-step compliance with the April 6, 2026 Section 232 copper tariff expansion: 50% on semi-finished, 25% on derivatives, with smelt-and-cast country reporting.",
    steps: [
      {
        name: "Identify copper-bearing SKUs",
        text:
          "Run a BOM analysis to find every SKU where copper, steel, or aluminum content exceeds 15% by weight. Articles above 15% are pulled into the Section 232 derivative net.",
      },
      {
        name: "Map SKUs to HTSUS Chapter 99 lines",
        text:
          "Classify each covered SKU under the correct line: 9903.82.06 and 9903.82.09 for copper articles and derivative content, 9903.82.15 and 9903.82.16 for Russian-origin material.",
      },
      {
        name: "Collect smelt-and-cast affidavits",
        text:
          "Request mill certificates and smelter affidavits from suppliers documenting the smelt-and-cast country. The 95% US-origin threshold qualifies for treatment paths that bypass the headline rate.",
      },
      {
        name: "Recalculate landed cost",
        text:
          "Rebuild the duty model on full customs value — the 25% derivative rate applies to the whole article, not just the metal content. The 50% semi-finished rate applies to copper articles directly.",
      },
      {
        name: "Update quotes and contracts",
        text:
          "Reprice every quote and renegotiate contract pricing for entries dated on or after April 6, 2026, 12:01 a.m. ET. Pre-April 6 cost-of-goods models are stale on every covered SKU.",
      },
    ],
  },
  "first-sale-valuation-2026": {
    name: "Use the First Sale doctrine to reduce dutiable import value",
    description:
      "How importers structure transactions to claim the lower First Sale customs value (the manufacturer-to-middleman price) instead of the higher middleman-to-importer price.",
    steps: [
      {
        name: "Confirm the multi-tier transaction exists",
        text:
          "First Sale applies when there is an actual sale from foreign manufacturer to a foreign middleman, then a separate sale from middleman to US importer. Single-tier transactions don't qualify.",
      },
      {
        name: "Document the bona fide sale and arm's-length pricing",
        text:
          "CBP requires evidence that the manufacturer-to-middleman price was a true arm's-length transaction. Keep purchase orders, invoices, payment records, and proof the manufacturer assumed risk during the sale.",
      },
      {
        name: "Verify export-for-US-destination intent",
        text:
          "The goods must be sold by the manufacturer with the US as the known destination at the time of the first sale. The middleman cannot be receiving generic inventory for redistribution.",
      },
      {
        name: "Calculate duty on the first sale price",
        text:
          "Enter the manufacturer-to-middleman price as the dutiable value. Typical reductions land 20-35% below the middleman-to-importer price, which is the value most importers default to.",
      },
      {
        name: "Maintain audit-ready documentation",
        text:
          "CBP's data survey since March 2, 2026 signals coming scrutiny. Keep all First Sale documentation accessible for at least five years; respond promptly to any CF-28 information request.",
      },
    ],
  },
  "fmc-detention-demurrage-rule-2026": {
    name: "Dispute container detention and demurrage charges under the FMC 2026 rule",
    description:
      "Steps to dispute D&D invoices using the surviving OSRA 2022 invoice requirements after the September 2025 court vacatur of FMC rule 46 CFR 541.4.",
    steps: [
      {
        name: "Confirm invoice timeliness",
        text:
          "Invoices must be issued within 30 days of the date charges last accrued (OSRA 2022 statutory window, which survived the 541.4 vacatur). Charges issued past 30 days are not legally collectible.",
      },
      {
        name: "Audit invoice for required fields",
        text:
          "Per OSRA 2022 the invoice must include the date charges began and ended, applicable tariff or contract reference, billed party identity, and contact for disputes. Missing fields are grounds for dispute.",
      },
      {
        name: "File the dispute within the required window",
        text:
          "Disputes must be raised within 30 days of invoice receipt. Document delivery exceptions, port closures, or carrier-caused delays that suspend D&D accrual.",
      },
      {
        name: "Escalate via FMC Form 24 if unresolved",
        text:
          "Unresolved disputes can be escalated to the Federal Maritime Commission via the Charge Complaint process. The Commission has authority to order refunds and impose penalties on non-compliant carriers.",
      },
    ],
  },
};

export function howToFor(slug: string): HowToConfig | null {
  return HOW_TO_CONFIGS[slug] || null;
}
