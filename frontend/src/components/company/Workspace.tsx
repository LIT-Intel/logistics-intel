import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  DollarSign,
  Globe,
  Ship,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { CrmSavedCompany, IyCompanyProfile } from "@/lib/api";
import { buildCompanySnapshot, type CompanySnapshot } from "@/components/common/companyViewModel";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type WorkspaceTab = "Overview" | "Shipments" | "Contacts" | "Campaigns" | "RFP notes";

const WORKSPACE_TABS: WorkspaceTab[] = [
  "Overview",
  "Shipments",
  "Contacts",
  "Campaigns",
  "RFP notes",
];

type WorkspaceProps = {
  companies: CrmSavedCompany[];
  activeCompanyId: string | null;
  onSelectCompany: (id: string) => void;
  iyProfile: IyCompanyProfile | null;
  enrichment: any | null;
  isLoadingProfile?: boolean;
  errorProfile?: string | null;
  onSaveCompany: (company: CrmSavedCompany | IyCompanyProfile) => Promise<void>;
};

export default function Workspace({
  companies,
  activeCompanyId,
  onSelectCompany,
  iyProfile,
  enrichment,
  isLoadingProfile = false,
  errorProfile = null,
  onSaveCompany,
}: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");

  useEffect(() => {
    setActiveTab("Overview");
  }, [activeCompanyId]);

  const activeCompany = useMemo(
    () => companies.find((record) => record.company_id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const snapshot = useMemo(() => {
    if (!iyProfile && !activeCompany) return null;
    return buildCompanySnapshot({
      profile: iyProfile,
      enrichment,
      fallback: activeCompany
        ? {
            companyId: activeCompany.company_id,
            name:
              (activeCompany.payload as any)?.normalized_company?.name ??
              activeCompany.payload?.name ??
              activeCompany.company_id,
            payload: activeCompany.payload ?? null,
          }
        : null,
    });
  }, [iyProfile, enrichment, activeCompany]);

  const handleSaveClick = async () => {
    const target = iyProfile ?? activeCompany;
    if (!target) return;
    await onSaveCompany(target);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto flex max-w-7xl gap-4">
        <SavedCompaniesRail
          companies={companies}
          activeCompanyId={activeCompanyId}
          onSelectCompany={onSelectCompany}
        />
        <section className="flex-1">
          {isLoadingProfile ? (
            <PanelShell>
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-slate-500">
                <Sparkles className="h-6 w-6 animate-spin text-indigo-400" />
                <p>Loading Command Center…</p>
              </div>
            </PanelShell>
          ) : errorProfile ? (
            <PanelShell>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorProfile}
              </div>
            </PanelShell>
          ) : !snapshot ? (
            <PanelShell>
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Sparkles className="h-10 w-10 text-indigo-300" />
                <p className="max-w-md text-sm text-slate-500">
                  Save a company from LIT Search to explore KPIs, AI insights, and shipment
                  intelligence inside Command Center.
                </p>
              </div>
            </PanelShell>
          ) : (
            <div className="space-y-6">
              <WorkspaceHeader
                snapshot={snapshot}
                onSaveClick={handleSaveClick}
                isSaveDisabled={!iyProfile && !activeCompany}
              />
              <HeroBanner snapshot={snapshot} />
              <WorkspaceTabsSection
                activeTab={activeTab}
                onTabChange={setActiveTab}
                snapshot={snapshot}
                enrichment={enrichment}
              />
              <ChartsAndLanes snapshot={snapshot} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type SavedCompaniesRailProps = {
  companies: CrmSavedCompany[];
  activeCompanyId: string | null;
  onSelectCompany: (id: string) => void;
};

const SavedCompaniesRail: React.FC<SavedCompaniesRailProps> = ({
  companies,
  activeCompanyId,
  onSelectCompany,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const items = useMemo(
    () =>
      companies.map((record) => {
        const payload = record.payload ?? {};
        const normalized = (payload as any)?.normalized_company ?? {};
        const name =
          normalized?.name ??
          (payload as any)?.profile?.name ??
          payload?.name ??
          record.company_id;
        const city = normalized?.city ?? (payload as any)?.profile?.city ?? null;
        const state = normalized?.state ?? (payload as any)?.profile?.state ?? null;
        const country = normalized?.country ?? (payload as any)?.profile?.country ?? null;
        const shipments = (payload as any)?.shipments_12m ?? null;
        return {
          id: record.company_id,
          name,
          location: [city, state, country].filter(Boolean).join(", ") || "Location unknown",
          shipments:
            typeof shipments === "number" && Number.isFinite(shipments) ? shipments : null,
        };
      }),
    [companies],
  );

  return (
    <aside
      className={cn(
        "relative flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-200",
        isOpen ? "w-72" : "w-14",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        {isOpen ? (
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Saved companies
            </span>
            <span className="mt-1 text-xs text-slate-500">{companies.length} companies</span>
          </div>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            CC
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
        >
          {isOpen ? "←" : "→"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-slate-500">
            No saved companies yet – save from Search to see them here.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const isActive = item.id === activeCompanyId;
              const initials = item.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((chunk) => chunk[0]?.toUpperCase() ?? "")
                .join("")
                .padEnd(2, "·");
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCompany(item.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-3 text-left text-xs transition-colors",
                      isActive
                        ? "bg-indigo-50/80 border-l-4 border-l-[#5C4DFF]"
                        : "hover:bg-slate-50",
                    )}
                  >
                    <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#5C4DFF] to-[#7F5CFF] text-[11px] font-semibold text-white shadow-sm">
                      {initials}
                    </div>
                    {isOpen && (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold tracking-[0.16em] text-slate-800">
                          {item.name.toUpperCase()}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{item.location}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Shipments 12m: {item.shipments?.toLocaleString() ?? "—"}
                        </p>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

type HeaderProps = {
  snapshot: CompanySnapshot;
  onSaveClick: () => void;
  isSaveDisabled: boolean;
};

const WorkspaceHeader: React.FC<HeaderProps> = ({ snapshot, onSaveClick, isSaveDisabled }) => {
  return (
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-400">
            Workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Command Center
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Saved shippers, shipment KPIs, and pre-call prep in one view.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
              <span className="text-base leading-none">{getCountryFlag(snapshot.countryCode)}</span>
              <span>
                {snapshot.displayName} · {snapshot.countryName || "HQ"}
              </span>
            </span>
            <span>
              Source: <span className="font-semibold text-indigo-600">LIT Search Intelligence</span> · Gemini auto-enriched from
              public customs data
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
          >
            Export PDF
          </button>
          <button
            type="button"
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-md shadow-slate-400/40 hover:bg-black"
          >
            Generate brief
          </button>
          <button
            type="button"
            onClick={onSaveClick}
            disabled={isSaveDisabled}
            className="rounded-full border border-indigo-600 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save to CRM
          </button>
        </div>
      </div>
    </header>
  );
};

type HeroProps = {
  snapshot: CompanySnapshot;
};

const HeroBanner: React.FC<HeroProps> = ({ snapshot }) => {
  const initials = snapshot.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "·");

  const lastShipment = snapshot.recentShipmentDate
    ? new Date(snapshot.recentShipmentDate).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-6 shadow-sm">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.6fr)]">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#5C4DFF] to-[#7F5CFF] text-lg font-semibold text-white shadow-lg">
            {initials}
          </div>
          <div className="space-y-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {snapshot.displayName}
              </h2>
              <p className="text-sm text-slate-500">{snapshot.address ?? "Address unavailable"}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <Badge icon={<Building2 className="h-3 w-3" />}>Verified shipper</Badge>
              <Badge icon={<Globe className="h-3 w-3" />}>{snapshot.domain ?? snapshot.website ?? "No website"}</Badge>
            </div>
            <div className="text-xs text-slate-600">
              Contacts available soon · Gemini insights ready for this company
            </div>
          </div>
        </div>
        <div className="flex h-full flex-col justify-between rounded-2xl border border-[#5C4DFF]/40 bg-white/80 px-4 py-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Most recent shipment
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-[#5C4DFF]">{lastShipment}</p>
          <p className="mt-1 text-xs text-slate-600">
            {snapshot.topRouteLabel ?? "Route data not available"}
          </p>
          <div className="mt-3 text-[11px] text-slate-500">Live import data synced from customs filings.</div>
        </div>
      </div>
    </section>
  );
};

type TabsSectionProps = {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  snapshot: CompanySnapshot;
  enrichment: any | null;
};

const WorkspaceTabsSection: React.FC<TabsSectionProps> = ({ activeTab, onTabChange, snapshot, enrichment }) => {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-xs">
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              tab === activeTab
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)]">
        <div>{renderTabContent(activeTab, snapshot, enrichment)}</div>
        <div className="space-y-3">
          <KpiTile
            icon={<Ship className="h-4 w-4" />}
            label="Shipments (12m)"
            value={formatNumber(snapshot.shipments12m)}
            accent="from-emerald-50 to-emerald-100"
          />
          <KpiTile
            icon={<TrendingUp className="h-4 w-4" />}
            label="TEU (12m)"
            value={formatNumber(snapshot.teus12m)}
            accent="from-sky-50 to-sky-100"
          />
          <KpiTile
            icon={<DollarSign className="h-4 w-4" />}
            label="Est. Spend (12m)"
            value={formatCurrency(snapshot.estSpend12m)}
            accent="from-amber-50 to-amber-100"
          />
        </div>
      </div>
    </section>
  );
};

const ChartsAndLanes: React.FC<{ snapshot: CompanySnapshot }> = ({ snapshot }) => {
  const maxVolume = snapshot.timeSeries.reduce((acc, point) => {
    const total = point.fcl + point.lcl;
    return total > acc ? total : acc;
  }, 0);

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Shipment activity</h3>
          <span className="text-xs text-slate-500">Last 12 months</span>
        </div>
        {snapshot.timeSeries.length === 0 ? (
          <div className="mt-6 text-xs text-slate-500">No shipment time series available.</div>
        ) : (
          <div className="mt-6 flex items-end gap-3 overflow-x-auto">
            {snapshot.timeSeries.map((point) => {
              const total = point.fcl + point.lcl;
              const height = maxVolume ? Math.max((total / maxVolume) * 120, 6) : 6;
              const fclHeight = maxVolume ? Math.max((point.fcl / maxVolume) * 120, 2) : 2;
              const lclHeight = Math.max(height - fclHeight, 2);
              return (
                <div key={point.label} className="flex flex-col items-center gap-2 text-xs text-slate-500">
                  <div className="flex w-6 flex-col justify-end gap-0.5">
                    <div
                      className="rounded-t-md bg-indigo-500"
                      style={{ height: `${fclHeight}px` }}
                    />
                    <div className="rounded-b-md bg-slate-300" style={{ height: `${lclHeight}px` }} />
                  </div>
                  <span className="text-[10px] text-slate-500">{point.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Top lanes</h3>
          <span className="text-xs text-slate-500">12m volume</span>
        </div>
        {snapshot.topRoutes.length === 0 ? (
          <div className="mt-6 text-xs text-slate-500">No lane data available.</div>
        ) : (
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {snapshot.topRoutes.slice(0, 6).map((lane) => (
              <li key={lane.label} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="font-medium text-slate-900">{lane.label}</p>
                <div className="mt-1 text-[11px] text-slate-500">
                  {formatNumber(lane.shipments) ?? "—"} shipments · {formatNumber(lane.teu) ?? "—"} TEU
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

const Badge: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
    {icon}
    {children}
  </span>
);

const KpiTile: React.FC<{ icon: React.ReactNode; label: string; value: string; accent: string }> = ({
  icon,
  label,
  value,
  accent,
}) => (
  <div className={cn("rounded-2xl border border-slate-100 px-4 py-3", `bg-gradient-to-br ${accent}`)}>
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
      {icon}
      {label}
    </div>
    <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
  </div>
);

const renderTabContent = (
  tab: WorkspaceTab,
  snapshot: CompanySnapshot,
  enrichment: any | null,
) => {
  switch (tab) {
    case "Overview": {
      return (
        <div className="space-y-4 text-sm text-slate-600">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p>{snapshot.aiSummary ?? "No AI summary available yet for this company."}</p>
          </div>
          {snapshot.keySuppliers.length > 0 && (
            <div className="rounded-2xl border border-slate-100 px-4 py-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key suppliers</h4>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {snapshot.keySuppliers.slice(0, 5).map((supplier) => (
                  <li key={supplier}>{supplier}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "Shipments": {
      return snapshot.timeSeries.length === 0 ? (
        <div className="text-xs text-slate-500">No shipment history yet.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2 text-right">FCL</th>
                <th className="px-4 py-2 text-right">LCL</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.timeSeries.map((point) => (
                <tr key={point.label} className="border-t text-slate-600">
                  <td className="px-4 py-2">{point.label}</td>
                  <td className="px-4 py-2 text-right">{formatNumber(point.fcl)}</td>
                  <td className="px-4 py-2 text-right">{formatNumber(point.lcl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "Contacts": {
      const contacts = enrichment?.logistics_kpis?.contacts ?? [];
      return contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-xs text-slate-500">
          No contacts enriched yet. Once Lusha/ZoomInfo sync is wired, they’ll appear here.
        </div>
      ) : (
        <ul className="space-y-3">
          {contacts.map((contact: any) => (
            <li key={contact.email} className="rounded-2xl border border-slate-100 px-4 py-3">
              <p className="font-medium text-slate-900">{contact.name}</p>
              <p className="text-xs text-slate-500">{contact.title}</p>
            </li>
          ))}
        </ul>
      );
    }
    case "Campaigns": {
      const campaigns = enrichment?.sales_assets?.campaign_support ?? [];
      return campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-xs text-slate-500">
          No recommended campaigns yet. Gemini will surface playbooks once available.
        </div>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((campaign: any, index: number) => (
            <li key={`${campaign?.name ?? index}`} className="rounded-2xl border border-slate-100 px-4 py-3">
              <p className="font-medium text-slate-900">{campaign?.name ?? `Campaign ${index + 1}`}</p>
              <p className="text-xs text-slate-500">{campaign?.summary ?? "Auto-generated sequence"}</p>
            </li>
          ))}
        </ul>
      );
    }
    case "RFP notes": {
      const notes =
        enrichment?.sales_assets?.rfp_support?.notes ??
        enrichment?.command_center_enrichment?.rfp_notes ??
        [];
      return notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-xs text-slate-500">
          No RFP notes yet. Upload an RFP to see structured guidance.
        </div>
      ) : (
        <ul className="list-disc space-y-2 pl-4 text-sm text-slate-600">
          {notes.map((note: string, index: number) => (
            <li key={`${note}-${index}`}>{note}</li>
          ))}
        </ul>
      );
    }
    default:
      return null;
  }
};

const formatNumber = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Math.round(Number(value)).toLocaleString()}`;
};

const getCountryFlag = (code?: string | null) => {
  if (!code) return "🌐";
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return "🌐";
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
};

const PanelShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
);
