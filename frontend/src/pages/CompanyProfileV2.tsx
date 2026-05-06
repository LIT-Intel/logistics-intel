/**
 * Phase 3 — Canonical Company Profile container (full-width, rich data).
 *
 * Mounted at /app/companies/:id (canonical), /app/companies/:id/preview
 * (alias), with /app/companies/:id/legacy preserved as fallback.
 *
 * Phase 3 architectural note (TEMPORARY):
 * V2 fetches shipment data through the known-good legacy ImportYeti path
 * (`getSavedCompanyShellOnly` → cached snapshot, with a background
 * `getSavedCompanyDetail({ forceRefresh:false })` if the shell is missing
 * or stale) instead of the new `company-profile` aggregator. Identity /
 * contacts / activity / pulse still come from the aggregator + resolver.
 * This dual-fetch is intentional for Phase 3 to match legacy parity; we
 * consolidate in a later phase once the aggregator's shipment block is
 * fully equivalent to `normalizeIyCompanyProfile`.
 *
 * Layout matches the legacy page: full-bleed flex with `flex-1` content +
 * 360px right rail. No `max-w-7xl` cap.
 */

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Users,
  Workflow,
  Activity,
  ServerCrash,
  Wrench,
  Bookmark,
} from "lucide-react";

import CDPHeader from "@/components/company/CDPHeader";
import CDPDetailsPanel from "@/components/company/CDPDetailsPanel";
import CDPSupplyChain from "@/components/company/CDPSupplyChain";
import CDPContacts from "@/components/company/CDPContacts";
import CDPResearch from "@/components/company/CDPResearch";
import CDPActivity from "@/components/company/CDPActivity";
import CompanyProfileGuard from "@/components/company/CompanyProfileGuard";
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import {
  buildYearScopedProfile,
  getSavedCompanyDetail,
  getSavedCompanyShellOnly,
  saveCompanyToCommandCenter,
  type IyCompanyProfile,
  type IyRouteKpis,
} from "@/lib/api";
import {
  loadSyntheticProfile,
} from "@/lib/companyProfileFallback";
import type { ProfileBundle } from "@/lib/companyProfile.types";

type TabId = "supply-chain" | "contacts" | "pulse" | "activity";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "supply-chain", label: "Supply Chain", icon: Workflow },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "pulse", label: "Pulse AI", icon: Sparkles },
  { id: "activity", label: "Activity", icon: Activity },
];

