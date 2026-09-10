/**
 * MX pedimento company-profile data adapter.
 *
 * ONE shared TanStack hook over the `lit_mx_company_profile` RPC so every
 * consumer (CompanyProfileV2 header/right-rail + MxTradePanel body) reads
 * the SAME cache entry — the RPC fires once per company per 5 minutes via
 * query dedup, and the header can never contradict the tab below it.
 *
 * RPC payload (all keys optional — render defensively; a v3 may add
 * `regimes` / `name_variants`):
 *   summary { rfc, imports, exports, total_value_usd, total_weight_kg,
 *             first_activity, last_activity }
 *   modes[{v,n,usd}] gateways[{v,n}] counterparties[{v,c,n,usd}]
 *   brokers products incoterms freight_control
 *   declarations[≤30: d, direction, transport_type, customs_office,
 *                counterparty, hs_code, product, value_usd, weight_kg,
 *                incoterm, who_pays_freight]
 *
 * Lives under frontend/src/api/ per CLAUDE.md (no new code in lib/api.ts).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type MxNamedCount = { v?: string | null; n?: number | null; usd?: number | null };
export type MxCounterparty = MxNamedCount & { c?: string | null };

export type MxCompanyProfileData = {
  summary?: {
    rfc?: string | null;
    imports?: number | null;
    exports?: number | null;
    total_value_usd?: number | null;
    total_weight_kg?: number | null;
    first_activity?: string | null;
    last_activity?: string | null;
  } | null;
  modes?: MxNamedCount[] | null;
  gateways?: MxNamedCount[] | null;
  counterparties?: MxCounterparty[] | null;
  brokers?: MxNamedCount[] | null;
  products?: Array<MxNamedCount & { label?: string | null }> | null;
  incoterms?: MxNamedCount[] | null;
  freight_control?: MxNamedCount[] | null;
  declarations?: Array<{
    d?: string | null;
    direction?: string | null;
    transport_type?: string | null;
    customs_office?: string | null;
    counterparty?: string | null;
    hs_code?: string | null;
    product?: string | null;
    value_usd?: number | null;
    weight_kg?: number | null;
    incoterm?: string | null;
    who_pays_freight?: string | null;
  }> | null;
  /** v3 forward-compat — render only when present. */
  regimes?: MxNamedCount[] | null;
  name_variants?: string[] | null;
} | null;

/**
 * The RPC matches by name-prefix ILIKE — pass the HUMAN name, stripping any
 * leftover slug decoration ('mx:' route ids, 'mx-' key prefixes). Shared by
 * every consumer so the query key (and therefore the cache entry) is
 * identical regardless of which surface asked first.
 */
export function normalizeMxCompanyName(raw: string | null | undefined): string {
  let v = String(raw ?? "").trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    /* keep raw */
  }
  return v.replace(/^mx[:-]\s*/i, "").trim();
}

/**
 * Shared MX company-profile query. Pass null/undefined to disable (non-MX
 * identities). staleTime 5 min mirrors the original MxTradePanel query.
 */
export function useMxCompanyProfile(
  companyName: string | null | undefined,
): UseQueryResult<MxCompanyProfileData> {
  const name = normalizeMxCompanyName(companyName);
  return useQuery<MxCompanyProfileData>({
    queryKey: ["mx-company-profile", name],
    enabled: Boolean(name),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lit_mx_company_profile", {
        p_name: name,
      });
      if (error) return null;
      return (data ?? null) as MxCompanyProfileData;
    },
  });
}

/* ── Header stats adapter ──────────────────────────────────────────────
 * Collapses the RPC payload into exactly what CDPHeader / the right rail
 * need, so the page-level component stays a thin pass-through. Always
 * returns an object (zeros/nulls while the RPC loads) so MX pages never
 * flash the US "Snapshot pending" chrome. */

export type MxHeaderStats = {
  rfc: string | null;
  declaredValueUsd: number | null;
  imports: number;
  exports: number;
  declarations: number;
  totalWeightKg: number | null;
  topGateway: string | null;
  gatewayCount: number | null;
  lastActivity: string | null;
  firstActivity: string | null;
  /** Trade role derived from import/export counts. */
  role: "Importer" | "Exporter" | "Importer & Exporter" | null;
};

export function deriveMxHeaderStats(
  data: MxCompanyProfileData | undefined,
): MxHeaderStats {
  const s = data?.summary ?? {};
  const imports = Math.max(0, Number(s?.imports ?? 0) || 0);
  const exports = Math.max(0, Number(s?.exports ?? 0) || 0);
  const declaredValueUsd = Number(s?.total_value_usd);
  const totalWeightKg = Number(s?.total_weight_kg);
  const gateways = Array.isArray(data?.gateways) ? data!.gateways! : [];
  return {
    rfc: s?.rfc ?? null,
    declaredValueUsd:
      Number.isFinite(declaredValueUsd) && declaredValueUsd > 0
        ? declaredValueUsd
        : null,
    imports,
    exports,
    declarations: imports + exports,
    totalWeightKg:
      Number.isFinite(totalWeightKg) && totalWeightKg > 0 ? totalWeightKg : null,
    topGateway: shortGatewayLabel(gateways[0]?.v) || null,
    gatewayCount: gateways.length > 0 ? gateways.length : null,
    lastActivity: s?.last_activity ?? null,
    firstActivity: s?.first_activity ?? null,
    role:
      imports > 0 && exports > 0
        ? "Importer & Exporter"
        : exports > 0
          ? "Exporter"
          : imports > 0
            ? "Importer"
            : null,
  };
}

