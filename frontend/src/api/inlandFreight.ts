/**
 * Domestic inland-freight estimate API — reads the `lit_company_inland_freight`
 * Postgres RPC, which returns a single jsonb OBJECT of MODELED domestic
 * truckload activity for one company, derived from import shipment records
 * (never observed domestic freight — consumers must label it as estimated).
 *
 * RPC contract (verified):
 *   {
 *     ok,
 *     totals: { est_tl_month, monthly_shipments, containers_per_shipment,
 *               ftl_bols, lcl_bols, latest_month },
 *     facilities: [{ city, state, zip, bols, containers, first_seen,
 *                    last_seen, class: "own_facility"|"3pl", corroborated,
 *                    confidence }],
 *     flows:      [{ origin_port, dest_city, dest_state, bols, est_tl_month,
 *                    kind, modeled, confidence }],
 *     transfers:  [{ from_city, from_state, to_city, to_state, kind,
 *                    modeled, confidence }]
 *   }
 *
 * KNOWN DATA QUIRKS handled here (not in the UI):
 *   - `origin_port` is polluted (often mirrors the destination city, e.g.
 *     "Canon Del Santa Ana"). It is DROPPED in normalization — consumers
 *     render flows as "Port of entry → {City}, {ST}".
 *   - flows can contain duplicate (dest_city, dest_state) rows (same city,
 *     different zips). Deduped here: bols + est_tl_month are summed,
 *     confidence takes the max.
 *   - facilities/flows/transfers may be empty; totals may be 0. Consumers
 *     MUST render empty states rather than zeros.
 *
 * `p_company_id` is the bare ImportYeti slug (source_company_key), same key
 * the lane-month rollup uses — normalized via bareSlug() exactly like
 * `frontend/src/api/laneIntel.ts`.
 *
 * Graceful degradation: an error or missing RPC resolves to `null` so the
 * card silently hides rather than crashing the profile.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const FIVE_MIN = 5 * 60 * 1000;

export interface InlandFreightTotals {
  est_tl_month: number;
  monthly_shipments: number;
  containers_per_shipment: number | null;
  ftl_bols: number;
  lcl_bols: number;
  /** ISO date of the latest contributing month, e.g. "2025-06-01". */
  latest_month: string | null;
}

export interface InlandFacility {
  city: string;
  state: string;
  zip: string | null;
  bols: number;
  containers: number;
  first_seen: string | null;
  last_seen: string | null;
  /** "own_facility" | "3pl" (free-form tolerated). */
  class: string;
  corroborated: boolean;
  confidence: number;
}

/** Deduped port-of-entry → destination-city flow. `origin_port` from the RPC
 *  is intentionally dropped (polluted upstream). */
export interface InlandFlow {
  dest_city: string;
  dest_state: string;
  bols: number;
  est_tl_month: number;
  kind: string;
  modeled: boolean;
  confidence: number;
}

export interface InlandTransfer {
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
  kind: string;
  modeled: boolean;
  confidence: number;
}

export interface InlandFreight {
  ok: boolean;
  totals: InlandFreightTotals;
  facilities: InlandFacility[];
  flows: InlandFlow[];
  transfers: InlandTransfer[];
}

/** Normalize whatever company key the page has to the bare IY slug the RPC
 *  expects (strip a "company/" prefix, trim, lowercase). Mirrors laneIntel. */
