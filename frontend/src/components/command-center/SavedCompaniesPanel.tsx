import React from "react";
import { Loader2 } from "lucide-react";
import type { CommandCenterRecord } from "@/types/importyeti";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";

type SavedCompaniesPanelProps = {
  companies: CommandCenterRecord[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
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

const formatNumber = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
};

const buildRouteLabel = (shipment?: {
  origin_port?: string | null;
  destination_port?: string | null;
}) => {
  if (!shipment) return "—";
  const origin = shipment.origin_port || "—";
  const destination = shipment.destination_port || "—";
  if (origin === "—" && destination === "—") return "—";
  return `${origin} → ${destination}`;
};

const buildLocation = (company?: CommandCenterRecord["company"]) => {
  if (!company) return "Location unavailable";
  if (company.address) return company.address;
  return company.country_code || "Location unavailable";
};

const recordKey = (record: CommandCenterRecord) =>
  record.company?.company_id ||
  record.company?.name ||
  record.company?.company_name ||
  "";

export default function SavedCompaniesPanel({
  companies,
  selectedKey,
  onSelect,
  loading,
  error,
  collapsed,
  onToggleCollapse,
}: SavedCompaniesPanelProps) {
  return (
    <aside
      className={`relative flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-200 flex-shrink-0 ${
        collapsed ? "w-14" : "w-72"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        {collapsed ? (
          <span className="mx-auto text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            CC
          </span>
        ) : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Saved companies
            </p>
            <p className="text-xs text-slate-500">{companies.length} companies</p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] text-slate-500 hover:bg-slate-100"
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          </div>
        )}
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-auto">
          {error && (
            <li className="px-4 py-5 text-sm text-rose-600">{error}</li>
          )}
          {!error && !companies.length && !loading && (
            <li className="px-4 py-5 text-sm text-slate-500">
              No saved companies yet. Save a shipper from ImportYeti search to get
              started.
            </li>
          )}
          {companies.map((record) => {
            const key = recordKey(record);
            if (!key) return null;
            const active = key === selectedKey;
            const lastShipment =
              record.company?.kpis?.last_activity ||
              record.shipments?.[0]?.date ||
              null;
            const recentRoute = buildRouteLabel(record.shipments?.[0]);
            const logoUrl = getCompanyLogoUrl(record.company?.domain);

            const shipments12m = record.company?.kpis?.shipments_12m ?? null;

            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`flex w-full items-start gap-3 px-3 py-3 text-left transition ${
                    active ? "bg-indigo-50" : "hover:bg-slate-50"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <CompanyAvatar
                    name={record.company?.name || "Company"}
                    logoUrl={logoUrl ?? undefined}
                    size="sm"
                  />
                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold tracking-[0.18em] text-slate-600">
                        {(record.company?.name || "Company").toUpperCase()}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {buildLocation(record.company)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Shipments 12m: {formatNumber(shipments12m)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Recent: {formatDate(lastShipment)} · {recentRoute}
                      </p>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
