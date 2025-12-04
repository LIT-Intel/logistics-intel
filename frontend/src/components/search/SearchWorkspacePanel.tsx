import React, { useEffect, useMemo, useState } from "react";
import { getIyCompanyProfile, type IyCompanyProfile } from "@/lib/api";

export type WorkspaceTab = "overview" | "lanes" | "suppliers" | "saved";

type SelectedCompany = {
  key: string;
  title: string;
  subtitle?: string | null;
  isSaved?: boolean;
};

type SearchWorkspacePanelProps = {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  selectedCompany: SelectedCompany | null;
};

const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: "Overview",
  lanes: "Lanes",
  suppliers: "Suppliers",
  saved: "Saved",
};

const formatNumber = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toLocaleString();
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `$${Number(value).toLocaleString()}`;
};

export default function SearchWorkspacePanel({
  activeTab,
  onTabChange,
  selectedCompany,
}: SearchWorkspacePanelProps) {
  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);
  const [enrichment, setEnrichment] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompany?.key) {
      setProfile(null);
      setEnrichment(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getIyCompanyProfile({
          companyKey: selectedCompany.key,
          userGoal: "Enrich company profile for LIT Search workspace",
        });

        if (cancelled) return;
        setProfile(res.companyProfile);
        setEnrichment(res.enrichment ?? null);
      } catch (err: any) {
        if (cancelled) return;
        console.error("[LIT] Search workspace profile load failed", err);
        setProfile(null);
        setEnrichment(null);
        setError("Unable to load company profile");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany?.key]);

  if (!selectedCompany) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-xs text-slate-500">
        <p>Select a shipper to see KPIs, lanes, suppliers, and save status.</p>
      </div>
    );
  }

  const subtitle =
    selectedCompany.subtitle ??
    profile?.country ??
    profile?.countryCode ??
    profile?.address ??
    "Location unavailable";

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {profile?.title ?? selectedCompany.title}
            </p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              selectedCompany.isSaved
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {selectedCompany.isSaved ? "Saved in Command Center" : "Not saved"}
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 px-4">
        <nav className="flex gap-4 text-xs font-semibold">
          {(Object.keys(TAB_LABELS) as WorkspaceTab[]).map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`py-3 text-xs uppercase tracking-wide ${
                  isActive
                    ? "border-b-2 border-slate-900 text-slate-900"
                    : "border-b-2 border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {loading && (
          <div className="text-xs text-slate-500">Loading profile…</div>
        )}
        {!loading && error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {error}
          </div>
        )}
        {!loading && !error && profile && (
          <>
            {activeTab === "overview" && (
              <OverviewTab profile={profile} enrichment={enrichment} />
            )}
            {activeTab === "lanes" && (
              <LanesTab profile={profile} enrichment={enrichment} />
            )}
            {activeTab === "suppliers" && (
              <SuppliersTab profile={profile} enrichment={enrichment} />
            )}
            {activeTab === "saved" && (
              <SavedTab
                profile={profile}
                enrichment={enrichment}
                isSaved={selectedCompany.isSaved ?? false}
              />
            )}
          </>
        )}
        {!loading && !error && !profile && (
          <div className="text-xs text-slate-500">
            No profile data is available for this shipper yet.
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  profile,
  enrichment,
}: {
  profile: IyCompanyProfile;
  enrichment: any;
}) {
  const logisticsKpis = enrichment?.logistics_kpis ?? {};
  const spend = enrichment?.spend_analysis ?? {};

  const shipments12m =
    logisticsKpis.shipments_12m ??
    logisticsKpis.shipmentsLast12m ??
    profile.routeKpis?.shipmentsLast12m ??
    profile.totalShipments ??
    null;

  const teus12m =
    logisticsKpis.teus_12m ??
    logisticsKpis.teuLast12m ??
    profile.routeKpis?.teuLast12m ??
    null;

  const estSpendUsd12m =
    spend.estimated_12m_spend_total ??
    logisticsKpis.estSpendUsd12m ??
    profile.routeKpis?.estSpendUsd12m ??
    profile.estSpendUsd12m ??
    null;

  const summary =
    enrichment?.command_center_enrichment?.quick_summary ??
    enrichment?.sales_assets?.pre_call_brief?.summary ??
    enrichment?.ai?.summary ??
    null;

  const suppliers = useMemo(() => {
    const raw =
      (Array.isArray(profile.topSuppliers) && profile.topSuppliers) ||
      (Array.isArray(profile.suppliersSample) && profile.suppliersSample) ||
      (Array.isArray(enrichment?.market_intel?.top_suppliers) &&
        enrichment.market_intel.top_suppliers) ||
      [];
    return raw
      .map((entry: any) =>
        typeof entry === "string"
          ? entry
          : entry?.name ?? entry?.supplier_name ?? entry?.company ?? "",
      )
      .filter((value: string) => Boolean(value))
      .slice(0, 4);
  }, [profile.topSuppliers, profile.suppliersSample, enrichment?.market_intel]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Shipments (12m)" value={formatNumber(shipments12m)} />
        <KpiCard label="TEU (12m)" value={formatNumber(teus12m)} />
        <KpiCard label="Est. Spend (12m)" value={formatCurrency(estSpendUsd12m)} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          AI insights
        </p>
        <p className="mt-2 text-sm text-slate-700">
          {summary ?? "No AI summary available yet for this company."}
        </p>
      </div>
      {suppliers.length > 0 && (
        <div className="rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Key suppliers
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {suppliers.map((supplier) => (
              <li key={supplier} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span>{supplier}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LanesTab({
  profile,
  enrichment,
}: {
  profile: IyCompanyProfile;
  enrichment: any;
}) {
  const laneCandidates =
    (Array.isArray(enrichment?.logistics_kpis?.top_lanes) &&
      enrichment.logistics_kpis.top_lanes) ||
    (Array.isArray(profile.routeKpis?.topRoutesLast12m) &&
      profile.routeKpis.topRoutesLast12m) ||
    (Array.isArray(profile.topRoutes) && profile.topRoutes) ||
    [];

  const lanes = laneCandidates.map((lane: any, index: number) => {
    const origin =
      lane.origin ??
      lane.origin_port ??
      lane.originCity ??
      lane.origin_port_name ??
      lane.route?.split?.("→")?.[0]?.trim?.() ??
      null;
    const destination =
      lane.destination ??
      lane.destination_port ??
      lane.destinationCity ??
      lane.destination_port_name ??
      lane.route?.split?.("→")?.[1]?.trim?.() ??
      null;
    const shipments =
      lane.shipments_12m ??
      lane.shipmentsLast12m ??
      lane.shipments ??
      lane.volume ??
      null;
    const teu = lane.teus_12m ?? lane.teu ?? lane.teus ?? null;
    const share =
      lane.share ??
      lane.sharePct ??
      lane.share_pct ??
      (typeof lane.share_percentage === "number"
        ? lane.share_percentage
        : null);
    const lastShipment =
      lane.last_shipment_date ??
      lane.lastShipmentDate ??
      lane.last_shipment ??
      lane.lastShipDate ??
      null;

    const label =
      origin && destination
        ? `${origin} → ${destination}`
        : origin || destination || `Lane ${index + 1}`;

    return {
      label,
      shipments,
      teu,
      share,
      lastShipment: lastShipment ? formatDate(lastShipment) : null,
    };
  });

  if (!lanes.length) {
    return (
      <div className="text-xs text-slate-500">
        No lane data is available for this company yet.
      </div>
    );
  }

  const totalShipments = lanes.reduce((sum, lane) => {
    const value = Number(lane.shipments);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 text-left">Lane</th>
            <th className="py-2 pr-3 text-right">Shipments (12m)</th>
            <th className="py-2 pr-3 text-right">TEU (12m)</th>
            <th className="py-2 pr-3 text-right">Share %</th>
            <th className="py-2 text-right">Last shipment</th>
          </tr>
        </thead>
        <tbody>
          {lanes.slice(0, 10).map((lane, idx) => {
            const shareValue =
              lane.share != null
                ? lane.share
                : totalShipments && lane.shipments != null
                ? (Number(lane.shipments) / totalShipments) * 100
                : null;
            return (
              <tr key={lane.label + idx} className="border-b border-slate-100">
                <td className="py-2 pr-3 text-left font-medium text-slate-900">
                  {lane.label}
                </td>
                <td className="py-2 pr-3 text-right">
                  {formatNumber(lane.shipments) ?? "—"}
                </td>
                <td className="py-2 pr-3 text-right">
                  {formatNumber(lane.teu) ?? "—"}
                </td>
                <td className="py-2 pr-3 text-right">
                  {shareValue != null ? `${shareValue.toFixed(1)}%` : "—"}
                </td>
                <td className="py-2 text-right">{lane.lastShipment ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SuppliersTab({
  profile,
  enrichment,
}: {
  profile: IyCompanyProfile;
  enrichment: any;
}) {
  const supplierCandidates = [
    profile.topSuppliers,
    profile.suppliersSample,
    enrichment?.logistics_kpis?.top_suppliers,
    enrichment?.market_intel?.top_suppliers,
    enrichment?.market_intel?.peers,
  ].find((list) => Array.isArray(list)) as any[] | undefined;

  const suppliers = (supplierCandidates ?? [])
    .map((entry: any) =>
      typeof entry === "string"
        ? entry
        : entry?.name ?? entry?.supplier_name ?? entry?.company ?? "",
    )
    .filter((value: string) => Boolean(value))
    .slice(0, 20);

  if (!suppliers.length) {
    return (
      <div className="text-xs text-slate-500">
        No supplier information is available for this company yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2 text-sm text-slate-800">
      {suppliers.map((supplier) => (
        <li key={supplier} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span>{supplier}</span>
        </li>
      ))}
    </ul>
  );
}

function SavedTab({
  profile,
  enrichment,
  isSaved,
}: {
  profile: IyCompanyProfile;
  enrichment: any;
  isSaved: boolean;
}) {
  const crmPayload =
    enrichment?.command_center_enrichment?.crm_payload ??
    enrichment?.command_center_enrichment?.save_payload ??
    enrichment?.crm_save_payload ??
    null;

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Command Center status
        </p>
        <p className="mt-2">
          {isSaved
            ? "This company is already saved to Command Center."
            : "This company has not been saved yet."}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Company ID: {profile.companyId || profile.key || "Unknown"}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          CRM payload preview
        </p>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900/90 p-3 text-[11px] text-slate-100">
          {crmPayload
            ? JSON.stringify(crmPayload, null, 2)
            : "Payload will appear here once enrichment is available."}
        </pre>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-900">
        {value ?? "—"}
      </p>
    </div>
  );
}
