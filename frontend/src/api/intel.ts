/**
 * Premium Intel API — per-domain hooks for the company profile's
 * "Premium Intel" tab.
 *
 * Talks to Supabase RPCs added in
 * supabase/migrations/20260614230000_iy_powerquery_tables_and_rpcs.sql:
 *   - lit_lane_carrier_mix(p_company_name)
 *   - lit_lane_yoy_trend(p_company_name)
 *
 * And direct table reads against:
 *   - lit_mx_import_declarations  (MX customs — truck / rail / air)
 *   - lit_us_export_bols          (US exports)
 *
 * Graceful degradation: when an RPC or table isn't deployed yet (older
 * project copy, dev branch behind main), each hook returns an empty array
 * and emits ONE console.warn so the UI degrades to its empty state rather
 * than throwing or crashing the Premium Intel tab. This is intentional —
 * the feature ships dark on environments where the IY-3 migration hasn't
 * been applied.
 *
 * This file lives under frontend/src/api/ deliberately. Per CLAUDE.md
 * (and the api.ts split plan), new domain code MUST NOT be added to
 * frontend/src/lib/api.ts (6,658-line god-object — splitting it is a
 * planned P1 refactor).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const FIVE_MIN = 5 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;

// ── Types ───────────────────────────────────────────────────────────────

export interface LaneCarrierMixRow {
  // City/state present after 2026-06-15 migration. Origin side currently
  // null (source-data gap in lit_unified_shipments) — see migration comment.
  origin_city: string | null;
  origin_state: string | null;
  origin_country: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_country: string | null;
  carrier: string | null;
  shipment_count: number;
  share_pct: number;
}

export interface LaneYoyTrendRow {
  origin_city: string | null;
  origin_state: string | null;
  origin_country: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_country: string | null;
  // Sliding 12-month windows anchored to now() — replaces the old
  // hardcoded period_2024/period_2025/period_2026 columns.
  trailing_12m: number;
  prior_12m: number;
  prior_prior_12m: number;
  yoy_pct: number | null;
}

export interface PqCompanyAggregateRow {
  source: string;
  company_name: string;
  company_address: string[] | null;
  company_country_code: string | null;
  company_country: string | null;
  total_shipments: number | null;
  name_variations: string[] | null;
  customs_offices: string[] | null;
  product_descriptions: string[] | null;
  incoterms: string[] | null;
  fetched_at: string;
}

export interface PqSupplierAggregateRow {
  source: string;
  buyer_company_name: string;
  supplier_name: string;
  supplier_country: string | null;
  shipment_count: number | null;
  top_products: string[] | null;
  first_shipment_date: string | null;
  last_shipment_date: string | null;
}

export interface DatabaseFreshnessRow {
  last_updated: string | null;
  age_days: number | null;
  fetched_at: string | null;
}

export interface PqCreditsSummaryRow {
  credits_remaining: number | null;
  credits_burned_30d: number | null;
  last_sync_at: string | null;
}

export interface MxImportRow {
  declaration_id: string;
  declaration_date: string | null;
  importer_name: string | null;
  supplier_name: string | null;
  supplier_country: string | null;
  customs_broker_name: string | null;
  transport_type: string | null;
  hs_code: string | null;
  value_usd: number | null;
  origin_country: string | null;
}

export interface DomesticInlandLegRow {
  entry_port: string | null;
  destination_city: string | null;
  destination_state: string | null;
  shipment_count: number;
  approx_inland_miles: number | null;
  est_mode: "Truck" | "Intermodal" | "Rail" | string;
}

export interface UsExportRow {
  bol_number: string;
  shipment_date: string | null;
  shipper_name: string | null;
  consignee_name: string | null;
  consignee_country: string | null;
  carrier: string | null;
  origin_port: string | null;
  destination_port: string | null;
  hs_code: string | null;
  teu: number | null;
}

// ── Warning dedup ───────────────────────────────────────────────────────
// One warn per missing-source, not one per render. Logged at first miss.
const warned = new Set<string>();
function warnOnce(source: string, err: unknown) {
  if (warned.has(source)) return;
  warned.add(source);
  // eslint-disable-next-line no-console
  console.warn(
    `[intel] ${source} unavailable — UI will fall back to empty state. Cause:`,
    err,
  );
}

// Common "table not found / function not found" sniff. Postgres returns
// PGRST202 / 42P01 / 42883 for these classes. We treat unknown errors as
// real failures (surfaced via empty data + a single console.warn).
function isMissingSourceError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code ?? "";
  const message = String((err as { message?: string }).message ?? "").toLowerCase();
  if (
    code === "42P01" || // undefined_table
    code === "42883" || // undefined_function
    code === "PGRST202" || // schema cache: function not found
    code === "PGRST204" // schema cache: column not found (close enough)
  ) {
    return true;
  }
  return (
    message.includes("does not exist") ||
    message.includes("not found in schema cache") ||
    message.includes("could not find the function")
  );
}

// ── Hooks ────────────────────────────────────────────────────────────────

/**
 * Per-lane carrier mix for a receiver. Rows are pre-grouped by
 * (origin_country, destination_country, carrier) with share_pct already
 * computed server-side via window function.
 */
