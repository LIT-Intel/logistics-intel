/**
 * Lane shipment intelligence API — reads the `lit_lane_shipment_intel`
 * Postgres RPC, which returns a single jsonb OBJECT of BOL-level detail for
 * one company × origin-country × dest-country lane (carrier mix, modes,
 * commodities, FCL/LCL split, origin ports, and aggregate totals).
 *
 * RPC contract (verified behr-process / China / United States of America):
 *   {
 *     ok, totals: { bols, teu, weight_kg, spend_usd, containers, ... },
 *     carriers[], modes[], commodities[], load_types[], origin_ports[]
 *   }
 *
 * Data richness varies per lane — carriers / modes / commodities / teu can
 * each be empty or null. Consumers MUST render a section only when its array
 * is non-empty / value non-null (no fake pies, no "0" placeholders).
 *
 * `p_company_id` is the ImportYeti slug (source_company_key), same key the
 * lane-month rollup stores in `lit_company_lane_months.company_id`. Country
 * args are the raw display names ("China", "United States of America"), NOT
 * canonical slugs.
 *
 * Graceful degradation: an error or missing RPC resolves to `null` so the
 * intelligence card silently hides rather than crashing the map.
 *
 * Lives under frontend/src/api/ per CLAUDE.md — new domain code must NOT be
 * added to frontend/src/lib/api.ts. Kept framework-light so the dashboard map
 * can reuse the same hook.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const FIVE_MIN = 5 * 60 * 1000;

export interface LaneIntelCarrier {
  name: string;
  bols: number;
}
export interface LaneIntelNamed {
  name: string;
  bols: number;
}
export interface LaneIntelCommodity {
  code: string;
  description: string;
  bols: number;
  kg: number | null;
}
export interface LaneIntelTotals {
  bols: number;
  teu: number | null;
  weight_kg: number | null;
  spend_usd: number | null;
  containers: number | null;
  n_carriers: number | null;
  n_commodities: number | null;
}
export interface LaneShipmentIntel {
  ok: boolean;
  totals: LaneIntelTotals;
  carriers: LaneIntelCarrier[];
  modes: LaneIntelNamed[];
  commodities: LaneIntelCommodity[];
  load_types: LaneIntelNamed[];
  origin_ports: LaneIntelNamed[];
}

/** Normalize whatever company key the page has to the bare IY slug the RPC
 *  expects (strip a "company/" prefix, trim, lowercase). */
function bareSlug(raw: string | null | undefined): string | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  return key.replace(/^company\//i, "").trim().toLowerCase() || null;
}

/**
 * BOL-level intelligence for one lane. Disabled (and resolves `null`) until
 * companyId + both country names are present. Keyed on all three so switching
 * the selected lane refetches; TanStack Query serializes concurrent requests
 * so the last-selected lane always wins (no manual race guard needed).
 */
export function useLaneShipmentIntel(
  companyId: string | null | undefined,
  originCountry: string | null | undefined,
  destCountry: string | null | undefined,
): UseQueryResult<LaneShipmentIntel | null> {
  const slug = bareSlug(companyId);
  const origin = String(originCountry ?? "").trim();
  const dest = String(destCountry ?? "").trim();
  const enabled = Boolean(slug && origin && dest);
  return useQuery({
    queryKey: ["lane-shipment-intel", slug ?? "", origin, dest],
    enabled,
    staleTime: FIVE_MIN,
    queryFn: async (): Promise<LaneShipmentIntel | null> => {
      if (!slug || !origin || !dest) return null;
      const { data, error } = await supabase.rpc("lit_lane_shipment_intel", {
        p_company_id: slug,
        p_origin_country: origin,
        p_dest_country: dest,
      });
      if (error) {
        console.warn(
          "[laneIntel] lit_lane_shipment_intel failed:",
          error.message,
        );
        return null;
      }
      // The RPC returns the jsonb object directly (not an array).
      const obj = (data ?? null) as any;
      if (!obj || typeof obj !== "object") return null;
      return {
        ok: Boolean(obj.ok),
        totals: {
          bols: Number(obj?.totals?.bols) || 0,
          teu: obj?.totals?.teu == null ? null : Number(obj.totals.teu),
          weight_kg:
            obj?.totals?.weight_kg == null ? null : Number(obj.totals.weight_kg),
          spend_usd:
            obj?.totals?.spend_usd == null ? null : Number(obj.totals.spend_usd),
          containers:
            obj?.totals?.containers == null
              ? null
              : Number(obj.totals.containers),
          n_carriers:
            obj?.totals?.n_carriers == null
              ? null
              : Number(obj.totals.n_carriers),
          n_commodities:
            obj?.totals?.n_commodities == null
              ? null
              : Number(obj.totals.n_commodities),
        },
        carriers: Array.isArray(obj.carriers)
          ? obj.carriers.map((c: any) => ({
              name: String(c?.name ?? "—"),
              bols: Number(c?.bols) || 0,
            }))
          : [],
        modes: Array.isArray(obj.modes)
          ? obj.modes.map((m: any) => ({
              name: String(m?.name ?? "—"),
              bols: Number(m?.bols) || 0,
            }))
          : [],
        commodities: Array.isArray(obj.commodities)
          ? obj.commodities.map((c: any) => ({
              code: String(c?.code ?? ""),
              description: String(c?.description ?? ""),
              bols: Number(c?.bols) || 0,
              kg: c?.kg == null ? null : Number(c.kg),
            }))
          : [],
        load_types: Array.isArray(obj.load_types)
          ? obj.load_types.map((l: any) => ({
              name: String(l?.name ?? "—"),
              bols: Number(l?.bols) || 0,
            }))
          : [],
        origin_ports: Array.isArray(obj.origin_ports)
          ? obj.origin_ports.map((p: any) => ({
              name: String(p?.name ?? "—"),
              bols: Number(p?.bols) || 0,
            }))
          : [],
      };
    },
  });
}
