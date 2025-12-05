import type { IyCompanyProfile, IyRouteKpis, IyRouteTopRoute } from "@/lib/api";

export type CompanySnapshot = {
  displayName: string;
  companyId: string | null;
  domain: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  countryName: string | null;
  shipments12m: number | null;
  teus12m: number | null;
  estSpend12m: number | null;
  topRouteLabel: string | null;
  recentShipmentDate: string | null;
  keySuppliers: string[];
  aiSummary: string | null;
  tags: string[];
  normalized: Record<string, any> | null;
  timeSeries: Array<{ label: string; fcl: number; lcl: number }>;
  topRoutes: Array<{
    label: string;
    shipments: number | null;
    teu: number | null;
    estSpendUsd: number | null;
  }>;
};

export type CompanySnapshotInput = {
  profile: IyCompanyProfile | null;
  enrichment: any | null;
  fallback?: {
    companyId?: string | null;
    name?: string | null;
    payload?: Record<string, any> | null;
  } | null;
};

const toNumber = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMonthLabel = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}$/u.test(value)) {
    const [year, month] = value.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  return value;
};

const normalizeTopRoutes = (routes: IyRouteTopRoute[] = []): CompanySnapshot["topRoutes"] => {
  return routes.map((route) => {
    const label =
      route.route ||
      (route as any)?.label ||
      [
        (route as any)?.origin,
        (route as any)?.destination,
      ]
        .filter(Boolean)
        .join(" → ") ||
      "Lane";
    return {
      label,
      shipments: toNumber(route.shipments),
      teu: toNumber(route.teu),
      estSpendUsd: toNumber(route.estSpendUsd),
    };
  });
};