/**
 * Short display label for a customs-gateway string: strips leading numeric
 * office codes ("470 - NUEVO LAREDO"), keeps the segment before the first
 * comma, and title-cases the SHOUTY customs casing.
 */
export function shortGatewayLabel(raw: string | null | undefined): string | null {
  let v = String(raw ?? "").trim();
  if (!v) return null;
  v = v.replace(/^\s*\d+\s*[-–·:]?\s*/, "");
  v = v.split(",")[0].trim();
  if (!v) return null;
  return v
    .toLowerCase()
    .replace(/(^|[\s\-./(])([a-záéíóúñü])/g, (_m, pre, ch) => pre + ch.toUpperCase());
}

/* ── MX customs-gateway coordinates ────────────────────────────────────
 * Compact substring lookup for the major aduanas (border crossings, sea
 * ports, airports). Accent-insensitive. Falls back to null — callers use
 * the Mexico country centroid from @/lib/laneGlobe.COUNTRY_COORDS. */

const MX_GATEWAYS: Array<[RegExp, number, number]> = [
  [/nuevo laredo/, 27.48, -99.53],
  [/\bcolombia\b/, 27.7, -99.76], // Aduana Colombia (Solidarity Bridge, NL)
  [/tijuana|otay/, 32.52, -117.03],
  [/juarez/, 31.69, -106.43],
  [/manzanillo/, 19.05, -104.31],
  [/lazaro cardenas/, 17.96, -102.19],
  [/veracruz/, 19.19, -96.14],
  [/altamira/, 22.39, -97.93],
  [/tampico/, 22.26, -97.87],
  [/ensenada/, 31.85, -116.62],
  [/mazatlan/, 23.22, -106.42],
  [/guaymas/, 27.92, -110.9],
  [/progreso/, 21.28, -89.66],
  [/reynosa/, 26.09, -98.28],
  [/matamoros/, 25.87, -97.5],
  [/nogales/, 31.31, -110.94],
  [/mexicali/, 32.66, -115.47],
  [/tecate/, 32.57, -116.63],
  [/piedras negras/, 28.7, -100.52],
  [/acuna/, 29.32, -100.93],
  [/ojinaga/, 29.57, -104.42],
  [/agua prieta/, 31.33, -109.55],
  [/san luis rio colorado/, 32.46, -114.77],
  [/aicm|pantaco|cd\.? de mexico|ciudad de mexico|mexico city/, 19.44, -99.07],
  [/toluca/, 19.34, -99.57],
  [/guadalajara/, 20.52, -103.31],
  [/monterrey/, 25.78, -100.11],
  [/queretaro/, 20.62, -100.19],
  [/aguascalientes/, 21.88, -102.3],
  [/puebla/, 19.04, -98.2],
  [/cancun/, 21.04, -86.87],
  [/merida/, 20.97, -89.62],
  [/coatzacoalcos/, 18.15, -94.43],
  [/tuxpan/, 20.96, -97.41],
  [/salina cruz/, 16.17, -95.19],
  [/dos bocas/, 18.43, -93.19],
  [/chihuahua/, 28.63, -106.07],
  [/torreon/, 25.54, -103.45],
];

/**
 * Resolve a customs-gateway label to [lat, lng] (Leaflet order), or null
 * when the office isn't in the compact table.
 */
export function mxGatewayCoords(
  raw: string | null | undefined,
): [number, number] | null {
  const v = String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!v) return null;
  for (const [re, lat, lng] of MX_GATEWAYS) {
    if (re.test(v)) return [lat, lng];
  }
  return null;
}

/* ── Mode → arc color (map legend contract) ────────────────────────────
 * truck emerald · sea cyan · air violet · rail amber — mirrors the chip
 * tones MxTradePanel already renders so map and chips agree. */

export type MxModeKey = "truck" | "sea" | "air" | "rail" | "other";

export function mxModeKey(v: string | null | undefined): MxModeKey {
  const k = String(v ?? "").trim().toLowerCase();
  if (/truck|carreter|autotransporte/.test(k)) return "truck";
  if (/sea|marit|ocean|barco|buque/.test(k)) return "sea";
  if (/air|aere|avion/.test(k)) return "air";
  if (/rail|ferro|tren/.test(k)) return "rail";
  return "other";
}

export const MX_MODE_ARC_COLORS: Record<
  MxModeKey,
  { base: string; selected: string; glow: string; label: string }
> = {
  truck: { base: "#10B981", selected: "#059669", glow: "rgba(16,185,129,0.30)", label: "Truck" },
  sea: { base: "#06B6D4", selected: "#0891B2", glow: "rgba(6,182,212,0.30)", label: "Sea" },
  air: { base: "#8B5CF6", selected: "#7C3AED", glow: "rgba(139,92,246,0.30)", label: "Air" },
  rail: { base: "#F59E0B", selected: "#D97706", glow: "rgba(245,158,11,0.30)", label: "Rail" },
  other: { base: "#64748B", selected: "#475569", glow: "rgba(100,116,139,0.30)", label: "Other" },
};
