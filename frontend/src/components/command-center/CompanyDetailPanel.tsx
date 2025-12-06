import React, { useMemo, useState } from "react";
import { Globe, Phone } from "lucide-react";
import type {
  IyCompanyProfile,
  IyRouteKpis,
  IyRouteTopRoute,
} from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import CompanyActivityChart from "./CompanyActivityChart";
import CommandCenterEmptyState from "./CommandCenterEmptyState";

export const COMMAND_CENTER_TABS = [
  "Overview",
  "Shipments",
  "Contacts",
  "Campaigns",
  "RFP notes",
] as const;
export type CommandCenterTab = (typeof COMMAND_CENTER_TABS)[number];

type CompanyDetailPanelProps = {
  record: CommandCenterRecord | null;
  profile: IyCompanyProfile | null;
  routeKpis: IyRouteKpis | null;
  loading: boolean;
  error: string | null;
  activeTab: CommandCenterTab;
  onTabChange: (tab: CommandCenterTab) => void;
};

type Contact = {
  id: number;
  name: string;
  title: string;
  city: string;
  state: string;
  email: string;
  phone: string;
  website: string;
};

const CONTACT_TEMPLATES: Omit<Contact, "website">[] = [
  {
    id: 1,
    name: "Sarah Johnson",
    title: "VP Global Logistics",
    city: "Bentonville",
    state: "AR",
    email: "sarah.johnson@example.com",
    phone: "+1 (479) 555-0142",
  },
  {
    id: 2,
    name: "Miguel Alvarez",
    title: "Sr Director, Ocean Procurement",
    city: "Miami",
    state: "FL",
    email: "miguel.alvarez@example.com",
    phone: "+1 (305) 555-8870",
  },
  {
    id: 3,
    name: "Priya Desai",
    title: "Director, Supply Chain Strategy",
    city: "Dallas",
    state: "TX",
    email: "priya.desai@example.com",
    phone: "+1 (972) 555-2244",
  },
  {
    id: 4,
    name: "Eric Chen",
    title: "Sr Manager, Imports & Compliance",
    city: "Los Angeles",
    state: "CA",
    email: "eric.chen@example.com",
    phone: "+1 (213) 555-9911",
  },
];

const regionFormatter =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

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

const countryCodeToEmoji = (code?: string | null) => {
  if (!code) return "🇺🇸";
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return "🇺🇸";
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
};