function bareSlug(raw: string | null | undefined): string | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  return key.replace(/^company\//i, "").trim().toLowerCase() || null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize the raw jsonb OBJECT into `InlandFreight`. Includes the flow
 * dedupe by (dest_city, dest_state): bols + est_tl_month summed, max
 * confidence, `modeled` only when EVERY merged row was modeled.
 */
function normalizeInlandFreight(data: unknown): InlandFreight | null {
  const obj = (data ?? null) as any;
  if (!obj || typeof obj !== "object") return null;

  const facilities: InlandFacility[] = Array.isArray(obj.facilities)
    ? obj.facilities
        .map((f: any): InlandFacility => ({
          city: str(f?.city),
          state: str(f?.state),
          zip: str(f?.zip) || null,
          bols: num(f?.bols),
          containers: num(f?.containers),
          first_seen: str(f?.first_seen) || null,
          last_seen: str(f?.last_seen) || null,
          class: str(f?.class) || "own_facility",
          corroborated: Boolean(f?.corroborated),
          confidence: num(f?.confidence),
        }))
        .filter((f: InlandFacility) => f.city || f.state)
    : [];

  // Flow dedupe: same city can appear under multiple zips. Key on
  // (dest_city, dest_state) case-insensitively; sum volumes, max confidence.
  const flowMap = new Map<string, InlandFlow>();
  if (Array.isArray(obj.flows)) {
    for (const raw of obj.flows) {
      const dest_city = str(raw?.dest_city);
      const dest_state = str(raw?.dest_state).toUpperCase();
      if (!dest_city && !dest_state) continue;
      const key = `${dest_city.toLowerCase()}::${dest_state}`;
      const row: InlandFlow = {
        dest_city,
        dest_state,
        bols: num(raw?.bols),
        est_tl_month: num(raw?.est_tl_month),
        kind: str(raw?.kind) || "drayage_inland_tl",
        modeled: Boolean(raw?.modeled),
        confidence: num(raw?.confidence),
      };
      const prev = flowMap.get(key);
      if (!prev) {
        flowMap.set(key, row);
      } else {
        prev.bols += row.bols;
        prev.est_tl_month += row.est_tl_month;
        prev.confidence = Math.max(prev.confidence, row.confidence);
        prev.modeled = prev.modeled && row.modeled;
      }
    }
  }
  const flows = Array.from(flowMap.values()).sort(
    (a, b) => b.est_tl_month - a.est_tl_month || b.bols - a.bols,
  );

  const transfers: InlandTransfer[] = Array.isArray(obj.transfers)
    ? obj.transfers
        .map((t: any): InlandTransfer => ({
          from_city: str(t?.from_city),
          from_state: str(t?.from_state).toUpperCase(),
          to_city: str(t?.to_city),
          to_state: str(t?.to_state).toUpperCase(),
          kind: str(t?.kind) || "replenishment_transfer",
          modeled: t?.modeled == null ? true : Boolean(t.modeled),
          confidence: num(t?.confidence),
        }))
        .filter((t: InlandTransfer) => (t.from_city || t.from_state) && (t.to_city || t.to_state))
    : [];

  return {
    ok: Boolean(obj.ok),
    totals: {
      est_tl_month: num(obj?.totals?.est_tl_month),
      monthly_shipments: num(obj?.totals?.monthly_shipments),
      containers_per_shipment:
        obj?.totals?.containers_per_shipment == null
          ? null
          : num(obj.totals.containers_per_shipment),
      ftl_bols: num(obj?.totals?.ftl_bols),
      lcl_bols: num(obj?.totals?.lcl_bols),
      latest_month: str(obj?.totals?.latest_month) || null,
    },
    facilities,
    flows,
    transfers,
  };
}

/**
 * ImportYeti-observed facility address for one company — a row from
 * `lit_company_iy_facilities` (RLS: authenticated read). Addresses are messy
 * free text (e.g. "2110 W Ikea Way, Dept Tel, Tempe, Az 85284, Us"); they're
 * used to CORROBORATE the modeled BOL facilities (city+state substring
 * match), never geocoded or parsed structurally.
 */
export interface IyFacility {
  address: string;
  /** Date of the last shipment observed to this address (ISO), if any. */
  last_shipment_to: string | null;
}

/**
 * ImportYeti facility addresses on file for one company, most recent
 * shipment first. Disabled (resolves `[]`) until a company key is present;
 * errors degrade to `[]` so corroboration silently no-ops.
 */
export function useCompanyIyFacilities(
  companyId: string | null | undefined,
): UseQueryResult<IyFacility[]> {
  const slug = bareSlug(companyId);
  return useQuery({
    queryKey: ["company-iy-facilities", slug ?? ""],
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async (): Promise<IyFacility[]> => {
      if (!slug) return [];
      const { data, error } = await supabase
        .from("lit_company_iy_facilities")
        .select("address, last_shipment_to")
        .eq("company_id", slug)
        .order("last_shipment_to", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) {
        console.warn(
          "[inlandFreight] lit_company_iy_facilities query failed:",
          error.message,
        );
        return [];
      }
      return (data ?? [])
        .map((r: any): IyFacility => ({
          address: str(r?.address),
          last_shipment_to: str(r?.last_shipment_to) || null,
        }))
        .filter((r: IyFacility) => r.address);
    },
  });
}

/**
 * Estimated domestic freight for one company. Disabled (resolves `null`)
 * until a company key is present. 5-min staleTime; degrades to `null` on
 * error so the card silently hides.
 */
export function useInlandFreight(
  companyId: string | null | undefined,
): UseQueryResult<InlandFreight | null> {
  const slug = bareSlug(companyId);
  return useQuery({
    queryKey: ["company-inland-freight", slug ?? ""],
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async (): Promise<InlandFreight | null> => {
      if (!slug) return null;
      const { data, error } = await supabase.rpc("lit_company_inland_freight", {
        p_company_id: slug,
      });
      if (error) {
        console.warn(
          "[inlandFreight] lit_company_inland_freight failed:",
          error.message,
        );
        return null;
      }
      return normalizeInlandFreight(data);
    },
  });
}
