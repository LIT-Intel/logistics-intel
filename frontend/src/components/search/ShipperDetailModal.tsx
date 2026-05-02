import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Bookmark,
  MapPin,
  Globe,
  Phone,
  ArrowRight,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import LitFlag from "@/components/ui/LitFlag";
import { formatLaneShort, resolveEndpoint } from "@/lib/laneGlobe";
import {
  type IyCompanyProfile,
  type IyRouteKpis,
} from "@/lib/api";
import {
  formatSafeShipmentDate,
  parseImportYetiDate,
} from "@/lib/dateUtils";

// Phase B.12 — popup Shipments-tab date parser. ImportYeti delivers
// `date_formatted` as DD/MM/YYYY, which `new Date()` mis-parses in the
// US locale (treats it as MM/DD/YYYY, e.g. "13/04/2026" → Invalid Date),
// dropping a real shipment row to "—". `formatSafeShipmentDate` already
// runs the input through `parseImportYetiDate` + the 24h future-cap, so
// we route the row date through it. The sort helper below converts a
// raw value to a comparable timestamp (0 for unparseable) so newest
// shipments float to the top and "Unknown" rows sink.
function parseShipmentDateForSort(raw: string | null | undefined): number {
  if (!raw) return 0;
  const trimmed = String(raw).trim();
  if (!trimmed) return 0;
  const iy = parseImportYetiDate(trimmed);
  if (iy) {
    const d = new Date(iy);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const native = new Date(trimmed);
  return Number.isNaN(native.getTime()) ? 0 : native.getTime();
}

type SearchPreviewShipper = {
  id?: string;
  key?: string;
  companyId?: string;
  company_id?: string;
  importyeti_key?: string;
  name?: string;
  title?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  last_shipment?: string;
  shipments?: number;
  shipments_12m?: number;
  teu_estimate?: number;
  top_suppliers?: string[];
};

type ShipmentRow = {
  date: string | null;
  bol: string | null;
  route: string | null;
  origin: string | null;
  destination: string | null;
  teu: number | null;
};

type Props = {
  isOpen: boolean;
  shipper: SearchPreviewShipper | null;
  profile: IyCompanyProfile | null;
  routeKpis: IyRouteKpis | null;
  enrichment?: any | null;
  loadingProfile?: boolean;
  saveLoading?: boolean;
  isSaved?: boolean;
  year?: number;
  error?: string | null;
  contacts?: Contact[];
  loadingContacts?: boolean;
  onClose: () => void;
  onSaveToCommandCenter?: () => void;
};

type TabKey = "overview" | "routes" | "shipments" | "contacts" | "equipment";

type Contact = {
  id: string;
  full_name: string | null;
  email: string | null;
  title: string | null;
  department: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  phone: string | null;
};

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function titleCaseMonth(monthKey: string): string {
  if (!monthKey) return "";
  if (/^\d{4}-\d{2}$/.test(monthKey)) {
    const [year, month] = monthKey.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString("en-US", { month: "short" });
  }
  return monthKey;
}

function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function fullNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function currencyCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function buildLocationLine(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string {
  const address =
    profile?.address ||
    shipper?.address ||
    [shipper?.city, shipper?.state, shipper?.country].filter(Boolean).join(", ");

  return address || "Location unavailable";
}

function buildWebsite(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string | null {
  return profile?.website || shipper?.website || profile?.domain || null;
}

function buildPhone(profile: IyCompanyProfile | null): string | null {
  return (profile as any)?.phoneNumber || (profile as any)?.phone || null;
}

function buildShipments12m(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null, routeKpis: IyRouteKpis | null): number | null {
  return (
    safeNumber(routeKpis?.shipmentsLast12m) ??
    safeNumber(profile?.routeKpis?.shipmentsLast12m) ??
    safeNumber(shipper?.shipments_12m) ??
    safeNumber(shipper?.shipments) ??
    safeNumber(profile?.totalShipments) ??
    null
  );
}

function buildTeu12m(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null, routeKpis: IyRouteKpis | null): number | null {
  return (
    safeNumber(routeKpis?.teuLast12m) ??
    safeNumber(profile?.routeKpis?.teuLast12m) ??
    safeNumber(shipper?.teu_estimate) ??
    null
  );
}

function buildFclLcl(profile: IyCompanyProfile | null): string {
  const fcl12m =
    safeNumber((profile as any)?.containers?.fclShipments12m) ??
    safeNumber((profile as any)?.fcl_count_12m) ??
    0;
  const lcl12m =
    safeNumber((profile as any)?.containers?.lclShipments12m) ??
    safeNumber((profile as any)?.lcl_count_12m) ??
    0;

  if (!fcl12m && !lcl12m) {
    const fclAllTime = safeNumber((profile as any)?.fcl_shipments_all_time);
    const lclAllTime = safeNumber((profile as any)?.lcl_shipments_all_time);
    if (fclAllTime != null || lclAllTime != null) {
      return `${fullNumber(fclAllTime ?? 0)} / ${fullNumber(lclAllTime ?? 0)}`;
    }
    return "—";
  }

  return `${fullNumber(fcl12m)} / ${fullNumber(lcl12m)}`;
}

function buildLastShipment(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string | null {
  return (
    profile?.lastShipmentDate ||
    shipper?.last_shipment ||
    null
  );
}

function buildMonthlyChartData(profile: IyCompanyProfile | null, selectedYear?: number) {
  const monthlyTotals = Array.isArray((profile as any)?.monthly_totals)
    ? (profile as any).monthly_totals
    : [];

  if (monthlyTotals.length > 0) {
    return monthlyTotals
      .filter((row: any) => !selectedYear || Number(row?.year) === Number(selectedYear))
      .map((row: any) => {
        const total = safeNumber(row?.shipments) ?? 0;
        const fcl = safeNumber(row?.fcl_shipments ?? row?.fcl) ?? Math.round(total * 0.65);
        const lcl = safeNumber(row?.lcl_shipments ?? row?.lcl) ?? Math.max(0, total - fcl);
        return {
          month: titleCaseMonth(`${row?.year}-${String(row?.month).padStart(2, "0")}`),
          shipments: total,
          teu: safeNumber(row?.teu) ?? 0,
          fcl,
          lcl,
        };
      });
  }

  const timeSeries = Array.isArray(profile?.timeSeries) ? profile.timeSeries : [];
  return timeSeries
    .filter((row: any) => !selectedYear || Number(row?.year) === Number(selectedYear))
    .map((row: any) => {
      const total = safeNumber(row?.shipments) ?? 0;
      const fcl = safeNumber(row?.fcl_shipments ?? row?.fcl) ?? Math.round(total * 0.65);
      const lcl = safeNumber(row?.lcl_shipments ?? row?.lcl) ?? Math.max(0, total - fcl);
      return {
        month: titleCaseMonth(row?.month || ""),
        shipments: total,
        teu: safeNumber(row?.teu) ?? 0,
        fcl,
        lcl,
      };
    });
}

function buildRoutes(profile: IyCompanyProfile | null, routeKpis: IyRouteKpis | null) {
  const source =
    routeKpis?.topRoutesLast12m ||
    profile?.routeKpis?.topRoutesLast12m ||
    (Array.isArray((profile as any)?.top_routes) ? (profile as any).top_routes : []);

  return (Array.isArray(source) ? source : [])
    .map((row: any) => ({
      route: row?.route || "Unknown route",
      shipments: safeNumber(row?.shipments) ?? 0,
      teu: safeNumber(row?.teu) ?? 0,
      fcl: safeNumber(row?.fclShipments ?? row?.fcl_shipments) ?? 0,
      lcl: safeNumber(row?.lclShipments ?? row?.lcl_shipments) ?? 0,
    }))
    .filter((row) => row.route && row.route !== "Unknown → Unknown");
}

function buildShipmentRows(profile: IyCompanyProfile | null): ShipmentRow[] {
  const recentBols = Array.isArray((profile as any)?.recent_bols)
    ? (profile as any).recent_bols
    : Array.isArray(profile?.recentBols)
      ? profile.recentBols
      : [];

  return recentBols.map((row: any) => {
    const raw = row?.raw || row || {};
    const date =
      row?.date ||
      raw?.date_formatted ||
      raw?.date ||
      raw?.arrival_date ||
      null;

    const route =
      row?.route ||
      raw?.shipping_route ||
      raw?.route ||
      null;

    const origin =
      row?.origin ||
      raw?.origin_port ||
      raw?.origin ||
      raw?.supplier_address_loc ||
      raw?.origin_city ||
      null;

    const destination =
      row?.destination ||
      raw?.destination_port ||
      raw?.destination ||
      raw?.company_address_loc ||
      raw?.destination_city ||
      null;

    return {
      date,
      bol:
        row?.bolNumber ||
        raw?.bol_number ||
        raw?.bol ||
        raw?.bill_of_lading_number ||
        null,
      route,
      origin,
      destination,
      teu:
        safeNumber(row?.teu) ??
        safeNumber(raw?.TEU) ??
        safeNumber(raw?.teu) ??
        safeNumber(raw?.total_teu) ??
        null,
    };
  });
}

function buildSuppliers(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string[] {
  const profileSuppliers = Array.isArray(profile?.topSuppliers) ? profile.topSuppliers : [];
  const shipperSuppliers = Array.isArray(shipper?.top_suppliers) ? shipper.top_suppliers : [];
  return [...new Set([...profileSuppliers, ...shipperSuppliers])].filter(Boolean).slice(0, 6);
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className={`group transition-all hover:-translate-y-0.5 ${accent}`}
      style={{
        background: 'linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)',
        border: '1px solid #E5E7EB',
        borderRadius: 14,
        padding: 16,
        boxShadow: '0 8px 30px rgba(15,23,42,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.09em',
          textTransform: 'uppercase', color: '#94a3b8',
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 22, fontWeight: 700, color: '#1d4ed8', letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ShipperDetailModal({
  isOpen,
  shipper,
  profile,
  routeKpis,
  loadingProfile = false,
  saveLoading = false,
  isSaved = false,
  year,
  error,
  contacts = [],
  loadingContacts = false,
  onClose,
  onSaveToCommandCenter,
}: Props) {
  const navigate = useNavigate();

  const companyName = shipper?.name || shipper?.title || profile?.title || "Company";
  const website = buildWebsite(shipper || {}, profile);
  const phone = buildPhone(profile);
  const locationLine = buildLocationLine(shipper || {}, profile);

  const shipments12m = buildShipments12m(shipper || {}, profile, routeKpis);
  const teu12m = buildTeu12m(shipper || {}, profile, routeKpis);
  const fclLcl = buildFclLcl(profile);
  const lastShipment = buildLastShipment(shipper || {}, profile);

  const chartData = useMemo(
    () => buildMonthlyChartData(profile, year),
    [profile, year],
  );

  const routeRows = useMemo(
    () => buildRoutes(profile, routeKpis),
    [profile, routeKpis],
  );

  const suppliers = useMemo(
    () => buildSuppliers(shipper || {}, profile),
    [shipper, profile],
  );

  if (!isOpen || !shipper) return null;

  // Resolve a slug for the deep-link target. Search rows carry
  // `importyeti_key` like "company/acme-industries"; CRM rows carry a
  // raw `company_id`. Either is a valid /app/companies/:id path.
  const commandCenterSlug =
    (shipper as any)?.importyeti_key ||
    shipper?.id ||
    shipper?.companyId ||
    shipper?.company_id ||
    null;

  // Strip the legacy "company/" prefix the IY proxy attaches; the route
  // expects a bare slug.
  const ccTarget = commandCenterSlug
    ? String(commandCenterSlug).replace(/^company\//, "")
    : null;

  const handleOpenInCommandCenter = () => {
    if (!ccTarget) return;
    onClose();
    navigate(`/app/companies/${encodeURIComponent(ccTarget)}`);
  };

  // Pre-compute the top 3 lanes with city + ISO-code labels (matches
  // the format used everywhere else in the app — Dashboard, Profile,
  // ActivityCard).
  const slimLanes = routeRows.slice(0, 3).map((row) => {
    const short = formatLaneShort(row.route);
    return {
      label: row.route,
      shipments: row.shipments,
      from: short?.fromLabel || row.route,
      fromCode: short?.fromCountryCode || null,
      fromCountry: short?.fromCountryName || null,
      to: short?.toLabel || "",
      toCode: short?.toCountryCode || null,
      toCountry: short?.toCountryName || null,
    };
  });

  // Tiny 12-month sparkline data; we just need the magnitude per month.
  const sparkData = chartData.slice(-12).map((row: any) => ({
    month: row.month,
    value: Number(row.shipments) || 0,
  }));
  const sparkMax = Math.max(1, ...sparkData.map((d) => d.value));

  return (
    // Right-anchored preview drawer — tighter than the previous
    // tabbed modal, intentionally feels like an "appetizer" that
    // funnels the user into the Command Center company profile.
    // Backdrop click closes; the drawer itself stops propagation.
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-slate-950/45"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-[#F8FAFC] shadow-[0_24px_60px_rgba(15,23,42,0.35)] sm:max-w-[440px] xl:max-w-[480px]"
        style={{ borderLeft: "1px solid #E5E7EB" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cyan/blue accent strip — same hue family as the Pulse Coach
            card so the surfaces feel related. */}
        <div
          style={{
            height: 3,
            background:
              "linear-gradient(90deg,#0F172A 0%,#1E293B 50%,#00F0FF 100%)",
            flexShrink: 0,
          }}
        />

        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <CompanyAvatar
            name={companyName}
            domain={website || null}
            size="sm"
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="font-display truncate text-[14px] font-bold tracking-tight text-slate-900">
                {companyName}
              </h2>
              <span className="font-display inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-slate-500">
                {shipper?.country_code || (profile as any)?.countryCode || "US"}
              </span>
            </div>
            <div className="font-body mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{locationLine}</span>
              </span>
              {website && (
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">
                    {website.replace(/^https?:\/\//, "")}
                  </span>
                </span>
              )}
              {phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-2.5 w-2.5 shrink-0" />
                  <span>{phone}</span>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadingProfile ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
              <Loader2 className="mb-2 h-5 w-5 animate-spin text-slate-400" />
              <div className="font-display text-[12px] font-semibold text-slate-700">
                Loading preview…
              </div>
              <div className="font-body mt-1 text-[10.5px] text-slate-400">
                Pulling shipment intelligence
              </div>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">
              {error}
            </div>
          ) : (
            <div className="space-y-3">
              {/* 4-up KPI strip */}
              <div className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-r border-slate-100 px-3 py-2">
                  <div className="font-display text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Shipments 12m
                  </div>
                  <div className="font-mono mt-0.5 text-[15px] font-bold text-slate-900">
                    {fullNumber(shipments12m)}
                  </div>
                </div>
                <div className="border-b border-slate-100 px-3 py-2">
                  <div className="font-display text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    TEU 12m
                  </div>
                  <div className="font-mono mt-0.5 text-[15px] font-bold text-slate-900">
                    {fullNumber(teu12m)}
                  </div>
                </div>
                <div className="border-r border-slate-100 px-3 py-2">
                  <div className="font-display text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Last shipment
                  </div>
                  <div className="font-body mt-0.5 truncate text-[12px] font-semibold text-slate-700">
                    {formatSafeShipmentDate(lastShipment, "—")}
                  </div>
                </div>
                <div className="px-3 py-2">
                  <div className="font-display text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    FCL / LCL
                  </div>
                  <div className="font-mono mt-0.5 text-[12px] font-semibold text-slate-700">
                    {fclLcl}
                  </div>
                </div>
              </div>

              {/* 12-month sparkline */}
              {sparkData.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="font-display mb-1.5 flex items-center justify-between text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    <span>Last 12 months</span>
                    <span className="font-mono normal-case tracking-normal text-slate-400">
                      shipments
                    </span>
                  </div>
                  <div className="flex h-12 items-end gap-[3px]">
                    {sparkData.map((d, i) => {
                      const h = Math.max(2, Math.round((d.value / sparkMax) * 100));
                      return (
                        <div
                          key={`${d.month}-${i}`}
                          className="flex-1 rounded-t-sm"
                          style={{
                            height: `${h}%`,
                            background:
                              "linear-gradient(180deg,#0F172A 0%,#1E293B 100%)",
                          }}
                          title={`${d.month}: ${d.value.toLocaleString()}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top lanes */}
              {slimLanes.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="font-display border-b border-slate-100 px-3 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Top lanes
                  </div>
                  <div>
                    {slimLanes.map((l, i) => (
                      <div
                        key={`${l.label}-${i}`}
                        className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5 last:border-b-0"
                      >
                        <span
                          className="inline-flex min-w-0 items-center gap-1.5 truncate"
                          title={l.label}
                        >
                          {l.fromCode && (
                            <LitFlag
                              code={l.fromCode}
                              size={12}
                              label={l.fromCountry || l.from}
                            />
                          )}
                          <span className="font-mono truncate text-[11px] font-semibold text-slate-800">
                            {l.from}
                          </span>
                          <ArrowRight className="h-2.5 w-2.5 shrink-0 text-slate-300" />
                          {l.toCode && (
                            <LitFlag
                              code={l.toCode}
                              size={12}
                              label={l.toCountry || l.to}
                            />
                          )}
                          <span className="font-mono truncate text-[11px] font-semibold text-slate-800">
                            {l.to}
                          </span>
                        </span>
                        <span className="font-mono shrink-0 text-[11px] font-bold text-slate-700">
                          {fullNumber(l.shipments)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top suppliers */}
              {suppliers.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="font-display mb-1.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Top suppliers
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {suppliers.slice(0, 5).map((s, i) => (
                      <span
                        key={`${s}-${i}`}
                        className="font-display inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                      >
                        {s}
                      </span>
                    ))}
                    {suppliers.length > 5 && (
                      <span className="font-mono inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                        +{suppliers.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Contacts teaser — only render the count, full list lives
                  in the Command Center contacts tab */}
              {contacts && contacts.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="font-body text-[11px] text-slate-500">
                    {contacts.length} verified contact
                    {contacts.length === 1 ? "" : "s"} on file
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenInCommandCenter}
                    disabled={!ccTarget}
                    className="font-display inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 transition hover:text-blue-800 disabled:opacity-40"
                  >
                    Manage in Command Center
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer — primary CTA mirrors the Pulse Coach card
            styling so the two surfaces feel like siblings. Save is a
            small secondary action; the drawer's whole job is to push
            the user to the full Command Center page. */}
        <div className="sticky bottom-0 z-10 flex shrink-0 items-center gap-1.5 border-t border-slate-200 bg-white px-3 py-2.5 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
          <button
            type="button"
            onClick={handleOpenInCommandCenter}
            disabled={!ccTarget || loadingProfile}
            className="font-display group/btn relative inline-flex h-10 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-white/10 text-[12px] font-semibold text-white shadow-[0_6px_20px_rgba(15,23,42,0.25)] transition hover:shadow-[0_10px_28px_rgba(15,23,42,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-8 -right-8 h-20 w-20 rounded-full opacity-70"
              style={{
                background:
                  "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
              }}
            />
            <span className="relative">Open in Command Center</span>
            <ArrowRight
              className="relative h-3.5 w-3.5"
              style={{ color: "#00F0FF" }}
            />
          </button>

          <button
            type="button"
            onClick={onSaveToCommandCenter}
            disabled={saveLoading || isSaved}
            title={isSaved ? "Saved" : "Save to Command Center"}
            className={[
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition",
              isSaved
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              (saveLoading || isSaved) && "cursor-default",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {saveLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bookmark
                className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
