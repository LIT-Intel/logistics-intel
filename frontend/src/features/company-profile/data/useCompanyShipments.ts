/**
 * useShipmentDataset — the profile page's ONE data load (README §3).
 *
 * Primary:  lit_unified_shipments rows for the company (per-BOL archive).
 * Fallback: the ImportYeti snapshot's recentBols (already fetched by the
 *           page) for companies whose archive is not materialized yet.
 *
 * Everything downstream (every tab, KPI, chart, trace) filters this dataset
 * client-side via memoized selectors — no per-widget fetches.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  normalizeRecentBols,
  normalizeUnifiedShipments,
  type RecentBolInput,
  type UnifiedShipmentDbRow,
} from "./normalizeShipments";
import type { ShipmentDataset } from "./types";

const FIVE_MIN = 5 * 60 * 1000;

const COLS =
  "id,bol_number,house_bol,master_bol,bol_date,scac,carrier_name,shipper_name," +
  "origin_country,origin_country_code,destination_country_code,origin_port,destination_port," +
  "hs_code,product_description,container_count,teu,weight_kg,lcl,load_type,shipping_cost_usd,container_type";

/** "company/tesla" | "tesla" → "tesla" (lit_unified_shipments.company_id is the bare slug) */
export const toArchiveSlug = (companyKey: string | null | undefined): string | null => {
  const k = (companyKey ?? "").trim();
  if (!k) return null;
  return k.replace(/^company\//, "");
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCompanyShipmentArchive(companyKey: string | null | undefined) {
  const slug = toArchiveSlug(companyKey);
  return useQuery<ShipmentDataset | null>({
    queryKey: ["company-shipments-v2", slug ?? ""],
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async () => {
      // The page can mount with the route param (which may be the
      // lit_companies UUID) before the identity bundle resolves the real
      // source_company_key — resolve UUID → slug here so the archive is
      // never missed for a company that has one. (Sany fell back to the
      // ImportYeti sample exactly this way, 2026-09-26.)
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
      const { data, error } = await supabase
        .from("lit_unified_shipments")
        .select(COLS)
        .eq("company_id", archiveKey)
        .order("bol_date", { ascending: true })
        .limit(5000);
      if (error || !data || data.length === 0) return null;
      return normalizeUnifiedShipments(data as unknown as UnifiedShipmentDbRow[]);
    },
  });
}

export interface ShipmentDatasetResult {
  dataset: ShipmentDataset | null;
  loading: boolean;
  /** true when we fell back to the ImportYeti snapshot sample */
  isSnapshotFallback: boolean;
}

/** Archive first; fall back to the snapshot's recentBols when empty. */
export function useShipmentDataset(
  companyKey: string | null | undefined,
  recentBols: RecentBolInput[] | null | undefined,
): ShipmentDatasetResult {
  const archive = useCompanyShipmentArchive(companyKey);
  const fallback = useMemo(
    () => (recentBols && recentBols.length ? normalizeRecentBols(recentBols) : null),
    [recentBols],
  );
  const dataset = archive.data ?? fallback;
  return {
    dataset: dataset && dataset.rows.length ? dataset : null,
    loading: archive.isLoading,
    isSnapshotFallback: !archive.data && !!fallback,
  };
}
