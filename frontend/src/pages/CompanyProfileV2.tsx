/**
 * Phase 2 — Canonical Company Profile container.
 *
 * Mounted at /app/companies/:id (canonical) AND /app/companies/:id/preview
 * (back-compat alias from Phase 1). The legacy Company.jsx page remains
 * available at /app/companies/:id/legacy as an explicit fallback in case
 * something breaks.
 *
 * Wires real action handlers to existing api.ts helpers so Add-to-list,
 * Start-outreach, Refresh-enrichment, In-CRM badge, and the four tabs
 * (Supply Chain / Contacts / Pulse AI / Activity) keep working. Share /
 * Export-PDF surface friendly "coming soon" toasts in Phase 2 — the full
 * pulse-share / export-company-profile flows live in Company.jsx and will
 * be ported in Phase 3.
 *
 * An error boundary catches any render-time crash and offers an explicit
 * "Open legacy page" link instead of a white screen.
 */

import { Component, useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, Users, Workflow, Activity, ServerCrash, Wrench } from "lucide-react";

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
  getSavedCompanyDetail,
  saveCompanyToCommandCenter,
} from "@/lib/api";
import type { ProfileBundle } from "@/lib/companyProfile.types";

type TabId = "supply-chain" | "contacts" | "pulse" | "activity";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "supply-chain", label: "Supply Chain", icon: Workflow },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "pulse", label: "Pulse AI", icon: Sparkles },
  { id: "activity", label: "Activity", icon: Activity },
];

// Class-based error boundary — React doesn't ship a hook for this.
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
            <p className="text-sm text-slate-600 mb-1">
              We're surfacing the legacy view as a fallback so you can keep working.
            </p>
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

function bundleToHeaderProps(bundle: ProfileBundle) {
  const d = bundle.identity.display;
  const m = bundle.identity.sources.metrics;
  const c = bundle.contacts;
  return {
    company: {
      id: bundle.identity.id,
      name: d.name || "Unknown Company",
      domain: d.domain,
      website: d.website,
      address: [d.address.line1, d.address.city, d.address.state].filter(Boolean).join(", ") || null,
      countryCode: d.address.country_code,
      countryName: d.address.country,
      phone: d.phone,
    },
    kpis: {
      shipments: m.shipments_12m,
      teu: m.teu_12m,
      spend: m.est_spend_12m,
      lastShipment: m.last_shipment,
      topRoute: m.top_route,
      fclCount: m.fcl_shipments_12m,
      lclCount: m.lcl_shipments_12m,
      contacts: c?.count ?? null,
      contactsVerified: c?.items.filter((x) => x.is_verified).length ?? null,
    },
  };
}

