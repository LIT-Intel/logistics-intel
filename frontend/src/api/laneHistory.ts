/**
 * Lane history API — reads the per-company lane × month rollup table
 * `lit_company_lane_months` built by the P0-L deep shipment-history
 * ingestion worker (supabase/functions/company-history-ingest, cron'd
 * every 30 min for saved companies).
 *
 * Table contract (docs/agents/plans/2026-08-12-p0l-shipment-history-ingestion.md):
 *   company_id = lit_saved_companies.source_company_key (ImportYeti slug)
 *   one row per (lane fields, month-start date) with shipments + teu,
 *   refreshed_at = last rollup rebuild time (freshness chip).
 *
 * RLS: authenticated SELECT — safe to query directly from the frontend.
 *
 * Graceful degradation: most companies have NO rollup rows yet (deep
 * ingestion is saved-companies-only and accretes gradually). An error or
 * empty result resolves to [] so the Lane Matrix UI renders its
 * "history builds automatically" state instead of crashing.
 *
 * Lives under frontend/src/api/ per CLAUDE.md — new domain code must NOT
 * be added to frontend/src/lib/api.ts.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const FIVE_MIN = 5 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve whatever company key the page has (bare IY slug, "company/<slug>"
 * identity key, or a lit_companies UUID) to the BARE slug the rollup table
 * stores in `company_id`.
 *
 * CEO bug 2026-08-13: CompanyProfileV2's fallback chain passes
 * `bundle.identity.source_company_key`, which in `lit_companies` is often
 * the PREFIXED form ("company/tesla") — while `lit_company_lane_months`
 * (and `lit_saved_companies.source_company_key`) store the bare slug
 * ("tesla"). The old exact `.eq()` silently missed, so companies WITH
 * rollups fell back to the 50-BOL sample path and month filters showed
 * "no lane activity" for months the rollup actually covers.
 */
async function resolveRollupCompanyId(raw: string): Promise<string | null> {
  let key = String(raw).trim();
  if (!key) return null;
  if (UUID_RE.test(key)) {
    // Route param was a lit_companies UUID — look up its source key.
    const { data } = await supabase
      .from("lit_companies")
      .select("source_company_key")
      .eq("id", key)
      .maybeSingle();
    const sck = (data as any)?.source_company_key;
    if (!sck) return null;
    key = String(sck);
  }
  const bare = key.replace(/^company\//i, "").trim().toLowerCase();
  return bare || null;
}

export interface CompanyLaneMonthRow {
  origin_country: string;
  origin_city: string | null;
  dest_country: string | null;
  dest_state: string | null;
  dest_city: string | null;
  /** Month-start date, e.g. "2026-07-01". */
  month: string;
  shipments: number;
  teu: number | null;
  refreshed_at: string | null;
}

/**
 * Last 24 months of lane × month rollup rows for one company.
 * `companyId` is the ImportYeti slug (source_company_key). Disabled and
 * resolves [] when the key is unknown.
 */
export function useCompanyLaneMonths(
  companyId: string | null | undefined,
): UseQueryResult<CompanyLaneMonthRow[]> {
  return useQuery({
    queryKey: ["company-lane-months", companyId ?? ""],
    enabled: Boolean(companyId),
    staleTime: FIVE_MIN,
    queryFn: async (): Promise<CompanyLaneMonthRow[]> => {
      if (!companyId) return [];
      const rollupId = await resolveRollupCompanyId(companyId);
      if (!rollupId) return [];
      // month >= date_trunc('month', now()) - 23 months (24-month window).
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1));
      const startIso = start.toISOString().slice(0, 10);
      // `.in()` with both the bare slug and the raw key — the rollup table
      // stores bare slugs today, but tolerate prefixed rows defensively.
      const candidates = Array.from(
        new Set([rollupId, String(companyId).trim()].filter(Boolean)),
      );
      const { data, error } = await supabase
        .from("lit_company_lane_months")
        .select(
          "origin_country, origin_city, dest_country, dest_state, dest_city, month, shipments, teu, refreshed_at",
        )
        .in("company_id", candidates)
        .gte("month", startIso)
        .order("month", { ascending: true });
      if (error) {
        // Table not deployed on this environment / transient failure —
        // degrade to the empty state rather than throwing.
        console.warn(
          "[laneHistory] lit_company_lane_months query failed:",
          error.message,
        );
        return [];
      }
      return (Array.isArray(data) ? data : []).map((r: any) => ({
        origin_country: String(r.origin_country ?? "Unknown"),
        origin_city: r.origin_city ?? null,
        dest_country: r.dest_country ?? null,
        dest_state: r.dest_state ?? null,
        dest_city: r.dest_city ?? null,
        month: String(r.month),
        shipments: Number(r.shipments) || 0,
        teu: r.teu == null ? null : Number(r.teu),
        refreshed_at: r.refreshed_at ?? null,
      }));
    },
  });
}
