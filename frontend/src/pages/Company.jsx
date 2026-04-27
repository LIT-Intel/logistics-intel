import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Download,
  Globe,
  LayoutGrid,
  Loader2,
  Send,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
// Phase B.9 — the hero no longer renders the dark KPI strip, so the
// `formatNumber` / `formatCurrency` / `formatDate` display helpers and
// `HeroKpiTile` are gone. The KPI row lives inside `CompanyDetailPanel`
// (approach 1) and reads `detail.shipments` / `detail.teu` / `detail.spend`
// / `canonicalLanes` / `phantomContacts` / `isContactVerified` directly
// from the panel's own scope. Date helpers stay because `headerKpis`
// still feeds `headerRecord` (panel reads it via `record.company.kpis`).
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import { getSavedCompanyDetail, buildYearScopedProfile } from "@/lib/api";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";
import { flagFromCode } from "@/lib/laneGlobe";
import { capFutureDate } from "@/lib/dateUtils";

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

// Phase B.5 — delegate to the shared cap-future-date helper so the
// hero's "Latest Shipment" KPI never out-runs the wall clock. Local
// helper name retained because multiple call sites in this file already
// reference `capDateAtToday`.
function capDateAtToday(value) {
  return capFutureDate(value);
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

/**
 * Phase B.9 — the dark navy hero KPI strip is GONE. KPIs now live in a
 * floating bridge row rendered inside `CompanyDetailPanel` (approach 1
 * from the Phase B.9 brief: the panel already owns `detail.shipments`,
 * `detail.teu`, `canonicalLanes`, `phantomContacts`, `isContactVerified`,
 * so we keep the KPI row close to its data source rather than re-lifting
 * everything to Company.jsx). The hero is now light (`bg-white`) with a
 * glossy translucent blue right-zone action panel.
 */

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
  // Phase B.12 — Pulse brief modal state. Tavily / pulse-brief Edge
  // Function is not deployed (verified against supabase/functions
  // listing on 2026-04-27), so the modal renders an honest stub.
  const [pulseModalOpen, setPulseModalOpen] = useState(false);
  // Share-link affordance. No export-company-profile Edge Function
  // exists, so "Share HTML" copies the canonical page URL to the
  // clipboard as a non-deceptive temporary share and shows a
  // transient inline confirmation. PDF export remains disabled.
  const [shareCopied, setShareCopied] = useState(false);

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
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Phase B.9 — premium light hero with a glossy translucent blue
            right-zone action panel. The previous Phase B.3 dark navy
            gradient `linear-gradient(160deg, #132344 0%, #0F1D38 100%)` is
            gone — the user's brief explicitly directs to soften the hero
            so the page stops feeling like stacked dashboard cards and
            starts reading as an executive intelligence workspace. The
            embedded 4-up KPI strip has moved to the floating KPI bridge
            row (rendered inside `CompanyDetailPanel`, approach 1) so the
            hero stays clean: identity left, actions right.

            Phase B.11 — wrap the hero in a `group relative` shell so a
            sibling glow div (positioned BEHIND the hero via `-inset-px`
            and `blur-md`) can bloom in on hover without affecting the
            hero's own layout. The glow is opacity-0 by default and only
            becomes visible on `group-hover`, with a 700ms transition so
            it feels intentional rather than reactive. */}
        <div className="group relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-[2.1rem] bg-gradient-to-r from-indigo-300/0 via-blue-400/40 to-indigo-300/0 opacity-0 blur-md transition-opacity duration-700 group-hover:opacity-100"
          />
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          {/* Phase B.12 — Abstract vector surface header. Replaces the
              flat blue/cyan glass panel from B.9–B.11 with a layered
              dark indigo→violet surface (base gradient + two
              animated radial blobs + an inline SVG curve set + a
              left-side vignette). The animation is wrapped in a
              `prefers-reduced-motion: no-preference` media query so
              users with reduced-motion preferences see the still
              composition. Only renders on `lg:` because the identity
              column owns the full width on smaller breakpoints. */}
          <style>{`
            @media (prefers-reduced-motion: no-preference) {
              @keyframes b12_pulseSlow {
                0%, 100% { opacity: 0.35; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(1.06); }
              }
              @keyframes b12_float {
                0%, 100% { transform: translate(0, 0) rotate(0deg); }
                33% { transform: translate(20px, -15px) rotate(2deg); }
                66% { transform: translate(-15px, 10px) rotate(-1deg); }
              }
              @keyframes b12_wave {
                0%, 100% { transform: translateX(0); opacity: 0.4; }
                50% { transform: translateX(-12px); opacity: 0.55; }
              }
              .b12-blob-pulse { animation: b12_pulseSlow 12s ease-in-out infinite; }
              .b12-blob-float { animation: b12_float 18s ease-in-out infinite; }
              .b12-wave-svg { animation: b12_wave 22s ease-in-out infinite; }
            }
          `}</style>
          {/* Layer 1 — base dark indigo gradient surface */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 lg:block"
          />
          {/* Layer 2 — indigo radial blob (animated pulse) */}
          <div
            aria-hidden
            className="b12-blob-pulse pointer-events-none absolute right-[10%] top-[15%] hidden h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl lg:block"
          />
          {/* Layer 3 — violet drifting blob */}
          <div
            aria-hidden
            className="b12-blob-float pointer-events-none absolute bottom-[10%] right-[35%] hidden h-56 w-56 rounded-full bg-violet-500/25 blur-3xl lg:block"
          />
          {/* Layer 4 — soft blue accent */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-[18%] top-[55%] hidden h-40 w-40 rounded-full bg-blue-600/20 blur-3xl lg:block"
          />
          {/* Layer 5 — inline SVG vector curves (cyan stroke accent) */}
          <svg
            aria-hidden
            viewBox="0 0 600 400"
            preserveAspectRatio="none"
            className="b12-wave-svg pointer-events-none absolute right-0 top-0 hidden h-full w-[42%] opacity-40 lg:block"
          >
            <path
              d="M0,80 C150,160 300,0 600,90 L600,0 L0,0 Z"
              fill="rgba(99,102,241,0.08)"
            />
            <path
              d="M0,200 C200,140 400,260 600,180"
              fill="none"
              stroke="rgba(34,211,238,0.18)"
              strokeWidth="1.5"
            />
            <path
              d="M0,310 C180,260 380,360 600,290"
              fill="none"
              stroke="rgba(139,92,246,0.20)"
              strokeWidth="1"
            />
            <path
              d="M0,360 C160,320 360,400 600,340"
              fill="none"
              stroke="rgba(99,102,241,0.15)"
              strokeWidth="1"
            />
          </svg>
          {/* Layer 6 — left-side vignette so the dark surface fades
              cleanly into the identity column rather than showing a
              hard 42% seam */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] bg-gradient-to-l from-slate-950/40 via-transparent to-transparent lg:block"
          />

          <div className="relative grid gap-8 p-6 lg:grid-cols-[1.45fr_0.85fr] lg:p-8">
            {/* LEFT — company identity */}
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/app/command-center")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Command Center
                </button>

                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
                  <Sparkles className="h-3 w-3" />
                  Company Intelligence
                </span>
              </div>

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
                        undefined,
                    ) || undefined
                  }
                  size="lg"
                  className="shrink-0 ring-2 ring-slate-100"
                />

                <div className="min-w-0">
                  <h1
                    className="break-words text-3xl font-bold tracking-[-0.025em] text-slate-950 md:text-4xl xl:text-5xl"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {companyName}
                  </h1>

                  {/* Metadata row — flag + country + 2-letter code · domain
                      · Saved. Address rendered as muted text below. */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-600">
                    {(countryFlag || countryDisplay || companyCountryCode) ? (
                      <span className="inline-flex items-center gap-1.5">
                        {countryFlag ? (
                          <span aria-hidden className="text-base leading-none">
                            {countryFlag}
                          </span>
                        ) : null}
                        <span className="font-medium text-slate-800">
                          {countryDisplay || companyCountryCode}
                        </span>
                        {companyCountryCode ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600">
                            {companyCountryCode}
                          </span>
                        ) : null}
                      </span>
                    ) : null}

                    {companyDomain ? (
                      <>
                        <span aria-hidden className="text-slate-300">·</span>
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <Globe className="h-3.5 w-3.5 text-slate-400" />
                          {companyDomain}
                        </span>
                      </>
                    ) : null}

                    <span aria-hidden className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Saved
                    </span>
                  </div>

                  {companyAddress ? (
                    <div className="mt-2 text-sm text-slate-500">
                      {companyAddress}
                    </div>
                  ) : null}
                </div>
              </div>

              {loading ? (
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading company intelligence…
                </div>
              ) : null}
            </div>

            {/* RIGHT — Action Zone (glossy translucent panel). Year selector
                + Start Outreach + In Command Center. All click handlers
                preserved: Start Outreach opens AddToCampaignModal; In
                Command Center navigates to /app/command-center; the year
                selector still rebinds `selectedYear` (which downstream
                rebinds `effectiveSelectedYear` inside the panel). */}
            <div className="relative flex flex-col gap-3 self-start rounded-2xl border border-white/40 bg-white/60 p-5 shadow-sm backdrop-blur-md">
              {years.length > 0 ? (
                <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white/80 px-3 py-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                  <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-xs font-semibold text-slate-800 outline-none"
                  >
                    {years.map((year) => (
                      <option key={year} value={year} className="text-slate-900">
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              ) : loading ? (
                <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  if (!companyId) return;
                  setCampaignModalOpen(true);
                }}
                disabled={!companyId}
                title={
                  companyId
                    ? "Add this company to an outreach campaign"
                    : "Save company first to enable outreach"
                }
                className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Start Outreach
              </button>

              <button
                type="button"
                onClick={() => navigate("/app/command-center")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
              >
                <LayoutGrid className="h-4 w-4" />
                In Command Center
              </button>

              {/* Phase B.12 — Pulse brief CTA. Opens a stub modal until
                  the Tavily / pulse-brief Edge Function is deployed.
                  No fake brief content is rendered. */}
              <button
                type="button"
                onClick={() => setPulseModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-300/60 bg-gradient-to-br from-violet-500/15 to-indigo-500/15 px-4 py-2 text-sm font-semibold text-violet-800 backdrop-blur-md transition hover:from-violet-500/25 hover:to-indigo-500/25"
              >
                <Sparkles className="h-4 w-4" />
                Pulse
              </button>

              {/* Phase B.12 — Share HTML / Export PDF. No
                  export-company-profile Edge Function exists yet, so:
                  • Share HTML copies the canonical page URL to the
                    clipboard (non-deceptive temporary share). Inline
                    confirmation appears for ~2s.
                  • Export PDF stays disabled with an honest tooltip
                    pointing at the missing backend. */}
              <div className="flex flex-col gap-2 border-t border-white/60 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const url =
                          typeof window !== "undefined"
                            ? window.location.href
                            : "";
                        if (
                          url &&
                          typeof navigator !== "undefined" &&
                          navigator.clipboard?.writeText
                        ) {
                          await navigator.clipboard.writeText(url);
                          setShareCopied(true);
                          setTimeout(() => setShareCopied(false), 2000);
                        }
                      } catch {
                        // ignore — clipboard may be blocked by browser
                      }
                    }}
                    title="Copies this page's link. Branded HTML share requires the export-company-profile Edge Function (not deployed)."
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-indigo-200/70 bg-white/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share HTML
                  </button>
                  <button
                    type="button"
                    disabled
                    title="PDF export requires the export-company-profile Edge Function (not deployed)."
                    className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 py-1.5 text-xs font-semibold text-slate-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export PDF
                  </button>
                </div>
                {shareCopied ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-center text-[11px] font-semibold text-emerald-700">
                    Link copied to clipboard
                  </div>
                ) : null}
              </div>

              {/* Phase B.9 — Refresh Intel + Watchlist are NOT functional
                  today, so per the brief's honesty rule we render them
                  disabled with `title="Coming soon"` rather than ship a
                  fake CTA. They're tucked into a small footer row so the
                  primary actions stay dominant. */}
              <div className="mt-1 flex flex-wrap gap-2 border-t border-white/60 pt-3">
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-400"
                >
                  Refresh Intel
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-400"
                >
                  Watchlist
                </button>
              </div>
            </div>
          </div>
        </section>
        </div>

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

        {/* Phase B.12 — Pulse brief modal stub. Tavily / pulse-brief
            Edge Function is not deployed (verified against
            supabase/functions listing on 2026-04-27). The modal
            renders an honest empty state describing the seven brief
            sections that will populate once the backend is wired,
            rather than fabricating placeholder content. */}
        {pulseModalOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pulse-brief-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPulseModalOpen(false)}
          >
            <div
              className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-6 text-white">
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-[10%] top-[20%] h-40 w-40 rounded-full bg-indigo-500/30 blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-[10%] right-[35%] h-28 w-28 rounded-full bg-violet-500/25 blur-3xl"
                />
                <button
                  type="button"
                  onClick={() => setPulseModalOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 backdrop-blur-md transition hover:bg-white/20"
                  aria-label="Close Pulse brief"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="relative inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-violet-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-100">
                  <Sparkles className="h-3 w-3" />
                  Pulse Brief
                </div>
                <h3
                  id="pulse-brief-title"
                  className="relative mt-3 text-2xl font-bold tracking-tight"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {companyName}
                </h3>
                <p className="relative mt-1 text-sm text-slate-300">
                  AI-generated company intelligence brief
                </p>
              </div>
              <div className="space-y-4 p-6">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                  <strong className="font-semibold">
                    Pulse brief generation is not configured yet.
                  </strong>
                  <p className="mt-1 text-amber-800">
                    The Tavily / pulse-brief Edge Function is not deployed.
                    Once the backend is wired, clicking Pulse will generate:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
                    <li>Executive Summary</li>
                    <li>Shipment Signal</li>
                    <li>Public Web Context</li>
                    <li>Opportunity Angle</li>
                    <li>Suggested Outreach Angle</li>
                    <li>Risks / Watchouts</li>
                    <li>Sources</li>
                  </ul>
                </div>
                <p className="text-xs text-slate-500">
                  No placeholder content is shown here intentionally — Pulse
                  will only render real Tavily-grounded intelligence.
                </p>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setPulseModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}