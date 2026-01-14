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
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  IyCompanyProfile,
  IyRouteKpis,
} from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import CommandCenterKpiCard from "./CommandCenterKpiCard";
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

const formatNumber = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
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

const buildRouteLabel = (value?: string | null) => {
  if (!value) return "—";
  return value;
};

const deriveRouteFromShipment = (shipment?: {
  origin_port?: string | null;
  destination_port?: string | null;
}) => {
  if (!shipment) return null;
  if (!shipment.origin_port && !shipment.destination_port) return null;
  if (shipment.origin_port && shipment.destination_port) {
    return `${shipment.origin_port} → ${shipment.destination_port}`;
  }
  return shipment.origin_port ?? shipment.destination_port ?? null;
};

const buildActivitySeries = (
  kpis?: IyRouteKpis | null,
  profile?: IyCompanyProfile | null,
) => {
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

const findLoadValue = (
  profile?: IyCompanyProfile | null,
  type?: "FCL" | "LCL",
) => {
  if (!profile?.containersLoad) return null;
  const entry = profile.containersLoad.find(
    (item) => item.load_type?.toUpperCase() === type,
  );
  return entry?.shipments ?? null;
};

const getRecordKey = (record: CommandCenterRecord | null) =>
  record?.company?.company_id ?? record?.company?.name ?? null;

const InfoChip = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
    <Icon className="h-3.5 w-3.5" />
    <span className="truncate">{label}</span>
  </span>
);

const KpiCard = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) => (
  <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      {label}
    </div>
    <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
  </div>
);

export default function CompanyDetailPanel({
  record,
  profile,
  routeKpis,
  loading,
  error,
}: CompanyDetailPanelProps) {
  const key = getRecordKey(record);

  const activitySeries = useMemo(
    () => buildActivitySeries(routeKpis, profile),
    [routeKpis, profile],
  );

  const shipments12m =
    routeKpis?.shipmentsLast12m ??
    profile?.totalShipments ??
    record?.company?.kpis?.shipments_12m ??
    null;
  const teu12m = routeKpis?.teuLast12m ?? null;
  const estSpend = routeKpis?.estSpendUsd ?? null;
  const fclShipments = routeKpis?.topRoutesLast12m
    ? null
    : findLoadValue(profile, "FCL");
  const lclShipments = routeKpis?.topRoutesLast12m
    ? null
    : findLoadValue(profile, "LCL");
  const recentShipmentDate =
    profile?.lastShipmentDate ??
    record?.company?.kpis?.last_activity ??
    record?.shipments?.[0]?.date ??
    null;

  const topRouteLabel =
    routeKpis?.topRouteLast12m ||
    profile?.topRoutes?.[0]?.label ||
    deriveRouteFromShipment(record?.shipments?.[0]) ||
    null;
  const recentRouteLabel =
    routeKpis?.mostRecentRoute ||
    profile?.mostRecentRoute?.label ||
    deriveRouteFromShipment(record?.shipments?.[0]) ||
    null;

  const insights = [
    topRouteLabel
      ? {
          title: "Opportunities",
          body: `Top lane ${topRouteLabel} has ${
            routeKpis?.topRoutesLast12m?.[0]?.shipments
              ? formatNumber(routeKpis.topRoutesLast12m[0].shipments)
              : "meaningful"
          } shipments in the last 12 months.`,
        }
      : null,
    recentRouteLabel
      ? {
          title: "Risks",
          tone: "warning" as const,
          body: `Recent shipment (${formatDate(
            recentShipmentDate,
          )}) ran ${recentRouteLabel}. Validate carrier performance before pitching.`,
        }
      : null,
    shipments12m
      ? {
          title: "Pre-call notes",
          tone: "highlight" as const,
          body: `Bring a point of view on ${
            formatNumber(shipments12m) ?? "—"
          } shipments in the past year and how DSV can optimize Asia → US flows.`,
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {loading && (
        <div className="mb-4 text-sm text-slate-500">Loading company profile…</div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <CompanyAvatar
            name={profile?.title || record?.company?.name || "Company"}
            logoUrl={
              getCompanyLogoUrl(
                profile?.domain || (record as any)?.company?.domain,
              ) ?? undefined
            }
            size="lg"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              {(profile?.title || record?.company?.name || "Company").toUpperCase()}
            </p>
            <p className="text-sm text-slate-600">
              {profile?.address || record?.company?.address || "Address unavailable"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile?.website && (
                <InfoChip icon={Globe} label={profile.website.replace(/^https?:\/\//, "")} />
              )}
              {profile?.phoneNumber && <InfoChip icon={Phone} label={profile.phoneNumber} />}
              {profile?.countryCode && (
                <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                  {profile.countryCode}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Export PDF
          </button>
          <button className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
            Generate brief
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Shipments (12m)" value={formatNumber(shipments12m)} icon={Package} />
        <KpiCard label="TEU (12m)" value={formatNumber(teu12m)} icon={Ship} />
        <KpiCard label="Est. spend (12m)" value={formatCurrency(estSpend)} icon={DollarSign} />
        <KpiCard label="FCL shipments" value={formatNumber(fclShipments)} icon={Layers} />
        <KpiCard label="LCL shipments" value={formatNumber(lclShipments)} icon={Boxes} />
        <KpiCard label="Recent shipment" value={formatDate(recentShipmentDate)} icon={CalendarClock} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Top route (last 12m)
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {buildRouteLabel(topRouteLabel)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent route
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {buildRouteLabel(recentRouteLabel)}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-900">
          Activity last 12 months
        </h3>
        <p className="text-xs text-slate-500">
          Monthly shipments split between FCL and LCL services.
        </p>
        <CompanyActivityChart data={activitySeries} />
      </div>

      <CommandCenterInsights insights={insights} />
    </section>
  );
}
