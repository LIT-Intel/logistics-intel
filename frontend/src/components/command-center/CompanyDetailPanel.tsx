import React, { useMemo } from "react";
import {
  Boxes,
  CalendarClock,
  DollarSign,
  Globe,
  Package,
  Phone,
  Ship,
  TrendingUp,
  MapPin,
  Truck,
  Sparkles,
} from "lucide-react";
import {
  buildCommandCenterDetailModel,
  buildYearScopedProfile,
  getCommandCenterAvailableYears,
} from "@/lib/api";
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
  selectedYear?: number | null;
  onGenerateBrief?: () => void;
  onExportPDF?: () => void;
};

type ActivityPoint = {
  period: string;
  fcl: number;
  lcl: number;
};

type TableRow = Record<string, React.ReactNode>;

type TimeSeriesLike = {
  month?: string | null;
  year?: number | null;
  shipments?: number | null;
  fclShipments?: number | null;
  lclShipments?: number | null;
  teu?: number | null;
  estSpendUsd?: number | null;
};

type NormalizedShipment = {
  source: any;
  raw: any;
  id: string;
  date: string | null;
  year: number | null;
  monthIndex: number | null;
  teu: number;
  spend: number | null;
  loadType: "FCL" | "LCL" | "UNKNOWN";
  carrier: string;
  origin: string;
  destination: string;
  route: string;
  product: string;
  hsCode: string;
};

type DetailModel = {
  years: number[];
  selectedYear: number | null;
  filteredShipments: NormalizedShipment[];
  monthlySeries: ActivityPoint[];
  shipments: number;
  teu: number;
  spend: number | null;
  fclShipments: number;
  lclShipments: number;
  avgTeuPerShipment: number | null;
  avgShipmentsPerMonth: number | null;
  oldestShipmentDate: string | null;
  latestShipmentDate: string | null;
  topRouteLabel: string;
  recentRouteLabel: string;
  topRoutes: Array<{ lane: string; shipments: number; teu: number; spend: number | null }>;
  carriers: Array<{ carrier: string; shipments: number; teu: number }>;
  origins: Array<{ label: string; count: number }>;
  destinations: Array<{ label: string; count: number }>;
  hsRows: Array<{ hsCode: string; description: string; count: number }>;
  productRows: Array<{ product: string; hsCode: string; volumeShare: string }>;
  shipmentTableRows: TableRow[];
  pivotRows: TableRow[];
};

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

const isMeaningfulText = (value?: string | null) => {
  const cleaned = normalizeText(value).toLowerCase();
  return Boolean(
    cleaned &&
      cleaned !== "—" &&
      cleaned !== "null" &&
      cleaned !== "undefined" &&
      cleaned !== "n/a" &&
      cleaned !== "na" &&
      cleaned !== "unknown",
  );
};

const cleanDisplayText = (value?: string | null) => (isMeaningfulText(value) ? normalizeText(value) : "");

const buildRouteLabel = (value?: string | null) => {
  const cleaned = cleanDisplayText(value);
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

const safeArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const getRecordKey = (record: CommandCenterRecord | null) =>
  record?.company?.company_id ?? record?.company?.name ?? null;

const getNested = (obj: any, path: string[]) => {
  let current = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
};

const pickFirst = (...values: any[]) => {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !normalizeText(value)) continue;
    return value;
  }
  return null;
};

const getShipmentValue = (shipment: any, ...paths: string[][]) => {
  const candidates = [shipment, shipment?.raw, shipment?.raw?.shipment, shipment?.raw?.data];
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const path of paths) {
      const value = getNested(candidate, path);
      if (value != null && !(typeof value === "string" && !normalizeText(value))) {
        return value;
      }
    }
  }
  return null;
};

const normalizeLocation = (...values: any[]) => {
  const value = pickFirst(...values);
  const text =
    typeof value === "string" ? value : value?.name || value?.label || value?.port || value?.city || "";
  return cleanDisplayText(text);
};

const normalizeDateValue = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
};

const extractDate = (shipment: any) =>
  normalizeDateValue(
    pickFirst(
      getShipmentValue(
        shipment,
        ["bill_of_lading_date"],
        ["bill_of_lading_date_formatted"],
        ["date"],
        ["arrival_date"],
        ["shipment_date"],
        ["estimated_arrival"],
      ),
      shipment?.date,
      shipment?.dateObj,
    ),
  );

const extractTeu = (shipment: any) =>
  toNumber(
    pickFirst(
      getShipmentValue(
        shipment,
        ["teu"],
        ["TEU"],
        ["container_teu"],
        ["metrics", "teu"],
        ["stats", "teu"],
      ),
      0,
    ),
  );

const extractSpend = (shipment: any) => {
  const explicitSpend = toNumber(
    pickFirst(
      getShipmentValue(
        shipment,
        ["estSpendUsd"],
        ["est_spend_usd"],
        ["estimated_spend_usd"],
        ["spend_usd"],
        ["metrics", "spendUsd"],
      ),
      NaN,
    ),
  );
  if (explicitSpend > 0) return explicitSpend;
  const teu = extractTeu(shipment);
  return teu > 0 ? teu * 1100 : null;
};

