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
import { readAllRows } from "@/api/readAllRows";
import { useAuth } from "@/auth/AuthProvider";
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
  "hs_code,product_description,container_count,teu,weight_kg,lcl,load_type,shipping_cost_usd,container_type,transport_mode,ingest_source";

/** "company/tesla" | "tesla" → "tesla" (rollup + archive tables key on the bare slug) */
export const toArchiveSlug = (companyKey: string | null | undefined): string | null => {
  const k = (companyKey ?? "").trim();
  if (!k) return null;
  return k.replace(/^company\//, "");
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCompanyArchiveBundle(companyKey: string | null | undefined) {
  const { user, orgId, plan } = useAuth();
  const slug = toArchiveSlug(companyKey);
  const scope = ["company-shipments-v2", user?.id, orgId, plan, slug ?? ""];
  const isUuid = Boolean(slug && UUID_RE.test(slug));
  const resolved = useQuery({
    queryKey: [...scope, "identity"],
    enabled: Boolean(isUuid && user?.id),
    staleTime: FIVE_MIN,
    queryFn: async () => {
        const { data: co, error } = await supabase
          .from("lit_companies")
          .select("source_company_key")
          .eq("id", slug)
          .maybeSingle();
        if(error) throw error;
        return toArchiveSlug((co as any)?.source_company_key) ?? slug;
    },
  });
  const archiveKey = isUuid ? resolved.data : slug;
  const enabled = Boolean(archiveKey && user?.id);
  // Monthly totals paint independently of the larger document/lane archives.
  const bols = useQuery({
    queryKey:[...scope,"bols"], enabled, staleTime:FIVE_MIN,
    queryFn:()=>readAllRows<UnifiedShipmentDbRow>((from, to) => supabase
          .from("lit_unified_shipments")
          .select(BOL_COLS)
          .eq("company_id", archiveKey)
          .order("bol_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as any),
  });
  const ts = useQuery({
    queryKey:[...scope,"monthly"], enabled, staleTime:FIVE_MIN,
    queryFn:()=>readAllRows<TsMonthlyDbRow>((from, to) => supabase
          .from("lit_company_time_series_monthly")
          .select("year,month,shipments,teu")
          .eq("company_id", archiveKey)
          .order("year", { ascending: true })
          .order("month", { ascending: true })
          .range(from, to) as any),
  });
  const lanes = useQuery({
    queryKey:[...scope,"lanes"], enabled, staleTime:FIVE_MIN,
    queryFn:()=>readAllRows<LaneMonthDbRow>((from, to) => supabase
          .from("lit_company_lane_months")
          .select("origin_country,dest_country,month,shipments,teu")
          .eq("company_id", archiveKey)
          .order("month", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as any),
  });
  const data = useMemo<ArchiveBundle | null>(() => {
    if(!bols.data && !ts.data && !lanes.data) return null;
    return {bolRows:bols.data ?? [],tsRows:ts.data ?? [],laneRows:lanes.data ?? []};
  },[bols.data,ts.data,lanes.data]);
  return {data, airSummary: bols.data ? airCoverage(bols.data) : null,
    isLoading:(isUuid && resolved.isLoading) || (bols.isLoading && ts.isLoading && lanes.isLoading),
    detailsLoading:bols.isLoading || lanes.isLoading,
    isError:resolved.isError || bols.isError || ts.isError || lanes.isError};
}

// This summarizes ONLY records explicitly labeled as air by a source.
// Ocean BOLs or rows with missing transport_mode cannot establish air volume.
export interface AirCoverageSummary {
  verifiedAir: number;
  unclassified: number;
  observedDocuments: number;
  weightKg: number | null;
  lastAirDate: string | null;
  topOrigin: string | null;
}

function airCoverage(rows: UnifiedShipmentDbRow[]): AirCoverageSummary {
  const air = rows.filter((r) => /^air(?:\s|$)/i.test(String(r.transport_mode ?? "").trim()));
  const unknown = rows.filter((r) => !String(r.transport_mode ?? "").trim());
  const origins = new Map<string, number>();
  let weight = 0;
  let weightKnown = false;
  let lastAirDate: string | null = null;
  for (const row of air) {
    const origin = (row.origin_country ?? row.origin_country_code ?? "").trim();
    if (origin) origins.set(origin, (origins.get(origin) ?? 0) + 1);
    const w = Number(row.weight_kg);
    if (row.weight_kg != null && Number.isFinite(w)) { weight += w; weightKnown = true; }
    if (row.bol_date && (!lastAirDate || row.bol_date > lastAirDate)) lastAirDate = row.bol_date;
  }
  const topOrigin = [...origins.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? null;
  return { verifiedAir: air.length, unclassified: unknown.length,
    observedDocuments: rows.length, weightKg: weightKnown ? weight : null,
    lastAirDate, topOrigin };
}

export interface ShipmentDatasetResult {
  airSummary: AirCoverageSummary | null;
  detailsLoading: boolean;
  dataError: boolean;
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
    airSummary: bundle.airSummary,
    detailsLoading: bundle.detailsLoading,
    dataError: bundle.isError,
    dataset,
    loading: bundle.isLoading,
    isSnapshotFallback: !!dataset && dataset.source === "snapshot" && dataset.rows.length > 0,
  };
}