// ---------- Error boundary ----------
type BoundaryProps = { rawId: string; children: ReactNode };
type BoundaryState = { error: Error | null };
class V2ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error("[CompanyProfileV2] render crash", { error, info });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-4">
              <Wrench className="w-6 h-6 text-rose-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Something went wrong loading this profile
            </h2>
            <p className="text-xs text-slate-400 mb-6 break-all">
              {String(this.state.error?.message ?? this.state.error)}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                to={`/app/companies/${encodeURIComponent(this.props.rawId)}/legacy`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
              >
                Open legacy page
              </Link>
              <Link
                to="/app/command-center"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Command Center
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- Helpers ----------
function bundleToHeaderProps(bundle: ProfileBundle, profile: IyCompanyProfile | null) {
  const d = bundle.identity.display;
  const m = bundle.identity.sources.metrics;
  const p = profile;
  const c = bundle.contacts;
  return {
    company: {
      id: bundle.identity.id,
      name: d.name || p?.name || "Unknown Company",
      domain: d.domain ?? p?.domain ?? null,
      website: d.website ?? p?.website ?? null,
      address:
        [d.address.line1, d.address.city, d.address.state]
          .filter(Boolean)
          .join(", ") || p?.address || null,
      countryCode: d.address.country_code ?? p?.countryCode ?? null,
      countryName: d.address.country ?? p?.country ?? null,
      phone: d.phone ?? p?.phone ?? null,
    },
    kpis: {
      shipments: p?.routeKpis?.shipmentsLast12m ?? p?.totalShipments ?? m.shipments_12m,
      teu: p?.routeKpis?.teuLast12m ?? p?.totalTeuAllTime ?? m.teu_12m,
      spend: p?.routeKpis?.estSpendUsd12m ?? p?.estSpendUsd12m ?? m.est_spend_12m,
      lastShipment: p?.lastShipmentDate ?? m.last_shipment,
      topRoute: p?.routeKpis?.topRouteLast12m ?? m.top_route,
      fclCount: p?.containers?.fclShipments12m ?? m.fcl_shipments_12m,
      lclCount: p?.containers?.lclShipments12m ?? m.lcl_shipments_12m,
      tradeLanes: Array.isArray(p?.topRoutes) ? p!.topRoutes!.length : null,
      contacts: c?.count ?? null,
      contactsVerified:
        c?.items.filter((x) => x.is_verified).length ?? null,
    },
  };
}

function deriveYears(profile: IyCompanyProfile | null): number[] {
  if (!profile?.timeSeries?.length) return [];
  const set = new Set<number>();
  for (const point of profile.timeSeries) {
    const y = Number(point?.year);
    if (Number.isFinite(y) && y > 1990) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

// ---------- Main panel ----------
function ProfilePanel({ id }: { id: string }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("supply-chain");
  const [panelOpen, setPanelOpen] = useState(true);
  const [savingStar, setSavingStar] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);

  // Aggregator: identity + contacts + activity + pulse (NOT shipments).
  const {
    data: bundle,
    loading: bundleLoading,
    error: bundleError,
    refetch: refetchBundle,
    usedFallback,
  } = useCompanyProfile(id, {
    include: ["identity", "contacts", "activity"],
  });

  // Legacy ImportYeti shipment path — known-good, mirrors Company.jsx.
  const [iyProfile, setIyProfile] = useState<IyCompanyProfile | null>(null);
  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | null>(null);
  const [snapshotIsStale, setSnapshotIsStale] = useState<boolean>(true);
  const [shipmentsLoading, setShipmentsLoading] = useState<boolean>(false);
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);
  const [refreshLimitState, setRefreshLimitState] = useState<{
    plan: string | null;
    used: number | null;
    limit: number | null;
    reset_at: string | null;
    upgrade_url: string;
  } | null>(null);
  const [didAutoRefresh, setDidAutoRefresh] = useState<boolean>(false);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const years = useMemo(() => deriveYears(iyProfile), [iyProfile]);
  const lastShipmentKeyRef = useRef<string | null>(null);

  // Pick a sensible year when profile lands.
  useEffect(() => {
    if (years.length === 0) {
      setSelectedYear(null);
      return;
    }
    if (selectedYear == null || !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear]);

  // ----- Step 1: shell-only cached read -----
  // Anchor the shipment fetch to the resolved canonical key/UUID once
  // the aggregator has resolved identity. We prefer the source_company_key
  // because the snapshot is keyed on slug, but UUID also works for the
  // upstream helpers.
  const shipmentKey = useMemo(() => {
    if (bundle?.identity?.key) return bundle.identity.key;
    if (bundle?.identity?.id) return bundle.identity.id;
    return id;
  }, [bundle, id]);

  // Reset shipment state when the resolved key changes.
  useEffect(() => {
    if (shipmentKey === lastShipmentKeyRef.current) return;
    lastShipmentKeyRef.current = shipmentKey;
    setIyProfile(null);
    setRouteKpis(null);
    setSnapshotUpdatedAt(null);
    setSnapshotIsStale(true);
    setDidAutoRefresh(false);
  }, [shipmentKey]);

  // Cached-first load.
  useEffect(() => {
    if (!shipmentKey) return;
    let cancelled = false;
    setShipmentsLoading(true);

    (async () => {
      try {
        const shell = await getSavedCompanyShellOnly(shipmentKey);
        if (cancelled) return;
        setSnapshotUpdatedAt(shell.snapshotUpdatedAt);
        setSnapshotIsStale(shell.isStale);
        if (shell.profile) {
          setIyProfile(shell.profile);
          setRouteKpis(shell.routeKpis);
        }
      } catch (e) {
        console.warn("[CompanyProfileV2] shell load failed", e);
      } finally {
        if (!cancelled) setShipmentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shipmentKey]);

  // Synthetic fallback from lit_companies + lit_company_source_metrics
  // when (a) the aggregator has resolved a saved-company UUID and
  // (b) the shell read returned nothing or no top_routes.
  useEffect(() => {
    const savedId = bundle?.identity?.id;
    const savedPresent = bundle?.identity?.sources?.saved?.present === true;
    if (!savedId || !savedPresent) return;
    if (shipmentsLoading) return;
    const hasRichProfile =
      iyProfile &&
      ((iyProfile.topRoutes && iyProfile.topRoutes.length > 0) ||
        (iyProfile.timeSeries && iyProfile.timeSeries.length > 0));
    if (hasRichProfile) return;

    let cancelled = false;
    (async () => {
      const synthetic = await loadSyntheticProfile(savedId);
      if (cancelled || !synthetic) return;
      // Only adopt the synthetic profile if we still don't have a real one.
      setIyProfile((prev) => (prev && (prev.timeSeries?.length || prev.recentBols?.length) ? prev : synthetic));
      setRouteKpis((prev) => prev ?? synthetic.routeKpis);
    })();

    return () => {
      cancelled = true;
    };
  }, [bundle?.identity?.id, bundle?.identity?.sources?.saved?.present, shipmentsLoading, iyProfile]);

  // ----- Step 2: background refresh (no forceRefresh) when stale -----
  // Mirrors legacy Company.jsx behavior: silently fetch fresh ImportYeti
  // when the cached snapshot is missing or stale, but never burn a
  // forceRefresh credit on auto-load. Best-effort; swallow LIMIT_EXCEEDED
  // and other errors silently because the page is still useful with
  // synthetic/shell data.
  useEffect(() => {
    if (!shipmentKey) return;
    if (didAutoRefresh) return;
    if (shipmentsLoading) return;
    if (!snapshotIsStale && iyProfile && iyProfile.timeSeries?.length) return;

    const savedPresent = bundle?.identity?.sources?.saved?.present === true;
    if (!savedPresent) return; // do not auto-fetch for directory-only profiles

    let cancelled = false;
    setDidAutoRefresh(true);
    (async () => {
      try {
        const fresh = await getSavedCompanyDetail(shipmentKey, undefined, {
          forceRefresh: false,
        } as any);
        if (cancelled || !fresh) return;
        if (fresh.profile) setIyProfile(fresh.profile);
        if (fresh.routeKpis) setRouteKpis(fresh.routeKpis);
        setSnapshotUpdatedAt(new Date().toISOString());
        setSnapshotIsStale(false);
      } catch (err: any) {
        const code = err?.code;
        if (code === "LIMIT_EXCEEDED") {
          // Silent on auto-refresh — user-triggered refresh handles UI
          // gating. We don't want to nag trial users on every page load.
          console.info("[CompanyProfileV2] auto-refresh skipped: LIMIT_EXCEEDED");
        } else {
          console.warn("[CompanyProfileV2] auto-refresh failed", code, err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shipmentKey, didAutoRefresh, shipmentsLoading, snapshotIsStale, iyProfile, bundle?.identity?.sources?.saved?.present]);

  // ----- User-triggered refresh (forceRefresh: true) -----
  const handleManualRefresh = useCallback(async () => {
    if (!shipmentKey || manualRefreshing) return;
    setManualRefreshing(true);
    setRefreshLimitState(null);
    try {
      const fresh = await getSavedCompanyDetail(shipmentKey, undefined, {
        forceRefresh: true,
      } as any);
      if (fresh?.profile) setIyProfile(fresh.profile);
      if (fresh?.routeKpis) setRouteKpis(fresh.routeKpis);
      setSnapshotUpdatedAt(new Date().toISOString());
      setSnapshotIsStale(false);
      // Refresh aggregator-fed sections too (counts/activity may change).
      refetchBundle();
      // Writeback so Command Center / dashboard see the latest KPIs.
      try {
        const fp = fresh?.profile;
        if (fp) {
          const slug = String(fp.key || `company/${shipmentKey}`).replace(/^company\//, "");
          await saveCompanyToCommandCenter({
            shipper: {
              key: `company/${slug}`,
              companyId: `company/${slug}`,
              title: fp.title || fp.name || "",
              name: fp.title || fp.name || "",
              domain: fp.domain || undefined,
              website: fp.website || undefined,
              address: fp.address || undefined,
              countryCode: fp.countryCode || undefined,
              totalShipments: fp.routeKpis?.shipmentsLast12m,
              teusLast12m: fp.routeKpis?.teuLast12m,
              mostRecentShipment: fp.lastShipmentDate,
              lastShipmentDate: fp.lastShipmentDate,
              primaryRoute: fp.routeKpis?.topRouteLast12m,
              topSuppliers: Array.isArray(fp.topSuppliers) ? fp.topSuppliers : [],
            } as any,
            profile: fp as any,
            stage: "prospect",
            source: "importyeti",
          } as any);
        }
      } catch (writebackErr) {
        console.warn("[CompanyProfileV2] writeback to lit_companies failed", writebackErr);
      }
      toast.success("Intelligence refreshed");
    } catch (err: any) {
      const code = err?.code;
      if (code === "LIMIT_EXCEEDED") {
        const gate = err?.gate || {};
        setRefreshLimitState({
          plan: gate.plan ?? null,
          used: gate.used ?? null,
          limit: gate.limit ?? null,
          reset_at: gate.reset_at ?? null,
          upgrade_url: gate.upgrade_url || "/app/billing",
        });
        toast.warning("You've reached your refresh limit for this billing period.");
      } else if (code === "COMPANY_PROFILE_FAILED" || code === "IY_API_KEY_MISSING") {
        toast.error("Couldn't refresh trade intel — try again in a moment.");
      } else if (code === "UNAUTHORIZED") {
        toast.error("Session expired. Please sign in again.");
      } else {
        toast.error(`Refresh failed: ${String(err?.message ?? err)}`);
      }
    } finally {
      setManualRefreshing(false);
    }
  }, [shipmentKey, manualRefreshing, refetchBundle]);

  // ----- Star toggle (save to Command Center) -----
  const inCrm = bundle?.identity?.sources?.saved?.present === true;
  const handleToggleStar = useCallback(async () => {
    if (!bundle?.identity || savingStar) return;
    setSavingStar(true);
    try {
      const ident = bundle.identity;
      const slug = (ident.key || `company/${ident.id ?? id}`).replace(/^company\//, "");
      await saveCompanyToCommandCenter({
        shipper: {
          key: `company/${slug}`,
          companyId: `company/${slug}`,
          title: ident.display.name,
          name: ident.display.name,
          domain: ident.display.domain || undefined,
          website: ident.display.website || undefined,
          countryCode: ident.display.address.country_code || undefined,
          totalShipments: ident.sources.metrics.shipments_12m ?? undefined,
          teusLast12m: ident.sources.metrics.teu_12m ?? undefined,
          mostRecentShipment: ident.sources.metrics.last_shipment ?? undefined,
          lastShipmentDate: ident.sources.metrics.last_shipment ?? undefined,
          primaryRoute: ident.sources.metrics.top_route ?? undefined,
        } as any,
        stage: "prospect",
        source: "importyeti",
      } as any);
      toast.success(inCrm ? "Saved" : "Saved to Command Center");
      await refetchBundle();
    } catch (e: any) {
      toast.error(`Couldn't save company: ${String(e?.message ?? e)}`);
    } finally {
      setSavingStar(false);
    }
  }, [bundle, id, inCrm, refetchBundle, savingStar]);

  const handleShare = useCallback(() => {
    toast.info("Share — available in the legacy view this week", {
      action: {
        label: "Open legacy",
        onClick: () =>
          navigate(`/app/companies/${encodeURIComponent(id)}/legacy`),
      },
    });
  }, [id, navigate]);

  const handleExportPdf = useCallback(() => {
    toast.info("Export — available in the legacy view this week", {
      action: {
        label: "Open legacy",
        onClick: () =>
          navigate(`/app/companies/${encodeURIComponent(id)}/legacy`),
      },
    });
  }, [id, navigate]);

  // ----- Year-scoped profile (mirrors legacy buildYearScopedProfile) -----
  const activeProfile = useMemo(() => {
    if (!iyProfile) return null;
    if (selectedYear == null || !years.length) return iyProfile;
    return buildYearScopedProfile(iyProfile, selectedYear) || iyProfile;
  }, [iyProfile, selectedYear, years]);

  // ----- Render guards -----
  if (bundleLoading && !bundle) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-slate-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading company profile…</p>
      </div>
    );
  }

  if (bundleError) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <ServerCrash className="w-6 h-6 text-rose-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            {bundleError.code === "COMPANY_NOT_FOUND"
              ? "Company not found"
              : "Couldn't load profile"}
          </h2>
          <p className="text-sm text-slate-600 mb-2">{bundleError.message}</p>
          {bundleError.hint ? (
            <p className="text-xs text-slate-400 mb-6">{bundleError.hint}</p>
          ) : null}
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link
              to="/app/command-center"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Command Center
            </Link>
            <button
              onClick={() => refetchBundle()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Retry
            </button>
            <Link
              to={`/app/companies/${encodeURIComponent(id)}/legacy`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Try legacy view
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!bundle) return null;

  const headerProps = bundleToHeaderProps(bundle, activeProfile ?? iyProfile ?? null);

  // Directory-only state — saved company is absent AND we have no synthetic
  // profile data. Show a clean empty Supply Chain with a save CTA instead
  // of cluttered blank cards.
  const isDirectoryOnly =
    bundle.identity.sources.saved.present === false &&
    bundle.identity.sources.directory.present === true;

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      {usedFallback ? (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-[12px] px-6 py-1.5 flex items-center justify-center shrink-0">
          <span>
            Identity aggregator unreachable — using in-browser resolver fallback.
            Shipment, contact, and activity data still load via direct queries.{" "}
            <Link
              to={`/app/companies/${encodeURIComponent(id)}/legacy`}
              className="underline font-medium"
            >
              Switch to legacy view
            </Link>
          </span>
        </div>
      ) : null}

      {refreshLimitState ? (
        <div className="bg-violet-50 border-b border-violet-200 text-violet-900 text-[12px] px-6 py-1.5 flex items-center justify-center gap-2 shrink-0">
          <span>
            Refresh limit reached
            {refreshLimitState.used != null && refreshLimitState.limit != null
              ? ` (${refreshLimitState.used}/${refreshLimitState.limit})`
              : ""}
            {refreshLimitState.plan ? ` on the ${refreshLimitState.plan} plan` : ""}.
            Upgrade to refresh more profiles.
          </span>
          <Link
            to={refreshLimitState.upgrade_url}
            className="underline font-medium"
          >
            View plans
          </Link>
        </div>
      ) : null}

      {/* Phase 3.2 — content shell capped at 1500px on large desktops while
          the outer bg stays full-bleed. Surface / laptop widths are below
          1500px so this is a no-op there; on 27"+ desktops the company
          profile no longer floats at the natural max-width of the right
          rail's 300px + flex-1 center, which made the cards feel small. */}
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
      <CDPHeader
        company={headerProps.company as any}
        kpis={headerProps.kpis as any}
        starred={inCrm}
        onToggleStar={handleToggleStar}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((p) => !p)}
        onBack={() => navigate(-1)}
        onShare={handleShare}
        onExportPdf={handleExportPdf}
        onAddToList={() => setCampaignModalOpen(true)}
        onStartOutreach={() => setCampaignModalOpen(true)}
        onPulse={() => setActiveTab("pulse")}
        onRefresh={handleManualRefresh}
        manualRefreshing={manualRefreshing}
        snapshotUpdatedAt={snapshotUpdatedAt}
      />

      {/* Tab bar — matches legacy density (px-6, h-3 w-3 icons, 12.5px font). */}
      <div
        role="tablist"
        aria-label="Company sections"
        className="flex shrink-0 items-center gap-0 border-b border-slate-200 bg-white px-6"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(t.id)}
              className={[
                "font-display -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold transition-colors",
                isActive
                  ? "border-blue-500 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
        <div className="ml-auto text-[11px] text-slate-400">
          <Link
            to={`/app/companies/${encodeURIComponent(id)}/legacy`}
            className="hover:text-slate-600 underline-offset-2 hover:underline"
          >
            Legacy view
          </Link>
        </div>
      </div>

      {/* Body — full-bleed, matches legacy width. */}
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {activeTab === "supply-chain" ? (
            isDirectoryOnly ? (
              <DirectoryOnlyEmptyState
                companyName={bundle.identity.display.name}
                onSave={handleToggleStar}
                saving={savingStar}
              />
            ) : (
              <CDPSupplyChain
                profile={activeProfile as any}
                routeKpis={routeKpis as any}
                selectedYear={selectedYear ?? undefined}
                years={years}
                onSelectYear={setSelectedYear}
              />
            )
          ) : null}

          {activeTab === "contacts" ? (
            <CDPContacts
              companyId={bundle.identity.id}
              companyName={bundle.identity.display.name}
              companyDomain={bundle.identity.display.domain}
              companyLocation={[
                bundle.identity.display.address.city,
                bundle.identity.display.address.state,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          ) : null}

          {activeTab === "pulse" ? (
            <CDPResearch
              companyName={bundle.identity.display.name}
              tradeKpis={
                {
                  shipments12m: headerProps.kpis.shipments,
                  teu12m: headerProps.kpis.teu,
                  activeLanes: headerProps.kpis.tradeLanes,
                  topLaneLabel: headerProps.kpis.topRoute,
                  topLaneShare: null,
                  yoyPct: null,
                } as any
              }
              topRoutes={(activeProfile?.topRoutes ?? []) as any}
              pulseBrief={(bundle.pulse?.brief ?? null) as any}
              pulseLoading={false}
              pulseError={null as any}
              pulseUsage={null as any}
              onPulse={() => {}}
              onRefresh={() => refetchBundle()}
              onShareHtml={handleShare}
              onExportPdf={handleExportPdf}
            />
          ) : null}

          {activeTab === "activity" ? (
            <CDPActivity companyId={bundle.identity.id} />
          ) : null}
        </div>

        {panelOpen ? (
          <CDPDetailsPanel
            company={headerProps.company as any}
            kpis={headerProps.kpis as any}
            profile={(activeProfile ?? iyProfile) as any}
            onRefresh={handleManualRefresh}
            refreshing={manualRefreshing}
            snapshotUpdatedAt={snapshotUpdatedAt}
          />
        ) : null}
      </div>
      </div>{/* /Phase 3.2 max-w-[1500px] shell */}

      <AddToCampaignModal
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        company={{
          company_id: bundle.identity.id,
          name: bundle.identity.display.name,
        }}
      />
    </div>
  );
}

// ---------- Directory-only empty state ----------
function DirectoryOnlyEmptyState({
  companyName,
  onSave,
  saving,
}: {
  companyName: string;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <Bookmark className="w-7 h-7 text-blue-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">
        Save {companyName} to ingest shipment intelligence
      </h2>
      <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">
        This company exists in the LIT directory but hasn't been added to
        your Command Center yet. Save it to pull live trade lanes, FCL/LCL
        breakdown, recent shipments, and supplier intelligence.
      </p>
      <button
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Bookmark className="w-4 h-4" />
        )}
        {saving ? "Saving…" : "Save & Enrich"}
      </button>
      <p className="text-xs text-slate-400 mt-4">
        We won't burn ImportYeti credits until the company is saved and
        eligible.
      </p>
    </div>
  );
}

export default function CompanyProfileV2() {
  const params = useParams();
  const rawId = params.id ?? null;
  return (
    <CompanyProfileGuard rawId={rawId}>
      {(resolvedId) => (
        <V2ErrorBoundary rawId={resolvedId}>
          <ProfilePanel id={resolvedId} />
        </V2ErrorBoundary>
      )}
    </CompanyProfileGuard>
  );
}
