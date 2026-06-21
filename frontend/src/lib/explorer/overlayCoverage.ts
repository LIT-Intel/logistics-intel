// T2: Company Search intelligence-overlay coverage diagnostic.
//
// Pure summary over the overlay map that fetchSearchMetadataOverlay already
// built — no database round-trip. Tells us whether sparse Industry / Vertical
// / Revenue / Opp Score columns are a wiring bug or a data-coverage gap (the
// latter is what a T3b firmographics backfill would close). Kept standalone so
// it is unit-testable without importing the Supabase-initialising api.ts.

export type OverlayCoverage = {
  total: number;
  matched: number;
  missing: number;
  /** Whole-percent share of input keys that matched at least one field. */
  coveragePct: number;
  /** Per-field count of non-empty values across the input keys. */
  fields: {
    industry: number;
    vertical: number;
    revenue: number;
    opportunity_composite_score: number;
  };
};

type OverlayEntry = {
  industry?: string | null;
  vertical?: string | null;
  revenue?: number | string | null;
  opportunity_composite_score?: number | null;
};

const isPresent = (v: unknown) => v !== null && v !== undefined && v !== "";

export function summarizeOverlayCoverage(
  companyKeys: string[],
  overlay: Record<string, OverlayEntry>,
): OverlayCoverage {
  const keys = (companyKeys || []).filter(Boolean);
  const total = keys.length;
  const fields = {
    industry: 0,
    vertical: 0,
    revenue: 0,
    opportunity_composite_score: 0,
  };
  let matched = 0;
  for (const k of keys) {
    const e = overlay?.[k];
    if (!e) continue;
    let any = false;
    if (isPresent(e.industry)) {
      fields.industry++;
      any = true;
    }
    if (isPresent(e.vertical)) {
      fields.vertical++;
      any = true;
    }
    if (isPresent(e.revenue)) {
      fields.revenue++;
      any = true;
    }
    if (isPresent(e.opportunity_composite_score)) {
      fields.opportunity_composite_score++;
      any = true;
    }
    if (any) matched++;
  }
  return {
    total,
    matched,
    missing: total - matched,
    coveragePct: total > 0 ? Math.round((matched / total) * 100) : 0,
    fields,
  };
}
