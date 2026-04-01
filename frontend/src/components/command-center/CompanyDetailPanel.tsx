import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  DollarSign,
  Globe,
  Layers,
  MapPin,
  Package,
  Phone,
  Ship,
  Sparkles,
  Table2,
  TrendingUp,
  Truck,
  Users,
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

type InsightTone = "default" | "warning" | "highlight";

type InsightCard = {
  title: string;
  body: string;
  tone?: InsightTone;
};

type NormalizedShipment = {
  source: any;
  raw: any;
  date: string | null;
  parsedDate: Date | null;
  year: number | null;
  month: number | null;
  monthLabel: string;
  teu: number;
  loadType: "FCL" | "LCL" | null;
  carrier: string;
  route: string;
  origin: string;
  destination: string;
  product: string;
  hsCode: string;
  bolId: string;
  spend: number | null;
};

type RouteSummary = {
  lane: string;
  shipments: number;
  teu: number;
  spend: number | null;
};

type CarrierSummary = {
  carrier: string;
  shipments: number;
  teu: number;
};

type LocationSummary = {
  label: string;
  count: number;
};

type HsSummary = {
  hsCode: string;
  description: string;
  count: number;
};

type ProductSummary = {
  product: string;
  hsCode: string;
  count: number;
};

type PivotSummary = {
  monthIndex: number;
  month: string;
  shipments: number;
  teu: number;
  spend: number | null;
};

