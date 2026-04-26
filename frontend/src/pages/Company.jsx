import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Globe,
  Loader2,
  MapPin,
  Package,
  Plus,
  Ship,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import { getSavedCompanyDetail, buildYearScopedProfile } from "@/lib/api";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";
import { resolveEndpoint, flagFromCode } from "@/lib/laneGlobe";

// Sidebar navy from docs/design-specs/lit-design-system/colors_and_type.css
// (--color-sidebar-bg). Used as an *accent* on the hero — never a takeover.
const SIDEBAR_NAVY = "#081225";

function buildRouteFlagPair(routeLabel) {
  if (!routeLabel) return null;
  const cleaned = String(routeLabel).trim();
  if (!cleaned || cleaned === "—") return null;
  const parts = cleaned.split(/→|->|>/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const fromMeta = resolveEndpoint(parts[0]);
  const toMeta = resolveEndpoint(parts[1]);
  return {
    from: parts[0],
    to: parts[1],
    fromFlag: fromMeta?.flag || "",
    toFlag: toMeta?.flag || "",
    label: cleaned,
  };
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function estimateMarketSpend(teu, fclTeu = null, lclTeu = null) {
  const total = Number(teu);
  if (!total || total <= 0) return null;
  if (fclTeu != null && lclTeu != null) {
    return Math.round(Number(fclTeu) * 1850 + Number(lclTeu) * 850);
  }
  const inferredFcl = total * 0.85;
  const inferredLcl = total * 0.15;
  return Math.round(inferredFcl * 1850 + inferredLcl * 850);
}

function capDateAtToday(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed <= new Date() ? value : null;
}

function normalizeDateValue(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function getNestedValue(obj, path) {
  let current = obj;
  for (const key of path) {
    if (current == null) return null;
    current = current[key];
  }
  return current ?? null;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function getShipmentDateValue(shipment) {
  const candidates = [shipment, shipment?.raw, shipment?.raw?.shipment, shipment?.raw?.data];
  const paths = [
    ["bill_of_lading_date"],
    ["bill_of_lading_date_formatted"],
    ["arrival_date"],
    ["shipment_date"],
    ["date"],
    ["estimated_arrival"],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const path of paths) {
      const value = getNestedValue(candidate, path);
      const normalized = normalizeDateValue(value);
      const capped = capDateAtToday(normalized);
      if (capped) return capped;
    }
  }
  return null;
}

function getLatestShipmentFromProfile(profile) {
  const directLatest = normalizeDateValue(
    pickFirstValue(profile?.lastShipmentDate, profile?.last_shipment_date),
  );
  const safeDirectLatest = capDateAtToday(directLatest);
  if (safeDirectLatest) return safeDirectLatest;

  const shipments =
    profile?.recentBols ||
    profile?.recent_bols ||
    profile?.bols ||
    profile?.shipments ||
    [];
  if (!Array.isArray(shipments) || shipments.length === 0) return null;

  const validDates = shipments
    .map(getShipmentDateValue)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return validDates[0] || null;
}

function getStoredSelectedCompany() {
  try {
    const raw = localStorage.getItem("lit:selectedCompany");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildShellCompany(companyId, stored) {
  if (!companyId && !stored) return null;

  return {
    companyId: companyId || stored?.company_id || stored?.source_company_key || null,
    name: stored?.name || stored?.title || "Company",
    address: stored?.address || null,
    countryCode: stored?.country_code || stored?.countryCode || null,
    domain: stored?.domain || null,
    website: stored?.website || null,
    phone: stored?.phone || null,
    kpis: {
      shipments: stored?.kpis?.shipments_12m ?? stored?.shipments_12m ?? null,
      teu: stored?.kpis?.teu_12m ?? stored?.teu_12m ?? null,
      spend: stored?.kpis?.est_spend_12m ?? stored?.est_spend_12m ?? null,
      latestShipment: stored?.kpis?.last_activity ?? stored?.last_activity ?? null,
      topRoute: stored?.kpis?.top_route_12m ?? stored?.top_route_12m ?? null,
      recentRoute: stored?.kpis?.recent_route ?? stored?.recent_route ?? null,
    },
  };
}

function HeroKpiCard({ icon: Icon, label, value, tone = "default" }) {
  const toneMap = {
    default: { text: "text-slate-500", ring: "ring-slate-200", bg: "bg-slate-50" },
    emerald: { text: "text-emerald-600", ring: "ring-emerald-100", bg: "bg-emerald-50" },
    cyan: { text: "text-cyan-600", ring: "ring-cyan-100", bg: "bg-cyan-50" },
    violet: { text: "text-violet-600", ring: "ring-violet-100", bg: "bg-violet-50" },
    amber: { text: "text-amber-600", ring: "ring-amber-100", bg: "bg-amber-50" },
  };
  const t = toneMap[tone] || toneMap.default;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${t.bg} ${t.ring}`}
      >
        <Icon className={`h-5 w-5 ${t.text}`} />
      </div>
      <div className="min-w-0">
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {label}
        </div>
        <div
          className="mt-1 truncate text-xl font-bold tracking-tight text-slate-950 md:text-2xl"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function HeroRoutePill({ kind, routeLabel, loading }) {
  const flagPair = buildRouteFlagPair(routeLabel);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-600"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {kind === "top" ? "Top route · 12m" : "Most recent route"}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {flagPair ? (
          <>
            <span aria-hidden className="text-base leading-none">
              {flagPair.fromFlag || "🌐"}
            </span>
            <span className="truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {flagPair.from}
            </span>
            <span className="shrink-0 text-slate-400">→</span>
            <span aria-hidden className="text-base leading-none">
              {flagPair.toFlag || "🌐"}
            </span>
            <span className="truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {flagPair.to}
            </span>
          </>
        ) : (
          <span className="truncate text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {loading ? "Loading…" : "—"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Company() {
  const navigate = useNavigate();
  const { id } = useParams();

  const decodedRouteId = useMemo(() => {
    try {
      return id ? decodeURIComponent(id) : null;
    } catch {
      return id || null;
    }
  }, [id]);

  const storedSelectedCompany = useMemo(() => getStoredSelectedCompany(), []);
  const companyId = decodedRouteId || storedSelectedCompany?.company_id || null;

  const [profile, setProfile] = useState(null);
  const [routeKpis, setRouteKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);

  const shellCompany = useMemo(
    () => buildShellCompany(companyId, storedSelectedCompany),
    [companyId, storedSelectedCompany],
  );

  useEffect(() => {
    if (!companyId) {
      setError("Missing company id");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    getSavedCompanyDetail(companyId)
      .then(({ profile: nextProfile, routeKpis: nextRouteKpis }) => {
        if (cancelled) return;

        setProfile(nextProfile || null);
        setRouteKpis(nextRouteKpis || null);

        const years = Array.from(
          new Set(
            (nextProfile?.timeSeries || [])
              .map((point) => Number(point?.year))
              .filter((year) => Number.isFinite(year) && year > 2000),
          ),
        ).sort((a, b) => b - a);

        if (years.length) {
          setSelectedYear(years[0]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load company profile");
        setProfile(null);
        setRouteKpis(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const yearScopedProfile = useMemo(() => {
    if (!profile) return null;
    return buildYearScopedProfile(profile, selectedYear) || profile;
  }, [profile, selectedYear]);

  const activeProfile = yearScopedProfile || profile;
  const activeRouteKpis = yearScopedProfile?.routeKpis || routeKpis || null;

  const companyName =
    activeProfile?.title ||
    activeProfile?.name ||
    shellCompany?.name ||
    "Company";

  const companyDomain =
    activeProfile?.domain ||
    shellCompany?.domain ||
    null;

  const companyWebsite =
    activeProfile?.website ||
    shellCompany?.website ||
    null;

  const companyAddress =
    activeProfile?.address ||
    shellCompany?.address ||
    null;

  const companyCountryCode =
    activeProfile?.countryCode ||
    shellCompany?.countryCode ||
    null;

  const companyPhone =
    activeProfile?.phoneNumber ||
    activeProfile?.phone ||
    shellCompany?.phone ||
    null;

  const years = useMemo(() => {
    return Array.from(
      new Set(
        (profile?.timeSeries || [])
          .map((point) => Number(point?.year))
          .filter((year) => Number.isFinite(year) && year > 2000),
      ),
    ).sort((a, b) => b - a);
  }, [profile]);

  const headerKpis = useMemo(() => {
    const teu =
      activeRouteKpis?.teuLast12m ??
      activeProfile?.teuLast12m ??
      shellCompany?.kpis?.teu ??
      null;

    const explicitSpend =
      activeRouteKpis?.estSpendUsd12m ??
      activeProfile?.estSpendUsd12m ??
      activeProfile?.marketSpend ??
      shellCompany?.kpis?.spend ??
      null;

    const spend =
      explicitSpend != null && Number(explicitSpend) > 0
        ? Number(explicitSpend)
        : estimateMarketSpend(teu);

    const profileLatest = getLatestShipmentFromProfile(activeProfile);
    const shellLatest = capDateAtToday(
      normalizeDateValue(shellCompany?.kpis?.latestShipment),
    );

    return {
      shipments:
        activeRouteKpis?.shipmentsLast12m ??
        activeProfile?.totalShipments ??
        shellCompany?.kpis?.shipments ??
        null,
      teu,
      spend,
      latestShipment: profileLatest || shellLatest,
      topRoute:
        activeRouteKpis?.topRouteLast12m ||
        shellCompany?.kpis?.topRoute ||
        null,
      recentRoute:
        activeRouteKpis?.mostRecentRoute ||
        shellCompany?.kpis?.recentRoute ||
        null,
    };
  }, [activeProfile, activeRouteKpis, shellCompany]);

  const headerRecord = useMemo(() => {
    if (!companyId) return null;

    return {
      company: {
        company_id: companyId,
        name: companyName,
        address: companyAddress,
        country_code: companyCountryCode,
        domain: companyDomain,
        website: companyWebsite,
        phone: companyPhone,
        kpis: {
          shipments_12m: headerKpis.shipments,
          teu_12m: headerKpis.teu,
          est_spend_12m: headerKpis.spend,
          last_activity: headerKpis.latestShipment,
          top_route_12m: headerKpis.topRoute,
          recent_route: headerKpis.recentRoute,
        },
      },
    };
  }, [
    companyId,
    companyName,
    companyAddress,
    companyCountryCode,
    companyDomain,
    companyWebsite,
    companyPhone,
    headerKpis.shipments,
    headerKpis.teu,
    headerKpis.spend,
    headerKpis.latestShipment,
    headerKpis.topRoute,
    headerKpis.recentRoute,
  ]);

  if (error || !companyId) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/app/command-center")}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Command Center
        </button>

        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error || "Company unavailable"}
        </div>
      </div>
    );
  }

  const countryFlag = companyCountryCode ? flagFromCode(companyCountryCode) : "";
  const countryDisplay =
    activeProfile?.country ||
    activeProfile?.country_name ||
    shellCompany?.country ||
    null;

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-[28px] border border-slate-200 shadow-sm"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(99,102,241,0.10) 0%, rgba(99,102,241,0) 42%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 60%, #EEF2FF 100%)",
        }}
      >
        {/* Dark navy accent strip — pure left vertical band, full hero height,
            uses sidebar-bg navy as a featured-banner cue without taking over
            the light premium surface. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-2"
          style={{ backgroundColor: SIDEBAR_NAVY }}
        />

        {/* Subtle radial wash anchored at the avatar zone — visually rhymes
            with the navy strip without darkening the body of the hero. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(8,18,37,0.14) 0%, rgba(8,18,37,0) 70%)",
          }}
        />

        <div className="relative flex flex-col gap-6 p-5 pl-6 md:p-7 md:pl-8 xl:p-8 xl:pl-10">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-5">
              <CompanyAvatar
                name={companyName}
                logoUrl={
                  getCompanyLogoUrl(
                    companyDomain ||
                      companyWebsite ||
                      activeProfile?.domain ||
                      activeProfile?.website ||
                      shellCompany?.domain ||
                      shellCompany?.website ||
                      undefined
                  ) || undefined
                }
                size="lg"
                className="shrink-0 ring-2 ring-white"
              />

              <div className="min-w-0">
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    color: SIDEBAR_NAVY,
                    borderColor: "rgba(8,18,37,0.18)",
                    backgroundColor: "rgba(8,18,37,0.05)",
                  }}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Company Intelligence
                </div>

                <h1
                  className="mt-3 break-words text-3xl text-slate-950 md:text-4xl xl:text-5xl"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                  }}
                >
                  {companyName}
                </h1>

                {/* Metadata chip row — flag + country + domain + address +
                    saved badge. Each renders only when the data exists. */}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  {(countryFlag || countryDisplay || companyCountryCode) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                      {countryFlag ? (
                        <span aria-hidden className="text-sm leading-none">
                          {countryFlag}
                        </span>
                      ) : null}
                      <span>{countryDisplay || companyCountryCode}</span>
                      {companyCountryCode && countryDisplay ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-500">
                          {companyCountryCode}
                        </span>
                      ) : null}
                    </span>
                  ) : null}

                  {companyDomain ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                      <Globe className="h-3.5 w-3.5 text-slate-400" />
                      {companyDomain}
                    </span>
                  ) : null}

                  {companyAddress ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 shadow-sm">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{companyAddress}</span>
                    </span>
                  ) : null}

                  <span
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] text-white shadow-sm"
                    style={{ backgroundColor: SIDEBAR_NAVY }}
                  >
                    Saved
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:justify-end xl:flex-nowrap">
              <button
                type="button"
                onClick={() => navigate("/app/command-center")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Command Center
              </button>

              {years.length > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <CalendarClock className="h-4 w-4 text-slate-500" />
                  <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                  >
                    {years.map((year) => (
                      <option key={year} value={year} className="text-slate-900">
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              ) : loading ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading
                </div>
              ) : null}

              {companyId ? (
                <button
                  type="button"
                  onClick={() => setCampaignModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                  style={{
                    backgroundColor: SIDEBAR_NAVY,
                    boxShadow: "0 6px 16px rgba(8,18,37,0.18)",
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add to Campaign
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <HeroKpiCard
              icon={Package}
              label="Shipments"
              value={formatNumber(headerKpis.shipments)}
              tone="emerald"
            />
            <HeroKpiCard
              icon={Ship}
              label="TEU"
              value={formatNumber(headerKpis.teu, 1)}
              tone="cyan"
            />
            <HeroKpiCard
              icon={TrendingUp}
              label="Est. Market Spend"
              value={formatCurrency(headerKpis.spend)}
              tone="violet"
            />
            <HeroKpiCard
              icon={Sparkles}
              label="Latest shipment"
              value={formatDate(capDateAtToday(headerKpis.latestShipment))}
              tone="amber"
            />
          </div>

          {/* Lane intelligence pills inside the hero — share the same
              `resolveEndpoint` data that the Trade Lanes table consumes. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <HeroRoutePill
              kind="top"
              routeLabel={headerKpis.topRoute}
              loading={loading}
            />
            <HeroRoutePill
              kind="recent"
              routeLabel={headerKpis.recentRoute}
              loading={loading}
            />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading company intelligence…
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <CompanyDetailPanel
        record={headerRecord}
        profile={activeProfile}
        routeKpis={activeRouteKpis}
        loading={loading}
        error={null}
        selectedYear={selectedYear}
        onGenerateBrief={() => {}}
        onExportPDF={() => window.print()}
      />

      {campaignModalOpen && companyId ? (
        <AddToCampaignModal
          open={campaignModalOpen}
          onClose={() => setCampaignModalOpen(false)}
          company={{ company_id: String(companyId), name: companyName }}
        />
      ) : null}
    </div>
  );
}
