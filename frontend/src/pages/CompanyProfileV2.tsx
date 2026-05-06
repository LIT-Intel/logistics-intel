/**
 * Phase 1 — Preview container for the Company Profile data layer.
 *
 * Mounts at /app/companies/:id/preview (additive — does NOT replace
 * /app/companies/:id, which keeps rendering the existing Company.jsx
 * page). Demonstrates that:
 *
 *   1. CompanyProfileGuard catches malformed input.
 *   2. useCompanyProfile() resolves UUID/slug/domain/name+location via
 *      the new resolver and hits the company-profile edge function.
 *   3. The orphaned CDP components (already wired in Company.jsx) accept
 *      the new ProfileBundle shape.
 *
 * Phase 2 evaluates whether to migrate Company.jsx to consume this hook,
 * or to promote this page to the canonical /app/companies/:id route.
 *
 * Action callbacks (share, export, add-to-list, refresh, etc.) are stubs
 * here. Real handlers stay in Company.jsx until Phase 2 promotes them.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, Users, Workflow, Activity, ServerCrash } from "lucide-react";

import CDPHeader from "@/components/company/CDPHeader";
import CDPDetailsPanel from "@/components/company/CDPDetailsPanel";
import CDPSupplyChain from "@/components/company/CDPSupplyChain";
import CDPContacts from "@/components/company/CDPContacts";
import CDPResearch from "@/components/company/CDPResearch";
import CDPActivity from "@/components/company/CDPActivity";
import CompanyProfileGuard from "@/components/company/CompanyProfileGuard";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import type { ProfileBundle } from "@/lib/companyProfile.types";

type TabId = "supply-chain" | "contacts" | "pulse" | "activity";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "supply-chain", label: "Supply Chain", icon: Workflow },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "pulse", label: "Pulse AI", icon: Sparkles },
  { id: "activity", label: "Activity", icon: Activity },
];

function bundleToHeaderProps(bundle: ProfileBundle) {
  const d = bundle.identity.display;
  const m = bundle.identity.sources.metrics;
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
      contacts: bundle.contacts?.count ?? null,
      contactsVerified: bundle.contacts?.items.filter((c) => c.is_verified).length ?? null,
    },
  };
}

function ProfilePanel({ id }: { id: string }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("supply-chain");
  const [panelOpen, setPanelOpen] = useState(true);
  const [starred, setStarred] = useState(false);

  const { data, loading, error, refetch, usedFallback } = useCompanyProfile(id, {
    include: ["identity", "shipments", "contacts", "activity"],
  });

  const headerProps = useMemo(() => (data ? bundleToHeaderProps(data) : null), [data]);

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
          <p className="text-sm text-slate-600 mb-6">{error.message}</p>
          {error.hint ? <p className="text-xs text-slate-400 mb-6">{error.hint}</p> : null}
          <div className="flex items-center justify-center gap-3">
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
            <strong>Phase 1 preview</strong> — aggregator edge function not deployed yet; using
            in-browser resolver fallback. Shipments / Activity / Pulse will populate after deploy.
          </span>
        </div>
      ) : null}

      <CDPHeader
        company={headerProps.company as any}
        kpis={headerProps.kpis as any}
        starred={starred}
        onToggleStar={() => setStarred((s) => !s)}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((p) => !p)}
        onBack={() => navigate(-1)}
        onShare={() => {}}
        onExportPdf={() => {}}
        onAddToList={() => {}}
        onStartOutreach={() => {}}
        onPulse={() => setActiveTab("pulse")}
        onRefresh={() => refetch()}
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
              onShareHtml={() => {}}
              onExportPdf={() => {}}
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
              onRefresh={() => refetch()}
              snapshotUpdatedAt={data.identity.sources.importyeti.updated_at ?? null}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CompanyProfileV2() {
  const params = useParams();
  const rawId = params.id ?? null;
  return (
    <CompanyProfileGuard rawId={rawId}>
      {(resolvedId) => <ProfilePanel id={resolvedId} />}
    </CompanyProfileGuard>
  );
}
