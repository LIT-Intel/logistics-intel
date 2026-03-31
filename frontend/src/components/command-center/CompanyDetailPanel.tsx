import React, { useMemo } from "react";
import {
  Boxes,
  CalendarClock,
  DollarSign,
  Globe,
  Layers,
  Package,
  Phone,
  Ship,
  TrendingUp,
  Users,
  BarChart3,
  MapPin,
  Truck,
  Factory,
  Table2,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type { IyCompanyProfile, IyRouteKpis } from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompanyActivityChart from "./CompanyActivityChart";
import CommandCenterInsights from "./CommandCenterInsights";
import CommandCenterEmptyState from "./CommandCenterEmptyState";

type CompanyDetailPanelProps = {
  record: CommandCenterRecord | null;
  profile: IyCompanyProfile | null;
  routeKpis: IyRouteKpis | null;
  loading: boolean;
  error: string | null;
};

type ActivityPoint = {
  period: string;
  fcl: number;
  lcl: number;
};

type TableRow = Record<string, React.ReactNode>;

const formatNumber = (value: number | null | undefined, digits = 0) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const normalizeText = (value?: string | null) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/Ã¢â‚¬â€œ|â†’|â†|Ã†/g, " → ")
    .replace(/Ã/g, "")
    .trim();

const buildRouteLabel = (value?: string | null) => {
  const cleaned = normalizeText(value);
  return cleaned || "—";
};

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const monthKey = (value?: string | null) => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return String(value).slice(0, 7) || "Unknown";
};

const deriveRouteFromShipment = (shipment?: any) => {
  if (!shipment) return null;
  const origin =
    shipment.origin_port ||
    shipment.origin ||
    shipment.loading_port ||
    shipment.place_of_receipt ||
    shipment.origin_location ||
    null;
  const destination =
    shipment.destination_port ||
    shipment.destination ||
    shipment.discharge_port ||
    shipment.place_of_delivery ||
    shipment.destination_location ||
    null;

  if (!origin && !destination) return null;
  if (origin && destination) return `${normalizeText(origin)} → ${normalizeText(destination)}`;
  return normalizeText(origin || destination);
};

const buildActivitySeries = (
  kpis?: IyRouteKpis | null,
  profile?: IyCompanyProfile | null,
): ActivityPoint[] => {
  if (kpis?.monthlySeries?.length) {
    return kpis.monthlySeries.slice(-12).map((point) => ({
      period: point.monthLabel,
      fcl: Math.max(point.shipmentsFcl ?? 0, 0),
      lcl: Math.max(point.shipmentsLcl ?? 0, 0),
    }));
  }
  if (profile?.timeSeries?.length) {
    return profile.timeSeries.slice(-12).map((point) => ({
      period: point.monthLabel,
      fcl: Math.max(point.fclShipments ?? 0, 0),
      lcl: Math.max(point.lclShipments ?? 0, 0),
    }));
  }
  return [];
};

const findLoadValue = (profile?: IyCompanyProfile | null, type?: "FCL" | "LCL") => {
  if (!profile?.containersLoad) return null;
  const entry = profile.containersLoad.find(
    (item) => item.load_type?.toUpperCase() === type,
  );
  return entry?.shipments ?? null;
};

const getRecordKey = (record: CommandCenterRecord | null) =>
  record?.company?.company_id ?? record?.company?.name ?? null;

