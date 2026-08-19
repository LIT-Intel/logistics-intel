/**
 * Port-level lane API — reads `lit_company_port_lanes`, the customs-derived
 * exit-port → US-entry-port rollup (one row per company × port pair), plus
 * the matching `port:` centroids from `lit_geo_place_centroids` so the
 * company-profile trade-lanes map can draw real port-to-port arcs.
 *
 * Table contract (RLS: authenticated read):
 *   lit_company_port_lanes(company_id, exit_port, exit_port_country,
 *     entry_port, entry_port_region, shipments, weight_kg, teu, updated_at)
 *
 * `company_id` is the bare ImportYeti slug (source_company_key) — normalized
 * via bareSlug() exactly like `frontend/src/api/laneIntel.ts`.
 *
 * PORT CENTROID KEYS (must stay in sync with the one-time seed migration
 * `supabase/migrations/20260819220000_lit_geo_port_centroids_seed.sql`):
 *   exit ports:  `port:<lower exit_port>|<lower exit_port_country>`
 *                 e.g. "port:yantian|china"
 *   entry ports: `port:<lower entry_port>`  (US entry ports carry their
 *                 state in the name) e.g. "port:los angeles, ca"
 * Junk buckets ("All Other X Ports", "Panama Canal", numeric codes) are
 * seeded with precision='failed' and therefore never resolve — consumers
 * skip pairs whose ends don't both geocode.
 *
 * Graceful degradation: errors resolve to `[]` / empty Map so the map layer
 * silently hides rather than crashing the profile.
 *
 * Lives under frontend/src/api/ per CLAUDE.md — new domain code must NOT be
 * added to frontend/src/lib/api.ts.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { usePlaceCentroids, type PlaceCentroid } from "@/api/geoCentroids";

const FIVE_MIN = 5 * 60 * 1000;

/** Max port pairs fetched per company (already the biggest by shipments). */
const PORT_LANE_LIMIT = 40;

export interface CompanyPortLane {
  exit_port: string;
  exit_port_country: string;
  entry_port: string;
  entry_port_region: string | null;
  shipments: number;
  weight_kg: number | null;
  teu: number | null;
}

/** Normalize whatever company key the page has to the bare IY slug the table
 *  stores (strip a "company/" prefix, trim, lowercase). Mirrors laneIntel. */
function bareSlug(raw: string | null | undefined): string | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  return key.replace(/^company\//i, "").trim().toLowerCase() || null;
}

/** `port:` centroid key for an exit (foreign) port row. Null when blank. */
export function exitPortKey(
  exitPort: string | null | undefined,
  exitPortCountry: string | null | undefined,
): string | null {
  const port = String(exitPort ?? "").trim().toLowerCase();
  const country = String(exitPortCountry ?? "").trim().toLowerCase();
  if (!port || !country) return null;
  return `port:${port}|${country}`;
}

/** `port:` centroid key for a US entry port row. Null when blank. */
export function entryPortKey(entryPort: string | null | undefined): string | null {
  const port = String(entryPort ?? "").trim().toLowerCase();
  if (!port) return null;
  return `port:${port}`;
}

/**
 * Top port-pair lanes for one company (by shipments desc, capped at 40).
 * Disabled (resolves `[]`) until a company key is present; errors degrade
 * to `[]` so the map layer hides silently.
 */
export function useCompanyPortLanes(
  companyId: string | null | undefined,
): UseQueryResult<CompanyPortLane[]> {
  const slug = bareSlug(companyId);
  return useQuery({
    queryKey: ["company-port-lanes", slug ?? ""],
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async (): Promise<CompanyPortLane[]> => {
      if (!slug) return [];
      const { data, error } = await supabase
        .from("lit_company_port_lanes")
        .select(
          "exit_port, exit_port_country, entry_port, entry_port_region, shipments, weight_kg, teu",
        )
        .eq("company_id", slug)
        .order("shipments", { ascending: false })
        .limit(PORT_LANE_LIMIT);
      if (error) {
        console.warn(
          "[portLanes] lit_company_port_lanes query failed:",
          error.message,
        );
        return [];
      }
      return (data ?? [])
        .map((r: any): CompanyPortLane => ({
          exit_port: String(r?.exit_port ?? "").trim(),
          exit_port_country: String(r?.exit_port_country ?? "").trim(),
          entry_port: String(r?.entry_port ?? "").trim(),
          entry_port_region:
            String(r?.entry_port_region ?? "").trim() || null,
          shipments: Number(r?.shipments) || 0,
          weight_kg: r?.weight_kg == null ? null : Number(r.weight_kg),
          teu: r?.teu == null ? null : Number(r.teu),
        }))
        .filter((r: CompanyPortLane) => r.exit_port && r.entry_port);
    },
  });
}

/**
 * Resolve the `port:` centroids needed by a set of port lanes. Thin wrapper
 * around {@link usePlaceCentroids} (which already handles chunking, caching
 * and dropping precision='failed' rows) — the port keys are just another
 * place_key shape in the same table. Returns Map<place_key, PlaceCentroid>
 * containing ONLY keys with usable coordinates.
 */
export function usePortCentroids(
  lanes: CompanyPortLane[] | null | undefined,
): UseQueryResult<Map<string, PlaceCentroid>> {
  const keys: string[] = [];
  for (const lane of lanes ?? []) {
    const exit = exitPortKey(lane.exit_port, lane.exit_port_country);
    const entry = entryPortKey(lane.entry_port);
    if (exit) keys.push(exit);
    if (entry) keys.push(entry);
  }
  return usePlaceCentroids(keys);
}