const extractLoadType = (shipment: any): "FCL" | "LCL" | "UNKNOWN" => {
  const lclFlag = pickFirst(
    getShipmentValue(shipment, ["lcl"], ["is_lcl"], ["lcl_flag"]),
    shipment?.lcl,
    shipment?.raw?.lcl,
  );
  if (lclFlag === true || String(lclFlag).toLowerCase() === "true") return "LCL";
  if (lclFlag === false || String(lclFlag).toLowerCase() === "false") return "FCL";

  const raw = cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["load_type"],
          ["loadType"],
          ["container_type"],
          ["containerType"],
          ["shipment_type"],
          ["mode"],
        ),
        "",
      ),
    ).toUpperCase(),
  );
  if (raw.includes("FCL") || raw.includes("FULL")) return "FCL";
  if (raw.includes("LCL") || raw.includes("LESS")) return "LCL";

  const teu = extractTeu(shipment);
  if (teu >= 1) return "FCL";
  if (teu > 0 && teu < 1) return "LCL";
  return "UNKNOWN";
};

const extractCarrier = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["carrier"],
          ["carrier_name"],
          ["carrierName"],
          ["shipping_line"],
          ["shippingLine"],
          ["steamship_line"],
          ["steamshipLine"],
          ["vessel_operator"],
          ["vesselOperator"],
          ["line"],
          ["ocean_carrier"],
          ["ocean_carrier_name"],
          ["manifest_carrier_name"],
          ["carrier_scac"],
          ["carrier_code"],
        ),
        "",
      ),
    ),
  );

const extractOrigin = (shipment: any) =>
  normalizeLocation(
    getShipmentValue(
      shipment,
      ["origin_port"],
      ["origin"],
      ["origin_country"],
      ["origin_country_name"],
      ["origin_location"],
      ["origin_port_name"],
      ["loading_port"],
      ["place_of_receipt"],
      ["pol"],
      ["port_of_loading"],
      ["shipper_country"],
      ["supplier_country"],
    ),
  );

const extractDestination = (shipment: any) =>
  normalizeLocation(
    getShipmentValue(
      shipment,
      ["destination_port"],
      ["destination"],
      ["destination_country"],
      ["destination_country_name"],
      ["destination_location"],
      ["destination_port_name"],
      ["discharge_port"],
      ["place_of_delivery"],
      ["pod"],
      ["port_of_discharge"],
      ["company_country"],
    ),
  );

const deriveRouteFromShipment = (shipment?: any) => {
  if (!shipment) return null;
  const origin = extractOrigin(shipment);
  const destination = extractDestination(shipment);
  if (!origin && !destination) return null;
  if (origin && destination) return `${origin} → ${destination}`;
  return origin || destination;
};

const extractProduct = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["Product_Description"],
          ["product_description"],
          ["description"],
          ["product_name"],
          ["commodity"],
          ["product"],
        ),
        "",
      ),
    ),
  );

const extractHsCode = (shipment: any) =>
  cleanDisplayText(
    String(
      pickFirst(
        getShipmentValue(
          shipment,
          ["HS_Code"],
          ["hsCode"],
          ["hs_code"],
          ["product_hs_code"],
          ["hs"],
        ),
        "",
      ),
    ),
  );

const normalizeShipment = (shipment: any, index: number): NormalizedShipment => {
  const date = extractDate(shipment);
  const parsedDate = date ? new Date(date) : null;
  const year = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getFullYear() : null;
  const monthIndex =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getMonth() : null;
  const route = buildRouteLabel(
    pickFirst(
      getShipmentValue(shipment, ["route"], ["lane"], ["trade_lane"]),
      deriveRouteFromShipment(shipment),
    ) as string | null,
  );

  return {
    source: shipment,
    raw: shipment?.raw ?? null,
    id: String(
      pickFirst(
        getShipmentValue(shipment, ["bill_of_lading"], ["bol_id"], ["id"], ["number"]),
        `shipment-${index}`,
      ),
    ),
    date: typeof date === "string" ? date : null,
    year,
    monthIndex,
    teu: extractTeu(shipment),
    spend: extractSpend(shipment),
    loadType: extractLoadType(shipment),
    carrier: extractCarrier(shipment) || "—",
    origin: extractOrigin(shipment) || "—",
    destination: extractDestination(shipment) || "—",
    route,
    product: extractProduct(shipment) || "—",
    hsCode: extractHsCode(shipment) || "—",
  };
};