const groupTop = <T extends string>(
  values: T[],
  top = 8,
): Array<{ label: string; count: number }> => {
  const map = new Map<string, number>();
  values.forEach((value) => {
    const label = normalizeText(value);
    if (!label) return;
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
};

const aggregateCarrierRows = (recentBols: any[]) => {
  const map = new Map<string, { shipments: number; teu: number }>();
  recentBols.forEach((bol) => {
    const carrier = normalizeText(
      bol.carrier || bol.shipping_line || bol.carrier_name || bol.vessel_operator,
    );
    if (!carrier) return;
    const current = map.get(carrier) || { shipments: 0, teu: 0 };
    current.shipments += 1;
    current.teu += toNumber(bol.teu || bol.TEU || bol.container_teu);
    map.set(carrier, current);
  });

  return [...map.entries()]
    .map(([carrier, stats]) => ({
      carrier,
      shipments: stats.shipments,
      teu: stats.teu,
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 10);
};

const aggregatePivotRows = (recentBols: any[]) => {
  const months = new Map<string, { shipments: number; teu: number }>();
  recentBols.forEach((bol) => {
    const month = monthKey(
      bol.bill_of_lading_date ||
        bol.bill_of_lading_date_formatted ||
        bol.date ||
        bol.arrival_date,
    );
    const current = months.get(month) || { shipments: 0, teu: 0 };
    current.shipments += 1;
    current.teu += toNumber(bol.teu || bol.TEU || bol.container_teu);
    months.set(month, current);
  });

  return [...months.entries()]
    .map(([month, stats]) => ({
      month,
      shipments: stats.shipments,
      teu: stats.teu,
    }))
    .slice(-12);
};

const InfoChip = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}) => (
  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    <span className="truncate">{label}</span>
  </span>
);

const KpiCard = ({
  label,
  value,
  icon: Icon,
  subLabel,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  subLabel?: string;
}) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
      <Icon className="h-3.5 w-3.5 text-indigo-500" />
      <span>{label}</span>
    </div>
    <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
    {subLabel ? <div className="mt-1 text-xs text-slate-500">{subLabel}</div> : null}
  </div>
);

const MetricList = ({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: React.ReactNode; meta?: React.ReactNode }>;
}) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
      {title}
    </div>
    <div className="space-y-3">
      {items.length ? (
        items.map((item) => (
          <div
            key={String(item.label)}
            className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{item.label}</div>
              {item.meta ? <div className="mt-1 text-xs text-slate-500">{item.meta}</div> : null}
            </div>
            <div className="shrink-0 text-sm font-semibold text-indigo-600">{item.value}</div>
          </div>
        ))
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          No data available yet.
        </div>
      )}
    </div>
  </div>
);

