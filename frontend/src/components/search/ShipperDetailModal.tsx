import React from "react";
import {
  Archive,
  Box,
  DollarSign,
  Globe,
  Phone,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import MonthlyFclLclChart from "@/components/charts/MonthlyFclLclChart";
import type { IyRouteKpis, IyShipperHit } from "@/lib/api";

type ShipperDetailModalProps = {
  isOpen: boolean;
  shipper: IyShipperHit | null;
  routeKpis: IyRouteKpis | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSaveToCommandCenter: (shipper: IyShipperHit) => void;
  saveLoading: boolean;
};

type ExtendedRouteKpis = IyRouteKpis & {
  estSpendUsd?: number | null;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const EMPTY_MONTHLY = MONTH_LABELS.map((month) => ({ month, fcl: 0, lcl: 0 }));

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function normalizeSuppliers(list: IyShipperHit["topSuppliers"]): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry: any) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const nameCandidate =
          entry.name ??
          entry.supplier_name ??
          entry.company ??
          entry.title ??
          "";
        return typeof nameCandidate === "string"
          ? nameCandidate.trim()
          : "";
      }
      return "";
    })
    .filter((value) => Boolean(value)) as string[];
}

function normalizeWebsite(website?: string | null, domain?: string | null) {
  const raw = website && website.trim().length ? website : domain || null;
  if (!raw) return undefined;
  if (/^https?:/i.test(raw)) return raw;
  return `https://${raw}`;
}

type KpiItem = {
  key: string;
  title: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
};

export default function ShipperDetailModal({
  isOpen,
  shipper,
  routeKpis,
  loading,
  error,
  onClose,
  onSaveToCommandCenter,
  saveLoading,
}: ShipperDetailModalProps) {
  if (!isOpen || !shipper) return null;

  const {
    title,
    countryCode,
    address,
    website,
    phone,
    domain,
    totalShipments,
    mostRecentShipment,
    topSuppliers,
  } = shipper;

  const kpis = (routeKpis as ExtendedRouteKpis | null) ?? null;

  const shipments12m =
    (kpis?.shipmentsLast12m ?? null) ??
    (typeof totalShipments === "number" ? totalShipments : null);
  const teu12m = kpis?.teuLast12m ?? null;
  const estSpendUsd = kpis?.estSpendUsd ?? null;
  const sampleSize = kpis?.sampleSize ?? null;

  const monthlyData = routeKpis?.monthly ?? EMPTY_MONTHLY;
  const hasMonthlyData = Boolean(
    routeKpis?.monthly?.some((point) => point.fcl > 0 || point.lcl > 0),
  );

  const supplierList = normalizeSuppliers(topSuppliers);
  const normalizedWebsite = normalizeWebsite(website, domain);
  const companyInitial =
    typeof title === "string" && title.trim().length
      ? title.trim().charAt(0).toUpperCase()
      : "C";

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter(shipper);
  };

  const kpiItems: KpiItem[] = [
    {
      key: "shipments",
      title: "Shipments (12m)",
      value: formatNumber(shipments12m),
      helper: mostRecentShipment
        ? `Last shipment: ${formatDate(mostRecentShipment)}`
        : undefined,
      icon: Archive,
    },
    {
      key: "total",
      title: "Total shipments",
      value: formatNumber(totalShipments as number | null | undefined),
      helper: countryCode ? `Country: ${countryCode}` : undefined,
      icon: Truck,
    },
    {
      key: "teu",
      title: "TEU (12m)",
      value: formatNumber(teu12m),
      helper: sampleSize ? `Sample size: ${formatNumber(sampleSize)}` : undefined,
      icon: Box,
    },
    {
      key: "spend",
      title: "Est. spend (12m)",
      value: formatCurrency(estSpendUsd),
      helper: "Source: ImportYeti",
      icon: DollarSign,
    },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-4 py-6">
      <div className="relative mt-6 mb-6 flex w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl max-h-[min(720px,100vh-3rem)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
        >
          <span className="sr-only">Close</span>
          <X className="h-4 w-4" />
        </button>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white">
                {companyInitial}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {title || "Company"}
                  </h2>
                  {countryCode && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-700">
                      {countryCode}
                    </span>
                  )}
                </div>
                {address && (
                  <p className="text-xs text-slate-500">{address}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  {normalizedWebsite && (
                    <a
                      href={normalizedWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-indigo-600 hover:underline"
                    >
                      {normalizedWebsite.replace(/^https?:\/\//i, "")}
                    </a>
                  )}
                  {phone && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Phone className="h-3.5 w-3.5" />
                      {phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={saveLoading}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveLoading ? "Saving…" : "Save to Command Center"}
              </button>
              {normalizedWebsite && (
                <a
                  href={normalizedWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Globe className="mr-1 h-3.5 w-3.5" /> View site
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 md:px-8 md:py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpiItems.map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {item.value}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                    <item.icon className="h-[18px] w-[18px]" />
                  </div>
                </div>
                {item.helper && (
                  <p className="mt-1 text-[11px] text-slate-500">{item.helper}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Monthly ocean mix (last 12m)
                    </p>
                    <p className="text-xs text-slate-500">
                      Split between FCL and LCL shipments for each month.
                    </p>
                  </div>
                  {loading && (
                    <p className="text-xs text-slate-400">Loading trend…</p>
                  )}
                </div>
                {error && (
                  <p className="mb-2 text-xs text-rose-500">
                    {error || "Failed to load shipment KPIs."}
                  </p>
                )}

                <MonthlyFclLclChart data={monthlyData} />

                {!hasMonthlyData && !loading && (
                  <p className="mt-3 text-xs text-slate-500">
                    Monthly data is not available for this shipper yet.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top suppliers
                </p>
                {supplierList.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Supplier insights will appear once ImportYeti surfaces
                    them for this shipper.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {supplierList.slice(0, 6).map((supplier) => (
                      <li key={supplier} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        <span className="truncate">{supplier}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-xs text-slate-500">
                <p className="font-medium text-slate-700">What you’re seeing</p>
                <p className="mt-1">
                  KPIs and charts are powered by ImportYeti shipment data. As
                  additional shipment stats become available, they will surface
                  automatically here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