export function buildCompanySnapshot({
  profile,
  enrichment,
  fallback,
}: CompanySnapshotInput): CompanySnapshot {
  const normalized =
    (enrichment?.normalized_company as Record<string, any> | undefined) ??
    (fallback?.payload?.normalized_company as Record<string, any> | undefined) ??
    null;
  const logisticsKpis =
    (enrichment?.logistics_kpis as Record<string, any> | undefined) ??
    (fallback?.payload?.logistics_kpis as Record<string, any> | undefined) ??
    null;
  const spendAnalysis =
    (enrichment?.spend_analysis as Record<string, any> | undefined) ??
    (fallback?.payload?.spend_analysis as Record<string, any> | undefined) ??
    null;
  const commandCenter =
    (enrichment?.command_center_enrichment as Record<string, any> | undefined) ??
    (fallback?.payload?.command_center_enrichment as Record<string, any> | undefined) ??
    null;
  const salesAssets = (enrichment?.sales_assets as Record<string, any> | undefined) ?? null;
  const routeKpis: IyRouteKpis | null = profile?.routeKpis ?? null;

  const displayName =
    normalized?.name ??
    profile?.title ??
    profile?.name ??
    fallback?.name ??
    "Company";

  const companyId =
    profile?.companyId ??
    normalized?.company_id ??
    fallback?.companyId ??
    null;

  const shipments12m =
    toNumber(logisticsKpis?.shipments_12m) ??
    toNumber(routeKpis?.shipmentsLast12m) ??
    toNumber(profile?.totalShipments) ??
    toNumber(fallback?.payload?.shipments_12m) ??
    toNumber(fallback?.payload?.shipments12m);

  const teus12m =
    toNumber(logisticsKpis?.teus_12m) ??
    toNumber(routeKpis?.teuLast12m) ??
    toNumber(profile?.containers?.fclShipments12m) ??
    toNumber(fallback?.payload?.teus_12m) ??
    toNumber(fallback?.payload?.teus12m);

  const estSpend12m =
    toNumber(spendAnalysis?.estimated_12m_spend_total) ??
    toNumber(routeKpis?.estSpendUsd12m) ??
    toNumber(profile?.estSpendUsd12m) ??
    toNumber(fallback?.payload?.estimated_12m_spend_total);

  const topRouteLabel =
    (routeKpis?.topRouteLast12m as string | null | undefined) ??
    (routeKpis?.mostRecentRoute as any)?.label ??
    profile?.mostRecentRoute?.label ??
    (fallback?.payload?.top_route_label as string | undefined) ??
    null;

  const recentShipmentDate =
    (routeKpis?.mostRecentRoute as any)?.lastShipmentDate ??
    profile?.lastShipmentDate ??
    (fallback?.payload?.last_shipment_date as string | undefined) ??
    (fallback?.payload?.most_recent_shipment as string | undefined) ??
    null;

  const keySuppliersSource =
    logisticsKpis?.top_suppliers ??
    salesAssets?.top_suppliers ??
    profile?.suppliersSample ??
    profile?.topSuppliers ??
    fallback?.payload?.top_suppliers ??
    [];
  const keySuppliers = Array.isArray(keySuppliersSource)
    ? keySuppliersSource
        .map((entry: any) =>
          typeof entry === "string"
            ? entry
            : entry?.name ?? entry?.supplier_name ?? entry?.company ?? "",
        )
        .filter((value: string) => Boolean(value))
    : [];

  const aiSummary =
    commandCenter?.quick_summary ??
    salesAssets?.pre_call_brief?.summary ??
    null;

  const tags: string[] = Array.isArray(normalized?.tags)
    ? normalized!.tags
    : Array.isArray(fallback?.payload?.tags)
      ? (fallback!.payload!.tags as string[])
      : [];

  const address =
    normalized?.hq_address ??
    profile?.address ??
    (fallback?.payload?.address as string | undefined) ??
    null;

  const countryCode =
    normalized?.country_code ??
    profile?.countryCode ??
    (fallback?.payload?.country_code as string | undefined) ??
    null;

  const countryName =
    normalized?.country ??
    profile?.country ??
    (fallback?.payload?.country as string | undefined) ??
    null;

  const city =
    normalized?.city ??
    profile?.timeSeries?.[0]?.city ??
    (fallback?.payload?.city as string | undefined) ??
    null;

  const state =
    normalized?.state ??
    (fallback?.payload?.state as string | undefined) ??
    null;

  const domain =
    normalized?.domain ??
    profile?.domain ??
    (fallback?.payload?.domain as string | undefined) ??
    null;

  const website =
    normalized?.website ??
    profile?.website ??
    profile?.rawWebsite ??
    (fallback?.payload?.website as string | undefined) ??
    null;

  const rawMonthlySeries: any[] = Array.isArray(routeKpis?.monthlySeries)
    ? (routeKpis!.monthlySeries as any[])
    : Array.isArray(profile?.timeSeries)
      ? (profile!.timeSeries as any[])
      : [];

  const timeSeries = rawMonthlySeries.slice(-12).map((point) => ({
    label: formatMonthLabel(point.monthLabel ?? point.month ?? ""),
    fcl:
      toNumber(point.shipmentsFcl ?? point.fclShipments ?? point.fcl ?? 0) ?? 0,
    lcl:
      toNumber(point.shipmentsLcl ?? point.lclShipments ?? point.lcl ?? 0) ?? 0,
  }));

  const topRoutes = normalizeTopRoutes(
    Array.isArray(routeKpis?.topRoutesLast12m)
      ? routeKpis!.topRoutesLast12m
      : Array.isArray(profile?.topRoutes)
        ? (profile!.topRoutes as IyRouteTopRoute[])
        : [],
  );

  return {
    displayName,
    companyId,
    domain,
    website,
    address,
    city,
    state,
    countryCode,
    countryName,
    shipments12m,
    teus12m,
    estSpend12m,
    topRouteLabel,
    recentShipmentDate,
    keySuppliers,
    aiSummary,
    tags,
    normalized,
    timeSeries,
    topRoutes,
  };
}
