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
import CompanyActivityChart from "@/components/command-center/CompanyActivityChart";
import {
  buildCompanySnapshot,
  type CompanySnapshot,
} from "@/components/common/companyViewModel";

const tabList = ["Overview", "Shipments", "Contacts", "Campaigns", "RFP notes"] as const;
type WorkspaceTab = (typeof tabList)[number];

type WorkspaceProps = {
  companies: CrmSavedCompany[];
  activeCompanyId: string | null;
  onSelectCompany: (id: string) => void;
  iyProfile: IyCompanyProfile | null;
  enrichment: any | null;
  isLoadingProfile?: boolean;
  errorProfile?: string | null;
  onSaveCompany: (company: CrmSavedCompany | IyCompanyProfile) => Promise<void>;
  companiesLoading?: boolean;
};

type ContactFilters = {
  search: string;
  title: string;
  location: string;
};

type NormalizedContact = {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  company?: string | null;
  source?: string | null;
};

type CampaignRecord = {
  id: string;
  name: string;
  channel?: string | null;
  personas?: string | null;
  status?: string | null;
  summary?: string | null;
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
  companiesLoading = false,
}: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");
  const [contactFilters, setContactFilters] = useState<ContactFilters>({
    search: "",
    title: "",
    location: "",
  });

  useEffect(() => {
    setActiveTab("Overview");
  }, [activeCompanyId]);

  const activeRecord = useMemo(
    () => companies.find((record) => record.company_id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const snapshot = useMemo(() => {
    if (!iyProfile && !activeRecord) return null;
    return buildCompanySnapshot({
      profile: iyProfile,
      enrichment,
      fallback: activeRecord
        ? {
            companyId: activeRecord.company_id,
            name:
              (activeRecord.payload as any)?.normalized_company?.name ??
              activeRecord.payload?.name ??
              activeRecord.company_id,
            payload: activeRecord.payload ?? null,
          }
        : null,
    });
  }, [iyProfile, enrichment, activeRecord]);

  const contacts = useMemo(() => normalizeContacts(enrichment), [enrichment]);
  const filteredContacts = useMemo(
    () => filterContacts(contacts, contactFilters),
    [contacts, contactFilters],
  );
  const campaigns = useMemo(() => normalizeCampaigns(enrichment), [enrichment]);
  const rfpNotes = useMemo(() => normalizeRfpNotes(enrichment), [enrichment]);

  const handleSaveClick = async () => {
    const target = iyProfile ?? activeRecord;
    if (!target) return;
    await onSaveCompany(target);
  };

  if (isLoadingProfile && !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-sm text-slate-500">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          Loading Command Center…
        </div>
      </div>
    );
  }

  if (errorProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700 shadow-sm">
          {errorProfile}
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-indigo-300" />
          <p className="text-sm text-slate-600">
            Save a company from LIT Search to populate Command Center with live KPIs and Gemini
            insights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto flex max-w-7xl gap-4">
        <SavedCompaniesRail
          companies={companies}
          activeCompanyId={activeCompanyId}
          onSelectCompany={onSelectCompany}
          isLoading={companiesLoading}
        />
        <div className="flex flex-1 flex-col gap-6">
          <WorkspaceHeader snapshot={snapshot} onSaveClick={handleSaveClick} hasSelection={Boolean(activeRecord || iyProfile)} />
          <HeroBanner snapshot={snapshot} companyRecord={activeRecord} />
          <WorkspaceTabsSection
            snapshot={snapshot}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            contacts={contacts}
            filteredContacts={filteredContacts}
            contactFilters={contactFilters}
            onContactFiltersChange={setContactFilters}
            campaigns={campaigns}
            rfpNotes={rfpNotes}
          />
          <ChartsAndLanes snapshot={snapshot} />
        </div>
      </div>
    </div>
  );
}

type SavedCompaniesRailProps = {
  companies: CrmSavedCompany[];
  activeCompanyId: string | null;
  onSelectCompany: (id: string) => void;
  isLoading: boolean;
};

