import React, { useEffect, useMemo, useState } from "react";
import type { IyCompanyProfile, IyShipperHit } from "@/lib/api";
import { getIyCompanyProfile } from "@/lib/api";
import { buildCompanySnapshot, type CompanySnapshot } from "@/components/common/companyViewModel";

export type SearchWorkspaceTab = "overview" | "lanes" | "suppliers" | "saved";

type SelectedCompany = {
  companyKey: string;
  title: string;
  subtitle: string | null;
  shipper: IyShipperHit;
  isSaved: boolean;
  initialProfile?: IyCompanyProfile | null;
};

type SearchWorkspacePanelProps = {
  activeTab: SearchWorkspaceTab;
  onTabChange: (tab: SearchWorkspaceTab) => void;
  selectedCompany: SelectedCompany | null;
};

const TAB_LABELS: Record<SearchWorkspaceTab, string> = {
  overview: "Overview",
  lanes: "Lanes",
  suppliers: "Suppliers",
  saved: "Saved",
};

export default function SearchWorkspacePanel({
  activeTab,
  onTabChange,
  selectedCompany,
}: SearchWorkspacePanelProps) {
  const [profile, setProfile] = useState<IyCompanyProfile | null>(selectedCompany?.initialProfile ?? null);
  const [enrichment, setEnrichment] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(selectedCompany?.initialProfile ?? null);
    setEnrichment(null);
    setError(null);
  }, [selectedCompany?.companyKey]);

  useEffect(() => {
    if (!selectedCompany) {
      setProfile(null);
      setEnrichment(null);
      setError(null);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await getIyCompanyProfile({
          companyKey: selectedCompany.companyKey,
          userGoal: "Populate LIT Search workspace panel with company intelligence",
        });
        if (cancelled) return;
        setProfile(response.companyProfile ?? null);
        setEnrichment(response.enrichment ?? null);
      } catch (err) {
        if (cancelled) return;
        console.error("SearchWorkspacePanel getIyCompanyProfile failed", err);
        setError("Unable to load company profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany?.companyKey]);

  if (!selectedCompany) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-xs text-slate-500">
        Select a shipper to see KPIs, top lanes, suppliers, and Command Center status.
      </div>
    );
  }

  const fallbackPayload = {
    shipments_12m: selectedCompany.shipper.shipmentsLast12m ?? selectedCompany.shipper.totalShipments ?? null,
    teus_12m: selectedCompany.shipper.teusLast12m ?? null,
    last_shipment_date:
      selectedCompany.shipper.lastShipmentDate ??
      selectedCompany.shipper.mostRecentShipment ??
      null,
    top_route_label:
      selectedCompany.shipper.primaryRouteSummary ??
      selectedCompany.shipper.primaryRoute ??
      null,
    address:
      selectedCompany.shipper.address ??
      ([selectedCompany.shipper.city, selectedCompany.shipper.state, selectedCompany.shipper.country]
        .filter(Boolean)
        .join(", ") || null),
    country: selectedCompany.shipper.country ?? null,
    country_code: selectedCompany.shipper.countryCode ?? null,
    domain: selectedCompany.shipper.domain ?? selectedCompany.shipper.website ?? null,
    website: selectedCompany.shipper.website ?? null,
  };

  const snapshot: CompanySnapshot = buildCompanySnapshot({
    profile,
    enrichment,
    fallback: {
      companyId: selectedCompany.companyKey,
      name: selectedCompany.title,
      payload: fallbackPayload,
    },
  });

  return (
    <div className="flex h-full flex-1 flex-col">
      <header className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{selectedCompany.title}</p>
            <p className="text-xs text-slate-500">{selectedCompany.subtitle ?? snapshot.locationLabel}</p>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              selectedCompany.isSaved
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {selectedCompany.isSaved ? "Saved" : "Not saved"}
          </div>
        </div>
      </header>

      <div className="border-b border-slate-100 px-4">
        <nav className="flex gap-4 text-xs font-semibold">
          {(Object.keys(TAB_LABELS) as SearchWorkspaceTab[]).map((tab) => {
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
        {!loading && !error && renderTabContent(activeTab, snapshot, enrichment, selectedCompany)}
      </div>
    </div>
  );
}

const renderTabContent = (
  tab: SearchWorkspaceTab,
  snapshot: CompanySnapshot,
  enrichment: any | null,
  selectedCompany: SelectedCompany,
) => {
  switch (tab) {
    case "overview":
      return (
        <div className="space-y-4 text-sm text-slate-600">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Shipments (12m)" value={formatNumber(snapshot.shipments12m)} />
            <KpiCard label="TEU (12m)" value={formatNumber(snapshot.teus12m)} />
            <KpiCard label="Est. Spend" value={formatCurrency(snapshot.estSpend12m)} />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">AI insights</p>
            <p className="mt-2 text-sm text-slate-700">
              {snapshot.aiSummary ?? "No AI summary available yet for this company."}
            </p>
          </div>
          {snapshot.keySuppliers.length > 0 && (
            <div className="rounded-2xl border border-slate-100 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key suppliers</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {snapshot.keySuppliers.slice(0, 6).map((supplier) => (
                  <li key={supplier}>{supplier}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    case "lanes": {
      const lanes = snapshot.topRoutes;
      return lanes.length === 0 ? (
        <div className="text-xs text-slate-500">No lane data available for this company yet.</div>
      ) : (
        <div className="text-xs">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2 text-left">Lane</th>
                <th className="py-1 pr-2 text-right">Shipments (12m)</th>
                <th className="py-1 pr-2 text-right">TEU (12m)</th>
                <th className="py-1 text-right">Spend</th>
              </tr>
            </thead>
            <tbody>
              {lanes.slice(0, 10).map((lane, idx) => (
                <tr key={`${lane.label}-${idx}`} className="border-b">
                  <td className="py-1 pr-2 text-left font-medium text-slate-900">{lane.label}</td>
                  <td className="py-1 pr-2 text-right">{formatNumber(lane.shipments)}</td>
                  <td className="py-1 pr-2 text-right">{formatNumber(lane.teu)}</td>
                  <td className="py-1 text-right">{formatCurrency(lane.estSpendUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "suppliers":
      return snapshot.keySuppliers.length === 0 ? (
        <div className="text-xs text-slate-500">No supplier information is available yet.</div>
      ) : (
        <ul className="space-y-2 text-sm text-slate-700">
          {snapshot.keySuppliers.slice(0, 15).map((supplier) => (
            <li key={supplier} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>{supplier}</span>
            </li>
          ))}
        </ul>
      );
    case "saved": {
      const crmPayload =
        enrichment?.command_center_enrichment?.crm_payload ??
        enrichment?.command_center_enrichment?.save_payload ??
        enrichment?.crm_save_payload ??
        null;
      return (
        <div className="space-y-4 text-xs text-slate-600">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-2 text-sm text-slate-800">
              {selectedCompany.isSaved
                ? "This company is already saved to Command Center."
                : "Not yet saved. Use the Save button on the card to add it to Command Center."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">CRM payload preview</p>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900/90 p-3 text-[11px] text-slate-100">
{crmPayload ? JSON.stringify(crmPayload, null, 2) : "Payload will appear here once enrichment is available."}
            </pre>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
};

const KpiCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 text-lg font-semibold text-slate-900">{value ?? "—"}</p>
  </div>
);

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Math.round(Number(value)).toLocaleString()}`;
}