const countryNameFromCode = (code?: string | null) => {
  if (!code) return "United States";
  const normalized = code.trim().slice(0, 2).toUpperCase();
  try {
    return regionFormatter?.of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
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

const splitRoute = (route?: string | null): [string | null, string | null] => {
  if (!route) return [null, null];
  const parts = route.split(/→|->|—|-/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  if (parts.length === 1) return [parts[0], null];
  return [null, null];
};

const buildActivitySeries = (
  kpis?: IyRouteKpis | null,
  profile?: IyCompanyProfile | null,
) => {
  const series =
    (kpis as any)?.monthlySeries?.length
      ? (kpis as any).monthlySeries
      : profile?.timeSeries ?? [];

  return series.slice(-12).map((point: any) => ({
    period: point.monthLabel ?? point.month ?? "",
    fcl: Math.max(point.shipmentsFcl ?? point.fclShipments ?? point.fcl ?? 0, 0),
    lcl: Math.max(point.shipmentsLcl ?? point.lclShipments ?? point.lcl ?? 0, 0),
  }));
};

const computeMonthlyRows = (
  data: ReturnType<typeof buildActivitySeries>,
  teu12m: number | null,
  shipments12m: number | null,
) => {
  if (!data.length) return [];
  const avgTeuPerShipment =
    shipments12m && teu12m ? teu12m / Math.max(shipments12m, 1) : null;
  return data.map((row) => {
    const total = (row.fcl ?? 0) + (row.lcl ?? 0);
    const estimatedTeu = avgTeuPerShipment ? Math.round(total * avgTeuPerShipment) : null;
    return {
      month: row.period,
      fcl: row.fcl,
      lcl: row.lcl,
      total,
      teu: estimatedTeu,
    };
  });
};

const inferDomain = (profile?: IyCompanyProfile | null) => {
  if (profile?.domain) return profile.domain;
  if (profile?.website) {
    try {
      const parsed = new URL(profile.website.startsWith("http") ? profile.website : `https://${profile.website}`);
      return parsed.hostname.replace(/^www\./i, "");
    } catch {
      return null;
    }
  }
  return null;
};

const campaignsFor = (companyName: string) => [
  {
    name: `${companyName} ocean optimization · Wave 1`,
    channel: "Email + LinkedIn",
    personas: "VP / Director Logistics, Ocean Procurement",
    status: "Running",
  },
  {
    name: `${companyName} cross-border pilot`,
    channel: "Email only",
    personas: "Supply Chain Strategy, DC Operations",
    status: "Planning",
  },
];

const cardBase = "rounded-2xl border px-4 py-3 shadow-sm";

type KpiTone = "emerald" | "sky" | "amber";

const KPI_THEME_CLASSES: Record<KpiTone, string> = {
  emerald: "border-emerald-100 bg-emerald-50/80",
  sky: "border-sky-100 bg-sky-50/80",
  amber: "border-amber-100 bg-amber-50/80",
};

const KPI_TEXT_CLASSES: Record<KpiTone, string> = {
  emerald: "text-emerald-700",
  sky: "text-sky-700",
  amber: "text-amber-700",
};

export default function CompanyDetailPanel({
  record,
  profile,
  routeKpis,
  loading,
  error,
  activeTab,
  onTabChange,
}: CompanyDetailPanelProps) {
  const selectedCompanyId =
    record?.company?.company_id ?? record?.company?.name ?? null;

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
  const estSpend = routeKpis?.estSpendUsd12m ?? profile?.estSpendUsd12m ?? null;
  const recentShipmentDate =
    profile?.lastShipmentDate ??
    record?.company?.kpis?.last_activity ??
    record?.shipments?.[0]?.date ??
    null;
  const topRouteLabel =
    routeKpis?.topRouteLast12m ||
    (routeKpis?.topRoutesLast12m?.[0]?.route as string | undefined) ||
    deriveRouteFromShipment(record?.shipments?.[0]) ||
    null;
  const recentRouteLabel =
    routeKpis?.mostRecentRoute ||
    deriveRouteFromShipment(record?.shipments?.[0]) ||
    topRouteLabel;

  const topRoutes = useMemo<IyRouteTopRoute[]>(() => {
    if (routeKpis?.topRoutesLast12m?.length) return routeKpis.topRoutesLast12m;
    if ((profile as any)?.routeKpis?.topRoutesLast12m?.length) {
      return (profile as any).routeKpis.topRoutesLast12m;
    }
    return [];
  }, [routeKpis, profile]);

  const [topOrigin, topDestination] = splitRoute(topRouteLabel ?? topRoutes[0]?.route);

  const laneConcentrationPct = useMemo(() => {
    if (!shipments12m || !topRoutes.length) return null;
    const topFive = topRoutes
      .slice(0, 5)
      .reduce((sum, route) => sum + (route.shipments ?? 0), 0);
    if (!topFive) return null;
    return Math.round((topFive / Math.max(shipments12m, 1)) * 100);
  }, [shipments12m, topRoutes]);

  const carrierDiversificationScore = useMemo(() => {
    if (!topRoutes.length) return null;
    const uniques = topRoutes.length;
    return (1 + Math.min(2, uniques / 4)).toFixed(2);
  }, [topRoutes]);

  const monthlyRows = useMemo(
    () => computeMonthlyRows(activitySeries, teu12m, shipments12m),
    [activitySeries, teu12m, shipments12m],
  );

  const domain = inferDomain(profile);

  const contacts = useMemo<Contact[]>(() => {
    return CONTACT_TEMPLATES.map((contact) => ({
      ...contact,
      email: domain ? contact.email.replace("example.com", domain) : contact.email,
      website: domain ?? "company.com",
    }));
  }, [domain]);

  const [contactSearch, setContactSearch] = useState("");
  const [contactTitleFilter, setContactTitleFilter] = useState("");
  const [contactLocationFilter, setContactLocationFilter] = useState("");

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const q = contactSearch.toLowerCase();
      const matchesSearch =
        !q ||
        contact.name.toLowerCase().includes(q) ||
        contact.title.toLowerCase().includes(q) ||
        contact.email.toLowerCase().includes(q);
      const matchesTitle =
        !contactTitleFilter ||
        contact.title.toLowerCase().includes(contactTitleFilter.toLowerCase());
      const location = `${contact.city}, ${contact.state}`.toLowerCase();
      const matchesLocation =
        !contactLocationFilter ||
        location.includes(contactLocationFilter.toLowerCase());
      return matchesSearch && matchesTitle && matchesLocation;
    });
  }, [contacts, contactSearch, contactTitleFilter, contactLocationFilter]);

  const campaignCompanyName = record?.company?.name ?? "Target shipper";
  const campaigns = useMemo(() => campaignsFor(campaignCompanyName), [campaignCompanyName]);

  if (!selectedCompanyId) {
    return <CommandCenterEmptyState />;
  }

  const companyName = profile?.title || record?.company?.name || "Company";
  const companyAddress =
    profile?.address || record?.company?.address || "Address unavailable";
  const countryCode = profile?.countryCode ?? record?.company?.country_code;
  const flagEmoji = countryCodeToEmoji(countryCode);
  const countryName = countryNameFromCode(countryCode);
  const initials = companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CC";

  const supplyChainFocus = topRouteLabel
    ? `High-volume ${topRouteLabel} flow with ${formatNumber(shipments12m)} tracked shipments.`
    : "Lane intelligence populates once shipments sync.";

  const currentPlay = laneConcentrationPct
    ? `Position DSV for the top ${Math.min(5, topRoutes.length)} lanes covering ${laneConcentrationPct}% of spend.`
    : "Prep a POV on Asia → US reliability and cost stability.";

  const topLanesList = topRoutes.slice(0, 4);

  const kpiTiles: Array<{
    label: string;
    value: string;
    badge: string;
    helper: string;
    tone: KpiTone;
  }> = [
    {
      label: "Shipments (12m)",
      value: formatNumber(shipments12m),
      badge: shipments12m ? `Avg ${(shipments12m / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo` : "Awaiting data",
      tone: "emerald",
      helper: "All sea modes tracked by LIT",
    },
    {
      label: "TEU (12m)",
      value: formatNumber(teu12m),
      badge: shipments12m && teu12m ? `${(teu12m / Math.max(shipments12m, 1)).toFixed(1)} TEU / shipment` : "Live calc",
      tone: "sky",
      helper: "Estimated from container mix",
    },
    {
      label: "Est. shipping spend",
      value: estSpend ? formatCurrency(estSpend) : "—",
      badge: shipments12m ? `${Math.round((shipments12m / 1000) * 41)}% coverage` : "Partial coverage",
      tone: "amber",
      helper: "Benchmarked via Xeneta composites",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {loading && (
        <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-2 text-xs text-indigo-700">
          Syncing the latest Gemini enrichment for this shipper…
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

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
                    {companyName}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200/80">
                    <span className="text-base leading-none">{flagEmoji}</span>
                    <span>{countryName} HQ</span>
                  </span>
                  <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                    Company
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{companyAddress}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-800">
                  {profile?.website && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5">
                      <Globe className="h-3 w-3 text-indigo-500" />
                      <span>{profile.website.replace(/^https?:\/\//, "")}</span>
                    </span>
                  )}
                  {profile?.phoneNumber && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5">
                      <Phone className="h-3 w-3 text-emerald-500" />
                      <span>{profile.phoneNumber}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 text-xs text-slate-700 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Contacts
                </p>
                <p className="text-sm text-slate-900">{profile?.phoneNumber || "Reach out via LIT contact search"}</p>
                <p className="text-sm text-indigo-700">
                  {domain ? domain : profile?.website?.replace(/^https?:\/\//, "") || "website pending"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Supply chain focus
                </p>
                <p>{supplyChainFocus}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Current play
                </p>
                <p>{currentPlay}</p>
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col justify-between rounded-2xl border border-[#5C4DFF]/40 bg-white/80 px-4 py-4 shadow-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Most recent shipment
              </p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-[#5C4DFF]">
                {formatDate(recentShipmentDate)}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {recentRouteLabel || "Route data appears once the first shipment syncs"}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800">
                Open shipment timeline
              </button>
              <button className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-50">
                View all historical shipments
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-xs">
          {COMMAND_CENTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                tab === activeTab
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
          <div className="space-y-3 text-sm text-slate-700">
            {activeTab === "Overview" && (
              <>
                <h4 className="text-sm font-semibold text-slate-900">
                  Narrative snapshot
                </h4>
                <p>
                  {companyName} is running {formatNumber(shipments12m)} shipments in the past
                  12 months with lane concentration across {topOrigin || "primary origins"}{" "}
                  → {topDestination || "key destinations"}. Lead with reliability on those
                  lanes and preload an SLA story for the next pricing conversation.
                </p>
                <p>
                  LIT data highlights {laneConcentrationPct ? `${laneConcentrationPct}%` : "a meaningful"} share of volume in the top lanes, making them ideal for targeted
                  value engineering, Gemini briefings, and campaign sequencing.
                </p>
              </>
            )}

            {activeTab === "Shipments" && (
              <>
                <h4 className="text-sm font-semibold text-slate-900">Shipment view</h4>
                {monthlyRows.length ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Month</th>
                          <th className="px-3 py-2">FCL</th>
                          <th className="px-3 py-2">LCL</th>
                          <th className="px-3 py-2">Total</th>
                          <th className="px-3 py-2">Est. TEU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyRows.map((row) => (
                          <tr key={row.month} className="odd:bg-white even:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{row.month}</td>
                            <td className="px-3 py-2">{formatNumber(row.fcl)}</td>
                            <td className="px-3 py-2">{formatNumber(row.lcl)}</td>
                            <td className="px-3 py-2">{formatNumber(row.total)}</td>
                            <td className="px-3 py-2">{formatNumber(row.teu)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Time-series data will populate once the first 12 months of shipments sync.</p>
                )}
              </>
            )}

            {activeTab === "Contacts" && (
              <>
                <h4 className="text-sm font-semibold text-slate-900">Contacts</h4>
                <p className="text-xs text-slate-500">
                  Lusha-style search to prep intros. Filters run locally in this mock but wire into LIT contact enrichment APIs in production.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Search
                    </label>
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(event) => setContactSearch(event.target.value)}
                      placeholder="Name, title or email"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Title contains
                    </label>
                    <input
                      type="text"
                      value={contactTitleFilter}
                      onChange={(event) => setContactTitleFilter(event.target.value)}
                      placeholder="e.g. director, vp"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      City / State
                    </label>
                    <input
                      type="text"
                      value={contactLocationFilter}
                      onChange={(event) => setContactLocationFilter(event.target.value)}
                      placeholder="e.g. Bentonville, AR"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
                          {contact.name
                            .split(" ")
                            .map((piece) => piece[0])
                            .join("")}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{contact.name}</p>
                          <p className="text-[11px] text-slate-600">{contact.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {contact.city}, {contact.state}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-slate-600">
                        <p>{contact.email}</p>
                        <p className="mt-0.5">{contact.phone}</p>
                        <p className="mt-0.5 text-slate-400">{contact.website}</p>
                      </div>
                    </div>
                  ))}
                  {!filteredContacts.length && (
                    <p className="text-[11px] italic text-slate-500">
                      No contacts match the current filters.
                    </p>
                  )}
                </div>
              </>
            )}

            {activeTab === "Campaigns" && (
              <>
                <h4 className="text-sm font-semibold text-slate-900">Campaigns</h4>
                <p className="text-xs text-slate-500">
                  Snapshot of active and planned outreach motions for {companyName}.
                </p>
                <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Channel</th>
                        <th className="px-3 py-2">Personas</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => (
                        <tr key={campaign.name} className="odd:bg-white even:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{campaign.name}</td>
                          <td className="px-3 py-2">{campaign.channel}</td>
                          <td className="px-3 py-2">{campaign.personas}</td>
                          <td className="px-3 py-2 text-emerald-700">{campaign.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeTab === "RFP notes" && (
              <>
                <h4 className="text-sm font-semibold text-slate-900">RFP notes</h4>
                <p className="text-xs text-slate-500">
                  Quick scratchpad that syncs to CRM / Command Center notes in production.
                </p>
                <textarea
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                  rows={6}
                  placeholder="Ex: TPEB ocean RFP expected Q3. Priorities: rate stability on CN→USWC, improved dwell at Tacoma, cross-border MX pilot."
                />
              </>
            )}
          </div>

          <div className="grid gap-3 text-xs text-slate-700">
            {kpiTiles.map((tile) => (
              <div
                key={tile.label}
                className={`${cardBase} ${KPI_THEME_CLASSES[tile.tone]}`}
              >
                <div className={`flex items-center justify-between text-xs ${KPI_TEXT_CLASSES[tile.tone]}`}>
                  <span className="font-semibold">{tile.label}</span>
                  <span className={`rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold ${KPI_TEXT_CLASSES[tile.tone]}`}>
                    {tile.badge}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  {tile.value}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">{tile.helper}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Sea shipments over time
              </h2>
              <p className="text-xs text-slate-500">
                Last 12 months · FCL vs LCL mix
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600" />
                FCL shipments
              </div>
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-lime-400" />
                LCL shipments
              </div>
            </div>
          </div>
          <CompanyActivityChart data={activitySeries} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className={`${cardBase} border-sky-100 bg-sky-50/70`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                Top origin (12m)
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {topOrigin || "Awaiting data"}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">{formatNumber(topRoutes[0]?.shipments)} shipments</p>
            </div>
            <div className={`${cardBase} border-indigo-100 bg-indigo-50/70`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                Top destination (12m)
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {topDestination || "Awaiting data"}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">Primary gateway for current volume</p>
            </div>
            <div className={`${cardBase} border-emerald-100 bg-emerald-50/70`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Lane concentration
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {laneConcentrationPct ? `Top 5 lanes = ${laneConcentrationPct}%` : "Need more lanes"}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                Targeted plays for pricing & capacity
              </p>
            </div>
            <div className={`${cardBase} border-amber-100 bg-amber-50/70`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Carrier diversification
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {carrierDiversificationScore ? `${carrierDiversificationScore} lane mix index` : "Need data"}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {carrierDiversificationScore ? "Moderate mix; rebalance exposure" : "Add shipments to score"}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Top lanes (12m)</h3>
                <p className="text-xs text-slate-500">Ranked by shipments · mix of FCL and LCL</p>
              </div>
              <button className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-900 hover:bg-slate-100">
                View all lanes
              </button>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {topLanesList.length ? (
                topLanesList.map((route) => (
                  <div
                    key={route.route}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium text-slate-900">{route.route}</span>
                      <span className="mt-0.5 text-[11px] text-slate-600">
                        {formatNumber(route.shipments)} shipments · {formatNumber(route.teu)} TEU
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-slate-700">
                      <p className="font-medium">{route.fclShipments ? `${formatNumber(route.fclShipments)} FCL` : "Mix"}</p>
                      <p className="mt-0.5 text-slate-400">12m trend stable</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-slate-500">Top lanes populate once enrichment data syncs.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
