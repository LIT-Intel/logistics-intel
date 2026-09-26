/**
 * useShipmentDataset — the profile page's ONE data load (README §3).
 *
 * A single query bundle fetches everything the company already has saved:
 *   - lit_unified_shipments        → BOL documents (bounded ingest sample)
 *   - lit_company_time_series_monthly → FULL monthly shipments/teu history
 *   - lit_company_lane_months      → per-lane monthly history (subset)
 * plus the page-provided ImportYeti recentBols as the document fallback.
 *
 * assembleDataset() blends them: volume surfaces use the full rollup
 * history; document surfaces reconcile to the BOL records that exist.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RecentBolInput, UnifiedShipmentDbRow } from "./normalizeShipments";
import {
  assembleDataset,
  type ArchiveBundle,
  type LaneMonthDbRow,
  type TsMonthlyDbRow,
} from "./rollups";
import type { ShipmentDataset } from "./types";

const FIVE_MIN = 5 * 60 * 1000;

const BOL_COLS =
  "id,bol_number,house_bol,master_bol,bol_date,scac,carrier_name,shipper_name," +
  "origin_country,origin_country_code,destination_country_code,origin_port,destination_port," +
  "hs_code,product_description,container_count,teu,weight_kg,lcl,load_type,shipping_cost_usd,container_type";

/** "company/tesla" | "tesla" → "tesla" (rollup + archive tables key on the bare slug) */
export const toArchiveSlug = (companyKey: string | null | undefined): string | null => {
  const k = (companyKey ?? "").trim();
  if (!k) return null;
  return k.replace(/^company\//, "");
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCompanyArchiveBundle(companyKey: string | null | undefined) {
  const slug = toArchiveSlug(companyKey);
  return useQuery<ArchiveBundle | null>({
    queryKey: ["company-shipments-v2", slug ?? ""],
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async () => {
      // The page can mount with the route param (which may be the
      // lit_companies UUID) before the identity bundle resolves the real
      // source_company_key — resolve UUID → slug here so saved data is
      // never missed for a company that has it.
      let archiveKey = slug as string;
      if (UUID_RE.test(archiveKey)) {
        const { data: co } = await supabase
          .from("lit_companies")
          .select("source_company_key")
          .eq("id", archiveKey)
          .maybeSingle();
        const resolved = toArchiveSlug((co as any)?.source_company_key);
        if (resolved) archiveKey = resolved;
      }
      const [bols, ts, lanes] = await Promise.all([
        supabase
          .from("lit_unified_shipments")
          .select(BOL_COLS)
          .eq("company_id", archiveKey)
          .order("bol_date", { ascending: true })
          .limit(5000),
        supabase
          .from("lit_company_time_series_monthly")
          .select("year,month,shipments,teu")
          .eq("company_id", archiveKey)
          .limit(2000),
        supabase
          .from("lit_company_lane_months")
          .select("origin_country,dest_country,month,shipments,teu")
          .eq("company_id", archiveKey)
          .limit(5000),
      ]);
      return {
        bolRows: (bols.error ? [] : (bols.data ?? [])) as unknown as UnifiedShipmentDbRow[],
        tsRows: (ts.error ? [] : (ts.data ?? [])) as unknown as TsMonthlyDbRow[],
        laneRows: (lanes.error ? [] : (lanes.data ?? [])) as unknown as LaneMonthDbRow[],
      };
    },
  });
}

export interface ShipmentDatasetResult {
  dataset: ShipmentDataset | null;
  loading: boolean;
  /** true when the DOCUMENTS came from the ImportYeti snapshot sample */
  isSnapshotFallback: boolean;
}

/** Archive docs + full rollup history; ImportYeti recentBols as the document
 *  fallback when the archive has none. */
export function useShipmentDataset(
  companyKey: string | null | undefined,
  recentBols: RecentBolInput[] | null | undefined,
): ShipmentDatasetResult {
  const bundle = useCompanyArchiveBundle(companyKey);
  const dataset = useMemo(() => {
    const b = bundle.data ?? { bolRows: [], tsRows: [], laneRows: [] };
    if (!bundle.data && !(recentBols && recentBols.length)) return null;
    return assembleDataset(b, recentBols ?? null);
  }, [bundle.data, recentBols]);
  return {
    dataset,
    loading: bundle.isLoading,
    isSnapshotFallback: !!dataset && dataset.source === "snapshot" && dataset.rows.length > 0,
  };
}