export function useLaneCarrierMix(
  companyName: string | null | undefined,
): UseQueryResult<LaneCarrierMixRow[], Error> {
  return useQuery<LaneCarrierMixRow[], Error>({
    queryKey: ["intel", "lane-carrier-mix", companyName ?? ""],
    enabled: Boolean(companyName && companyName.trim()),
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("lit_lane_carrier_mix", {
          p_company_name: companyName,
        });
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_lane_carrier_mix", error);
            return [];
          }
          throw error;
        }
        return Array.isArray(data) ? (data as LaneCarrierMixRow[]) : [];
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_lane_carrier_mix", err);
          return [];
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Per-lane YoY shipment-count trend. Rows include 2024 / 2025 / 2026
 * counts and a pre-computed yoy_pct (null when 2025 baseline is 0).
 */
export function useLaneYoyTrend(
  companyName: string | null | undefined,
): UseQueryResult<LaneYoyTrendRow[], Error> {
  return useQuery<LaneYoyTrendRow[], Error>({
    queryKey: ["intel", "lane-yoy-trend", companyName ?? ""],
    enabled: Boolean(companyName && companyName.trim()),
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("lit_lane_yoy_trend", {
          p_company_name: companyName,
        });
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_lane_yoy_trend", error);
            return [];
          }
          throw error;
        }
        return Array.isArray(data) ? (data as LaneYoyTrendRow[]) : [];
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_lane_yoy_trend", err);
          return [];
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Recent MX customs import declarations (truck / rail / air) for a receiver.
 * Sorted by declaration_date DESC, capped at 100 rows (UI shows summary).
 */
export function useMxImportActivity(
  companyName: string | null | undefined,
): UseQueryResult<MxImportRow[], Error> {
  return useQuery<MxImportRow[], Error>({
    queryKey: ["intel", "mx-import-activity", companyName ?? ""],
    enabled: Boolean(companyName && companyName.trim()),
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("lit_mx_import_declarations")
          .select(
            "declaration_id, declaration_date, importer_name, supplier_name, supplier_country, customs_broker_name, transport_type, hs_code, value_usd, origin_country",
          )
          .ilike("importer_name", `%${companyName}%`)
          .order("declaration_date", { ascending: false, nullsFirst: false })
          .limit(100);
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_mx_import_declarations", error);
            return [];
          }
          throw error;
        }
        return Array.isArray(data) ? (data as MxImportRow[]) : [];
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_mx_import_declarations", err);
          return [];
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Per-(entry-port -> destination-city) inland-leg rollup for a US import
 * consignee. Returns the top inland legs with average inland miles (joined
 * from lit_drayage_estimates) and a heuristic est_mode (Truck < 500mi <
 * Intermodal < 1500mi < Rail). Powers the Premium Intel "Domestic
 * transportation" card. Graceful degrade when the RPC isn't deployed.
 */
export function useDomesticInlandLeg(
  companyName: string | null | undefined,
): UseQueryResult<DomesticInlandLegRow[], Error> {
  return useQuery<DomesticInlandLegRow[], Error>({
    queryKey: ["intel", "domestic-inland-leg", companyName ?? ""],
    enabled: Boolean(companyName && companyName.trim()),
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("lit_domestic_inland_leg", {
          p_company_name: companyName,
        });
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_domestic_inland_leg", error);
            return [];
          }
          throw error;
        }
        return Array.isArray(data) ? (data as DomesticInlandLegRow[]) : [];
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_domestic_inland_leg", err);
          return [];
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Per-company PowerQuery aggregate rows (customs_offices / product_descriptions
 * / incoterms / name_variations). Reads lit_pq_company_aggregates across all
 * four source feeds (us-import / us-export / mx-import / mx-export) and lets
 * the UI merge them into a single set of cards.
 */
export function usePqCompanyAggregates(
  companyName: string | null | undefined,
): UseQueryResult<PqCompanyAggregateRow[], Error> {
  return useQuery<PqCompanyAggregateRow[], Error>({
    queryKey: ["intel", "pq-company-aggregates", companyName ?? ""],
    enabled: Boolean(companyName && companyName.trim()),
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("lit_pq_company_aggregates")
          .select(
            "source, company_name, company_address, company_country_code, company_country, total_shipments, name_variations, customs_offices, product_descriptions, incoterms, fetched_at",
          )
          .ilike("company_name", `%${companyName}%`)
          .order("total_shipments", { ascending: false, nullsFirst: false })
          .limit(20);
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_pq_company_aggregates", error);
            return [];
          }
          throw error;
        }
        return Array.isArray(data) ? (data as PqCompanyAggregateRow[]) : [];
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_pq_company_aggregates", err);
          return [];
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Top overseas suppliers for a buyer. Reads lit_pq_supplier_aggregates and
 * orders by shipment_count DESC. Card shows the top 10.
 */
export function usePqSupplierAggregates(
  companyName: string | null | undefined,
): UseQueryResult<PqSupplierAggregateRow[], Error> {
  return useQuery<PqSupplierAggregateRow[], Error>({
    queryKey: ["intel", "pq-supplier-aggregates", companyName ?? ""],
    enabled: Boolean(companyName && companyName.trim()),
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("lit_pq_supplier_aggregates")
          .select(
            "source, buyer_company_name, supplier_name, supplier_country, shipment_count, top_products, first_shipment_date, last_shipment_date",
          )
          .ilike("buyer_company_name", `%${companyName}%`)
          .order("shipment_count", { ascending: false, nullsFirst: false })
          .limit(50);
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_pq_supplier_aggregates", error);
            return [];
          }
          throw error;
        }
        return Array.isArray(data) ? (data as PqSupplierAggregateRow[]) : [];
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_pq_supplier_aggregates", err);
          return [];
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Cached ImportYeti /database-updated freshness. Reads lit_internal_meta
 * via the lit_get_database_freshness RPC. Server-side cache TTL is 6h —
 * the badge is per-session at the UI layer (queryClient gc).
 */
export function useDatabaseFreshness(): UseQueryResult<DatabaseFreshnessRow | null, Error> {
  return useQuery<DatabaseFreshnessRow | null, Error>({
    queryKey: ["intel", "database-freshness"],
    staleTime: 30 * 60 * 1000, // 30m client cache
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("lit_get_database_freshness");
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_get_database_freshness", error);
            return null;
          }
          throw error;
        }
        const rows = Array.isArray(data) ? (data as DatabaseFreshnessRow[]) : [];
        return rows[0] ?? null;
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_get_database_freshness", err);
          return null;
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Live PowerQuery credits gauge — creditsRemaining from latest sync +
 * 30-day burn from lit_credit_ledger. Powers the admin Enrichment
 * Providers panel gauge.
 */
export function usePqCreditsSummary(): UseQueryResult<PqCreditsSummaryRow | null, Error> {
  return useQuery<PqCreditsSummaryRow | null, Error>({
    queryKey: ["intel", "pq-credits-summary"],
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("lit_get_pq_credits_summary");
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_get_pq_credits_summary", error);
            return null;
          }
          throw error;
        }
        const rows = Array.isArray(data) ? (data as PqCreditsSummaryRow[]) : [];
        return rows[0] ?? null;
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_get_pq_credits_summary", err);
          return null;
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}

/**
 * Recent US export BOLs for a shipper. Sorted by shipment_date DESC,
 * capped at 100 rows. Complements MX import activity (counter-direction).
 */
export function useUsExportActivity(
  companyName: string | null | undefined,
): UseQueryResult<UsExportRow[], Error> {
  return useQuery<UsExportRow[], Error>({
    queryKey: ["intel", "us-export-activity", companyName ?? ""],
    enabled: Boolean(companyName && companyName.trim()),
    staleTime: FIVE_MIN,
    gcTime: THIRTY_MIN,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("lit_us_export_bols")
          .select(
            "bol_number, shipment_date, shipper_name, consignee_name, consignee_country, carrier, origin_port, destination_port, hs_code, teu",
          )
          .ilike("shipper_name", `%${companyName}%`)
          .order("shipment_date", { ascending: false, nullsFirst: false })
          .limit(100);
        if (error) {
          if (isMissingSourceError(error)) {
            warnOnce("lit_us_export_bols", error);
            return [];
          }
          throw error;
        }
        return Array.isArray(data) ? (data as UsExportRow[]) : [];
      } catch (err) {
        if (isMissingSourceError(err)) {
          warnOnce("lit_us_export_bols", err);
          return [];
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  });
}
