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
  origin_country: string | null;
  destination_country: string | null;
  carrier: string | null;
  shipment_count: number;
  share_pct: number;
}

export interface LaneYoyTrendRow {
  origin_country: string | null;
  destination_country: string | null;
  period_2024: number;
  period_2025: number;
  period_2026: number;
  yoy_pct: number | null;
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
