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
  Ship,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { getSavedCompanyDetail, buildYearScopedProfile } from "@/lib/api";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";

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

function getStoredSelectedCompany() {
  try {
    const raw = localStorage.getItem("lit:selectedCompany");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

  const [profile, setProfile] = useState(null);
  const [routeKpis, setRouteKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const companyId = decodedRouteId || getStoredSelectedCompany()?.company_id || null;

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
    getStoredSelectedCompany()?.name ||
    "Company";

  const companyDomain = activeProfile?.domain || null;
  const companyWebsite = activeProfile?.website || null;
  const companyAddress = activeProfile?.address || null;
  const companyCountryCode = activeProfile?.countryCode || null;
  const companyPhone = activeProfile?.phoneNumber || activeProfile?.phone || null;

  const years = useMemo(() => {
    return Array.from(
      new Set(
        (profile?.timeSeries || [])
          .map((point) => Number(point?.year))
          .filter((year) => Number.isFinite(year) && year > 2000),
      ),
    ).sort((a, b) => b - a);
  }, [profile]);

  const headerKpis = {
    shipments: activeRouteKpis?.shipmentsLast12m ?? activeProfile?.totalShipments ?? null,
    teu: activeRouteKpis?.teuLast12m ?? activeProfile?.teuLast12m ?? null,
    spend:
      activeRouteKpis?.estSpendUsd12m ??
      activeProfile?.estSpendUsd12m ??
      activeProfile?.marketSpend ??
      null,
    latestShipment:
      activeProfile?.lastShipmentDate || activeProfile?.last_shipment_date || null,
    topRoute: activeRouteKpis?.topRouteLast12m || null,
    recentRoute: activeRouteKpis?.mostRecentRoute || null,
  };

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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading company intelligence…
        </div>
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-xl md:p-7 xl:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.14),transparent_28%)]" />

        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <CompanyAvatar
                name={companyName}
                logoUrl={getCompanyLogoUrl(companyDomain || companyWebsite || undefined) || undefined}
                size="lg"
                className="shrink-0"
              />

              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-200">
                  <Building2 className="h-3.5 w-3.5" />
                  Company Intelligence
                </div>

                <h1 className="mt-4 truncate text-2xl font-semibold tracking-tight text-white md:text-4xl">
                  {companyName}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
                  {companyAddress ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {companyAddress}
                    </span>
                  ) : null}

                  {companyDomain ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="h-4 w-4" />
                      {companyDomain}
                    </span>
                  ) : null}

                  {companyCountryCode ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">
                      {companyCountryCode}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => navigate("/app/command-center")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Command Center
              </button>

              {years.length > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <CalendarClock className="h-4 w-4 text-slate-300" />
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-sm font-medium text-white outline-none"
                  >
                    {years.map((year) => (
                      <option key={year} value={year} className="text-slate-900">
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Package className="h-3.5 w-3.5 text-emerald-300" />
                Shipments
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatNumber(headerKpis.shipments)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Ship className="h-3.5 w-3.5 text-cyan-300" />
                TEU
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatNumber(headerKpis.teu, 1)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <TrendingUp className="h-3.5 w-3.5 text-violet-300" />
                Market spend
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(headerKpis.spend)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                Latest shipment
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatDate(headerKpis.latestShipment)}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                Top route
              </div>
              <div className="mt-2 truncate text-base font-semibold text-white">
                {headerKpis.topRoute || "—"}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                Recent route
              </div>
              <div className="mt-2 truncate text-base font-semibold text-white">
                {headerKpis.recentRoute || "—"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <CompanyDetailPanel
        record={headerRecord}
        profile={activeProfile}
        routeKpis={activeRouteKpis}
        loading={false}
        error={null}
        selectedYear={selectedYear}
        onGenerateBrief={() => {}}
        onExportPDF={() => window.print()}
      />
    </div>
  );
}