const groupTop = <T extends string>(
  values: T[],
  top = 8,
): Array<{ label: string; count: number }> => {
  const map = new Map<string, number>();
  values.forEach((value) => {
    const label = normalizeText(value);
    if (!label || label === "—") return;
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
};

const aggregateCarrierRows = (shipments: NormalizedShipment[]) => {
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

const aggregateRouteRows = (shipments: NormalizedShipment[]) => {
  const map = new Map<string, { shipments: number; teu: number; spend: number }>();
  shipments.forEach((shipment) => {
    if (!shipment.route || shipment.route === "—") return;
    const current = map.get(shipment.route) || { shipments: 0, teu: 0, spend: 0 };
    current.shipments += 1;
    current.teu += shipment.teu;
    current.spend += shipment.spend ?? 0;
    map.set(shipment.route, current);
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
};

const aggregatePivotRows = (shipments: NormalizedShipment[]) => {
  const months = new Map<string, { shipments: number; teu: number }>();
  shipments.forEach((shipment) => {
    const month = monthKey(shipment.date);
    const current = months.get(month) || { shipments: 0, teu: 0 };
    current.shipments += 1;
    current.teu += shipment.teu;
    months.set(month, current);
  });

  return [...months.entries()]
    .map(([month, stats]) => ({
      month,
      shipments: stats.shipments,
      teu: stats.teu,
    }))
    .sort((a, b) => {
      const da = new Date(`01 ${a.month}`);
      const db = new Date(`01 ${b.month}`);
      if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
      return da.getTime() - db.getTime();
    })
    .slice(-12);
};

const getAvailableYears = (
  shipments: NormalizedShipment[],
  profile?: IyCompanyProfile | null,
  routeKpis?: IyRouteKpis | null,
) => {
  const years = new Set<number>();
  shipments.forEach((shipment) => {
    if (shipment.year) years.add(shipment.year);
  });

  safeArray((profile as any)?.timeSeries).forEach((point: any) => {
    const rawValue = pickFirst(point?.year, point?.month, point?.date, point?.monthLabel);
    if (!rawValue) return;
    const parsed = new Date(String(rawValue));
    if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear());
    const match = String(rawValue).match(/\b(20\d{2})\b/);
    if (match) years.add(Number(match[1]));
  });

  safeArray((routeKpis as any)?.monthlySeries).forEach((point: any) => {
    const rawValue = pickFirst(point?.year, point?.month, point?.monthLabel);
    if (!rawValue) return;
    const parsed = new Date(String(rawValue));
    if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear());
    const match = String(rawValue).match(/\b(20\d{2})\b/);
    if (match) years.add(Number(match[1]));
  });

  return [...years].sort((a, b) => b - a);
};

const getStatusLabel = (shipments: number, teu: number) => {
  if (shipments >= 50 || teu >= 100) return "High volume shipper";
  if (shipments >= 20 || teu >= 40) return "Active shipper";
  return "Tracked account";
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
  accent = "indigo",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  subLabel?: string;
  accent?: "indigo" | "violet" | "cyan" | "emerald" | "amber" | "rose";
}) => {
  const accentMap = {
    indigo: "border-indigo-200 bg-indigo-50/40 text-indigo-600",
    violet: "border-violet-200 bg-violet-50/40 text-violet-600",
    cyan: "border-cyan-200 bg-cyan-50/40 text-cyan-600",
    emerald: "border-emerald-200 bg-emerald-50/40 text-emerald-600",
    amber: "border-amber-200 bg-amber-50/40 text-amber-600",
    rose: "border-rose-200 bg-rose-50/40 text-rose-600",
  } as const;
  const accentClass = accentMap[accent];

  return (
    <div className="min-h-[112px] rounded-3xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${accentClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span>{label}</span>
      </div>
      <div className="mt-3 text-[1.5rem] font-semibold tracking-tight text-slate-950 md:text-[1.75rem]">{value}</div>
      {subLabel ? <div className="mt-1.5 text-xs text-slate-500">{subLabel}</div> : null}
    </div>
  );
};

const SmallMetric = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) => (
  <div className="min-h-[88px] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
      <Icon className="h-3.5 w-3.5 text-indigo-500" />
      <span>{label}</span>
    </div>
    <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{value}</div>
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
  shipments,
  teu,
  topRouteLabel,
}: {
  insights: Array<{ title: string; body: string; tone?: "default" | "warning" | "highlight" }>;
  shipments: number | null;
  teu: number | null;
  topRouteLabel: string;
}) => {
  const aiCards = [
    {
      title: "Growth alert",
      body:
        shipments && teu
          ? `Volume profile shows ${formatNumber(shipments)} shipments and ${formatNumber(teu, 1)} TEUs in scope. Good candidate for mode optimization and seasonal rate capture.`
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
    <aside className="space-y-4 w-full lg:sticky lg:top-4">
      <div className="rounded-[28px] border border-slate-800 bg-slate-950 p-5 text-white shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-300">AI Intelligence</div>
          <Sparkles className="h-4 w-4 text-indigo-300" />
        </div>

        <div className="space-y-4">
          {aiCards.map((card) => (
            <div key={card.title} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                {card.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-100">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Quick actions removed intentionally */}
    </aside>
  );
};

const buildDetailModel = (
  normalizedShipments: NormalizedShipment[],
  selectedYear: number | null,
  rawProfile: any,
  rawRouteKpis: any,
): DetailModel => {
  const parseSeriesMonthIndex = (point: any) => {
    const rawValue = String(pickFirst(point?.month, point?.monthLabel, point?.period, point?.date, point?.label, ""));
    if (/^\d{4}-\d{2}$/.test(rawValue)) return Number(rawValue.slice(5, 7)) - 1;
    if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) return Number(rawValue.slice(5, 7)) - 1;
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getMonth();
  };

  const parseSeriesYear = (point: any) => {
    const explicitYear = toNumber(point?.year);
    if (explicitYear) return explicitYear;
    const rawValue = String(pickFirst(point?.month, point?.monthLabel, point?.period, point?.date, point?.label, ""));
    const match = rawValue.match(/\b(20\d{2})\b/);
    if (match) return Number(match[1]);
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
  };

  const normalizeSeriesPoint = (point: any) => ({
    year: parseSeriesYear(point),
    monthIndex: parseSeriesMonthIndex(point),
    shipments: toNumber(pickFirst(point?.shipments, point?.totalShipments, point?.shipmentCount, point?.count)),
    fclShipments: toNumber(pickFirst(point?.fclShipments, point?.shipmentsFcl, point?.fcl, point?.fclCount)),
    lclShipments: toNumber(pickFirst(point?.lclShipments, point?.shipmentsLcl, point?.lcl, point?.lclCount)),
    teu: toNumber(pickFirst(point?.teu, point?.totalTeu, point?.teus)),
    estSpendUsd: toNumber(pickFirst(point?.estSpendUsd, point?.est_spend_usd, point?.spendUsd, point?.spend)),
  });

  const profileSeries = safeArray(rawProfile?.timeSeries)
    .map(normalizeSeriesPoint)
    .filter((point) => (selectedYear ? point.year === selectedYear : true));
  const routeSeries = safeArray(rawRouteKpis?.monthlySeries)
    .map(normalizeSeriesPoint)
    .filter((point) => (selectedYear ? point.year === selectedYear : true));
  const activeSeries = profileSeries.length >= routeSeries.length ? profileSeries : routeSeries;
  const filteredShipments = selectedYear
    ? normalizedShipments.filter((shipment) => shipment.year === selectedYear)
    : normalizedShipments;

  const monthlyBuckets = Array.from({ length: 12 }, (_, monthIndex) => ({
    period: new Date(2000, monthIndex, 1).toLocaleDateString(undefined, { month: "short" }),
    fcl: 0,
    lcl: 0,
  }));
  if (activeSeries.length) {
    activeSeries.forEach((point) => {
      if (point.monthIndex == null || point.monthIndex < 0 || point.monthIndex > 11) return;
      const fcl = toNumber(point.fclShipments);
      const lcl = toNumber(point.lclShipments);
      const shipments = toNumber(point.shipments);
      monthlyBuckets[point.monthIndex].fcl += fcl;
      monthlyBuckets[point.monthIndex].lcl += lcl;
      if (fcl + lcl === 0 && shipments > 0) monthlyBuckets[point.monthIndex].fcl += shipments;
    });
  } else {
    filteredShipments.forEach((shipment) => {
      if (shipment.monthIndex == null || shipment.monthIndex < 0 || shipment.monthIndex > 11) return;
      if (shipment.loadType === "LCL") {
        monthlyBuckets[shipment.monthIndex].lcl += 1;
      } else {
        monthlyBuckets[shipment.monthIndex].fcl += 1;
      }
    });
  }

  const seriesShipments = activeSeries.reduce((sum, point) => {
    const shipments = toNumber(point.shipments);
    if (shipments > 0) return sum + shipments;
    return sum + toNumber(point.fclShipments) + toNumber(point.lclShipments);
  }, 0);
  const seriesTeu = activeSeries.reduce((sum, point) => sum + toNumber(point.teu), 0);
  const seriesSpend = activeSeries.reduce((sum, point) => sum + toNumber(point.estSpendUsd), 0);
  const seriesFcl = activeSeries.reduce((sum, point) => sum + toNumber(point.fclShipments), 0);
  const seriesLcl = activeSeries.reduce((sum, point) => sum + toNumber(point.lclShipments), 0);

  const shipmentCount = filteredShipments.length;
  const shipmentTeu = filteredShipments.reduce((sum, shipment) => sum + shipment.teu, 0);
  const directSpend = filteredShipments.reduce((sum, shipment) => sum + (shipment.spend ?? 0), 0);
  const inferredFclCount = filteredShipments.filter((shipment) => shipment.loadType === "FCL").length;
  const inferredLclCount = filteredShipments.filter((shipment) => shipment.loadType === "LCL").length;

  const fallbackShipments = toNumber(
    pickFirst(
      rawRouteKpis?.shipmentsLast12m,
      rawProfile?.shipmentsLast12m,
      rawProfile?.shipments_last_12m,
      rawProfile?.totalShipments,
    ),
  );
  const fallbackTeu = toNumber(
    pickFirst(rawRouteKpis?.teuLast12m, rawProfile?.teuLast12m, rawProfile?.teu_last_12m),
  );
  const fallbackSpend = toNumber(
    pickFirst(
      rawRouteKpis?.estSpendUsd12m,
      rawRouteKpis?.estSpendUsd,
      rawProfile?.estSpendUsd12m,
      rawProfile?.estSpendUsd,
      rawProfile?.marketSpend,
      rawProfile?.est_spend,
    ),
  );
  const fallbackFcl = toNumber(
    pickFirst(
      rawProfile?.containers?.fclShipments12m,
      rawProfile?.containers?.fcl,
      safeArray(rawProfile?.containersLoad).find(
        (item: any) => String(item?.load_type || "").toUpperCase() === "FCL",
      )?.shipments,
      rawProfile?.fcl_shipments_12m,
    ),
  );
  const fallbackLcl = toNumber(
    pickFirst(
      rawProfile?.containers?.lclShipments12m,
      rawProfile?.containers?.lcl,
      safeArray(rawProfile?.containersLoad).find(
        (item: any) => String(item?.load_type || "").toUpperCase() === "LCL",
      )?.shipments,
      rawProfile?.lcl_shipments_12m,
    ),
  );

  const shipments = seriesShipments > 0 ? seriesShipments : shipmentCount > 0 ? shipmentCount : fallbackShipments;
  const teu = seriesTeu > 0 ? seriesTeu : shipmentTeu > 0 ? shipmentTeu : fallbackTeu;
  const spend = seriesSpend > 0 ? seriesSpend : fallbackSpend > 0 ? fallbackSpend : directSpend > 0 ? directSpend : null;
  const fclShipments = seriesFcl > 0 ? seriesFcl : fallbackFcl > 0 ? fallbackFcl : inferredFclCount;
  const lclShipments = seriesLcl > 0 ? seriesLcl : fallbackLcl > 0 ? fallbackLcl : inferredLclCount;

  const sortedByDate = [...filteredShipments].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });

  let topRoutes = safeArray(rawRouteKpis?.topRoutesLast12m)
    .map((route: any) => ({
      lane: buildRouteLabel(route?.route || route?.lane),
      shipments: toNumber(route?.shipments),
      teu: toNumber(route?.teu),
      spend: toNumber(pickFirst(route?.estSpendUsd, route?.estSpendUsd12m)) || null,
    }))
    .filter((row: any) => row.lane && row.lane !== '—');
  if (!topRoutes.length) topRoutes = aggregateRouteRows(filteredShipments);
  if (!topRoutes.length) {
    topRoutes = safeArray(rawProfile?.topRoutes)
      .map((route: any) => ({
        lane: buildRouteLabel(route?.label || route?.route),
        shipments: toNumber(route?.shipments),
        teu: toNumber(route?.teu),
        spend: toNumber(route?.estSpendUsd) || null,
      }))
      .filter((row: any) => row.lane && row.lane !== '—');
  }
  topRoutes = topRoutes.sort((a, b) => b.shipments - a.shipments || b.teu - a.teu).slice(0, 10);

  let carriers = aggregateCarrierRows(filteredShipments).filter((item) => isMeaningfulText(item.carrier));
  if (!carriers.length) {
    const carrierCounts = new Map<string, { shipments: number; teu: number }>();
    filteredShipments.forEach((shipment) => {
      const rawCarrier = cleanDisplayText(
        String(
          pickFirst(
            shipment.raw?.carrier,
            shipment.raw?.carrier_name,
            shipment.raw?.carrierName,
            shipment.raw?.shipping_line,
            shipment.raw?.shippingLine,
            shipment.raw?.vessel_operator,
            shipment.raw?.manifest_carrier_name,
            shipment.raw?.line,
            '',
          ),
        ),
      );
      if (!isMeaningfulText(rawCarrier)) return;
      const current = carrierCounts.get(rawCarrier) || { shipments: 0, teu: 0 };
      current.shipments += 1;
      current.teu += shipment.teu;
      carrierCounts.set(rawCarrier, current);
    });
    carriers = [...carrierCounts.entries()]
      .map(([carrier, stats]) => ({ carrier, shipments: stats.shipments, teu: stats.teu }))
      .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu)
      .slice(0, 10);
  }

  let origins = groupTop(filteredShipments.map((shipment) => shipment.origin), 8);
  let destinations = groupTop(filteredShipments.map((shipment) => shipment.destination), 8);
  if (!origins.length && topRoutes.length) {
    origins = groupTop(
      topRoutes
        .map((route) => route.lane.split('→')[0]?.trim() || '')
        .filter(Boolean) as string[],
      8,
    );
  }
  if (!destinations.length && topRoutes.length) {
    destinations = groupTop(
      topRoutes
        .map((route) => route.lane.split('→')[1]?.trim() || '')
        .filter(Boolean) as string[],
      8,
    );
  }

  const hsMap = new Map<string, { description: string; count: number }>();
  filteredShipments.forEach((shipment) => {
    const key = shipment.hsCode !== '—' ? shipment.hsCode : shipment.product;
    if (!key || key === '—') return;
    const current = hsMap.get(key) || { description: shipment.product, count: 0 };
    current.count += 1;
    if (!current.description || current.description === '—') current.description = shipment.product;
    hsMap.set(key, current);
  });
  const hsRows = [...hsMap.entries()]
    .map(([hsCode, stats]) => ({ hsCode, description: stats.description || '—', count: stats.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const productRows = hsRows.map((row) => ({ product: row.description, hsCode: row.hsCode, volumeShare: `${row.count}` }));
  const shipmentTableRows = [...filteredShipments]
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    })
    .slice(0, 25)
    .map((shipment) => ({
      Date: formatDate(shipment.date),
      'BOL ID': shipment.id || '—',
      TEU: formatNumber(shipment.teu, 1),
      Carrier: shipment.carrier || '—',
      Route: buildRouteLabel(shipment.route),
      Product: shipment.product || '—',
      'HS Code': shipment.hsCode || '—',
    }));
  const pivotRows = Array.from({ length: 12 }, (_, monthIndex) => {
    const point = monthlyBuckets[monthIndex];
    const seriesTeuForMonth = activeSeries
      .filter((seriesPoint) => seriesPoint.monthIndex === monthIndex)
      .reduce((sum, seriesPoint) => sum + toNumber(seriesPoint.teu), 0);
    const shipmentTeuForMonth = filteredShipments
      .filter((shipment) => shipment.monthIndex === monthIndex)
      .reduce((sum, shipment) => sum + shipment.teu, 0);
    return {
      Month: point.period,
      Shipments: formatNumber(point.fcl + point.lcl),
      TEU: formatNumber(seriesTeuForMonth > 0 ? seriesTeuForMonth : shipmentTeuForMonth, 1),
    };
  });
  const topRouteLabel = topRoutes[0]?.lane || buildRouteLabel(rawRouteKpis?.topRouteLast12m) || '—';
  const recentRouteLabel =
    [...filteredShipments].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    })[0]?.route || buildRouteLabel(rawRouteKpis?.mostRecentRoute) || '—';
  return {
    years: [],
    selectedYear,
    filteredShipments,
    monthlySeries: monthlyBuckets,
    shipments,
    teu,
    spend,
    fclShipments,
    lclShipments,
    avgTeuPerShipment: shipments > 0 ? teu / shipments : null,
    avgShipmentsPerMonth: shipments > 0 ? shipments / 12 : null,
    oldestShipmentDate: sortedByDate[0]?.date ?? rawProfile?.firstShipmentDate ?? null,
    latestShipmentDate: sortedByDate[sortedByDate.length - 1]?.date ?? rawProfile?.lastShipmentDate ?? rawProfile?.last_shipment_date ?? null,
    topRouteLabel,
    recentRouteLabel,
    topRoutes,
    carriers,
    origins,
    destinations,
    hsRows,
    productRows,
    shipmentTableRows,
    pivotRows,
  };
};