const DataTable = ({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: TableRow[];
}) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
        {title}
      </div>
      <div className="text-xs text-slate-400">{rows.length} rows</div>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
            {columns.map((column) => (
              <th key={column} className="px-3 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-50 last:border-b-0">
                {columns.map((column) => (
                  <td key={column} className="px-3 py-3 align-top text-slate-700">
                    {row[column] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-sm text-slate-500"
              >
                No data available yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const AiRail = ({
  insights,
  shipments12m,
  teu12m,
  topRouteLabel,
}: {
  insights: Array<{ title: string; body: string; tone?: "default" | "warning" | "highlight" }>;
  shipments12m: number | null;
  teu12m: number | null;
  topRouteLabel: string;
}) => {
  const aiCards = [
    {
      title: "Growth alert",
      body:
        shipments12m && teu12m
          ? `Volume profile shows ${formatNumber(shipments12m)} shipments and ${formatNumber(
              teu12m,
              1,
            )} TEUs in scope. Good candidate for mode optimization and seasonal rate capture.`
          : "Waiting for richer shipment history to surface growth signals.",
    },
    {
      title: "Sourcing risk",
      body:
        topRouteLabel && topRouteLabel !== "—"
          ? `Primary lane is ${topRouteLabel}. Validate backup carrier and alternate origin routing before quoting.`
          : "Route mix not fully available yet. Lane concentration risk will appear here.",
    },
    {
      title: "Strategic recommendation",
      body:
        insights[0]?.body ||
        "Use the account brief to frame DSV value around capacity planning, lane resiliency, and shipment visibility.",
    },
  ];

  return (
    <aside className="space-y-4">
      <div className="rounded-[28px] border border-slate-800 bg-slate-950 p-5 text-white shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-300">
            AI Intelligence
          </div>
          <Sparkles className="h-4 w-4 text-indigo-300" />
        </div>

        <div className="space-y-4">
          {aiCards.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                {card.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-100">{card.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
          Quick actions
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Consult
          </button>
          <button className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Save
          </button>
        </div>
      </div>
    </aside>
  );
};

export default function CompanyDetailPanel({
  record,
  profile,
  routeKpis,
  loading,
  error,
}: CompanyDetailPanelProps) {
  const key = getRecordKey(record);
  const rawProfile = profile as any;
  const rawRouteKpis = routeKpis as any;

  const activitySeries = useMemo(
    () => buildActivitySeries(routeKpis, profile),
    [routeKpis, profile],
  );

  const recentBols = useMemo(() => {
    const items =
      rawProfile?.recentBols ||
      rawProfile?.recent_bols ||
      rawProfile?.bols ||
      rawProfile?.shipments ||
      [];
    return Array.isArray(items) ? items : [];
  }, [rawProfile]);

  const shipments12m =
    routeKpis?.shipmentsLast12m ??
    rawProfile?.shipmentsLast12m ??
    rawProfile?.shipments_last_12m ??
    profile?.totalShipments ??
    record?.company?.kpis?.shipments_12m ??
    null;

  const teu12m =
    routeKpis?.teuLast12m ??
    rawProfile?.teuLast12m ??
    rawProfile?.teu_last_12m ??
    rawProfile?.avgTeuPerMonth ??
    null;

  const estSpend =
    rawRouteKpis?.estSpendUsd12m ??
    rawRouteKpis?.estSpendUsd ??
    rawProfile?.estSpendUsd12m ??
    rawProfile?.marketSpend ??
    rawProfile?.est_spend ??
    null;

  const fclShipments =
    findLoadValue(profile, "FCL") ??
    rawProfile?.containers?.fclShipments12m ??
    rawProfile?.containers?.fcl ??
    rawProfile?.fcl_shipments_12m ??
    null;

  const lclShipments =
    findLoadValue(profile, "LCL") ??
    rawProfile?.containers?.lclShipments12m ??
    rawProfile?.containers?.lcl ??
    rawProfile?.lcl_shipments_12m ??
    null;

  const recentShipmentDate =
    profile?.lastShipmentDate ??
    rawProfile?.last_shipment_date ??
    record?.company?.kpis?.last_activity ??
    recentBols?.[0]?.bill_of_lading_date ??
    recentBols?.[0]?.date ??
    null;

  const topRouteLabel =
    routeKpis?.topRouteLast12m ||
    rawProfile?.topRoutes?.[0]?.label ||
    rawRouteKpis?.topRoutesLast12m?.[0]?.route ||
    deriveRouteFromShipment(recentBols?.[0]) ||
    null;

  const recentRouteLabel =
    routeKpis?.mostRecentRoute ||
    rawProfile?.mostRecentRoute?.label ||
    deriveRouteFromShipment(recentBols?.[0]) ||
    null;

  const avgTeuPerShipment = shipments12m && teu12m ? Number(teu12m) / Number(shipments12m) : null;
  const avgTeuPerMonth = shipments12m ? Number(shipments12m) / 12 : null;
  const fclRatio =
    fclShipments != null && lclShipments != null && Number(fclShipments) + Number(lclShipments) > 0
      ? (Number(fclShipments) / (Number(fclShipments) + Number(lclShipments))) * 100
      : null;

  const topRoutes = useMemo(() => {
    const fromRouteKpis = rawRouteKpis?.topRoutesLast12m;
    if (Array.isArray(fromRouteKpis) && fromRouteKpis.length) {
      return fromRouteKpis.slice(0, 8).map((route: any) => ({
        lane: buildRouteLabel(route.route),
        shipments: formatNumber(route.shipments),
        teu: formatNumber(route.teu, 1),
        spend: formatCurrency(route.estSpendUsd || route.estSpendUsd12m),
      }));
    }
    const fromProfile = rawProfile?.topRoutes;
    if (Array.isArray(fromProfile) && fromProfile.length) {
      return fromProfile.slice(0, 8).map((route: any) => ({
        lane: buildRouteLabel(route.label || route.route),
        shipments: formatNumber(route.shipments),
        teu: formatNumber(route.teu, 1),
        spend: formatCurrency(route.estSpendUsd),
      }));
    }
    return [];
  }, [rawProfile, rawRouteKpis]);

  const carrierRows = useMemo(() => aggregateCarrierRows(recentBols), [recentBols]);

  const locationRows = useMemo(() => {
    const origins = recentBols.map(
      (bol) =>
        bol.origin_port ||
        bol.origin ||
        bol.loading_port ||
        bol.place_of_receipt ||
        bol.origin_location,
    );
    const destinations = recentBols.map(
      (bol) =>
        bol.destination_port ||
        bol.destination ||
        bol.discharge_port ||
        bol.place_of_delivery ||
        bol.destination_location,
    );

    return {
      origins: groupTop(origins as string[]),
      destinations: groupTop(destinations as string[]),
    };
  }, [recentBols]);

  const hsRows = useMemo(() => {
    const map = new Map<string, { description: string; count: number }>();
    recentBols.forEach((bol) => {
      const hsCode = normalizeText(
        bol.HS_Code || bol.hsCode || bol.hs_code || bol.product_hs_code,
      );
      const description = normalizeText(
        bol.Product_Description ||
          bol.product_description ||
          bol.description ||
          bol.product_name,
      );
      if (!hsCode && !description) return;
      const keyValue = hsCode || description;
      const current = map.get(keyValue) || { description, count: 0 };
      current.count += 1;
      if (!current.description && description) current.description = description;
      map.set(keyValue, current);
    });

    return [...map.entries()]
      .map(([hsCode, stats]) => ({
        hsCode,
        description: stats.description || "—",
        count: stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [recentBols]);

  const productRows = useMemo(() => {
    return hsRows.map((row) => ({
      product: row.description,
      hsCode: row.hsCode,
      volumeShare: `${row.count}`,
    }));
  }, [hsRows]);

  const shipmentTableRows = useMemo<TableRow[]>(() => {
    return recentBols.slice(0, 20).map((bol) => ({
      Date: formatDate(
        bol.bill_of_lading_date ||
          bol.bill_of_lading_date_formatted ||
          bol.date ||
          bol.arrival_date,
      ),
      "BOL ID": bol.bill_of_lading || bol.bol_id || bol.id || "—",
      TEU: formatNumber(bol.teu || bol.TEU || bol.container_teu, 1),
      Carrier:
        normalizeText(
          bol.carrier || bol.shipping_line || bol.carrier_name || bol.vessel_operator,
        ) || "—",
      Route: buildRouteLabel(deriveRouteFromShipment(bol)),
      Product: normalizeText(
        bol.Product_Description || bol.product_description || bol.product_name,
      ) || "—",
      "HS Code":
        normalizeText(bol.HS_Code || bol.hsCode || bol.hs_code || bol.product_hs_code) || "—",
    }));
  }, [recentBols]);

  const pivotRows = useMemo<TableRow[]>(() => {
    return aggregatePivotRows(recentBols).map((row) => ({
      Month: row.month,
      Shipments: formatNumber(row.shipments),
      TEU: formatNumber(row.teu, 1),
    }));
  }, [recentBols]);

  const strategicInsights = [
    topRouteLabel
      ? {
          title: "Opportunities",
          body: `Top lane ${topRouteLabel} has ${
            rawRouteKpis?.topRoutesLast12m?.[0]?.shipments
              ? formatNumber(rawRouteKpis.topRoutesLast12m[0].shipments)
              : "meaningful"
          } shipments in scope. Position DSV around lane resilience and procurement leverage.`,
        }
      : null,
    recentRouteLabel
      ? {
          title: "Risks",
          tone: "warning" as const,
          body: `Recent movement on ${recentRouteLabel} should be validated against carrier performance and transit consistency.`,
        }
      : null,
    shipments12m
      ? {
          title: "Pre-call notes",
          tone: "highlight" as const,
          body: `Anchor the conversation around ${formatNumber(
            shipments12m,
          )} shipments and visible lane concentration to frame cost, service, and control.`,
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    body: string;
    tone?: "default" | "warning" | "highlight";
  }>;

  if (!key) {
    return <CommandCenterEmptyState />;
  }

  return (
    <section className="rounded-[32px] border border-slate-200 bg-slate-50 p-4 shadow-sm md:p-6">
      {loading ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          Loading company profile…
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CompanyAvatar
              name={profile?.title || record?.company?.name || "Company"}
              logoUrl={
                getCompanyLogoUrl(profile?.domain || (record as any)?.company?.domain) ?? undefined
              }
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  {profile?.title || record?.company?.name || "Company"}
                </h2>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  Priority
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <InfoChip
                  icon={MapPin}
                  label={profile?.address || record?.company?.address || "Address unavailable"}
                />
                {(profile?.website || (record as any)?.company?.website) && (
                  <InfoChip
                    icon={Globe}
                    label={(profile?.website || (record as any)?.company?.website || "").replace(
                      /^https?:\/\//,
                      "",
                    )}
                  />
                )}
                {(profile?.phoneNumber || (record as any)?.company?.phone) && (
                  <InfoChip icon={Phone} label={profile?.phoneNumber || (record as any)?.company?.phone} />
                )}
                {profile?.countryCode ? (
                  <InfoChip icon={Globe} label={profile.countryCode} />
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Export PDF
            </button>
            <button className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900">
              Generate brief
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Market spend"
                value={formatCurrency(estSpend)}
                icon={DollarSign}
                subLabel="12-month estimate"
              />
              <KpiCard
                label="Total TEUs"
                value={formatNumber(teu12m, 1)}
                icon={Ship}
                subLabel="Volume profile"
              />
              <KpiCard
                label="Shipments"
                value={formatNumber(shipments12m)}
                icon={Package}
                subLabel="12 months"
              />
              <KpiCard
                label="FCL ratio"
                value={fclRatio != null ? `${formatNumber(fclRatio, 0)}%` : "—"}
                icon={Layers}
                subLabel="Load type mix"
              />
            </div>

            <Tabs defaultValue="strategic" className="space-y-5">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-[26px] border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-5">
                <TabsTrigger value="strategic" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Strategic Hub
                </TabsTrigger>
                <TabsTrigger value="flow" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Logistics Flow
                </TabsTrigger>
                <TabsTrigger value="history" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Shipment History
                </TabsTrigger>
                <TabsTrigger value="contacts" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Contact Intelligence
                </TabsTrigger>
                <TabsTrigger value="product" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  HS & Product
                </TabsTrigger>
              </TabsList>

              <TabsContent value="strategic" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                        Peak seasonality index
                      </div>
                      <p className="mb-4 text-xs text-slate-500">
                        Monthly shipment profile derived from FCL and LCL activity.
                      </p>
                      <CompanyActivityChart data={activitySeries} />
                      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <span className="font-semibold text-indigo-600">Observation:</span>{" "}
                        Peak demand cycles can be used to position early booking, consolidation strategy,
                        and carrier allocation planning.
                      </div>
                    </div>

                    <CommandCenterInsights insights={strategicInsights} />
                  </div>

                  <AiRail
                    insights={strategicInsights}
                    shipments12m={shipments12m}
                    teu12m={teu12m}
                    topRouteLabel={buildRouteLabel(topRouteLabel)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="flow" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <MetricList
                      title="Trade lanes"
                      items={topRoutes.map((route) => ({
                        label: String(route.lane),
                        value: route.shipments,
                        meta: `TEU ${route.teu} • Spend ${route.spend}`,
                      }))}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <MetricList
                        title="Carriers"
                        items={carrierRows.map((carrier) => ({
                          label: carrier.carrier,
                          value: formatNumber(carrier.shipments),
                          meta: `TEU ${formatNumber(carrier.teu, 1)}`,
                        }))}
                      />

                      <MetricList
                        title="Locations"
                        items={[
                          ...locationRows.origins.map((item) => ({
                            label: item.label,
                            value: formatNumber(item.count),
                            meta: "Origin",
                          })),
                          ...locationRows.destinations.map((item) => ({
                            label: item.label,
                            value: formatNumber(item.count),
                            meta: "Destination",
                          })),
                        ].slice(0, 10)}
                      />
                    </div>

                    <DataTable
                      title="Monthly pivot"
                      columns={["Month", "Shipments", "TEU"]}
                      rows={pivotRows}
                    />
                  </div>

                  <AiRail
                    insights={strategicInsights}
                    shipments12m={shipments12m}
                    teu12m={teu12m}
                    topRouteLabel={buildRouteLabel(topRouteLabel)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <DataTable
                    title="Verified shipment ledger"
                    columns={["Date", "BOL ID", "TEU", "Carrier", "Route", "Product", "HS Code"]}
                    rows={shipmentTableRows}
                  />
                  <AiRail
                    insights={strategicInsights}
                    shipments12m={shipments12m}
                    teu12m={teu12m}
                    topRouteLabel={buildRouteLabel(topRouteLabel)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="contacts" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                          Contact intelligence
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Contact enrichment block ready for AI and third-party enrichment.
                        </p>
                      </div>
                      <button className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">
                        Sync to CRM
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {(
                        (rawProfile?.notifyParties ||
                          rawProfile?.notify_parties ||
                          rawProfile?.topSuppliers ||
                          rawProfile?.top_suppliers ||
                          []) as any[]
                      )
                        .slice(0, 6)
                        .map((contact: any, index: number) => {
                          const name = normalizeText(
                            contact.name || contact.notify_party || contact.company || contact,
                          );
                          const email = normalizeText(contact.email || contact.email_address);
                          const phone = normalizeText(contact.phone || contact.phone_number);
                          const role = normalizeText(contact.role || "Decision maker");
                          return (
                            <div
                              key={`${name}-${index}`}
                              className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="rounded-2xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                                  {name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((part: string) => part[0])
                                    .join("")
                                    .toUpperCase() || "CT"}
                                </div>
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                  Verified
                                </span>
                              </div>
                              <div className="text-lg font-semibold text-slate-950">{name || "Unknown contact"}</div>
                              <div className="mt-1 text-sm font-medium text-indigo-600">{role}</div>
                              <div className="mt-4 space-y-2 text-sm text-slate-600">
                                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                                  {email || "Email unavailable"}
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                                  {phone || "Phone unavailable"}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      {!(
                        (rawProfile?.notifyParties ||
                          rawProfile?.notify_parties ||
                          rawProfile?.topSuppliers ||
                          rawProfile?.top_suppliers ||
                          []) as any[]
                      ).length ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 md:col-span-2">
                          AI enrichment can populate verified logistics contacts here later.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <AiRail
                    insights={strategicInsights}
                    shipments12m={shipments12m}
                    teu12m={teu12m}
                    topRouteLabel={buildRouteLabel(topRouteLabel)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="product" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <MetricList
                      title="Product mix (HS codes)"
                      items={hsRows.map((row) => ({
                        label: row.hsCode,
                        value: formatNumber(row.count),
                        meta: row.description,
                      }))}
                    />
                    <MetricList
                      title="Top products"
                      items={productRows.map((row) => ({
                        label: String(row.product),
                        value: row.volumeShare,
                        meta: `HS ${row.hsCode}`,
                      }))}
                    />
                  </div>

                  <AiRail
                    insights={strategicInsights}
                    shipments12m={shipments12m}
                    teu12m={teu12m}
                    topRouteLabel={buildRouteLabel(topRouteLabel)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4 xl:hidden">
            <AiRail
              insights={strategicInsights}
              shipments12m={shipments12m}
              teu12m={teu12m}
              topRouteLabel={buildRouteLabel(topRouteLabel)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