type DetailModel = {
  years: number[];
  selectedYear: number | null;
  shipments: NormalizedShipment[];
  activitySeries: ActivityPoint[];
  marketSpend: number | null;
  shipmentsCount: number | null;
  teuCount: number | null;
  fclShipments: number | null;
  lclShipments: number | null;
  fclRatio: number | null;
  avgTeuPerShipment: number | null;
  avgShipmentsPerMonth: number | null;
  oldestShipmentDate: string | null;
  latestShipmentDate: string | null;
  topRoutes: RouteSummary[];
  carrierRows: CarrierSummary[];
  locationRows: { origins: LocationSummary[]; destinations: LocationSummary[] };
  hsRows: HsSummary[];
  productRows: ProductSummary[];
  shipmentTableRows: TableRow[];
  pivotRows: TableRow[];
  topRouteLabel: string;
  recentRouteLabel: string;
  statusBadge: string;
  strategicInsights: InsightCard[];
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

const getRecordKey = (record: CommandCenterRecord | null) =>
  record?.company?.company_id ?? record?.company?.name ?? null;

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const compact = String(value).trim();
  const ym = compact.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const parsed = new Date(Number(ym[1]), Number(ym[2]) - 1, 1);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const monYear = compact.match(/^([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (monYear) {
    const year = monYear[2].length === 2 ? 2000 + Number(monYear[2]) : Number(monYear[2]);
    const parsed = new Date(`${monYear[1]} 1, ${year}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const getShipmentDateValue = (shipment: any, raw?: any) =>
  shipment?.bill_of_lading_date ||
  shipment?.bill_of_lading_date_formatted ||
  shipment?.date ||
  shipment?.arrival_date ||
  raw?.bill_of_lading_date ||
  raw?.bill_of_lading_date_formatted ||
  raw?.date ||
  raw?.arrival_date ||
  null;

const deriveRouteFromShipment = (shipment?: any, raw?: any) => {
  const source = shipment || {};
  const rawSource = raw || source?.raw || {};

  const origin =
    source.origin_port ||
    source.origin ||
    source.loading_port ||
    source.place_of_receipt ||
    source.origin_location ||
    rawSource.origin_port ||
    rawSource.origin ||
    rawSource.loading_port ||
    rawSource.place_of_receipt ||
    rawSource.origin_location ||
    null;

  const destination =
    source.destination_port ||
    source.destination ||
    source.discharge_port ||
    source.place_of_delivery ||
    source.destination_location ||
    rawSource.destination_port ||
    rawSource.destination ||
    rawSource.discharge_port ||
    rawSource.place_of_delivery ||
    rawSource.destination_location ||
    null;

  if (!origin && !destination) return null;
  if (origin && destination) return `${normalizeText(origin)} → ${normalizeText(destination)}`;
  return normalizeText(origin || destination);
};

const detectLoadType = (shipment: any, raw?: any): "FCL" | "LCL" | null => {
  const source = shipment || {};
  const rawSource = raw || source?.raw || {};
  const candidates = [
    source.load_type,
    source.loadType,
    source.container_type,
    source.mode,
    rawSource.load_type,
    rawSource.loadType,
    rawSource.container_type,
    rawSource.mode,
  ]
    .map((value) => normalizeText(String(value || "")).toUpperCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("FCL") || candidate.includes("FULL")) return "FCL";
    if (candidate.includes("LCL") || candidate.includes("LESS")) return "LCL";
  }

  return null;
};

const getShipmentSpend = (shipment: any, raw?: any): number | null => {
  const source = shipment || {};
  const rawSource = raw || source?.raw || {};
  const direct = [
    source.estSpendUsd,
    source.est_spend_usd,
    source.market_spend,
    source.spend,
    rawSource.estSpendUsd,
    rawSource.est_spend_usd,
    rawSource.market_spend,
    rawSource.spend,
  ]
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0);

  if (direct != null) return direct;

  const teu = toNumber(
    source.teu ||
      source.TEU ||
      source.container_teu ||
      rawSource.teu ||
      rawSource.TEU ||
      rawSource.container_teu,
  );

  return teu > 0 ? teu * 1800 : null;
};

const getSeriesDate = (point: any): Date | null => {
  return (
    parseDate(point?.monthStart) ||
    parseDate(point?.month_start) ||
    parseDate(point?.period) ||
    parseDate(point?.month) ||
    parseDate(point?.monthLabel) ||
    parseDate(point?.label) ||
    (Number.isFinite(Number(point?.year)) && Number.isFinite(Number(point?.monthIndex))
      ? new Date(Number(point.year), Number(point.monthIndex), 1)
      : null) ||
    (Number.isFinite(Number(point?.year)) && Number.isFinite(Number(point?.month))
      ? new Date(Number(point.year), Math.max(Number(point.month) - 1, 0), 1)
      : null)
  );
};

const normalizeShipments = (shipments: any[]): NormalizedShipment[] => {
  return shipments
    .map((shipment) => {
      const raw = shipment?.raw || shipment;
      const dateValue = getShipmentDateValue(shipment, raw);
      const parsedDate = parseDate(dateValue);
      const route = buildRouteLabel(deriveRouteFromShipment(shipment, raw));
      const origin = normalizeText(
        shipment?.origin_port ||
          shipment?.origin ||
          shipment?.loading_port ||
          shipment?.place_of_receipt ||
          shipment?.origin_location ||
          raw?.origin_port ||
          raw?.origin ||
          raw?.loading_port ||
          raw?.place_of_receipt ||
          raw?.origin_location,
      );
      const destination = normalizeText(
        shipment?.destination_port ||
          shipment?.destination ||
          shipment?.discharge_port ||
          shipment?.place_of_delivery ||
          shipment?.destination_location ||
          raw?.destination_port ||
          raw?.destination ||
          raw?.discharge_port ||
          raw?.place_of_delivery ||
          raw?.destination_location,
      );
      const product = normalizeText(
        shipment?.Product_Description ||
          shipment?.product_description ||
          shipment?.description ||
          shipment?.product_name ||
          raw?.Product_Description ||
          raw?.product_description ||
          raw?.description ||
          raw?.product_name,
      );
      const hsCode = normalizeText(
        shipment?.HS_Code ||
          shipment?.hsCode ||
          shipment?.hs_code ||
          shipment?.product_hs_code ||
          raw?.HS_Code ||
          raw?.hsCode ||
          raw?.hs_code ||
          raw?.product_hs_code,
      );
      const carrier = normalizeText(
        shipment?.carrier ||
          shipment?.shipping_line ||
          shipment?.carrier_name ||
          shipment?.vessel_operator ||
          raw?.carrier ||
          raw?.shipping_line ||
          raw?.carrier_name ||
          raw?.vessel_operator,
      );
      const bolId =
        normalizeText(
          shipment?.bill_of_lading ||
            shipment?.bol_id ||
            shipment?.id ||
            raw?.bill_of_lading ||
            raw?.bol_id ||
            raw?.id,
        ) || "—";
      const teu = toNumber(
        shipment?.teu ||
          shipment?.TEU ||
          shipment?.container_teu ||
          raw?.teu ||
          raw?.TEU ||
          raw?.container_teu,
      );

      return {
        source: shipment,
        raw,
        date: dateValue,
        parsedDate,
        year: parsedDate ? parsedDate.getFullYear() : null,
        month: parsedDate ? parsedDate.getMonth() : null,
        monthLabel:
          parsedDate != null
            ? parsedDate.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
            : "Unknown",
        teu,
        loadType: detectLoadType(shipment, raw),
        carrier: carrier || "—",
        route,
        origin: origin || "—",
        destination: destination || "—",
        product: product || "—",
        hsCode: hsCode || "—",
        bolId,
        spend: getShipmentSpend(shipment, raw),
      };
    })
    .sort((a, b) => {
      const aTime = a.parsedDate?.getTime() ?? 0;
      const bTime = b.parsedDate?.getTime() ?? 0;
      return bTime - aTime;
    });
};

const sumSpendFromSeries = (timeSeries: any[], selectedYear: number | null): number | null => {
  if (!selectedYear || !timeSeries.length) return null;

  const values = timeSeries
    .filter((point) => getSeriesDate(point)?.getFullYear() === selectedYear)
    .map((point) =>
      [
        point.estSpendUsd,
        point.est_spend_usd,
        point.marketSpend,
        point.market_spend,
        point.spend,
      ]
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value >= 0),
    )
    .filter((value): value is number => typeof value === "number");

  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};

const groupTop = (values: string[], top = 8): LocationSummary[] => {
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

const aggregateRoutes = (shipments: NormalizedShipment[], fallbackRoutes: any[] = []): RouteSummary[] => {
  if (shipments.length) {
    const map = new Map<string, { shipments: number; teu: number; spend: number }>();
    shipments.forEach((shipment) => {
      const lane = buildRouteLabel(shipment.route);
      if (!lane || lane === "—") return;
      const current = map.get(lane) || { shipments: 0, teu: 0, spend: 0 };
      current.shipments += 1;
      current.teu += shipment.teu;
      current.spend += shipment.spend || 0;
      map.set(lane, current);
    });

    return [...map.entries()]
      .map(([lane, stats]) => ({
        lane,
        shipments: stats.shipments,
        teu: stats.teu,
        spend: stats.spend > 0 ? stats.spend : null,
      }))
      .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu)
      .slice(0, 10);
  }

  return fallbackRoutes
    .map((route) => ({
      lane: buildRouteLabel(route?.route || route?.label),
      shipments: toNumber(route?.shipments),
      teu: toNumber(route?.teu),
      spend: toNumber(route?.estSpendUsd || route?.estSpendUsd12m) || null,
    }))
    .filter((route) => route.lane !== "—")
    .slice(0, 10);
};

const aggregateCarriers = (shipments: NormalizedShipment[]): CarrierSummary[] => {
  const map = new Map<string, { shipments: number; teu: number }>();
  shipments.forEach((shipment) => {
    if (!shipment.carrier || shipment.carrier === "—") return;
    const current = map.get(shipment.carrier) || { shipments: 0, teu: 0 };
    current.shipments += 1;
    current.teu += shipment.teu;
    map.set(shipment.carrier, current);
  });

  return [...map.entries()]
    .map(([carrier, stats]) => ({ carrier, shipments: stats.shipments, teu: stats.teu }))
    .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu)
    .slice(0, 10);
};

const aggregateHsRows = (shipments: NormalizedShipment[]): HsSummary[] => {
  const map = new Map<string, { description: string; count: number }>();
  shipments.forEach((shipment) => {
    const key = shipment.hsCode !== "—" ? shipment.hsCode : shipment.product;
    if (!key || key === "—") return;
    const current = map.get(key) || { description: shipment.product, count: 0 };
    current.count += 1;
    if ((!current.description || current.description === "—") && shipment.product !== "—") {
      current.description = shipment.product;
    }
    map.set(key, current);
  });

  return [...map.entries()]
    .map(([hsCode, stats]) => ({ hsCode, description: stats.description || "—", count: stats.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
};

const deriveStatusBadge = (shipments: NormalizedShipment[], latestShipmentDate: string | null) => {
  const latestDate = parseDate(latestShipmentDate);
  if (!shipments.length) return "Inactive";
  if (shipments.length >= 40) return "High volume shipper";
  if (latestDate) {
    const diffDays = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 180) return "Inactive";
  }

  const monthsWithActivity = new Set(shipments.map((shipment) => shipment.month).filter((value): value is number => value != null));
  if (monthsWithActivity.size <= 4 && shipments.length >= 6) return "Seasonal";
  return "Active";
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
    <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">{title}</div>
    <div className="space-y-3">
      {items.length ? (
        items.map((item) => (
          <div
            key={`${String(item.label)}-${String(item.meta || "")}`}
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
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">{title}</div>
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
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-500">
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
  insights: InsightCard[];
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
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-300">AI Intelligence</div>
          <Sparkles className="h-4 w-4 text-indigo-300" />
        </div>

        <div className="space-y-4">
          {aiCards.map((card) => (
            <div key={card.title} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">{card.title}</div>
              <p className="mt-2 text-sm leading-6 text-slate-100">{card.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Quick actions</div>
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
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const recentBols = useMemo(() => {
    const items =
      rawProfile?.recentBols ||
      rawProfile?.recent_bols ||
      rawProfile?.bols ||
      rawProfile?.shipments ||
      [];
    return Array.isArray(items) ? items : [];
  }, [rawProfile]);

  const normalizedShipments = useMemo(() => normalizeShipments(recentBols), [recentBols]);

  const detail = useMemo<DetailModel>(() => {
    const profileTimeSeries = Array.isArray(profile?.timeSeries)
      ? profile.timeSeries
      : Array.isArray(rawProfile?.timeSeries)
        ? rawProfile.timeSeries
        : [];
    const kpiMonthlySeries = Array.isArray(routeKpis?.monthlySeries)
      ? routeKpis.monthlySeries
      : Array.isArray(rawRouteKpis?.monthlySeries)
        ? rawRouteKpis.monthlySeries
        : [];
    const timeSeries = kpiMonthlySeries.length ? kpiMonthlySeries : profileTimeSeries;

    const yearSet = new Set<number>();
    normalizedShipments.forEach((shipment) => {
      if (shipment.year != null) yearSet.add(shipment.year);
    });
    timeSeries.forEach((point: any) => {
      const date = getSeriesDate(point);
      if (date) yearSet.add(date.getFullYear());
    });

    if (!yearSet.size) {
      const lastShipment = parseDate(
        profile?.lastShipmentDate || rawProfile?.last_shipment_date || record?.company?.kpis?.last_activity || null,
      );
      if (lastShipment) yearSet.add(lastShipment.getFullYear());
    }

    const years = [...yearSet].sort((a, b) => b - a);
    const effectiveYear = selectedYear && years.includes(selectedYear) ? selectedYear : years[0] ?? null;

    const shipments = effectiveYear != null
      ? normalizedShipments.filter((shipment) => shipment.year === effectiveYear)
      : normalizedShipments;

    const monthlyFromShipments = MONTH_LABELS.map((label, index) => ({
      period: label,
      fcl: 0,
      lcl: 0,
      shipments: 0,
      teu: 0,
      spend: 0,
    }));

    shipments.forEach((shipment) => {
      if (shipment.month == null || shipment.month < 0 || shipment.month > 11) return;
      monthlyFromShipments[shipment.month].shipments += 1;
      monthlyFromShipments[shipment.month].teu += shipment.teu;
      monthlyFromShipments[shipment.month].spend += shipment.spend || 0;
      if (shipment.loadType === "FCL") monthlyFromShipments[shipment.month].fcl += 1;
      if (shipment.loadType === "LCL") monthlyFromShipments[shipment.month].lcl += 1;
    });

    const monthlyFromSeries = MONTH_LABELS.map((label) => ({
      period: label,
      fcl: 0,
      lcl: 0,
      shipments: 0,
      teu: 0,
      spend: 0,
    }));

    timeSeries.forEach((point: any) => {
      const date = getSeriesDate(point);
      if (!date || (effectiveYear != null && date.getFullYear() !== effectiveYear)) return;
      const monthIndex = date.getMonth();
      monthlyFromSeries[monthIndex] = {
        period: MONTH_LABELS[monthIndex],
        fcl: Math.max(toNumber(point?.shipmentsFcl ?? point?.fclShipments), 0),
        lcl: Math.max(toNumber(point?.shipmentsLcl ?? point?.lclShipments), 0),
        shipments: Math.max(
          toNumber(point?.shipments ?? point?.shipmentCount) ||
            toNumber(point?.shipmentsFcl ?? point?.fclShipments) + toNumber(point?.shipmentsLcl ?? point?.lclShipments),
          0,
        ),
        teu: Math.max(toNumber(point?.teu ?? point?.teuCount), 0),
        spend: Math.max(
          toNumber(
            point?.estSpendUsd ?? point?.est_spend_usd ?? point?.marketSpend ?? point?.market_spend ?? point?.spend,
          ),
          0,
        ),
      };
    });

    const activitySeries: ActivityPoint[] = MONTH_LABELS.map((label, index) => {
      const shipmentRow = monthlyFromShipments[index];
      const seriesRow = monthlyFromSeries[index];
      return {
        period: label,
        fcl: seriesRow.fcl > 0 || seriesRow.lcl > 0 ? seriesRow.fcl : shipmentRow.fcl,
        lcl: seriesRow.fcl > 0 || seriesRow.lcl > 0 ? seriesRow.lcl : shipmentRow.lcl,
      };
    });

    const shipmentsCount = shipments.length || null;
    const teuCount = shipments.length
      ? shipments.reduce((sum, shipment) => sum + shipment.teu, 0)
      : routeKpis?.teuLast12m ?? rawProfile?.teuLast12m ?? rawProfile?.teu_last_12m ?? null;

    const fclShipments = shipments.length
      ? shipments.filter((shipment) => shipment.loadType === "FCL").length
      : (profile?.containersLoad?.find((item) => item.load_type?.toUpperCase() === "FCL")?.shipments ??
          rawProfile?.containers?.fclShipments12m ??
          rawProfile?.containers?.fcl ??
          rawProfile?.fcl_shipments_12m ??
          null);

    const lclShipments = shipments.length
      ? shipments.filter((shipment) => shipment.loadType === "LCL").length
      : (profile?.containersLoad?.find((item) => item.load_type?.toUpperCase() === "LCL")?.shipments ??
          rawProfile?.containers?.lclShipments12m ??
          rawProfile?.containers?.lcl ??
          rawProfile?.lcl_shipments_12m ??
          null);

    const spendFromSeries = sumSpendFromSeries(timeSeries, effectiveYear);
    const spendFromShipments = shipments.reduce((sum, shipment) => sum + (shipment.spend || 0), 0) || null;
    const marketSpend =
      spendFromSeries ??
      spendFromShipments ??
      rawRouteKpis?.estSpendUsd12m ??
      rawRouteKpis?.estSpendUsd ??
      rawProfile?.estSpendUsd12m ??
      rawProfile?.marketSpend ??
      rawProfile?.est_spend ??
      null;

    const latestShipmentDate = shipments[0]?.date || profile?.lastShipmentDate || rawProfile?.last_shipment_date || null;
    const oldestShipmentDate = shipments[shipments.length - 1]?.date || null;

    const topRoutes = aggregateRoutes(
      shipments,
      Array.isArray(rawRouteKpis?.topRoutesLast12m)
        ? rawRouteKpis.topRoutesLast12m
        : Array.isArray(rawProfile?.topRoutes)
          ? rawProfile.topRoutes
          : [],
    );
    const carrierRows = aggregateCarriers(shipments);
    const locationRows = {
      origins: groupTop(shipments.map((shipment) => shipment.origin), 10),
      destinations: groupTop(shipments.map((shipment) => shipment.destination), 10),
    };
    const hsRows = aggregateHsRows(shipments);
    const productRows: ProductSummary[] = hsRows.map((row) => ({
      product: row.description,
      hsCode: row.hsCode,
      count: row.count,
    }));

    const shipmentTableRows: TableRow[] = shipments.slice(0, 20).map((shipment) => ({
      Date: formatDate(shipment.date),
      "BOL ID": shipment.bolId,
      TEU: formatNumber(shipment.teu, 1),
      Carrier: shipment.carrier,
      Route: buildRouteLabel(shipment.route),
      Product: shipment.product,
      "HS Code": shipment.hsCode,
    }));

    const pivotSource: PivotSummary[] = MONTH_LABELS.map((label, index) => ({
      monthIndex: index,
      month: label,
      shipments: monthlyFromShipments[index].shipments,
      teu: monthlyFromShipments[index].teu,
      spend: monthlyFromShipments[index].spend > 0 ? monthlyFromShipments[index].spend : null,
    }));

    const pivotRows: TableRow[] = pivotSource.map((row) => ({
      Month: row.month,
      Shipments: formatNumber(row.shipments),
      TEU: formatNumber(row.teu, 1),
      Spend: formatCurrency(row.spend),
    }));

    const totalKnownLoads = (fclShipments || 0) + (lclShipments || 0);
    const fclRatio = totalKnownLoads > 0 ? ((fclShipments || 0) / totalKnownLoads) * 100 : null;
    const avgTeuPerShipment = shipmentsCount && teuCount != null ? teuCount / shipmentsCount : null;
    const avgShipmentsPerMonth = shipmentsCount != null ? shipmentsCount / 12 : null;
    const topRouteLabel = topRoutes[0]?.lane || buildRouteLabel(rawRouteKpis?.topRouteLast12m) || "—";
    const recentRouteLabel = shipments[0]?.route || buildRouteLabel(routeKpis?.mostRecentRoute) || "—";
    const statusBadge = deriveStatusBadge(shipments, latestShipmentDate);

    const strategicInsights: InsightCard[] = [
      topRouteLabel && topRouteLabel !== "—"
        ? {
            title: "Trade lane signal",
            body: `Primary lane for ${effectiveYear || "current"} is ${topRouteLabel}. Position DSV around lane resilience, capacity optionality, and routing control.`,
          }
        : null,
      shipmentsCount
        ? {
            title: "Volume profile",
            tone: "highlight",
            body: `Selected-year activity shows ${formatNumber(shipmentsCount)} shipments and ${formatNumber(
              teuCount,
              1,
            )} TEUs. This account supports a real logistics intelligence conversation, not a generic sales pitch.`,
          }
        : null,
      latestShipmentDate
        ? {
            title: "Recency risk",
            tone: statusBadge === "Inactive" ? "warning" : "default",
            body: `Latest visible movement is ${formatDate(latestShipmentDate)}. Use this to frame urgency, renewal timing, and outbound sequencing.`,
          }
        : null,
    ].filter(Boolean) as InsightCard[];

    return {
      years,
      selectedYear: effectiveYear,
      shipments,
      activitySeries,
      marketSpend,
      shipmentsCount,
      teuCount,
      fclShipments,
      lclShipments,
      fclRatio,
      avgTeuPerShipment,
      avgShipmentsPerMonth,
      oldestShipmentDate,
      latestShipmentDate,
      topRoutes,
      carrierRows,
      locationRows,
      hsRows,
      productRows,
      shipmentTableRows,
      pivotRows,
      topRouteLabel,
      recentRouteLabel,
      statusBadge,
      strategicInsights,
    };
  }, [normalizedShipments, profile, rawProfile, rawRouteKpis, record, routeKpis, selectedYear]);

  useEffect(() => {
    if (!detail.years.length) {
      if (selectedYear !== null) setSelectedYear(null);
      return;
    }
    if (detail.selectedYear !== selectedYear) {
      setSelectedYear(detail.selectedYear);
    }
  }, [detail.selectedYear, detail.years, selectedYear]);

  if (!key) {
    return <CommandCenterEmptyState />;
  }

  const contactPool =
    (rawProfile?.notifyParties ||
      rawProfile?.notify_parties ||
      rawProfile?.topSuppliers ||
      rawProfile?.top_suppliers ||
      []) as any[];

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
              logoUrl={getCompanyLogoUrl(profile?.domain || (record as any)?.company?.domain) ?? undefined}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  {profile?.title || record?.company?.name || "Company"}
                </h2>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  {detail.statusBadge}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <InfoChip icon={MapPin} label={profile?.address || record?.company?.address || "Address unavailable"} />
                {(profile?.website || (record as any)?.company?.website) && (
                  <InfoChip
                    icon={Globe}
                    label={(profile?.website || (record as any)?.company?.website || "").replace(/^https?:\/\//, "")}
                  />
                )}
                {(profile?.phoneNumber || (record as any)?.company?.phone) && (
                  <InfoChip icon={Phone} label={profile?.phoneNumber || (record as any)?.company?.phone} />
                )}
                {profile?.countryCode ? <InfoChip icon={Globe} label={profile.countryCode} /> : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap gap-2 justify-start xl:justify-end">
              <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                Export PDF
              </button>
              <button className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900">
                Generate brief
              </button>
            </div>
            <div className="flex flex-wrap gap-2 justify-start xl:justify-end">
              {detail.years.length ? (
                detail.years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setSelectedYear(year)}
                    className={[
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      detail.selectedYear === year
                        ? "bg-slate-950 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {year}
                  </button>
                ))
              ) : (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                  No year data
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4 min-w-0">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Market spend"
                value={formatCurrency(detail.marketSpend)}
                icon={DollarSign}
                subLabel={detail.selectedYear ? `${detail.selectedYear} estimate` : "Selected-year estimate"}
              />
              <KpiCard
                label="Shipments"
                value={formatNumber(detail.shipmentsCount)}
                icon={Package}
                subLabel={detail.selectedYear ? `${detail.selectedYear} visible activity` : "Visible activity"}
              />
              <KpiCard
                label="Total TEUs"
                value={formatNumber(detail.teuCount, 1)}
                icon={Ship}
                subLabel="Selected-year volume"
              />
              <KpiCard
                label="FCL ratio"
                value={detail.fclRatio != null ? `${formatNumber(detail.fclRatio, 0)}%` : "—"}
                icon={Layers}
                subLabel="Load mix"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                label="FCL shipments"
                value={formatNumber(detail.fclShipments)}
                icon={Truck}
                subLabel="Selected year"
              />
              <KpiCard
                label="LCL shipments"
                value={formatNumber(detail.lclShipments)}
                icon={Truck}
                subLabel="Selected year"
              />
              <KpiCard
                label="Avg TEU / shipment"
                value={formatNumber(detail.avgTeuPerShipment, 2)}
                icon={TrendingUp}
                subLabel="Selected year"
              />
              <KpiCard
                label="Avg shipments / month"
                value={formatNumber(detail.avgShipmentsPerMonth, 1)}
                icon={CalendarClock}
                subLabel="Jan–Dec basis"
              />
              <KpiCard
                label="Oldest shipment"
                value={formatDate(detail.oldestShipmentDate)}
                icon={CalendarClock}
                subLabel="Within selected year"
              />
              <KpiCard
                label="Latest shipment"
                value={formatDate(detail.latestShipmentDate)}
                icon={CalendarClock}
                subLabel="Within selected year"
              />
            </div>

            <Tabs defaultValue="overview" className="space-y-5">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-[26px] border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-4 xl:grid-cols-8">
                <TabsTrigger value="overview" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="lanes" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Trade Lanes
                </TabsTrigger>
                <TabsTrigger value="carriers" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Carriers
                </TabsTrigger>
                <TabsTrigger value="locations" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Locations
                </TabsTrigger>
                <TabsTrigger value="products" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Products
                </TabsTrigger>
                <TabsTrigger value="history" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Shipment History
                </TabsTrigger>
                <TabsTrigger value="pivot" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Pivot Table
                </TabsTrigger>
                <TabsTrigger value="contacts" className="rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Contact Intel
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                        Peak seasonality index
                      </div>
                      <p className="mb-4 text-xs text-slate-500">
                        Monthly shipment profile for Jan–Dec of {detail.selectedYear || "the selected year"}.
                      </p>
                      <CompanyActivityChart data={detail.activitySeries} />
                      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <span className="font-semibold text-indigo-600">Observation:</span>{" "}
                        Selected-year trends now reconcile with the same dataset powering shipments, lanes, products, and pivot views.
                      </div>
                    </div>

                    <CommandCenterInsights insights={detail.strategicInsights} />
                  </div>

                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="lanes" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <MetricList
                    title="Trade lanes"
                    items={detail.topRoutes.map((route) => ({
                      label: route.lane,
                      value: formatNumber(route.shipments),
                      meta: `TEU ${formatNumber(route.teu, 1)} • Spend ${formatCurrency(route.spend)}`,
                    }))}
                  />
                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="carriers" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <MetricList
                    title="Carriers"
                    items={detail.carrierRows.map((carrier) => ({
                      label: carrier.carrier,
                      value: formatNumber(carrier.shipments),
                      meta: `TEU ${formatNumber(carrier.teu, 1)}`,
                    }))}
                  />
                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="locations" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <MetricList
                      title="Origins"
                      items={detail.locationRows.origins.map((item) => ({
                        label: item.label,
                        value: formatNumber(item.count),
                        meta: "Origin",
                      }))}
                    />
                    <MetricList
                      title="Destinations"
                      items={detail.locationRows.destinations.map((item) => ({
                        label: item.label,
                        value: formatNumber(item.count),
                        meta: "Destination",
                      }))}
                    />
                  </div>
                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="products" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <MetricList
                      title="Product mix (HS codes)"
                      items={detail.hsRows.map((row) => ({
                        label: row.hsCode,
                        value: formatNumber(row.count),
                        meta: row.description,
                      }))}
                    />
                    <MetricList
                      title="Top products"
                      items={detail.productRows.map((row) => ({
                        label: row.product,
                        value: formatNumber(row.count),
                        meta: `HS ${row.hsCode}`,
                      }))}
                    />
                  </div>
                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <DataTable
                    title="Verified shipment ledger"
                    columns={["Date", "BOL ID", "TEU", "Carrier", "Route", "Product", "HS Code"]}
                    rows={detail.shipmentTableRows}
                  />
                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pivot" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <DataTable
                    title="Monthly pivot"
                    columns={["Month", "Shipments", "TEU", "Spend"]}
                    rows={detail.pivotRows}
                  />
                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
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
                          Placeholder for Lusha and AI enrichment only. No synthetic contacts added.
                        </p>
                      </div>
                      <button className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">
                        Sync to CRM
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {contactPool.slice(0, 6).map((contact: any, index: number) => {
                        const name = normalizeText(contact.name || contact.notify_party || contact.company || contact);
                        const email = normalizeText(contact.email || contact.email_address);
                        const phone = normalizeText(contact.phone || contact.phone_number);
                        const role = normalizeText(contact.role || "Decision maker");
                        return (
                          <div key={`${name}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
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
                                Derived
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

                      {!contactPool.length ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 md:col-span-2">
                          AI enrichment can populate verified logistics contacts here later.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="hidden xl:block">
                    <AiRail
                      insights={detail.strategicInsights}
                      shipments12m={detail.shipmentsCount}
                      teu12m={detail.teuCount}
                      topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4 xl:hidden">
            <AiRail
              insights={detail.strategicInsights}
              shipments12m={detail.shipmentsCount}
              teu12m={detail.teuCount}
              topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