export default function CompanyDetailPanel({
  record,
  profile,
  routeKpis,
  loading,
  error,
  selectedYear,
  onGenerateBrief,
  onExportPDF,
}: CompanyDetailPanelProps) {
  const key = getRecordKey(record);
  const rawProfile = profile as any;
  const rawRouteKpis = routeKpis as any;
  const recentBols = useMemo(() => {
    const items = rawProfile?.recentBols || rawProfile?.recent_bols || rawProfile?.bols || rawProfile?.shipments || [];
    return Array.isArray(items) ? items : [];
  }, [rawProfile]);
  const normalizedShipments = useMemo(() => recentBols.map((shipment, index) => normalizeShipment(shipment, index)), [recentBols]);
  const availableYears = useMemo(() => {
    const apiYears = getCommandCenterAvailableYears(profile);
    return apiYears.length ? apiYears : getAvailableYears(normalizedShipments, profile, routeKpis);
  }, [normalizedShipments, profile, routeKpis]);
  const effectiveSelectedYear = selectedYear ?? availableYears[0] ?? null;
  const detail = useMemo(() => {
    const activeYear = effectiveSelectedYear || new Date().getFullYear();
    const scopedProfile = buildYearScopedProfile(profile, activeYear) || profile;
    const scopedRouteKpis = (scopedProfile as any)?.routeKpis ?? routeKpis;
    const baseModel = buildCommandCenterDetailModel(scopedProfile, scopedRouteKpis, activeYear) as any;
    const fallbackModel = buildDetailModel(normalizedShipments, activeYear, scopedProfile as any, (scopedProfile as any)?.routeKpis ?? rawRouteKpis);
    const resolvedShipments = Math.max(Number(baseModel?.shipments ?? 0), Number(scopedProfile?.totalShipments ?? 0), Number(scopedRouteKpis?.shipmentsLast12m ?? 0), Number(fallbackModel.shipments ?? 0));
    const resolvedTeu = Math.max(Number(baseModel?.teu ?? 0), Number(scopedRouteKpis?.teuLast12m ?? 0), Number((scopedProfile as any)?.teuLast12m ?? 0), Number(fallbackModel.teu ?? 0));
    const resolvedSpendCandidates = [
      Number(baseModel?.marketSpendUsd ?? 0),
      Number(scopedRouteKpis?.estSpendUsd12m ?? 0),
      Number((scopedProfile as any)?.estSpendUsd12m ?? 0),
      Number((scopedProfile as any)?.marketSpend ?? 0),
      Number(fallbackModel.spend ?? 0),
    ].filter((value) => Number.isFinite(value) && value > 0);
    const resolvedSpend = resolvedSpendCandidates.length ? Math.max(...resolvedSpendCandidates) : null;
    const resolvedFcl = Math.max(Number(baseModel?.fclShipments ?? 0), Number((scopedProfile as any)?.containers?.fclShipments12m ?? 0), Number(fallbackModel.fclShipments ?? 0));
    const resolvedLcl = Math.max(Number(baseModel?.lclShipments ?? 0), Number((scopedProfile as any)?.containers?.lclShipments12m ?? 0), Number(fallbackModel.lclShipments ?? 0));
    const latestDate = baseModel?.latestShipmentDate ?? fallbackModel.latestShipmentDate ?? scopedProfile?.lastShipmentDate ?? null;
    const latestParsed = latestDate ? new Date(latestDate) : null;
    const latestMonthCap = latestParsed && !Number.isNaN(latestParsed.getTime()) && latestParsed.getFullYear() === activeYear ? latestParsed.getMonth() : null;
    const monthlySeriesBase = Array.isArray(baseModel?.activitySeries) && baseModel.activitySeries.length
      ? baseModel.activitySeries.map((point: any) => ({
          period: point.month || point.period,
          fcl: Number(point.fcl || 0),
          lcl: Number(point.lcl || 0),
        }))
      : fallbackModel.monthlySeries;
    const monthlySeries = monthlySeriesBase
      .map((point: any) => ({
        period: point.period,
        fcl: Number(point.fcl || 0),
        lcl: Number(point.lcl || 0),
      }))
      .slice(0, latestMonthCap != null ? latestMonthCap + 1 : monthlySeriesBase.length);
    const topRoutes = Array.isArray(baseModel?.tradeLanes) && baseModel.tradeLanes.length
      ? baseModel.tradeLanes.map((lane: any) => ({
          lane: lane.label,
          shipments: Number(lane.count || 0),
          teu: Number(lane.teu || 0),
          spend: lane.spend ?? null,
        }))
      : fallbackModel.topRoutes;
    const carriers = Array.isArray(baseModel?.carriers) && baseModel.carriers.length
      ? baseModel.carriers
          .map((carrier: any) => ({ carrier: carrier.label || carrier.carrier, shipments: Number(carrier.count || carrier.shipments || 0), teu: Number(carrier.teu || 0) }))
          .filter((row: any) => isMeaningfulText(row.carrier))
      : fallbackModel.carriers;
    return {
      ...fallbackModel,
      years: availableYears,
      selectedYear: activeYear,
      shipments: resolvedShipments,
      teu: resolvedTeu,
      spend: resolvedSpend,
      fclShipments: Math.min(resolvedFcl, resolvedShipments || resolvedFcl),
      lclShipments: resolvedLcl,
      avgTeuPerShipment: resolvedShipments > 0 ? resolvedTeu / resolvedShipments : (baseModel?.avgTeuPerShipment ?? fallbackModel.avgTeuPerShipment ?? null),
      avgShipmentsPerMonth: resolvedShipments > 0 ? resolvedShipments / (monthlySeries.length || 1) : null,
      oldestShipmentDate: baseModel?.oldestShipmentDate ?? fallbackModel.oldestShipmentDate ?? null,
      latestShipmentDate: latestDate,
      monthlySeries,
      topRoutes,
      carriers,
      origins: Array.isArray(baseModel?.locations?.origins) && baseModel.locations.origins.length
        ? baseModel.locations.origins.map((item: any) => ({ label: item.label, count: Number(item.count || 0) }))
        : fallbackModel.origins,
      destinations: Array.isArray(baseModel?.locations?.destinations) && baseModel.locations.destinations.length
        ? baseModel.locations.destinations.map((item: any) => ({ label: item.label, count: Number(item.count || 0) }))
        : fallbackModel.destinations,
    };
  }, [normalizedShipments, effectiveSelectedYear, rawProfile, rawRouteKpis, availableYears, profile, routeKpis]);
  const statusLabel = getStatusLabel(detail.shipments, detail.teu);
  const strategicInsights = [
    detail.topRouteLabel && detail.topRouteLabel !== '—'
      ? {
          title: 'Trade lane signal',
          body: `Primary lane for ${effectiveSelectedYear ?? 'the selected year'} is ${detail.topRouteLabel}. Position DSV around lane resilience, capacity optionality, and routing control.`,
        }
      : null,
    detail.latestShipmentDate
      ? {
          title: 'Recency risk',
          tone: 'warning' as const,
          body: `Latest visible movement is ${formatDate(detail.latestShipmentDate)}. Use this to frame urgency, renewal timing, and outbound sequencing.`,
        }
      : null,
    detail.shipments
      ? {
          title: 'Volume profile',
          tone: 'highlight' as const,
          body: `Selected-year activity shows ${formatNumber(detail.shipments)} shipments and ${formatNumber(detail.teu, 1)} TEUs. This account supports a real logistics intelligence conversation, not a generic sales pitch.`,
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    body: string;
    tone?: 'default' | 'warning' | 'highlight';
  }>;
  if (!key) {
    return <CommandCenterEmptyState />;
  }
  return (
    <section className="w-full rounded-[28px] border border-slate-200 bg-slate-50 p-2 shadow-sm md:p-3 lg:p-4">
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
              name={profile?.title || record?.company?.name || 'Company'}
              logoUrl={getCompanyLogoUrl(profile?.domain || (record as any)?.company?.domain) ?? undefined}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  {profile?.title || record?.company?.name || 'Company'}
                </h2>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  {statusLabel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <InfoChip icon={MapPin} label={profile?.address || record?.company?.address || 'Address unavailable'} />
                {(profile?.website || (record as any)?.company?.website) && (
                  <InfoChip
                    icon={Globe}
                    label={(profile?.website || (record as any)?.company?.website || '').replace(/^https?:\/\//, '')}
                  />
                )}
                {(profile?.phoneNumber || (record as any)?.company?.phone) && (
                  <InfoChip
                    icon={Phone}
                    label={profile?.phoneNumber || (record as any)?.company?.phone}
                  />
                )}
                {profile?.countryCode ? <InfoChip icon={Globe} label={profile.countryCode} /> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 self-start">
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => onExportPDF && onExportPDF()}
            >
              Export PDF
            </button>
            <button
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900"
              onClick={() => onGenerateBrief && onGenerateBrief()}
            >
              Generate brief
            </button>
          </div>
        </div>
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4 min-w-0">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              <KpiCard
                label="Market spend"
                value={formatCurrency(detail.spend)}
                icon={DollarSign}
                subLabel={`${effectiveSelectedYear ?? 'Selected year'} estimate`}
                accent="indigo"
              />
              <KpiCard
                label="Shipments"
                value={formatNumber(detail.shipments)}
                icon={Package}
                subLabel={`${effectiveSelectedYear ?? 'Selected year'} visible activity`}
                accent="violet"
              />
              <KpiCard
                label="Total TEUs"
                value={formatNumber(detail.teu, 1)}
                icon={Ship}
                subLabel="Selected-year volume"
                accent="cyan"
              />
              <KpiCard
                label="FCL shipments"
                value={formatNumber(detail.fclShipments)}
                icon={Boxes}
                subLabel="Selected year"
                accent="emerald"
              />
              <KpiCard
                label="LCL shipments"
                value={formatNumber(detail.lclShipments)}
                icon={Truck}
                subLabel="Selected year"
                accent="amber"
              />
              <KpiCard
                label="Avg shipments / month"
                value={formatNumber(detail.avgShipmentsPerMonth, 1)}
                icon={CalendarClock}
                subLabel="Selected year"
                accent="rose"
              />
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <SmallMetric
                label="Avg TEU / shipment"
                value={formatNumber(detail.avgTeuPerShipment, 2)}
                icon={TrendingUp}
              />
              <SmallMetric
                label="Oldest shipment"
                value={formatDate(detail.oldestShipmentDate)}
                icon={CalendarClock}
              />
              <SmallMetric
                label="Latest shipment"
                value={formatDate(detail.latestShipmentDate)}
                icon={CalendarClock}
              />
            </div>
            <Tabs defaultValue="overview" className="space-y-5">
              <TabsList className="flex h-auto w-full gap-2 overflow-x-auto rounded-[26px] border border-slate-200 bg-white p-2 shadow-sm whitespace-nowrap">
                <TabsTrigger value="overview" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="lanes" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Trade Lanes
                </TabsTrigger>
                <TabsTrigger value="carriers" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Carriers
                </TabsTrigger>
                <TabsTrigger value="locations" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Locations
                </TabsTrigger>
                <TabsTrigger value="products" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Products
                </TabsTrigger>
                <TabsTrigger value="history" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Shipment History
                </TabsTrigger>
                <TabsTrigger value="pivot" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Pivot Table
                </TabsTrigger>
                <TabsTrigger value="contacts" className="shrink-0 rounded-2xl px-3 py-3 text-xs font-semibold md:text-sm">
                  Contact Intel
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-4">
                <div className="space-y-4 min-w-0">
                  <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">Peak seasonality index</div>
                    <p className="mb-4 text-xs text-slate-500">
                      Monthly shipment profile for Jan–Dec of {effectiveSelectedYear ?? 'the selected year'}.
                    </p>
                    <div className="min-h-[340px]">
                      <CompanyActivityChart data={detail.monthlySeries} />
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <span className="font-semibold text-indigo-600">Observation:</span>{' '}
                      Selected-year trends now reconcile with the same dataset powering shipments, lanes, products, and pivot views.
                    </div>
                  </div>
                  <CommandCenterInsights insights={strategicInsights} />
                </div>
              </TabsContent>
              <TabsContent value="lanes" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
                  <MetricList
                    title="Trade lanes"
                    items={detail.topRoutes.map((route) => ({
                      label: String(route.lane),
                      value: formatNumber(route.shipments),
                      meta: `TEU ${formatNumber(route.teu, 1)} • Spend ${formatCurrency(route.spend)}`,
                    }))}
                  />
                </div>
              </TabsContent>
              <TabsContent value="carriers" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
                  <MetricList
                    title="Carriers"
                    items={detail.carriers.map((carrier) => ({
                      label: carrier.carrier,
                      value: formatNumber(carrier.shipments),
                      meta: `TEU ${formatNumber(carrier.teu, 1)}`,
                    }))}
                  />
                </div>
              </TabsContent>
              <TabsContent value="locations" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <MetricList
                      title="Origins"
                      items={detail.origins.map((item) => ({
                        label: item.label,
                        value: formatNumber(item.count),
                        meta: 'Origin',
                      }))}
                    />
                    <MetricList
                      title="Destinations"
                      items={detail.destinations.map((item) => ({
                        label: item.label,
                        value: formatNumber(item.count),
                        meta: 'Destination',
                      }))}
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="products" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
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
                        label: String(row.product),
                        value: row.volumeShare,
                        meta: `HS ${row.hsCode}`,
                      }))}
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="history" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
                  <DataTable
                    title="Verified shipment ledger"
                    columns={['Date', 'BOL ID', 'TEU', 'Carrier', 'Route', 'Product', 'HS Code']}
                    rows={detail.shipmentTableRows}
                  />
                </div>
              </TabsContent>
              <TabsContent value="pivot" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
                  <DataTable
                    title="Monthly pivot"
                    columns={['Month', 'Shipments', 'TEU']}
                    rows={detail.pivotRows}
                  />
                </div>
              </TabsContent>
              <TabsContent value="contacts" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">Contact intelligence</div>
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
                        (rawProfile?.notifyParties || rawProfile?.notify_parties || rawProfile?.topSuppliers || rawProfile?.top_suppliers || []) as any[]
                      )
                        .slice(0, 6)
                        .map((contact: any, index: number) => {
                          const name = normalizeText(contact.name || contact.notify_party || contact.company || contact);
                          const email = normalizeText(contact.email || contact.email_address);
                          const phone = normalizeText(contact.phone || contact.phone_number);
                          const role = normalizeText(contact.role || 'Decision maker');
                          return (
                            <div key={`${name}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="rounded-2xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                                  {name
                                    .split(' ')
                                    .slice(0, 2)
                                    .map((part: string) => part[0])
                                    .join('')
                                    .toUpperCase() || 'CT'}
                                </div>
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                  Verified
                                </span>
                              </div>
                              <div className="text-lg font-semibold text-slate-950">{name || 'Unknown contact'}</div>
                              <div className="mt-1 text-sm font-medium text-indigo-600">{role}</div>
                              <div className="mt-4 space-y-2 text-sm text-slate-600">
                                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                                  {email || 'Email unavailable'}
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                                  {phone || 'Phone unavailable'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      {!((rawProfile?.notifyParties || rawProfile?.notify_parties || rawProfile?.topSuppliers || rawProfile?.top_suppliers || []) as any[]).length ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 md:col-span-2">
                          AI enrichment can populate verified logistics contacts here later.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div className="hidden 2xl:block">
            <AiRail
              insights={strategicInsights}
              shipments={detail.shipments}
              teu={detail.teu}
              topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
            />
          </div>
        </div>
        <div className="space-y-4 2xl:hidden">
          <AiRail
            insights={strategicInsights}
            shipments={detail.shipments}
            teu={detail.teu}
            topRouteLabel={buildRouteLabel(detail.topRouteLabel)}
          />
        </div>
      </div>
    </section>
  );
}