const SavedCompaniesRail: React.FC<SavedCompaniesRailProps> = ({
  companies,
  activeCompanyId,
  onSelectCompany,
  isLoading,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const items = useMemo(() => {
    return companies.map((record) => {
      const payload = record.payload ?? {};
      const normalized = (payload as any)?.normalized_company ?? {};
      const name =
        normalized.name ??
        (payload as any)?.profile?.name ??
        payload?.name ??
        record.company_id;
      const code =
        normalized.code ??
        (
          name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((chunk) => chunk[0]?.toUpperCase() ?? "")
            .join("") || "—"
        );
      const city = normalized.city ?? (payload as any)?.profile?.city ?? null;
      const state = normalized.state ?? (payload as any)?.profile?.state ?? null;
      const country = normalized.country ?? (payload as any)?.profile?.country ?? null;
      const shipments = (payload as any)?.shipments_12m ?? null;
      const recentShipment =
        (payload as any)?.last_shipment_date ??
        (payload as any)?.recent_shipment ??
        null;
      const routeLabel =
        (payload as any)?.top_route_label ??
        (payload as any)?.most_recent_route?.label ??
        null;
      return {
        id: record.company_id,
        name,
        code: code.slice(0, 2).padEnd(2, "·"),
        location: [city, state, country].filter(Boolean).join(", ") || "Location unavailable",
        shipments,
        recentShipment,
        routeLabel,
      };
    });
  }, [companies]);

  return (
    <aside
      className={`relative flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-200 ${
        isOpen ? "w-72" : "w-12"
      }`}
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
          <span className="mx-auto text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            CC
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] text-slate-500 hover:bg-slate-100"
        >
          {isOpen ? "←" : "→"}
        </button>
      </div>
      {isOpen && (
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-4 text-[11px] text-slate-500">Loading saved companies…</div>
          ) : !items.length ? (
            <div className="px-3 py-4 text-[11px] text-slate-500">
              No saved companies yet. Save a shipper from LIT Search to see it here.
            </div>
          ) : (
            items.map((company) => {
              const isActive = company.id === activeCompanyId;
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => onSelectCompany(company.id)}
                  className={`flex w-full items-start gap-3 px-3 py-3 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-indigo-50/80 border-l-4 border-l-[#5C4DFF]"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#5C4DFF] to-[#7F5CFF] text-[11px] font-semibold text-white shadow-sm">
                    {company.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold tracking-[0.16em] text-slate-800">
                      {company.name.toUpperCase()}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{company.location}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {company.recentShipment
                        ? `Recent: ${formatDate(company.recentShipment)}`
                        : "No recent shipment"}
                      {company.routeLabel ? ` · ${company.routeLabel}` : ""}
                    </p>
                    {typeof company.shipments === "number" && (
                      <p className="text-[10px] text-slate-400">
                        {company.shipments.toLocaleString()} shipments · 12m
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
};

type HeaderProps = {
  snapshot: CompanySnapshot;
  onSaveClick: () => void;
  hasSelection: boolean;
};

const WorkspaceHeader: React.FC<HeaderProps> = ({ snapshot, onSaveClick, hasSelection }) => {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
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
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
            <span className="text-base leading-none">{getCountryFlag(snapshot.countryCode)}</span>
            <span>{snapshot.displayName} · {snapshot.countryName || "HQ"}</span>
          </span>
          <span>
            Source: <span className="font-semibold text-indigo-600">LIT Search Intelligence</span> · Gemini auto-enriched from public customs data
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100">
          Export PDF
        </button>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-md shadow-slate-400/40 hover:bg-black">
          Generate brief
        </button>
        <button
          type="button"
          onClick={onSaveClick}
          disabled={!hasSelection}
          className="rounded-full border border-indigo-600 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save to CRM
        </button>
      </div>
    </header>
  );
};

type HeroProps = {
  snapshot: CompanySnapshot;
  companyRecord: CrmSavedCompany | null;
};

const HeroBanner: React.FC<HeroProps> = ({ snapshot, companyRecord }) => {
  const initials = snapshot.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "·");

  const payload = companyRecord?.payload ?? {};
  const phone = (payload as any)?.phone ?? (payload as any)?.profile?.phone ?? null;
  const website = snapshot.domain ?? snapshot.website;
  const lastShipmentLabel = snapshot.recentShipmentDate
    ? formatDate(snapshot.recentShipmentDate)
    : "No shipments logged";

  return (
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-6 shadow-sm">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5C4DFF] to-[#7F5CFF] text-lg font-semibold text-white shadow-sm">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-900">
                  {snapshot.displayName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200/80">
                  <span className="text-base leading-none">{getCountryFlag(snapshot.countryCode)}</span>
                  <span>{snapshot.countryName ?? "Global"} HQ</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{snapshot.locationLabel}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-800">
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5">
                  <span className="h-3 w-3 rounded-full bg-gradient-to-br from-indigo-400 to-sky-400" />
                  <span>{snapshot.countryName || "Worldwide"} operations</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Verified shipper</span>
                </span>
              </div>
            </div>
          </div>
          <div className="grid gap-4 text-xs text-slate-700 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Contacts
              </p>
              {phone && <p className="text-sm text-slate-900">{phone}</p>}
              {website && (
                <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-700">
                  {website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Supply chain focus
              </p>
              <p>Insights powered by LIT Search + Gemini enrichment for this company.</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Current play
              </p>
              <p>Use the tabs below to prep campaigns, contacts, RFP notes, and shipment intel.</p>
            </div>
          </div>
        </div>
        <div className="flex h-full flex-col justify-between rounded-2xl border border-[#5C4DFF]/40 bg-white/80 px-4 py-4 shadow-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Most recent shipment
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-[#5C4DFF]">
              {lastShipmentLabel}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {snapshot.topRouteLabel ?? "Route data not available"}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800">
              Open shipment timeline
            </button>
            <button className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-50">
              View historical shipments
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

type TabsSectionProps = {
  snapshot: CompanySnapshot;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  contacts: NormalizedContact[];
  filteredContacts: NormalizedContact[];
  contactFilters: ContactFilters;
  onContactFiltersChange: (filters: ContactFilters) => void;
  campaigns: CampaignRecord[];
  rfpNotes: string[];
};

const WorkspaceTabsSection: React.FC<TabsSectionProps> = ({
  snapshot,
  activeTab,
  onTabChange,
  contacts,
  filteredContacts,
  contactFilters,
  onContactFiltersChange,
  campaigns,
  rfpNotes,
}) => {
  const [noteDraft, setNoteDraft] = useState("");

  const shipmentsTable = snapshot.timeSeries;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-xs">
        {tabList.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              tab === activeTab ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,2.1fr)_minmax(0,2fr)] text-xs text-slate-700">
        <div className="space-y-3">
          {activeTab === "Overview" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Narrative snapshot</h4>
                <p className="mt-1 text-sm text-slate-700">
                  {snapshot.aiSummary ??
                    "Gemini insights are still processing for this company. Once enrichment completes, you'll see the latest guidance here."}
                </p>
              </div>
              {snapshot.keySuppliers.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Key suppliers
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                    {snapshot.keySuppliers.slice(0, 5).map((supplier) => (
                      <li key={supplier}>{supplier}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === "Shipments" && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">Shipment view</h4>
              {shipmentsTable.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No time-series data yet. Once this company has activity in ImportYeti, monthly FCL/LCL breakdowns will appear here.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Month</th>
                        <th className="px-3 py-2">FCL</th>
                        <th className="px-3 py-2">LCL</th>
                        <th className="px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipmentsTable.map((row) => (
                        <tr key={row.label} className="odd:bg-white even:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                          <td className="px-3 py-2">{formatNumber(row.fcl)}</td>
                          <td className="px-3 py-2">{formatNumber(row.lcl)}</td>
                          <td className="px-3 py-2">{formatNumber(row.fcl + row.lcl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "Contacts" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Contacts</h4>
              <p>
                This panel hydrates from Gemini/CRM enrichment. Filter to quickly find the right persona for outreach.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Search
                  </label>
                  <input
                    value={contactFilters.search}
                    onChange={(e) => onContactFiltersChange({ ...contactFilters, search: e.target.value })}
                    placeholder="Name, title or email"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Title contains
                  </label>
                  <input
                    value={contactFilters.title}
                    onChange={(e) => onContactFiltersChange({ ...contactFilters, title: e.target.value })}
                    placeholder="e.g. director, vp"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    City / State
                  </label>
                  <input
                    value={contactFilters.location}
                    onChange={(e) => onContactFiltersChange({ ...contactFilters, location: e.target.value })}
                    placeholder="e.g. Bentonville, AR"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                  />
                </div>
              </div>
              <div className="space-y-2">
                {filteredContacts.length === 0 ? (
                  <p className="text-[11px] italic text-slate-500">
                    No contacts match the current filters or enrichment is still running.
                  </p>
                ) : (
                  filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
                          {contact.name
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{contact.name}</p>
                          {contact.title && <p className="text-[11px] text-slate-600">{contact.title}</p>}
                          <p className="text-[11px] text-slate-500">
                            {[contact.city, contact.state].filter(Boolean).join(", ") || "Location unknown"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-slate-600">
                        {contact.email && <p>{contact.email}</p>}
                        {contact.phone && <p className="mt-0.5">{contact.phone}</p>}
                        {contact.source && (
                          <p className="mt-0.5 text-slate-400">Source: {contact.source}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "Campaigns" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Campaigns</h4>
              {campaigns.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No campaign support data from Gemini yet. Once campaign recommendations are available, they will display here.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Channel</th>
                        <th className="px-3 py-2">Target personas</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => (
                        <tr key={campaign.id} className="odd:bg-white even:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {campaign.name}
                            {campaign.summary && (
                              <div className="text-[11px] font-normal text-slate-500">{campaign.summary}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">{campaign.channel ?? "—"}</td>
                          <td className="px-3 py-2">{campaign.personas ?? "—"}</td>
                          <td className="px-3 py-2 text-emerald-700">{campaign.status ?? "Planned"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "RFP notes" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">RFP notes</h4>
              {rfpNotes.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4">
                  {rfpNotes.map((note, index) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  No Gemini-generated RFP notes for this company yet. Capture your own below.
                </p>
              )}
              <textarea
                rows={5}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Ex: Walmart TPEB ocean RFP expected Q3. Priorities: rate stability, Tacoma dwell, MX pilot lanes."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
              />
              <p className="text-[10px] text-slate-400">
                Notes stay local for now; sync with CRM after Save to CRM.
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-3 text-xs text-slate-700 md:grid-cols-1 lg:grid-cols-1 xl:grid-cols-3">
          <KpiTile
            icon={<Ship className="h-4 w-4" />}
            label="Shipments (12m)"
            value={formatNumber(snapshot.shipments12m)}
            badge="Live"
            accent="from-emerald-50 to-emerald-100"
          />
          <KpiTile
            icon={<TrendingUp className="h-4 w-4" />}
            label="TEU (12m)"
            value={formatNumber(snapshot.teus12m)}
            badge="Indexed"
            accent="from-sky-50 to-sky-100"
          />
          <KpiTile
            icon={<DollarSign className="h-4 w-4" />}
            label="Est. spend (12m)"
            value={formatCurrency(snapshot.estSpend12m)}
            badge="Modeled"
            accent="from-amber-50 to-amber-100"
          />
        </div>
      </div>
    </section>
  );
};

type KpiTileProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: string;
  accent: string;
};

const KpiTile: React.FC<KpiTileProps> = ({ icon, label, value, badge, accent }) => (
  <div className={`flex flex-col justify-between rounded-2xl border border-slate-200 bg-gradient-to-br ${accent} px-4 py-3 shadow-sm`}>
    <div className="flex items-center justify-between text-xs text-slate-700">
      <span className="font-semibold">{label}</span>
      {badge && (
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {badge}
        </span>
      )}
    </div>
    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    <span className="mt-2 text-sm text-slate-700">{icon}</span>
  </div>
);

type ChartsProps = {
  snapshot: CompanySnapshot;
};

const ChartsAndLanes: React.FC<ChartsProps> = ({ snapshot }) => {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Sea shipments over time</h2>
            <p className="text-xs text-slate-500">Last 12 months · FCL vs LCL mix</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600" />
              FCL
            </div>
            <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-lime-400" />
              LCL
            </div>
          </div>
        </div>
        <CompanyActivityChart data={snapshot.timeSeries} />
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard title="Top origin" value={(snapshot.topRoutes[0]?.label?.split("→")[0]?.trim() ?? "—")} helper="Based on TEU" />
          <SummaryCard title="Top destination" value={(snapshot.topRoutes[0]?.label?.split("→")[1]?.trim() ?? "—")} helper="Most recent 12m" />
          <SummaryCard title="Lane concentration" value="Top 5 lanes" helper="Auto-calculated" />
          <SummaryCard title="Carrier diversification" value="Use shipment view" helper="Monitor mix" />
        </div>
        <div className="flex flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Top lanes (12m)</h3>
              <p className="text-xs text-slate-500">Derived from ImportYeti routes</p>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            {snapshot.topRoutes.length === 0 ? (
              <p className="text-slate-500">No lane data yet for this company.</p>
            ) : (
              snapshot.topRoutes.slice(0, 5).map((lane) => (
                <div
                  key={lane.label}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="text-[11px] font-medium text-slate-900">{lane.label}</p>
                    <p className="text-[11px] text-slate-600">
                      {formatNumber(lane.shipments)} shipments
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-600">
                    <p>{formatNumber(lane.teu)} TEU</p>
                    {lane.estSpendUsd != null && (
                      <p className="text-slate-400">{formatCurrency(lane.estSpendUsd)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

type SummaryCardProps = {
  title: string;
  value: string;
  helper?: string;
};

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, helper }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    {helper && <p className="text-[11px] text-slate-500">{helper}</p>}
  </div>
);

function normalizeContacts(enrichment: any): NormalizedContact[] {
  if (!enrichment) return [];
  const candidateSources = [
    enrichment?.contacts,
    enrichment?.command_center_enrichment?.contacts,
    enrichment?.sales_assets?.contacts,
    enrichment?.logistics_kpis?.contacts,
    enrichment?.contact_enrichment,
  ];
  for (const source of candidateSources) {
    if (Array.isArray(source) && source.length) {
      return source
        .map((entry, index) => {
          const location = (entry?.location as string | undefined) ??
            [entry?.city, entry?.state].filter(Boolean).join(", ");
          return {
            id: String(entry?.id ?? `${entry?.email ?? index}` ?? index),
            name: entry?.name ?? entry?.full_name ?? entry?.contact_name ?? "",
            title: entry?.title ?? entry?.role ?? entry?.position ?? null,
            email: entry?.email ?? entry?.email_address ?? null,
            phone: entry?.phone ?? entry?.phone_number ?? entry?.phoneNumber ?? null,
            city: entry?.city ?? null,
            state: entry?.state ?? null,
            company: entry?.company ?? entry?.organization ?? null,
            source: entry?.source ?? entry?.provider ?? null,
            location,
          } satisfies NormalizedContact;
        })
        .filter((contact) => Boolean(contact.name));
    }
  }
  return [];
}

function filterContacts(contacts: NormalizedContact[], filters: ContactFilters) {
  const search = filters.search.trim().toLowerCase();
  const titleFilter = filters.title.trim().toLowerCase();
  const locationFilter = filters.location.trim().toLowerCase();
  return contacts.filter((contact) => {
    const matchesSearch =
      !search ||
      contact.name.toLowerCase().includes(search) ||
      (contact.title ?? "").toLowerCase().includes(search) ||
      (contact.email ?? "").toLowerCase().includes(search);
    const matchesTitle = !titleFilter || (contact.title ?? "").toLowerCase().includes(titleFilter);
    const loc = [contact.city, contact.state].filter(Boolean).join(", ").toLowerCase();
    const matchesLocation = !locationFilter || loc.includes(locationFilter);
    return matchesSearch && matchesTitle && matchesLocation;
  });
}

function normalizeCampaigns(enrichment: any): CampaignRecord[] {
  if (!enrichment) return [];
  const sources = [
    enrichment?.sales_assets?.campaign_support,
    enrichment?.command_center_enrichment?.campaigns,
    enrichment?.campaigns,
  ];
  for (const source of sources) {
    if (Array.isArray(source) && source.length) {
      return source.map((entry, index) => ({
        id: String(entry?.id ?? entry?.name ?? index),
        name: entry?.name ?? `Campaign ${index + 1}`,
        channel: entry?.channel ?? entry?.type ?? null,
        personas: entry?.target_personas ?? entry?.personas ?? null,
        status: entry?.status ?? entry?.state ?? null,
        summary: entry?.summary ?? entry?.description ?? null,
      }));
    }
  }
  return [];
}

function normalizeRfpNotes(enrichment: any): string[] {
  const notes =
    enrichment?.sales_assets?.rfp_support?.notes ??
    enrichment?.command_center_enrichment?.rfp_notes ??
    [];
  return Array.isArray(notes) ? notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0) : [];
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Math.round(Number(value)).toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getCountryFlag(code?: string | null) {
  if (!code) return "🌐";
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return "🌐";
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}