function ProfilePanel({ id }: { id: string }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("supply-chain");
  const [panelOpen, setPanelOpen] = useState(true);
  const [starred, setStarred] = useState(false);
  const [savingStar, setSavingStar] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refetch, usedFallback } = useCompanyProfile(id, {
    include: ["identity", "shipments", "contacts", "activity"],
  });

  const headerProps = useMemo(() => (data ? bundleToHeaderProps(data) : null), [data]);

  // In-CRM badge derives from sources.saved.present. Keep local `starred`
  // as an optimistic toggle so the icon flips immediately on save.
  const inCrm = data?.identity.sources.saved.present === true || starred;

  const handleToggleStar = useCallback(async () => {
    if (!data?.identity) return;
    if (savingStar) return;
    setSavingStar(true);
    const wasStarred = inCrm;
    setStarred(true);
    try {
      const ident = data.identity;
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
      toast.success(wasStarred ? "Saved" : "Saved to Command Center");
      await refetch();
    } catch (e: any) {
      console.error("[CompanyProfileV2] toggle star failed", e);
      setStarred(wasStarred);
      toast.error(`Couldn't save company: ${String(e?.message ?? e)}`);
    } finally {
      setSavingStar(false);
    }
  }, [data, id, inCrm, refetch, savingStar]);

  const handleManualRefresh = useCallback(async () => {
    if (!data?.identity || refreshing) return;
    setRefreshing(true);
    try {
      const ident = data.identity;
      // Try the upstream forceRefresh path first so KPIs and snapshot
      // get a fresh pull. Non-fatal on failure — we still refetch the
      // aggregator below.
      try {
        if (ident.id || ident.key) {
          await getSavedCompanyDetail(
            (ident.key || ident.id) as string,
            undefined,
            { forceRefresh: true } as any,
          );
        }
      } catch (upstreamErr: any) {
        const code = upstreamErr?.code;
        if (code === "LIMIT_EXCEEDED") {
          toast.warning("You've hit your refresh limit for this billing period.");
        } else if (code) {
          console.warn("[CompanyProfileV2] upstream refresh failed", code, upstreamErr);
        }
      }
      await refetch();
      toast.success("Profile refreshed");
    } catch (e: any) {
      toast.error(`Refresh failed: ${String(e?.message ?? e)}`);
    } finally {
      setRefreshing(false);
    }
  }, [data, refetch, refreshing]);

  const handleShare = useCallback(() => {
    toast.info("Share — available in the legacy view this week", {
      action: {
        label: "Open legacy",
        onClick: () => navigate(`/app/companies/${encodeURIComponent(id)}/legacy`),
      },
    });
  }, [id, navigate]);

  const handleExportPdf = useCallback(() => {
    toast.info("Export — available in the legacy view this week", {
      action: {
        label: "Open legacy",
        onClick: () => navigate(`/app/companies/${encodeURIComponent(id)}/legacy`),
      },
    });
  }, [id, navigate]);

  if (loading && !data) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-slate-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading company profile…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <ServerCrash className="w-6 h-6 text-rose-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            {error.code === "COMPANY_NOT_FOUND" ? "Company not found" : "Couldn't load profile"}
          </h2>
          <p className="text-sm text-slate-600 mb-2">{error.message}</p>
          {error.hint ? <p className="text-xs text-slate-400 mb-6">{error.hint}</p> : null}
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link
              to="/app/command-center"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Command Center
            </Link>
            <button
              onClick={() => refetch()}
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

  if (!data || !headerProps) return null;

  const profileForCDP = {
    name: headerProps.company.name,
    domain: headerProps.company.domain,
    website: headerProps.company.website,
    countryCode: headerProps.company.countryCode,
    countryName: headerProps.company.countryName,
    address: headerProps.company.address,
    phone: headerProps.company.phone,
    timeSeries: data.shipments?.monthly ?? [],
    topRoutes: data.shipments?.top_routes ?? [],
    topOrigins: data.shipments?.top_origins ?? [],
    topDestinations: data.shipments?.top_destinations ?? [],
    recentBols: data.shipments?.recent_bols ?? [],
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {usedFallback ? (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-2 flex items-center justify-center">
          <span>
            Aggregator unreachable — using in-browser resolver fallback. Identity loads;
            Shipments / Activity / Pulse may be empty.{" "}
            <Link
              to={`/app/companies/${encodeURIComponent(id)}/legacy`}
              className="underline font-medium"
            >
              Switch to legacy view
            </Link>
          </span>
        </div>
      ) : null}

      <CDPHeader
        company={
          {
            ...headerProps.company,
            // Surface the In-CRM badge through the existing prop the
            // header already understands (CompanyShape doesn't carry the
            // flag explicitly — CDPHeader infers from `id` presence + the
            // Star control. We pass starred=inCrm so the star icon fills.)
          } as any
        }
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
        manualRefreshing={refreshing}
        snapshotUpdatedAt={data.identity.sources.importyeti.updated_at ?? null}
      />

      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
          <div className="ml-auto text-xs text-slate-400">
            <Link
              to={`/app/companies/${encodeURIComponent(id)}/legacy`}
              className="hover:text-slate-600 underline-offset-2 hover:underline"
            >
              Legacy view
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          {activeTab === "supply-chain" ? <CDPSupplyChain profile={profileForCDP as any} /> : null}
          {activeTab === "contacts" ? (
            <CDPContacts
              companyId={data.identity.id}
              companyName={data.identity.display.name}
              companyDomain={data.identity.display.domain}
              companyLocation={[data.identity.display.address.city, data.identity.display.address.state]
                .filter(Boolean)
                .join(", ")}
            />
          ) : null}
          {activeTab === "pulse" ? (
            <CDPResearch
              companyName={data.identity.display.name}
              pulseBrief={(data.pulse?.brief ?? null) as any}
              pulseLoading={false}
              pulseError={null as any}
              pulseUsage={null as any}
              onPulse={() => {}}
              onRefresh={() => refetch()}
              onShareHtml={handleShare}
              onExportPdf={handleExportPdf}
            />
          ) : null}
          {activeTab === "activity" ? <CDPActivity companyId={data.identity.id} /> : null}
        </div>

        {panelOpen ? (
          <div>
            <CDPDetailsPanel
              company={headerProps.company as any}
              kpis={headerProps.kpis as any}
              profile={profileForCDP as any}
              onRefresh={handleManualRefresh}
              refreshing={refreshing}
              snapshotUpdatedAt={data.identity.sources.importyeti.updated_at ?? null}
            />
          </div>
        ) : null}
      </div>

      <AddToCampaignModal
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        company={{
          company_id: data.identity.id,
          name: data.identity.display.name,
        }}
      />
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
